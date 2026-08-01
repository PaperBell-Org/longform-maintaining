import { App, base64ToArrayBuffer, normalizePath } from "obsidian";

import {
  buildPaperbellScaffold,
  SCAFFOLD_PRIMARY_DRAFT,
  type ScaffoldOptions,
} from "./paperbell-scaffold";
import {
  primaryPathFor,
  scenesBeforeIndexes,
  type ScaffoldFile,
} from "./parts";

export {
  buildPaperbellScaffold,
  acronymFromTitle,
  commonScaffoldFiles,
  exampleAssetFiles,
  renderTree,
  scaffoldContext,
  SCAFFOLD_PRIMARY_DRAFT,
} from "./paperbell-scaffold";
export type { ScaffoldOptions } from "./paperbell-scaffold";
export {
  ALL_PAPER_PARTS,
  PAPER_PARTS,
  isIndexNote,
  paperPart,
  primaryPathFor,
  scenesBeforeIndexes,
  type PaperPart,
  type PaperPartId,
  type PartContext,
  type ProjectForm,
  type ScaffoldFile,
} from "./parts";

/** Create every intermediate folder of a vault-relative path, top down. */
async function ensureFolder(app: App, folder: string): Promise<void> {
  const parts = normalizePath(folder).split("/").filter(Boolean);
  let cur = "";
  for (const part of parts) {
    cur = cur ? `${cur}/${part}` : part;
    if (!(await app.vault.adapter.exists(cur))) {
      await app.vault.createFolder(cur);
    }
  }
}

export class ScaffoldConflictError extends Error {
  constructor(readonly conflicts: string[]) {
    super(
      `Some files already exist:\n${conflicts.map((c) => `  ${c}`).join("\n")}`
    );
    this.name = "ScaffoldConflictError";
  }
}

/**
 * Write scaffold files under `baseFolder`, all or nothing.
 *
 * Every target path is probed first and the whole batch is refused if any of
 * them exists — half a component is harder to clean up than none. Index notes
 * go last; see {@link scenesBeforeIndexes}.
 */
export async function writeScaffoldFiles(
  app: App,
  baseFolder: string,
  files: ScaffoldFile[]
): Promise<void> {
  const resolved = files.map((file) => ({
    file,
    full: normalizePath(`${baseFolder}/${file.path}`),
  }));

  const conflicts: string[] = [];
  for (const { full } of resolved) {
    if (await app.vault.adapter.exists(full)) {
      conflicts.push(full);
    }
  }
  if (conflicts.length > 0) {
    throw new ScaffoldConflictError(conflicts);
  }

  for (const { file, full } of scenesBeforeIndexes(resolved)) {
    await ensureFolder(app, full.split("/").slice(0, -1).join("/"));
    if ("text" in file) {
      await app.vault.create(full, file.text);
    } else {
      await app.vault.createBinary(full, base64ToArrayBuffer(file.base64));
    }
  }
}

/**
 * Write a full PaperBell paper scaffold under `parentPath` into a new folder named
 * after the project title, and return the vault path of its primary (Main
 * Manuscript) draft. Throws if the project folder already exists.
 */
export async function writePaperbellScaffold(
  app: App,
  parentPath: string,
  opts: ScaffoldOptions
): Promise<string> {
  const projectFolder = normalizePath(
    `${parentPath ? parentPath + "/" : ""}${opts.title.trim()}`
  );
  if (await app.vault.adapter.exists(projectFolder)) {
    throw new Error(`A folder already exists at ${projectFolder}.`);
  }

  await writeScaffoldFiles(app, projectFolder, buildPaperbellScaffold(opts));

  return normalizePath(
    `${projectFolder}/${primaryPathFor(opts.parts) ?? SCAFFOLD_PRIMARY_DRAFT}`
  );
}
