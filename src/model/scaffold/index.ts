import { App, base64ToArrayBuffer, normalizePath } from "obsidian";

import {
  buildPaperbellScaffold,
  SCAFFOLD_PRIMARY_DRAFT,
  type ScaffoldOptions,
} from "./paperbell-scaffold";

export {
  buildPaperbellScaffold,
  acronymFromTitle,
  SCAFFOLD_PRIMARY_DRAFT,
} from "./paperbell-scaffold";
export type { ScaffoldOptions, ScaffoldFile } from "./paperbell-scaffold";

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

  const files = buildPaperbellScaffold(opts);
  for (const file of files) {
    const full = normalizePath(`${projectFolder}/${file.path}`);
    await ensureFolder(app, full.split("/").slice(0, -1).join("/"));
    if ("text" in file) {
      await app.vault.create(full, file.text);
    } else {
      await app.vault.createBinary(full, base64ToArrayBuffer(file.base64));
    }
  }

  return normalizePath(`${projectFolder}/${SCAFFOLD_PRIMARY_DRAFT}`);
}
