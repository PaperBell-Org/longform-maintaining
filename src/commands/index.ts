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
];

export function addCommands(plugin: LongformPlugin) {
  commandBuilders.forEach((c) => {
    plugin.addCommand(c(plugin));
  });
}
