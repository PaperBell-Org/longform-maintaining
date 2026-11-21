import type { SerializedWorkflow } from "./types";

/**
 * The Pandoc asset marketplace: types + pure logic for a machine-readable index
 * of downloadable Pandoc assets (recipes / filters / templates / CSL) and bundles,
 * hosted as a single `index.json` in an external assets repository. This module is
 * pure and unit-tested (no obsidian import); fetching (`fetchMarketIndex`) and
 * installing live in `pandoc-assets.ts`, the browse UI in `src/view/pandoc-market/`.
 * See docs/ASSET_MARKETPLACE_SPEC.md for the repo spec.
 */

/**
 * Default marketplace index — the `index.json` published as a release asset of the
 * assets repo. `releases/latest/download/…` always resolves to the newest release,
 * so this URL is stable across versions. Overridable in settings.
 */
export const DEFAULT_MARKET_INDEX_URL =
  "https://github.com/PaperBell-Org/paperout-assets-market/releases/latest/download/index.json";

/** The index schema version this plugin understands. */
export const MARKET_SCHEMA_VERSION = 1;

/** File name of the install manifest, written at the assets root. */
export const INSTALLED_MANIFEST_NAME = "installed.json";

/** An asset's kind — mirrors the assets-root subdirectory it installs into.
 * `include` is an internal defaults fragment (e.g. crossref.yaml) — a dependency,
 * not a standalone install. */
export type AssetType = "recipe" | "filter" | "template" | "csl" | "include";

/** One file an asset installs: a dest-relative path + the raw URL to fetch it. */
export interface MarketFile {
  /** Path under the assets root, e.g. "defaults/paperbell.yaml". */
  path: string;
  /** Absolute raw URL to download the file from. */
  download: string;
  /** Optional lowercase hex SHA-256 for integrity checking. */
  sha256?: string;
}

/** A single downloadable asset (recipe / filter / template / csl). */
export interface MarketAsset {
  id: string; // globally unique, stable; the install-manifest key
  type: AssetType;
  name: string;
  description?: string;
  version: string; // semver
  author?: string;
  tags?: string[];
  /** Files this asset installs (a template may carry .sty siblings). */
  files: MarketFile[];
  /** Other asset ids this one needs (recipes → their filters/template/csl). */
  requires?: string[];
  /** External system tools (e.g. "pandoc-crossref") — surfaced, never downloaded. */
  systemDeps?: string[];
  /** Optional index metadata: curation tier, review status, docs, preview image. */
  tier?: string;
  reviewed?: boolean;
  readmePath?: string;
  previewPath?: string;
  /** Resolved raw URLs (computed in normalizeIndex from repo/tag + path). */
  readmeUrl?: string;
  previewUrl?: string;
}

/** A pre-packaged suite: one zip laid out as defaults/filters/templates/csl. */
export interface MarketBundle {
  id: string;
  name: string;
  description?: string;
  version: string;
  author?: string;
  tags?: string[];
  /** Raw URL of the bundle zip (installed via `downloadPandocAssets`). */
  download: string;
  sha256?: string;
  /** Asset ids / file paths contained in the bundle (for display). */
  assets?: string[];
  /** Optional recommended workflows — built-in step ids only, never user scripts. */
  workflows?: SerializedWorkflow[];
  /** Optional index metadata. */
  tier?: string;
  reviewed?: boolean;
  readmePath?: string;
  previewPath?: string;
  readmeUrl?: string;
  previewUrl?: string;
}

/** The parsed marketplace index. */
export interface MarketIndex {
  schemaVersion: number;
  name?: string;
  updatedAt?: string;
  bundles: MarketBundle[];
  assets: MarketAsset[];
}

/** Validate a parsed index against the schema this plugin supports. Throws on mismatch. */
export function validateIndex(parsed: unknown): MarketIndex {
  const idx = parsed as MarketIndex;
  if (!idx || typeof idx !== "object") {
    throw new Error("Marketplace index is empty or not an object.");
  }
  if (idx.schemaVersion !== MARKET_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported marketplace schemaVersion ${idx.schemaVersion} (this plugin supports ${MARKET_SCHEMA_VERSION}). Update the plugin or the index.`
    );
  }
  if (!Array.isArray(idx.assets) || !Array.isArray(idx.bundles)) {
    throw new Error("Marketplace index must have `assets` and `bundles` arrays.");
  }
  // `_`-prefixed ids name the install manifest's own records (`_kept`,
  // `_toolchain`); a market entry with one would overwrite them.
  const reserved = [...idx.assets, ...idx.bundles].find(
    (e) => typeof e?.id === "string" && e.id.startsWith("_")
  );
  if (reserved) {
    throw new Error(
      `Marketplace id "${reserved.id}" is reserved: ids starting with "_" are used by the install manifest.`
    );
  }
  return idx;
}

/**
 * Normalize an index entry from the assets repo's published shape into the shape
 * the plugin consumes. The `build-index.mjs` output uses `title`, a single `url` +
 * `sourcePath` (+ `extraFiles`), and bundle `url`; internally we use `name` and a
 * `files[]` array with a `download` URL each. Already-internal entries pass through.
 */
function normalizeAssetFiles(raw: Record<string, unknown>): MarketFile[] {
  if (Array.isArray(raw.files)) return raw.files as MarketFile[];
  const files: MarketFile[] = [];
  const src = (raw.sourcePath ?? raw.path) as string | undefined;
  const url = raw.url as string | undefined;
  if (src && url) {
    files.push({ path: src, download: url, sha256: raw.sha256 as string | undefined });
    // extraFiles are bare repo-relative paths; derive their URL from the main
    // one's base (the `.../<tag>/` prefix before sourcePath).
    const extra = raw.extraFiles as string[] | undefined;
    if (Array.isArray(extra) && url.endsWith(src)) {
      const base = url.slice(0, url.length - src.length);
      for (const ef of extra) files.push({ path: ef, download: base + ef });
    }
  }
  return files;
}

/** Pick a localized string from a plain string or a `{ locale: string }` map. */
export function pickLocalized(v: unknown, locale: string): string | undefined {
  if (v == null) return undefined;
  if (typeof v === "string") return v;
  if (typeof v === "object") {
    const o = v as Record<string, string>;
    return o[locale] ?? o.en ?? Object.values(o)[0];
  }
  return String(v);
}

export function normalizeIndex(idx: MarketIndex, locale = "en"): MarketIndex {
  const raw = idx as unknown as Record<string, unknown>;
  const repo = raw.repo as string | undefined;
  const tag = raw.tag as string | undefined;
  const rawBase =
    repo && tag ? `https://raw.githubusercontent.com/${repo}/${tag}/` : "";
  const url = (path: unknown) =>
    typeof path === "string" && rawBase ? rawBase + path : undefined;

  const asset = (a: Record<string, unknown>): MarketAsset => ({
    id: a.id as string,
    type: a.type as AssetType,
    name: pickLocalized(a.title ?? a.name, locale) ?? (a.id as string),
    description: pickLocalized(a.description, locale),
    version: (a.version ?? "0.0.0") as string,
    author: a.author as string | undefined,
    tags: a.tags as string[] | undefined,
    files: normalizeAssetFiles(a),
    requires: a.requires as string[] | undefined,
    systemDeps: a.systemDeps as string[] | undefined,
    tier: a.tier as string | undefined,
    reviewed: a.reviewed as boolean | undefined,
    readmePath: a.readmePath as string | undefined,
    previewPath: a.previewPath as string | undefined,
    readmeUrl: url(a.readmePath),
    previewUrl: url(a.previewPath),
  });
  const assets = idx.assets.map((a) =>
    asset(a as unknown as Record<string, unknown>)
  );
  // A bundle is a recipe's packaging and shares its id. Upstream only localizes
  // recipes (bundle title/description stay English), so reuse the same-id recipe's
  // localized name/description when present; fall back to the bundle's own.
  const recipeName = new Map<string, string>();
  const recipeDesc = new Map<string, string | undefined>();
  for (const a of assets)
    if (a.type === "recipe") {
      recipeName.set(a.id, a.name);
      recipeDesc.set(a.id, a.description);
    }
  const bundle = (b: Record<string, unknown>): MarketBundle => {
    const id = b.id as string;
    return {
      id,
      name:
        recipeName.get(id) ??
        pickLocalized(b.title ?? b.name, locale) ??
        id,
      description:
        recipeDesc.get(id) ?? pickLocalized(b.description, locale),
      version: (b.version ?? "0.0.0") as string,
      author: b.author as string | undefined,
      tags: b.tags as string[] | undefined,
      download: (b.download ?? b.url) as string,
      sha256: b.sha256 as string | undefined,
      assets: b.assets as string[] | undefined,
      workflows: b.workflows as MarketBundle["workflows"],
      tier: b.tier as string | undefined,
      reviewed: b.reviewed as boolean | undefined,
      readmePath: b.readmePath as string | undefined,
      previewPath: b.previewPath as string | undefined,
      readmeUrl: url(b.readmePath),
      previewUrl: url(b.previewPath),
    };
  };
  return {
    ...idx,
    assets,
    bundles: idx.bundles.map((b) => bundle(b as unknown as Record<string, unknown>)),
  };
}

/**
 * Expand an asset id into the ordered install set: its `requires` closure first,
 * then the asset itself, deduplicated. Throws on an unknown dependency id; cycles
 * are tolerated (each id installs once). Used to auto-install a recipe's
 * filters/template/csl alongside it.
 */
export function resolveInstallSet(
  index: MarketIndex,
  assetId: string
): MarketAsset[] {
  const byId = new Map(index.assets.map((a) => [a.id, a] as const));
  const out: MarketAsset[] = [];
  const seen = new Set<string>();
  const visit = (id: string) => {
    if (seen.has(id)) return;
    const asset = byId.get(id);
    if (!asset) throw new Error(`Unknown asset id referenced as a dependency: ${id}`);
    seen.add(id); // mark before recursing so a cycle back to `id` short-circuits
    for (const dep of asset.requires ?? []) visit(dep);
    out.push(asset);
  };
  visit(assetId);
  return out;
}

/**
 * Minimal numeric semver compare (ignores pre-release tags): returns -1 / 0 / 1
 * for a < / = / > b. Used to flag "update available".
 */
export function compareVersions(a: string, b: string): number {
  const norm = (v: string) =>
    v
      .split("-")[0]
      .split(".")
      .map((n) => parseInt(n, 10) || 0);
  const pa = norm(a);
  const pb = norm(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

/** A record of one installed asset/bundle, for update detection & uninstall. */
export interface InstalledRecord {
  id: string;
  version: string;
  /**
   * `kept` and `toolchain` are the reserved records {@link KEPT_RECORD_ID} and
   * {@link TOOLCHAIN_RECORD_ID}; no market entry ever has their ids.
   */
  kind: "asset" | "bundle" | "kept" | "toolchain";
  /** Dest-relative paths this install wrote (used to uninstall / diff). */
  files: string[];
  installedAt: string;
  /**
   * `defaults/<recipe>.yaml` → the `systemDeps` that recipe declares in the
   * index. Kept per preset, not per install: a bundle carries several recipes
   * and a shared list would make every preset in `full.zip` demand every tool
   * any of them needs. Written here because the index is only in hand while
   * installing — export-time preflight has this file and nothing else.
   */
  presetDeps?: Record<string, string[]>;
  /**
   * Dest-relative path → sha256 of the bytes this install wrote. Lets a later
   * reinstall/update/uninstall tell an untouched file from one the user
   * replaced (e.g. the cover letter's signature). Absent on records written
   * before it existed.
   */
  hashes?: Record<string, string>;
}

/** id → install record, persisted as `installed.json` at the assets root. */
export type InstalledManifest = Record<string, InstalledRecord>;

/**
 * What the manifest knows about each installed file: which paths any record
 * tracks, the last hash written for each, and when that record was installed
 * (the newest record wins).
 */
export type InstallBaseline = {
  tracked: Set<string>;
  hashes: Record<string, string>;
  installedAt: Record<string, string>;
};

export function installBaseline(manifest: InstalledManifest): InstallBaseline {
  const tracked = new Set<string>();
  const hashes: Record<string, string> = {};
  const installedAt: Record<string, string> = {};
  const records = Object.values(manifest).sort((a, b) =>
    a.installedAt.localeCompare(b.installedAt)
  );
  for (const rec of records) {
    for (const f of rec.files ?? []) {
      tracked.add(f);
      installedAt[f] = rec.installedAt;
    }
    Object.assign(hashes, rec.hashes ?? {});
  }
  return { tracked, hashes, installedAt };
}

/**
 * Reserved manifest record for files an uninstall kept because the user had
 * changed them. Without it the kept file would look like one the market never
 * installed, and the next install would overwrite it.
 */
export const KEPT_RECORD_ID = "_kept";

/**
 * Reserved manifest record for the toolchain zip the setup modal downloads.
 * Recording it keeps the hashes of files it overwrote current — otherwise every
 * later market update would mistake them for user edits — and tracks any
 * `<path>.new` it wrote so a later install can clean that up.
 */
export const TOOLCHAIN_RECORD_ID = "_toolchain";

function union(a: readonly string[] | undefined, b: readonly string[]): string[] {
  return [...new Set([...(a ?? []), ...b])];
}

/**
 * Hand `paths` back from the kept record: an install that writes them now owns
 * them. Drops the kept record once it is empty.
 */
export function releaseKeptFiles(
  manifest: InstalledManifest,
  paths: readonly string[]
): InstalledManifest {
  const kept = manifest[KEPT_RECORD_ID];
  if (!kept) return manifest;
  const taken = new Set(paths);
  const files = kept.files.filter((f) => !taken.has(f));
  const next = { ...manifest };
  if (files.length === 0) {
    delete next[KEPT_RECORD_ID];
    return next;
  }
  const hashes: Record<string, string> = {};
  for (const f of files) {
    const h = kept.hashes?.[f];
    if (h !== undefined) hashes[f] = h;
  }
  next[KEPT_RECORD_ID] = { ...kept, files, hashes };
  return next;
}

/**
 * The manifest once `id` is uninstalled. Files the uninstall kept (see
 * {@link planFileRemove}) move to the kept record with the hash that install
 * wrote, so a reinstall still sees the user's change and writes `<path>.new`.
 */
export function manifestAfterUninstall(
  manifest: InstalledManifest,
  id: string,
  kept: readonly string[]
): InstalledManifest {
  const rec = manifest[id];
  const next = { ...manifest };
  delete next[id];
  if (!rec || kept.length === 0) return next;

  const prev = next[KEPT_RECORD_ID];
  const hashes: Record<string, string> = { ...(prev?.hashes ?? {}) };
  for (const f of kept) {
    const h = rec.hashes?.[f];
    if (h !== undefined) hashes[f] = h;
  }
  // The older stamp: for a hash-less record, "modified after install" is
  // judged against it, and the earlier install is the one the file came from.
  const installedAt =
    prev && prev.installedAt < rec.installedAt ? prev.installedAt : rec.installedAt;
  next[KEPT_RECORD_ID] = {
    id: KEPT_RECORD_ID,
    version: "0",
    kind: "kept",
    files: union(prev?.files, kept),
    installedAt,
    hashes,
  };
  return next;
}

/**
 * The manifest once the setup modal's toolchain zip wrote `written`. The record
 * describes this download alone: carrying an earlier zip's entries forward
 * under the new stamp would make their stale hashes outrank a market install
 * that updated those files since.
 */
export function manifestAfterToolchainDownload(
  manifest: InstalledManifest,
  written: { files: readonly string[]; hashes: Record<string, string> },
  installedAt: string
): InstalledManifest {
  const next = releaseKeptFiles(manifest, written.files);
  next[TOOLCHAIN_RECORD_ID] = {
    id: TOOLCHAIN_RECORD_ID,
    version: "0",
    kind: "toolchain",
    files: [...written.files],
    installedAt,
    hashes: { ...written.hashes },
  };
  return next;
}

/** Suffix for a new version written next to a file the user changed. */
export const PRESERVED_SUFFIX = ".new";

/** Leeway for "modified after install": the record is stamped after the writes. */
const MTIME_SLACK_MS = 60_000;

/**
 * For a file recorded before hashes were kept: was it modified after the
 * install that wrote it? Judged by mtime, the only evidence left.
 */
export function modifiedSinceInstall(
  mtimeMs: number | null,
  installedAt: string | undefined
): boolean {
  if (mtimeMs === null || !installedAt) return false;
  const at = Date.parse(installedAt);
  return Number.isFinite(at) && mtimeMs > at + MTIME_SLACK_MS;
}

/** What we know about the file currently at an install path. */
export type DiskState = {
  /** sha256 of the file on disk, or `null` when there is none. */
  hash: string | null;
  /** For a record without hashes: whether its mtime is after that install. */
  modifiedSinceInstall: boolean;
};

/**
 * How to install one file over what is on disk:
 * - `write`: nothing there, or it is untouched since our last install (or was
 *   never installed by the market, e.g. the first-run toolchain zip);
 * - `skip-same`: the disk already holds exactly the incoming bytes;
 * - `write-new`: the user changed a file we installed — keep theirs and put
 *   the incoming version at `<path>.new`.
 * "Changed" is a hash mismatch against the recorded install; for a record
 * from before hashes were kept, it is an mtime after that install.
 */
export function planFileWrite(p: {
  disk: DiskState;
  incomingHash: string;
  tracked: boolean;
  recordedHash?: string;
}): "write" | "skip-same" | "write-new" {
  if (p.disk.hash === null) return "write";
  if (p.disk.hash === p.incomingHash) return "skip-same";
  if (p.recordedHash !== undefined) {
    return p.disk.hash === p.recordedHash ? "write" : "write-new";
  }
  return p.tracked && p.disk.modifiedSinceInstall ? "write-new" : "write";
}

/**
 * Whether uninstall may delete a file: only when it still holds what we
 * installed — by hash, or for an older record without hashes, by mtime.
 */
export function planFileRemove(
  disk: DiskState,
  recordedHash: string | undefined
): "remove" | "keep" | "missing" {
  if (disk.hash === null) return "missing";
  const changed =
    recordedHash !== undefined
      ? disk.hash !== recordedHash
      : disk.modifiedSinceInstall;
  return changed ? "keep" : "remove";
}

/**
 * Whether installing `ids` (assets or bundles) puts `assetId` on disk —
 * directly or as part of a bundle.
 */
export function installsAsset(
  index: MarketIndex,
  ids: string[],
  assetId: string
): boolean {
  return ids.some(
    (id) =>
      id === assetId ||
      (index.bundles.find((b) => b.id === id)?.assets ?? []).includes(assetId)
  );
}

/** The `defaults/*.yaml` an asset installs — its recipe presets. */
function presetFiles(asset: MarketAsset): string[] {
  return (asset.files ?? [])
    .map((f) => f.path)
    .filter((p) => /^defaults\/[^/]+\.ya?ml$/i.test(p));
}

/**
 * Map each recipe preset these assets install to the system tools it declares,
 * for {@link InstalledRecord.presetDeps}. Assets with no `systemDeps` and files
 * that aren't presets drop out, so the result is empty for most installs.
 */
export function presetSystemDeps(
  assets: MarketAsset[]
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const asset of assets) {
    const deps = asset.systemDeps ?? [];
    if (deps.length === 0) continue;
    for (const preset of presetFiles(asset)) out[preset] = deps;
  }
  return out;
}

/**
 * Is every file of this asset among `paths`? The rule for "this asset is here":
 * used against the files found on disk (`detectPresentIds`) and against the
 * files a bundle declares (`bundledAssets`). An asset that installs nothing is
 * never "here" — it would otherwise match vacuously.
 */
export function assetFilesAllIn(asset: MarketAsset, paths: Set<string>): boolean {
  const files = asset.files ?? [];
  return files.length > 0 && files.every((f) => paths.has(f.path));
}

/**
 * The assets a bundle zip contains: every index asset whose files it all lists.
 * A bundle names files, not asset ids, so its recipes' `systemDeps` can only be
 * recovered this way.
 */
export function bundledAssets(
  index: MarketIndex,
  bundle: MarketBundle
): MarketAsset[] {
  const contents = new Set(bundle.assets ?? []);
  return index.assets.filter((a) => assetFilesAllIn(a, contents));
}

/**
 * The system tools the recipe at `presetPath` (`defaults/<name>.yaml`) declares,
 * according to the install manifest. Union across records, since an asset
 * install and a bundle install can both own the same preset.
 */
export function systemDepsForPreset(
  manifest: InstalledManifest,
  presetPath: string
): string[] {
  const out = new Set<string>();
  for (const rec of Object.values(manifest ?? {})) {
    for (const dep of rec?.presetDeps?.[presetPath] ?? []) out.add(dep);
  }
  return [...out];
}

/**
 * Given the index and the install manifest, the display state for an entry.
 * Pure so the UI and tests share one source of truth.
 */
export type InstallState =
  | "not-installed"
  | "installed" // tracked in the manifest, up to date
  | "update-available" // tracked, older than the index
  | "present"; // files already on disk but not tracked (e.g. synced/legacy)

export function installStateFor(
  manifest: InstalledManifest,
  id: string,
  marketVersion: string,
  presentIds?: Set<string>
): InstallState {
  const rec = manifest[id];
  if (rec) {
    return compareVersions(rec.version, marketVersion) < 0
      ? "update-available"
      : "installed";
  }
  if (presentIds?.has(id)) return "present";
  return "not-installed";
}
