import type { Draft, ProjectAsset } from "src/model/types";
import {
  draftIndexFolder,
  draftParentFolder,
  projectRootPath,
} from "src/model/project-resources";
import {
  assetIdFor,
  joinPath,
  slugifyAssetName,
} from "src/model/project-index";
import {
  PAPER_PARTS,
  type PaperPartId,
  type ProjectForm,
} from "src/model/scaffold/parts";

/**
 * Pure planning for "Add paper components…" — deciding *what* to add to an
 * existing project and *where*, with no vault access. The command layer executes
 * the plan; everything decidable lives here so it can be unit tested.
 */

/** How a project records its drafts, plus the un-addable mixed state. */
export type ProjectFormState = ProjectForm | "mixed" | "empty";

/**
 * Which shape is this project in?
 *
 * A project is `project` form only when *every* draft comes from the same index
 * — a project half-converted (or two indexes sharing a title) is `mixed` and
 * must not be written to, since neither write path would be correct for all of
 * its drafts.
 */
export function projectFormOf(drafts: Draft[]): ProjectFormState {
  if (drafts.length === 0) return "empty";
  const indexed = drafts.filter((d) => d.indexPath);
  if (indexed.length === 0) return "legacy";
  // Some drafts converted and some not: neither write path is right for all.
  if (indexed.length !== drafts.length) return "mixed";
  const indexPaths = new Set(indexed.map((d) => d.indexPath));
  return indexPaths.size === 1 ? "project" : "mixed";
}

/** The single `format: project` index path, or null when there isn't exactly one. */
export function projectIndexPathOf(drafts: Draft[]): string | null {
  const indexPaths = new Set(
    drafts.map((d) => d.indexPath).filter((p): p is string => !!p)
  );
  return indexPaths.size === 1 ? [...indexPaths][0] : null;
}

/**
 * The folder new files are written under.
 *
 * For `project` form this must be the index note's own folder: an asset's
 * `folder`/`file` is resolved relative to it, so anchoring anywhere else would
 * need every path translated twice.
 *
 * For `legacy` form it is the project root — the lowest common ancestor of the
 * drafts' index folders. That degrades in one case: a project whose only
 * remaining draft is the Supplementary has its root *inside* `supplementary/`,
 * and writing a Main Manuscript there would nest it wrongly. When the root has
 * no `metadata.json` but its parent does, step up one level. Only one level:
 * walking up without a bound would escape toward the vault root.
 */
export function anchorFolderFor(
  drafts: Draft[],
  form: ProjectForm,
  hasMetadata: (folder: string) => boolean
): string {
  if (form === "project") {
    const indexPath = projectIndexPathOf(drafts);
    return indexPath ? draftParentFolder(indexPath) : projectRootPath(drafts);
  }
  const root = projectRootPath(drafts);
  if (!hasMetadata(root)) {
    const parent = draftParentFolder(root);
    if (parent !== root && hasMetadata(parent)) return parent;
  }
  return root;
}

/**
 * The parts this project already has.
 *
 * Matched on `draftTitle` first — for a project asset that is the asset's
 * `name`, so one rule covers both forms. A user who renamed a draft would fall
 * through, so `workflow` and then the part's own paths act as backstops. Any of
 * the three counts as present: over-reporting a part merely hides it from the
 * list, while under-reporting would offer to create files that already exist —
 * and that is caught for real by the conflict check at write time.
 */
export function presentParts(
  drafts: Draft[],
  pathExists: (path: string) => boolean,
  anchor: string
): Set<PaperPartId> {
  const present = new Set<PaperPartId>();
  for (const part of PAPER_PARTS) {
    const byTitle = drafts.some((d) => d.draftTitle === part.draftTitle);
    const byWorkflow = drafts.some((d) => d.workflow === part.workflow);
    const byPath = part.ownedPaths.some((p) => pathExists(joinPath(anchor, p)));
    if (byTitle || byWorkflow || byPath) present.add(part.id);
  }
  return present;
}

/** Ids already taken in an index, so a new asset never collides. */
export function usedAssetIds(assets: ProjectAsset[]): Set<string> {
  return new Set(assets.map((a) => assetIdFor(a)));
}

/**
 * An asset id derived from its name, suffixed until unique. Mirrors
 * `withUniqueIds` in the convert planner, but for appending one at a time.
 */
export function uniqueAssetId(name: string, used: Set<string>): string {
  const base = slugifyAssetName(name);
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!used.has(candidate)) return candidate;
  }
}

/** All drafts of every project whose files live under `folder`. */
export function projectsUnderFolder(
  folder: string,
  allDrafts: Draft[]
): string[] {
  const prefix = folder ? `${folder}/` : "";
  const titles = new Set<string>();
  for (const draft of allDrafts) {
    // Must go through draftIndexFolder: an asset's own vaultPath is synthetic
    // (`<indexPath>::<assetId>`) and would not resolve as a real path.
    const dir = draftIndexFolder(draft);
    if (!folder || dir === folder || dir.startsWith(prefix)) {
      titles.add(draft.title);
    }
  }
  return [...titles].sort();
}

export type AddComponentsPlan = {
  form: ProjectFormState;
  anchor: string;
  indexPath: string | null;
  /** Parts the project already has — not offered. */
  present: Set<PaperPartId>;
  /** Parts that can still be added. */
  addable: PaperPartId[];
  /**
   * Whether the example assets are already in the project. Read here rather
   * than asked again, so this flow never rewrites `figs/` or `README.md` and the
   * new part's body text matches what the project actually contains.
   */
  examples: boolean;
};

/** Work out what can be added to a project, and where it would go. */
export function planAddComponents(
  drafts: Draft[],
  deps: {
    pathExists: (path: string) => boolean;
    hasMetadata: (folder: string) => boolean;
  }
): AddComponentsPlan {
  const form = projectFormOf(drafts);
  if (form === "mixed" || form === "empty") {
    return {
      form,
      anchor: "",
      indexPath: null,
      present: new Set(),
      addable: [],
      examples: false,
    };
  }
  const anchor = anchorFolderFor(drafts, form, deps.hasMetadata);
  const present = presentParts(drafts, deps.pathExists, anchor);
  return {
    form,
    anchor,
    indexPath: form === "project" ? projectIndexPathOf(drafts) : null,
    present,
    addable: PAPER_PARTS.filter((p) => !present.has(p.id)).map((p) => p.id),
    examples: deps.pathExists(joinPath(anchor, EXAMPLE_FIGURE)),
  };
}

/** The example figure's path, whose presence stands for the example bundle. */
export const EXAMPLE_FIGURE = "figs/example_figure.png";
