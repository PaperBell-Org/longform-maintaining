import type { Draft } from "./types";

/** The folder containing an index note, derived from its vault path. */
export function draftParentFolder(vaultPath: string): string {
  return vaultPath.split("/").slice(0, -1).join("/");
}

/**
 * The real index file backing a draft. For an asset of a single-file
 * `format: project` index this is the shared index path; for a legacy draft
 * (whose own file is the index) it collapses to `vaultPath`. Use this — never
 * the raw `vaultPath`, which may be a synthetic `<indexPath>::<assetId>` key —
 * for any filesystem access (folder derivation, frontmatter reads/writes).
 */
export function draftIndexPath(draft: Draft): string {
  return draft.indexPath ?? draft.vaultPath;
}

/** The folder containing a draft's real index file. */
export function draftIndexFolder(draft: Draft): string {
  return draftParentFolder(draftIndexPath(draft));
}

/**
 * The real note to open/reveal for a draft: a single asset's external body
 * note if it has one, otherwise its index file. Never the synthetic `vaultPath`
 * of a project asset, which is not a real file on disk.
 */
export function draftNotePath(draft: Draft): string {
  if (draft.format === "single" && draft.bodyPath) return draft.bodyPath;
  return draftIndexPath(draft);
}

/**
 * The lowest common ancestor folder shared by a set of folder paths, computed
 * segment-wise. Returns "" (the vault root) when there is no shared prefix.
 */
export function lowestCommonAncestorFolder(folders: string[]): string {
  if (folders.length === 0) return "";
  const split = folders.map((f) => f.split("/").filter((s) => s.length > 0));
  let common = split[0];
  for (const segs of split.slice(1)) {
    let i = 0;
    while (i < common.length && i < segs.length && common[i] === segs[i]) {
      i++;
    }
    common = common.slice(0, i);
  }
  return common.join("/");
}

/**
 * The "project root" for a set of drafts: the lowest common ancestor of every
 * draft's folder. Shared resources (e.g. metadata.json) are searched for between
 * a draft's own folder and this root, inclusive.
 */
export function projectRootPath(projectDrafts: Draft[]): string {
  return lowestCommonAncestorFolder(
    projectDrafts.map((d) => draftIndexFolder(d))
  );
}

/**
 * Ordered candidate paths for a named resource, searched from `startDir` upward
 * to `rootDir` (inclusive). At each level both `<dir>/<baseName>` and
 * `<dir>/source/<baseName>` are produced. When `rootDir` is not an ancestor of
 * (or equal to) `startDir`, only `startDir` is searched — so callers that don't
 * know a project root degrade to the original single-folder behavior.
 */
export function projectResourceCandidatePaths(
  startDir: string,
  rootDir: string,
  baseName: string
): string[] {
  const startSegs = startDir.split("/").filter((s) => s.length > 0);
  const rootSegs = (rootDir ?? "").split("/").filter((s) => s.length > 0);

  const rootIsAncestor =
    rootSegs.length <= startSegs.length &&
    rootSegs.every((s, i) => s === startSegs[i]);
  const minLen = rootIsAncestor ? rootSegs.length : startSegs.length;

  const candidates: string[] = [];
  for (let len = startSegs.length; len >= minLen; len--) {
    const dir = startSegs.slice(0, len).join("/");
    const prefix = dir.length > 0 ? `${dir}/` : "";
    candidates.push(`${prefix}${baseName}`);
    candidates.push(`${prefix}source/${baseName}`);
  }
  return candidates;
}
