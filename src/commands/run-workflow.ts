import { get } from "svelte/store";
import { MarkdownView, Notice, type App, type TFile } from "obsidian";

import type LongformPlugin from "src/main";
import { translate } from "src/i18n";
import { drafts, projects, workflows } from "src/model/stores";
import {
  WorkflowError,
  calculateWorkflow,
  compile,
  effectiveWorkflow,
  type CompileStatus,
  type Workflow,
} from "src/compile";
import { showErrorModal } from "src/view/error-modal";
import { recoverableActions } from "src/view/compile-error-actions";
import { draftTitle } from "src/model/draft-utils";
import { draftIndexPath, projectRootPath } from "src/model/project-resources";
import type { Draft } from "src/model/types";
import { JumpModal } from "./helpers";
import {
  draftsForNote,
  draftsRunnableBy,
  ephemeralDraftForNote,
  isExportableNote,
  resolveEphemeralProjectRoot,
} from "./run-workflow-utils";

/**
 * The status callback shared by every compile entry point: a Notice on success,
 * a modal with the step's error on failure.
 */
export function compileStatusHandler(
  app: App
): (status: CompileStatus) => void {
  return (status: CompileStatus) => {
    if (status.kind === "CompileStatusSuccess") {
      new Notice("Compile complete.");
    } else if (status.kind === "CompileStatusError") {
      showErrorModal(
        app,
        "Compile failed",
        status.error,
        recoverableActions(app, status)
      );
    }
  };
}


/**
 * Run a compile workflow against the currently open note.
 *
 * If the note belongs to a Longform draft, that draft is compiled. Otherwise the
 * note is wrapped in an ephemeral single-file draft, so a plain markdown file
 * can be compiled and exported without first being made into a project.
 *
 * A workflow that starts on a Manuscript step always takes the second path, even
 * for a note that belongs to a project — see `draftsRunnableBy`.
 */
export async function runWorkflowOnActiveNote(
  plugin: LongformPlugin,
  workflowName: string
): Promise<void> {
  const workflow = get(workflows)[workflowName];
  if (!workflow) {
    new Notice(translate("notice.workflowMissing", { name: workflowName }));
    return;
  }

  const file = plugin.app.workspace.getActiveFile();
  if (!isExportableNote(file)) {
    new Notice(translate("notice.noActiveNote"));
    return;
  }

  // compile() reads the file from disk, not from the editor buffer. Without
  // this, a hotkey pressed mid-sentence would export the last saved version.
  const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
  if (view) {
    await view.save();
  }

  const candidates = draftsForNote(file.path, get(drafts));
  // A Manuscript-first workflow (Quick Export, Cover Letter) cannot compile a
  // scenes draft, so it exports the open note on its own instead of failing.
  const runnable = draftsRunnableBy(candidates, workflow);
  if (candidates.length > 0 && runnable.length === 0) {
    // Every draft this note belongs to was dropped; the tail of this function
    // exports the note on its own, which is worth saying out loud.
    new Notice(translate("notice.exportedOpenNoteOnly"));
  }

  if (runnable.length > 1) {
    // An index note shared by several assets. Prefer the asset that already
    // names this workflow; otherwise ask.
    const preferred = runnable.filter((d) => d.workflow === workflowName);
    if (preferred.length === 1) {
      compileDraft(plugin, preferred[0], workflow, file);
      return;
    }
    const choices = preferred.length > 0 ? preferred : runnable;
    const opts = new Map<string, Draft>();
    choices.forEach((d) => opts.set(draftTitle(d), d));
    new JumpModal(
      plugin.app,
      opts,
      [
        { command: "↑↓", purpose: "to navigate" },
        { command: "↵", purpose: "to compile" },
        { command: "esc", purpose: "to dismiss" },
      ],
      (draft: Draft) => compileDraft(plugin, draft, workflow, file)
    ).open();
    return;
  }

  const draft = runnable[0];
  if (draft) {
    compileDraft(plugin, draft, workflow, file);
  } else {
    compileDraft(
      plugin,
      ephemeralDraftForNote(file.path, workflowName),
      workflow,
      file,
      true
    );
  }
}

function compileDraft(
  plugin: LongformPlugin,
  draft: Draft,
  workflow: Workflow,
  file: TFile,
  ephemeral = false
): void {
  // `projectFolderPath` dereferences `.parent` without a null check, so make
  // sure the draft's index file is really in the vault before compiling.
  const indexPath = draftIndexPath(draft);
  const indexFile = plugin.app.vault.getAbstractFileByPath(indexPath);
  if (!indexFile || !indexFile.parent) {
    showErrorModal(
      plugin.app,
      "Compile failed",
      `Could not locate "${indexPath}" in the vault.`
    );
    return;
  }

  const isMultiScene = draft.format === "scenes";
  const effective = effectiveWorkflow(workflow, isMultiScene);
  const [validation, calculatedKinds] = calculateWorkflow(
    effective,
    isMultiScene
  );
  if (validation.error !== WorkflowError.Valid) {
    new Notice(validation.error);
    return;
  }

  const projectRoot = ephemeral
    ? resolveEphemeralProjectRoot(file.path, get(drafts))
    : projectRootPath(get(projects)[draft.title] ?? [draft]);

  compile(
    plugin.app,
    draft,
    effective,
    calculatedKinds,
    compileStatusHandler(plugin.app),
    { projectRoot }
  );
}
