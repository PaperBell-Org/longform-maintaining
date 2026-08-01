import { compileCurrent, compileSelection } from "./compile";
import {
  focusCurrentDraft,
  previousScene,
  previousSceneAtIndent,
  nextScene,
  nextSceneAtIndent,
  jumpToProject,
  showLongform,
  jumpToScene,
  revealProjectFolder,
  focusNewSceneField,
} from "./navigation";
import { indentScene, unindentScene } from "./indentation";
import type LongformPlugin from "src/main";
import {
  insertMultiSceneTemplate,
  insertSingleSceneTemplate,
} from "./templates";
import { startNewSession } from "./word-counts";
import { setupPandocExport } from "./pandoc";
import { markManuscriptSpan, insertManuscriptRef } from "./manuscript-refs";
import { newPaperProject } from "./scaffold";
import { convertToProject } from "./convert-to-project";
import { openPandocMarket } from "./pandoc-market";
import { registerWorkflowCommands } from "./workflow-commands";
import { addComponentsCommand } from "./add-components";

const commandBuilders = [
  compileCurrent,
  compileSelection,
  setupPandocExport,
  focusCurrentDraft,
  previousScene,
  previousSceneAtIndent,
  nextScene,
  nextSceneAtIndent,
  indentScene,
  unindentScene,
  jumpToProject,
  jumpToScene,
  showLongform,
  revealProjectFolder,
  focusNewSceneField,
  insertMultiSceneTemplate,
  insertSingleSceneTemplate,
  startNewSession,
  markManuscriptSpan,
  insertManuscriptRef,
  newPaperProject,
  convertToProject,
  openPandocMarket,
  addComponentsCommand,
];

export function addCommands(plugin: LongformPlugin) {
  commandBuilders.forEach((c) => {
    plugin.addCommand(c(plugin));
  });

  // One "Run workflow: <name>" command per workflow, kept in sync with the
  // workflows store. Safe to call here: loadSettings() has already populated it.
  registerWorkflowCommands(plugin);
}
