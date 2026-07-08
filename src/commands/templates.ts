import type { Editor, MarkdownFileInfo, MarkdownView } from "obsidian";

import { draftForPath } from "src/model/scene-navigation";
import { drafts, selectedDraftVaultPath } from "src/model/stores";
import { get } from "svelte/store";
import type { CommandBuilder } from "./types";
import { translate } from "src/i18n";
import { insertDraftIntoFrontmatter } from "src/model/draft-utils";
import { fileNameFromPath } from "src/model/note-utils";
import type {
  Draft,
  MultipleSceneDraft,
  SingleSceneDraft,
} from "src/model/types";

const callbackForFormat = (
  format: "scenes" | "single",
  checking: boolean,
  _editor: Editor,
  view: MarkdownView | MarkdownFileInfo
): boolean | void => {
  const file = view.file;

  // check if this is already a draft or scene, if so, do nothing
  const draft = draftForPath(file.path, get(drafts));
  if (checking && draft) {
    return false;
  } else if (draft) {
    console.log(
      `[PaperOut] Attempted to insert frontmatter into existing draft at ${file.path}; ignoring.`
    );
  } else if (checking) {
    return true;
  }

  const title = fileNameFromPath(file.path);

  const newDraft: Draft = (() => {
    if (format === "scenes") {
      const multi: MultipleSceneDraft = {
        format: "scenes",
        title,
        titleInFrontmatter: false,
        draftTitle: null,
        vaultPath: file.path,
        workflow: null,
        sceneFolder: "/",
        scenes: [],
        ignoredFiles: [],
        unknownFiles: [],
        sceneTemplate: null,
      };
      return multi;
    } else {
      const single: SingleSceneDraft = {
        format: "single",
        title,
        titleInFrontmatter: false,
        draftTitle: null,
        vaultPath: file.path,
        workflow: null,
      };
      return single;
    }
  })();

  insertDraftIntoFrontmatter(view.app, file.path, newDraft).then(() => {
    selectedDraftVaultPath.set(file.path);
  });
};

export const insertMultiSceneTemplate: CommandBuilder = (_plugin) => ({
  id: "longform-insert-multi-scene",
  name: translate("cmd.insertMultiScene"),
  editorCheckCallback(checking, editor, view) {
    const result = callbackForFormat("scenes", checking, editor, view);
    return result;
  },
});

export const insertSingleSceneTemplate: CommandBuilder = (_plugin) => ({
  id: "longform-insert-single-scene",
  name: translate("cmd.insertSingleScene"),
  editorCheckCallback(checking, editor, view) {
    return callbackForFormat("single", checking, editor, view);
  },
});
