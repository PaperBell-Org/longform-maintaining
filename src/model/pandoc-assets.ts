import { requestUrl } from "obsidian";
import { unzipSync } from "fflate";
import type { App } from "obsidian";
import { commonTopDir } from "src/compile/steps/pandoc-export-utils";
import {
  validateIndex,
  normalizeIndex,
  resolveInstallSet,
  assetFilesAllIn,
  bundledAssets,
  presetSystemDeps,
  installBaseline,
  planFileRemove,
  planFileWrite,
  INSTALLED_MANIFEST_NAME,
  PRESERVED_SUFFIX,
  type InstallBaseline,
  type MarketIndex,
  type MarketAsset,
  type MarketBundle,
  type InstalledManifest,
  type InstalledRecord,
} from "./pandoc-market";

async function ensureFolder(
  adapter: {
    exists: (p: string) => Promise<boolean>;
    mkdir: (p: string) => Promise<void>;
  },
  folder: string
): Promise<void> {
  const parts = folder.split("/").filter((p) => p.length > 0);
  let cur = "";
  for (const p of parts) {
    cur = cur ? `${cur}/${p}` : p;
    if (!(await adapter.exists(cur))) {
      try {
        await adapter.mkdir(cur);
      } catch (e) {
        // already exists / concurrent create — ignore
      }
    }
  }
}

export type DownloadResult = {
  count: number;
  dest: string;
  /** Dest-relative paths written, including any `<path>.new`. */
  files: string[];
  /** Path → sha256 of what was written there. */
  hashes: Record<string, string>;
  /** Paths kept because the user changed them; the new version is at `<path>.new`. */
  preserved: string[];
};

type InstallWrite = {
  files: string[];
  hashes: Record<string, string>;
  preserved: string[];
};

/**
 * Write one installed file without clobbering a user's change to it (#48);
 * see {@link planFileWrite}. Records into `out`.
 */
async function writeInstalledFile(
  app: App,
  destFolder: string,
  rel: string,
  ab: ArrayBuffer,
  baseline: InstallBaseline,
  out: InstallWrite
): Promise<void> {
  const adapter = app.vault.adapter;
  const full = `${destFolder}/${rel}`;
  const incomingHash = await sha256Hex(ab);
  const diskHash = (await adapter.exists(full))
    ? await sha256Hex(await adapter.readBinary(full))
    : null;
  const plan = planFileWrite({
    diskHash,
    incomingHash,
    tracked: baseline.tracked.has(rel),
    recordedHash: baseline.hashes[rel],
  });
  const parent = full.split("/").slice(0, -1).join("/");
  if (parent) await ensureFolder(adapter, parent);
  if (plan === "write") await adapter.writeBinary(full, ab);
  if (plan === "write-new") {
    await adapter.writeBinary(full + PRESERVED_SUFFIX, ab);
    out.files.push(rel + PRESERVED_SUFFIX);
    out.hashes[rel + PRESERVED_SUFFIX] = incomingHash;
    out.preserved.push(rel);
  }
  out.files.push(rel);
  out.hashes[rel] = incomingHash;
}

/** The manifest-derived baseline for `destFolder` (empty when none exists). */
export async function readInstallBaseline(
  app: App,
  destFolder: string
): Promise<InstallBaseline> {
  return installBaseline(await readInstalledManifest(app, destFolder));
}

/**
 * Download the Pandoc toolchain zip from `url` and extract it into the
 * vault-relative `destFolder`. Files (filters, templates, CSL, defaults) are
 * managed in a separate assets repository and published as a release zip, so
 * they are not bundled with the plugin. A single wrapping top-level directory
 * (as in GitHub source zipballs) is stripped.
 */
export async function downloadPandocAssets(
  app: App,
  url: string,
  destFolder: string,
  baseline?: InstallBaseline
): Promise<DownloadResult> {
  if (!url || !/^https?:\/\//.test(url)) {
    throw new Error(
      "No valid assets URL configured. Set the 'Pandoc assets URL' in Longform settings to a link to the toolchain zip."
    );
  }
  const res = await requestUrl({ url, method: "GET" });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Download failed (HTTP ${res.status}) from ${url}`);
  }
  const bytes = new Uint8Array(res.arrayBuffer);
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch (e) {
    throw new Error(
      `Could not unzip the downloaded file — is the URL a .zip? (${(e as Error).message})`
    );
  }

  const filePaths = Object.keys(files).filter((p) => !p.endsWith("/"));
  const top = commonTopDir(filePaths);
  const base = baseline ?? (await readInstallBaseline(app, destFolder));

  const out: InstallWrite = { files: [], hashes: {}, preserved: [] };
  let count = 0;
  for (const p of filePaths) {
    const rel = top ? p.slice(top.length) : p;
    if (!rel) continue;
    const data = files[p];
    const ab = data.buffer.slice(
      data.byteOffset,
      data.byteOffset + data.byteLength
    );
    await writeInstalledFile(app, destFolder, rel, ab, base, out);
    count += 1;
  }
  if (count === 0) {
    throw new Error("The downloaded archive contained no files.");
  }
  return { count, dest: destFolder, ...out };
}

/** SHA-256 of an ArrayBuffer as lowercase hex. */
async function sha256Hex(ab: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", ab);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Fetch and validate the marketplace index from a raw `index.json` URL. The pure
 * validation/logic lives in `pandoc-market.ts`; this is the obsidian-facing fetch.
 */
export async function fetchMarketIndex(
  url: string,
  locale = "en"
): Promise<MarketIndex> {
  if (!url || !/^https?:\/\//.test(url)) {
    throw new Error(
      "No valid marketplace index URL configured. Set it in Longform settings → Compile → Pandoc export."
    );
  }
  const res = await requestUrl({ url, method: "GET" });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Marketplace index fetch failed (HTTP ${res.status}) from ${url}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(res.text);
  } catch (e) {
    throw new Error(`Marketplace index is not valid JSON: ${(e as Error).message}`);
  }
  return normalizeIndex(validateIndex(parsed), locale);
}

/** Fetch an asset/bundle's README markdown (for the in-modal "how to use" panel). */
export async function fetchMarketReadme(url: string): Promise<string> {
  const res = await requestUrl({ url, method: "GET" });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`README fetch failed (HTTP ${res.status}).`);
  }
  return res.text;
}

/**
 * Detect which assets/bundles are already present on disk (files exist under the
 * assets root) — even if not tracked in the install manifest, e.g. synced or
 * downloaded via the legacy zip. An asset is "present" when all its files exist;
 * a bundle when all its listed files exist.
 */
export async function detectPresentIds(
  app: App,
  index: MarketIndex,
  destFolder: string
): Promise<Set<string>> {
  const adapter = app.vault.adapter;
  const paths = new Set<string>();
  for (const a of index.assets) for (const f of a.files ?? []) paths.add(f.path);
  const onDisk = new Set<string>();
  await Promise.all(
    [...paths].map(async (p) => {
      if (await adapter.exists(`${destFolder}/${p}`)) onDisk.add(p);
    })
  );
  const ids = new Set<string>();
  for (const a of index.assets) {
    if (assetFilesAllIn(a, onDisk)) ids.add(a.id);
  }
  for (const b of index.bundles) {
    const assets = b.assets ?? [];
    if (assets.length > 0 && assets.every((p) => onDisk.has(p))) ids.add(b.id);
  }
  return ids;
}

/** Read the install manifest at the assets root; missing/corrupt → empty object. */
export async function readInstalledManifest(
  app: App,
  destFolder: string
): Promise<InstalledManifest> {
  const path = `${destFolder}/${INSTALLED_MANIFEST_NAME}`;
  try {
    if (!(await app.vault.adapter.exists(path))) return {};
    return JSON.parse(await app.vault.adapter.read(path)) as InstalledManifest;
  } catch {
    return {};
  }
}

async function writeInstalledManifest(
  app: App,
  destFolder: string,
  manifest: InstalledManifest
): Promise<void> {
  await ensureFolder(app.vault.adapter, destFolder);
  await app.vault.adapter.write(
    `${destFolder}/${INSTALLED_MANIFEST_NAME}`,
    JSON.stringify(manifest, null, 2) + "\n"
  );
}

/** Download one asset's files into `destFolder`; verify sha256 when provided. */
async function installMarketAsset(
  app: App,
  asset: MarketAsset,
  destFolder: string,
  baseline: InstallBaseline
): Promise<InstallWrite> {
  const out: InstallWrite = { files: [], hashes: {}, preserved: [] };
  for (const file of asset.files) {
    const res = await requestUrl({ url: file.download, method: "GET" });
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`Download failed (HTTP ${res.status}) for ${file.path}`);
    }
    const ab = res.arrayBuffer;
    if (file.sha256) {
      const actual = await sha256Hex(ab);
      if (actual.toLowerCase() !== file.sha256.toLowerCase()) {
        throw new Error(`Checksum mismatch for ${file.path}.`);
      }
    }
    await writeInstalledFile(app, destFolder, file.path, ab, baseline, out);
  }
  return out;
}

/**
 * Install an asset and its `requires` closure (recipe → its filters/template/csl),
 * recording each in the install manifest. Returns the added/updated records
 * and the files kept because the user had changed them.
 */
export async function installAssetWithDeps(
  app: App,
  index: MarketIndex,
  assetId: string,
  destFolder: string
): Promise<{ records: InstalledRecord[]; preserved: string[] }> {
  const set = resolveInstallSet(index, assetId);
  const manifest = await readInstalledManifest(app, destFolder);
  const baseline = installBaseline(manifest);
  const records: InstalledRecord[] = [];
  const preserved: string[] = [];
  for (const asset of set) {
    const out = await installMarketAsset(app, asset, destFolder, baseline);
    const rec: InstalledRecord = {
      id: asset.id,
      version: asset.version,
      kind: "asset",
      files: out.files,
      installedAt: new Date().toISOString(),
      presetDeps: presetSystemDeps([asset]),
      hashes: out.hashes,
    };
    manifest[asset.id] = rec;
    records.push(rec);
    preserved.push(...out.preserved);
  }
  await writeInstalledManifest(app, destFolder, manifest);
  return { records, preserved };
}

/**
 * Install a bundle zip (reusing the zip downloader) and record it in the
 * manifest. `index` is required because the recipes inside the zip have to keep
 * the `systemDeps` they declare there: that record is all export-time preflight
 * ever gets to see of them.
 */
export async function installMarketBundle(
  app: App,
  bundle: MarketBundle,
  destFolder: string,
  index: MarketIndex
): Promise<{ record: InstalledRecord; preserved: string[] }> {
  const manifest = await readInstalledManifest(app, destFolder);
  const { files, hashes, preserved } = await downloadPandocAssets(
    app,
    bundle.download,
    destFolder,
    installBaseline(manifest)
  );
  const rec: InstalledRecord = {
    id: bundle.id,
    version: bundle.version,
    kind: "bundle",
    files,
    installedAt: new Date().toISOString(),
    presetDeps: presetSystemDeps(bundledAssets(index, bundle)),
    hashes,
  };
  manifest[bundle.id] = rec;
  await writeInstalledManifest(app, destFolder, manifest);
  return { record: rec, preserved };
}

/**
 * Remove an installed asset/bundle's files and its manifest record. If the item
 * isn't tracked in the manifest (present on disk but untracked), `fallbackFiles`
 * (e.g. the index's declared file paths) are removed instead. A file the user
 * changed since it was installed is kept (see {@link planFileRemove}).
 * Returns how many files were deleted and which were kept.
 */
export async function uninstallMarketItem(
  app: App,
  destFolder: string,
  id: string,
  fallbackFiles: string[] = []
): Promise<{ removed: number; kept: string[] }> {
  const manifest = await readInstalledManifest(app, destFolder);
  const rec = manifest[id];
  const files = rec ? rec.files : fallbackFiles;
  const adapter = app.vault.adapter;
  let removed = 0;
  const kept: string[] = [];
  for (const rel of files) {
    const full = `${destFolder}/${rel}`;
    const diskHash = (await adapter.exists(full))
      ? await sha256Hex(await adapter.readBinary(full))
      : null;
    const plan = planFileRemove(diskHash, rec?.hashes?.[rel]);
    if (plan === "remove") {
      await adapter.remove(full);
      removed += 1;
    } else if (plan === "keep") {
      kept.push(rel);
    }
  }
  if (rec) {
    delete manifest[id];
    await writeInstalledManifest(app, destFolder, manifest);
  }
  return { removed, kept };
}
