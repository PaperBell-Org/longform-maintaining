import {
  type App,
  type Editor,
  FuzzySuggestModal,
  Notice,
  TFile,
} from "obsidian";

import type { CommandBuilder } from "./types";
import { translate } from "src/i18n";
import {
  existingSpanIds,
  generateSpanId,
  insertRefText,
  scanSpans,
  spanDisplay,
  wrapSelection,
  type ManuscriptSpan,
} from "./manuscript-refs-utils";

/** The project's scene files: the active scene's sibling `.md` files. */
async function projectMarkdownFiles(
  app: App,
  activeFile: TFile
): Promise<{ name: string; content: string }[]> {
  const parent = activeFile.parent;
  if (!parent) return [];
  const out: { name: string; content: string }[] = [];
  for (const child of parent.children) {
    if (child instanceof TFile && child.extension === "md") {
      out.push({
        name: child.basename,
        content: await app.vault.cachedRead(child),
      });
    }
  }
  return out;
}

/** Fuzzy picker over marked `<!--ms:id-->` spans. */
class SpanSuggestModal extends FuzzySuggestModal<ManuscriptSpan> {
  constructor(
    app: App,
    private spans: ManuscriptSpan[],
    private onPick: (span: ManuscriptSpan) => void
  ) {
    super(app);
    this.setPlaceholder("Pick a marked manuscript span to cite…");
  }
  getItems(): ManuscriptSpan[] {
    return this.spans;
  }
  getItemText(span: ManuscriptSpan): string {
    return spanDisplay(span);
  }
  onChooseItem(span: ManuscriptSpan): void {
    this.onPick(span);
  }
}

/** Wrap the editor selection in a unique `<!--ms:id-->…<!--/ms:id-->` marker. */
export const markManuscriptSpan: CommandBuilder = (plugin) => ({
  id: "longform-mark-manuscript-span",
  name: translate("cmd.markManuscriptSpan"),
  editorCallback: (editor: Editor) => {
    void (async () => {
      const selection = editor.getSelection();
      if (!selection || !selection.trim()) {
        new Notice("Select the manuscript text to mark first.");
        return;
      }
      const activeFile = plugin.app.workspace.getActiveFile();
      if (!activeFile) return;
      const files = await projectMarkdownFiles(plugin.app, activeFile);
      const id = generateSpanId(
        activeFile.basename,
        selection,
        existingSpanIds(files)
      );
      editor.replaceSelection(wrapSelection(selection, id));
      new Notice(`Marked manuscript span \`${id}\`.`);
    })();
  },
});

/** Insert a ```manuscript / @id fence citing a marked span (fuzzy-picked). */
export const insertManuscriptRef: CommandBuilder = (plugin) => ({
  id: "longform-insert-manuscript-ref",
  name: translate("cmd.insertManuscriptRef"),
  editorCallback: (editor: Editor) => {
    void (async () => {
      const activeFile = plugin.app.workspace.getActiveFile();
      if (!activeFile) return;
      const files = await projectMarkdownFiles(plugin.app, activeFile);
      const spans = scanSpans(files);
      if (spans.length === 0) {
        new Notice(
          "No <!--ms:--> spans in this project yet — mark one in the manuscript first."
        );
        return;
      }
      new SpanSuggestModal(plugin.app, spans, (span) => {
        editor.replaceSelection(insertRefText(span.id));
      }).open();
    })();
  },
});
