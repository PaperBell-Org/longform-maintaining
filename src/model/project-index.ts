import type {
  Draft,
  IndentedScene,
  ProjectAsset,
  ProjectIndexEntry,
} from "./types";
import { draftParentFolder } from "./project-resources";

/**
 * Pure logic for the single-file `format: project` index. A project index is a
 * note whose `longform` frontmatter lists several *assets* (main text,
 * supplementary, response letter, cover letter, …); each asset expands into one
 * `Draft` so the rest of the plugin (compile, stores, sidebar) is unchanged.
 *
 * This module is intentionally free of any `obsidian` import so it stays unit
 * testable. Anything touching the vault (scene-folder scans, frontmatter I/O)
 * lives in `store-vault-sync.ts`, which consumes the drafts produced here.
 */

// ── Scene ⇄ nested-array conversion ─────────────────────────────────────────
// These are pure and shared by both the legacy per-file drafts and project
// assets. They live here (not in draft-utils, which imports obsidian) so both
// the model and the tests can use them without pulling in obsidian.

export function indentedScenesToArrays(indented: IndentedScene[]) {
  const result: any = [];
  // track our current indentation level
  let currentIndent = 0;
  // array for the current indentation level
  let currentNesting = result;
  // memoized arrays so that later, lesser indents can use earlier-created array
  const nestingAt: Record<number, any> = {};
  nestingAt[0] = currentNesting;

  indented.forEach(({ title, indent }) => {
    if (indent > currentIndent) {
      // we're at a deeper indentation level than current,
      // so build up a nest and memoize it
      while (currentIndent < indent) {
        currentIndent = currentIndent + 1;
        const newNesting: any = [];
        currentNesting.push(newNesting);
        nestingAt[currentIndent] = newNesting;
        currentNesting = newNesting;
      }
    } else if (indent < currentIndent) {
      // we're at a lesser indentation level than current,
      // so drop back to previously memoized nesting
      currentNesting = nestingAt[indent];
      currentIndent = indent;
    }

    // actually insert the value
    currentNesting.push(title);
  });
  return result;
}

export function arraysToIndentedScenes(
  arr: any,
  result: IndentedScene[] = [],
  currentIndent = -1
): IndentedScene[] {
  if (arr instanceof Array) {
    if (arr.length === 0) {
      return result;
    }

    const next = arr.shift();
    const inner = arraysToIndentedScenes(next, [], currentIndent + 1);
    return arraysToIndentedScenes(arr, [...result, ...inner], currentIndent);
  } else {
    return [
      {
        title: arr,
        indent: currentIndent,
      },
    ];
  }
}

// ── Asset id + path helpers ─────────────────────────────────────────────────

/** Join a folder and a relative name into a vault path (handles the root). */
function joinPath(folder: string, name: string): string {
  const cleaned = name.replace(/^\.\//, "");
  return folder ? `${folder}/${cleaned}` : cleaned;
}

/**
 * The stable id of an asset within its index. Prefer an explicit `id`; fall
 * back to the display `name` so a hand-authored index without ids still yields
 * a deterministic synthetic key that survives reloads.
 */
export function assetIdFor(asset: { id?: string; name: string }): string {
  return (asset.id ?? asset.name ?? "").trim() || "asset";
}

/** The synthetic, unique identity key for an asset draft (never touches disk). */
export function syntheticAssetPath(indexPath: string, assetId: string): string {
  return `${indexPath}::${assetId}`;
}

// ── Expansion ───────────────────────────────────────────────────────────────

/**
 * True when a parsed `longform` frontmatter entry is a single-file project
 * index (as opposed to a legacy per-file `scenes`/`single` draft).
 */
export function isProjectIndexEntry(
  longformEntry: any
): longformEntry is ProjectIndexEntry {
  return !!longformEntry && longformEntry.format === "project";
}

/**
 * Expand a parsed `longform` frontmatter entry into one `Draft` per asset.
 *
 * - `format: "project"` → one draft per `assets[]` entry, each carrying a
 *   synthetic `vaultPath`, the shared `indexPath`, its `assetId`, and (for
 *   single assets) a `bodyPath` pointing at the external body note.
 * - `format: "scenes" | "single"` (legacy) → a single draft whose `vaultPath`
 *   IS the index file and whose `indexPath`/`assetId` are `null`.
 *
 * Scene drafts are returned with the scenes parsed straight from frontmatter
 * and `unknownFiles: []`; the caller reconciles them against the real scene
 * folder on disk. Returns `[]` for an unrecognized `format`.
 */
export function expandProjectIndex(
  longformEntry: any,
  indexPath: string,
  fallbackTitle: string
): Draft[] {
  if (!longformEntry) return [];
  const indexFolder = draftParentFolder(indexPath);

  if (isProjectIndexEntry(longformEntry)) {
    const title = longformEntry.title ?? fallbackTitle;
    const assets: ProjectAsset[] = Array.isArray(longformEntry.assets)
      ? longformEntry.assets
      : [];
    return assets
      .filter((a) => a && (a.format === "scenes" || a.format === "single"))
      .map((asset) => {
        const assetId = assetIdFor(asset);
        const vaultPath = syntheticAssetPath(indexPath, assetId);
        const workflow = asset.workflow ?? null;
        if (asset.format === "single") {
          return {
            format: "single" as const,
            title,
            titleInFrontmatter: true,
            draftTitle: asset.name ?? null,
            vaultPath,
            workflow,
            indexPath,
            assetId,
            bodyPath: joinPath(indexFolder, asset.file),
          };
        }
        // clone the raw scenes: arraysToIndentedScenes mutates its input
        const rawScenes = Array.isArray(asset.scenes)
          ? JSON.parse(JSON.stringify(asset.scenes))
          : [];
        return {
          format: "scenes" as const,
          title,
          titleInFrontmatter: true,
          draftTitle: asset.name ?? null,
          vaultPath,
          workflow,
          indexPath,
          assetId,
          sceneFolder: asset.folder ?? "/",
          scenes: arraysToIndentedScenes(rawScenes),
          ignoredFiles: asset.ignoredFiles ?? [],
          unknownFiles: [],
          sceneTemplate: asset.sceneTemplate ?? null,
        };
      });
  }

  // Legacy single-draft index.
  const format = longformEntry.format;
  const titleInFrontmatter = !!longformEntry.title;
  const title = longformEntry.title ?? fallbackTitle;
  const workflow = longformEntry.workflow ?? null;
  const draftTitle = longformEntry.draftTitle ?? null;

  if (format === "scenes") {
    const rawScenes = Array.isArray(longformEntry.scenes)
      ? JSON.parse(JSON.stringify(longformEntry.scenes))
      : [];
    return [
      {
        format: "scenes",
        title,
        titleInFrontmatter,
        draftTitle,
        vaultPath: indexPath,
        workflow,
        indexPath: null,
        assetId: null,
        sceneFolder: longformEntry.sceneFolder ?? "/",
        scenes: arraysToIndentedScenes(rawScenes),
        ignoredFiles: longformEntry.ignoredFiles ?? [],
        unknownFiles: [],
        sceneTemplate: longformEntry.sceneTemplate ?? null,
      },
    ];
  }
  if (format === "single") {
    return [
      {
        format: "single",
        title,
        titleInFrontmatter,
        draftTitle,
        vaultPath: indexPath,
        workflow,
        indexPath: null,
        assetId: null,
        bodyPath: null,
      },
    ];
  }
  return [];
}

// ── Serialization (Draft → on-disk asset entry) ─────────────────────────────

/**
 * Build the on-disk `assets[]` entry for one asset draft — the inverse of
 * {@link expandProjectIndex}. `folder`/`file` are stored relative to the index
 * file's folder (that is how the draft's `sceneFolder`/`bodyPath` were derived).
 */
export function assetEntryFromDraft(draft: Draft): ProjectAsset {
  const name = draft.draftTitle ?? draft.assetId ?? draft.title;
  const base = {
    name,
    id: draft.assetId ?? undefined,
    workflow: draft.workflow ?? undefined,
  };
  if (draft.format === "single") {
    const indexFolder = draftParentFolder(draft.indexPath ?? draft.vaultPath);
    const file = relativeToFolder(draft.bodyPath ?? "", indexFolder);
    return { ...base, format: "single", file };
  }
  const entry: ProjectAsset = {
    ...base,
    format: "scenes",
    folder: draft.sceneFolder,
    scenes: indentedScenesToArrays(draft.scenes),
  };
  if (draft.sceneTemplate) entry.sceneTemplate = draft.sceneTemplate;
  if (draft.ignoredFiles && draft.ignoredFiles.length > 0) {
    entry.ignoredFiles = draft.ignoredFiles;
  }
  return entry;
}

/** Strip a folder prefix from a path, yielding a folder-relative name. */
function relativeToFolder(path: string, folder: string): string {
  if (folder && path.startsWith(`${folder}/`)) {
    return path.slice(folder.length + 1);
  }
  return path;
}

/**
 * Write a project index's `longform` frontmatter from the title and the assets'
 * drafts. Mirrors `setDraftOnFrontmatterObject` but produces the
 * `format: project` container. `obj` is a plain frontmatter object.
 */
export function setProjectAssetsOnFrontmatterObject(
  obj: Record<string, any>,
  title: string,
  assets: Draft[]
): void {
  obj["longform"] = {
    format: "project",
    title,
    assets: assets.map((d) => assetEntryFromDraft(d)),
  };
}
