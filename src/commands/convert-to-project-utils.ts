import type { Draft, ProjectAsset, ProjectIndexEntry } from "src/model/types";
import { indentedScenesToArrays } from "src/model/project-index";
import { draftParentFolder } from "src/model/project-resources";

/**
 * Pure logic for the "Convert project to single index" command: turn a legacy
 * title-grouped project (several sibling index files, one per asset) into a
 * single `format: project` index. Side-effect free and unit tested; the command
 * writes the plan to the vault.
 */

export type ProjectIndexPlan = {
  /** Where the new single index file should be written (relative to the vault). */
  indexPath: string;
  /** The `longform` frontmatter object for that new index. */
  indexEntry: ProjectIndexEntry;
  /** Old index files whose `longform` frontmatter should be stripped. */
  stripPaths: string[];
};

/** A stable, readable asset id. Keeps unicode (CJK) names rather than dropping them. */
export function slugifyAssetName(name: string): string {
  const ascii = (name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return ascii || (name || "").trim() || "asset";
}

function joinPath(folder: string, name: string): string {
  return folder ? `${folder}/${name}` : name;
}

/** A path made relative to `root` (which must be an ancestor of, or equal to, it). */
function relativeToRoot(path: string, root: string): string {
  if (!root) return path;
  if (path === root) return "";
  if (path.startsWith(`${root}/`)) return path.slice(root.length + 1);
  return path;
}

/**
 * Build the on-disk `assets[]` entry for one legacy draft. `folder`/`file` are
 * made relative to `projectRoot` (where the new index will live), so they match
 * how the runtime writer (`assetEntryFromDraft`) later serializes them.
 */
export function assetFromLegacyDraft(
  draft: Draft,
  projectRoot: string
): ProjectAsset {
  const name = draft.draftTitle ?? draft.title;
  const id = slugifyAssetName(name);
  const workflow = draft.workflow ?? undefined;

  if (draft.format === "single") {
    // A legacy single draft's own index note IS its body — keep it as the body.
    return {
      name,
      id,
      format: "single",
      file: relativeToRoot(draft.vaultPath, projectRoot),
      workflow,
    };
  }

  const indexFolder = draftParentFolder(draft.vaultPath);
  const trimmed = (draft.sceneFolder || "").replace(/^\/+|\/+$/g, "");
  const sceneFolderAbs = trimmed ? joinPath(indexFolder, trimmed) : indexFolder;
  const folder = relativeToRoot(sceneFolderAbs, projectRoot) || "/";

  const entry: ProjectAsset = {
    name,
    id,
    format: "scenes",
    folder,
    workflow,
    scenes: indentedScenesToArrays(draft.scenes),
  };
  if (draft.sceneTemplate) entry.sceneTemplate = draft.sceneTemplate;
  if (draft.ignoredFiles && draft.ignoredFiles.length > 0) {
    entry.ignoredFiles = draft.ignoredFiles;
  }
  return entry;
}

/** Ensure every asset id is unique, disambiguating collisions with a suffix. */
function withUniqueIds(assets: ProjectAsset[]): ProjectAsset[] {
  const seen = new Map<string, number>();
  return assets.map((a) => {
    const id = a.id ?? "asset";
    const count = seen.get(id) ?? 0;
    seen.set(id, count + 1);
    return count === 0 ? { ...a, id } : { ...a, id: `${id}-${count + 1}` };
  });
}

/**
 * Plan the conversion of a legacy title-grouped project into a single index.
 * The new index is placed at `<projectRoot>/<title> (Index).md`; the command is
 * responsible for guarding against a name collision.
 */
export function buildProjectIndexFromDrafts(
  projectDrafts: Draft[],
  projectRoot: string,
  title: string
): ProjectIndexPlan {
  const assets = withUniqueIds(
    projectDrafts.map((d) => assetFromLegacyDraft(d, projectRoot))
  );
  return {
    indexPath: joinPath(projectRoot, `${title} (Index).md`),
    indexEntry: { format: "project", title, assets },
    stripPaths: projectDrafts.map((d) => d.vaultPath),
  };
}
