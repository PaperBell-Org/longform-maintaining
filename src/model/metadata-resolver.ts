import { App, TFile } from "obsidian";
import { get } from "svelte/store";
import { drafts, projects } from "./stores";
import { draftForPath } from "./scene-navigation";
import {
  draftParentFolder,
  projectResourceCandidatePaths,
  projectRootPath,
} from "./project-resources";

export type ResolvedProjectMetadata = {
  /** The metadata file backing the project (shared across its drafts). */
  file: TFile;
  /** Parsed JSON contents, or `null` if the file is not valid JSON. */
  data: Record<string, unknown> | null;
};

/**
 * Locate and read the `metadata.json` that backs the Longform project owning
 * `sourcePath`, mirroring how the compile steps resolve project resources: from
 * the draft's own folder up to the project root (lowest common ancestor of the
 * project's drafts), checking each level's `source/` subfolder too.
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
  const startDir = draftParentFolder(draft.vaultPath);
  const candidatePaths = projectResourceCandidatePaths(
    startDir,
    root,
    "metadata.json"
  );

  let file: TFile | null = null;
  for (const path of candidatePaths) {
    const f = app.vault.getAbstractFileByPath(path);
    if (f instanceof TFile) {
      file = f;
      break;
    }
  }
  if (!file) return null;

  let data: Record<string, unknown> | null = null;
  try {
    data = JSON.parse(await app.vault.cachedRead(file)) as Record<
      string,
      unknown
    >;
  } catch {
    data = null;
  }
  return { file, data };
}
