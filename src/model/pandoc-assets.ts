import { requestUrl } from "obsidian";
import { unzipSync } from "fflate";
import type { App } from "obsidian";
import { commonTopDir } from "src/compile/steps/pandoc-export-utils";
import {
  validateIndex,
  normalizeIndex,
  resolveInstallSet,
  INSTALLED_MANIFEST_NAME,
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

export type DownloadResult = { count: number; dest: string; files: string[] };

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
  destFolder: string
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
  const adapter = app.vault.adapter;

  const written: string[] = [];
  for (const p of filePaths) {
    const rel = top ? p.slice(top.length) : p;
    if (!rel) continue;
    const full = `${destFolder}/${rel}`;
    const parent = full.split("/").slice(0, -1).join("/");
    if (parent) await ensureFolder(adapter, parent);
    const data = files[p];
    const ab = data.buffer.slice(
      data.byteOffset,
      data.byteOffset + data.byteLength
    );
    await adapter.writeBinary(full, ab);
    written.push(rel);
  }
  if (written.length === 0) {
    throw new Error("The downloaded archive contained no files.");
  }
  return { count: written.length, dest: destFolder, files: written };
}

/** SHA-256 of an ArrayBuffer as lowercase hex, for optional integrity checks. */
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
    const files = a.files ?? [];
    if (files.length > 0 && files.every((f) => onDisk.has(f.path))) ids.add(a.id);
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
  destFolder: string
): Promise<string[]> {
  const adapter = app.vault.adapter;
  const written: string[] = [];
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
    const full = `${destFolder}/${file.path}`;
    const parent = full.split("/").slice(0, -1).join("/");
    if (parent) await ensureFolder(adapter, parent);
    await adapter.writeBinary(full, ab);
    written.push(file.path);
  }
  return written;
}

/**
 * Install an asset and its `requires` closure (recipe → its filters/template/csl),
 * recording each in the install manifest. Returns the added/updated records.
 */
export async function installAssetWithDeps(
  app: App,
  index: MarketIndex,
  assetId: string,
  destFolder: string
): Promise<InstalledRecord[]> {
  const set = resolveInstallSet(index, assetId);
  const manifest = await readInstalledManifest(app, destFolder);
  const records: InstalledRecord[] = [];
  for (const asset of set) {
    const files = await installMarketAsset(app, asset, destFolder);
    const rec: InstalledRecord = {
      id: asset.id,
      version: asset.version,
      kind: "asset",
      files,
      installedAt: new Date().toISOString(),
    };
    manifest[asset.id] = rec;
    records.push(rec);
  }
  await writeInstalledManifest(app, destFolder, manifest);
  return records;
}

/** Install a bundle zip (reusing the zip downloader) and record it in the manifest. */
export async function installMarketBundle(
  app: App,
  bundle: MarketBundle,
  destFolder: string
): Promise<InstalledRecord> {
  const { files } = await downloadPandocAssets(app, bundle.download, destFolder);
  const manifest = await readInstalledManifest(app, destFolder);
  const rec: InstalledRecord = {
    id: bundle.id,
    version: bundle.version,
    kind: "bundle",
    files,
    installedAt: new Date().toISOString(),
  };
  manifest[bundle.id] = rec;
  await writeInstalledManifest(app, destFolder, manifest);
  return rec;
}

/** Remove a previously-installed asset/bundle's files and its manifest record. */
export async function uninstallMarketItem(
  app: App,
  destFolder: string,
  id: string
): Promise<void> {
  const manifest = await readInstalledManifest(app, destFolder);
  const rec = manifest[id];
  if (!rec) return;
  for (const rel of rec.files) {
    const full = `${destFolder}/${rel}`;
    if (await app.vault.adapter.exists(full)) {
      await app.vault.adapter.remove(full);
    }
  }
  delete manifest[id];
  await writeInstalledManifest(app, destFolder, manifest);
}
