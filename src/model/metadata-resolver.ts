import { App, TFile } from "obsidian";
import { get } from "svelte/store";
import { drafts, projects } from "./stores";
import { draftForPath, metadataStartDir } from "./scene-navigation";
import { projectRootPath } from "./project-resources";
import {
  MetadataParseError,
  mergeMetadataLayers,
  readMetadataLayers,
} from "./metadata-layers";

export type ResolvedProjectMetadata = {
  /**
   * Where an edit to a key no layer defines goes: the project's root-most
   * file, the one the metadata panel edits — not the nearest, which would
   * create a new override (#47).
   */
  defaultFile: TFile;
  /** All layers merged, or `null` if any layer is not valid JSON. */
  data: Record<string, unknown> | null;
  /** Which file each key came from — see `MergedMetadata.origin`. */
  origin: Record<string, string>;
};

/**
 * Read the layered `metadata.json` behind the Longform project owning
 * `sourcePath`, exactly as the compile steps do: every file from the project
 * root (lowest common ancestor of the project's drafts) down to the draft's
 * start folder, nearer files overriding farther ones key by key.
 *
 * Returns `null` when the note is not part of any Longform draft or no metadata
 * file exists — so live rendering only ever touches project notes.
 */
export async function resolveProjectMetadataFile(
  app: App,
  sourcePath: string
): Promise<ResolvedProjectMetadata | null> {
  const allDrafts = get(drafts);
  const draft = draftForPath(sourcePath, allDrafts);
  if (!draft) return null;

  const projectDrafts = get(projects)[draft.title] ?? [draft];
  const root = projectRootPath(projectDrafts);
  const startDir = metadataStartDir(draft, app.vault);

  let layers;
  try {
    layers = await readMetadataLayers(app.vault, startDir, root);
  } catch (e) {
    if (!(e instanceof MetadataParseError)) throw e;
    const file = app.vault.getAbstractFileByPath(e.path);
    return file instanceof TFile
      ? { defaultFile: file, data: null, origin: {} }
      : null;
  }
  if (layers.length === 0) return null;

  const rootMost = app.vault.getAbstractFileByPath(layers[0].path);
  if (!(rootMost instanceof TFile)) return null;
  const { merged, origin } = mergeMetadataLayers(layers);
  return { defaultFile: rootMost, data: merged, origin };
}
