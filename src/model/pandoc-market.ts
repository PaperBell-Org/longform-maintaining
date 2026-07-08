import type { SerializedWorkflow } from "./types";

/**
 * The Pandoc asset marketplace: types + pure logic for a machine-readable index
 * of downloadable Pandoc assets (recipes / filters / templates / CSL) and bundles,
 * hosted as a single `index.json` in an external assets repository. This module is
 * pure and unit-tested (no obsidian import); fetching (`fetchMarketIndex`) and
 * installing live in `pandoc-assets.ts`, the browse UI in `src/view/pandoc-market/`.
 * See docs/ASSET_MARKETPLACE_SPEC.md for the repo spec.
 */

/** Default marketplace index — a raw `index.json` in the assets repo. Overridable in settings. */
export const DEFAULT_MARKET_INDEX_URL =
  "https://raw.githubusercontent.com/PaperBell-Org/paperbell-pandoc-assets/main/index.json";

/** The index schema version this plugin understands. */
export const MARKET_SCHEMA_VERSION = 1;

/** File name of the install manifest, written at the assets root. */
export const INSTALLED_MANIFEST_NAME = "installed.json";

/** An asset's kind — mirrors the assets-root subdirectory it installs into. */
export type AssetType = "recipe" | "filter" | "template" | "csl";

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
  /** Asset ids contained in the bundle (for display / "already have it"). */
  assets?: string[];
  /** Optional recommended workflows — built-in step ids only, never user scripts. */
  workflows?: SerializedWorkflow[];
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
export type InstallState = "not-installed" | "installed" | "update-available";

export function installStateFor(
  manifest: InstalledManifest,
  id: string,
  marketVersion: string
): InstallState {
  const rec = manifest[id];
  if (!rec) return "not-installed";
  return compareVersions(rec.version, marketVersion) < 0
    ? "update-available"
    : "installed";
}
