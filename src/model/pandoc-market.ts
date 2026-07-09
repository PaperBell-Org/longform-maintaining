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
  kind: "asset" | "bundle";
  /** Dest-relative paths this install wrote (used to uninstall / diff). */
  files: string[];
  installedAt: string;
}

/** id → install record, persisted as `installed.json` at the assets root. */
export type InstalledManifest = Record<string, InstalledRecord>;

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
