import { App, Modal, Notice, Setting, TFile } from "obsidian";
import {
  formatPlaceholderValue,
  setByPath,
} from "src/compile/steps/replace-json-placeholders-utils";

/**
 * Coerce a text input into the scalar we store in metadata.json: `true`/`false`
 * become booleans, clean numeric strings become numbers, everything else stays a
 * string (so "2.2.0" or "Paper 1" are preserved verbatim).
 */
function coerceScalar(raw: string): unknown {
  const t = raw.trim();
  if (t === "true") return true;
  if (t === "false") return false;
  if (t !== "" && /^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  return raw;
}

export type VariableEditOptions = {
  /** Vault path of the metadata.json backing this project. */
  metadataFilePath: string;
  /** The placeholder path being edited, e.g. `version` or `_longform.csl`. */
  varPath: string;
  /** Current displayed value (empty string when the variable is unset). */
  currentValue: string;
  /** Called with the new formatted display value after a successful save. */
  onSaved: (displayValue: string) => void;
};

/**
 * Lightweight editor for a single `{{Variable}}`: edits one field of the
 * project's metadata.json in place. Created/overwrites simple object-key paths;
 * defers array/complex paths to the full "Edit metadata…" modal.
 */
export default class VariableEditModal extends Modal {
  private opts: VariableEditOptions;
  private value: string;

  constructor(app: App, opts: VariableEditOptions) {
    super(app);
    this.opts = opts;
    this.value = opts.currentValue;
  }

  onOpen(): void {
    const { contentEl, titleEl } = this;
    titleEl.setText(`Edit variable: ${this.opts.varPath}`);
    contentEl.empty();

    const setting = new Setting(contentEl)
      .setName("Value")
      .addText((text) => {
        text.setValue(this.value).onChange((v) => (this.value = v));
        text.inputEl.addEventListener("keydown", (evt) => {
          if (evt.key === "Enter") {
            evt.preventDefault();
            void this.save();
          }
        });
        // Focus and select for quick replacement.
        window.setTimeout(() => {
          text.inputEl.focus();
          text.inputEl.select();
        }, 0);
      });
    setting.descEl.setText(
      `Saved to ${this.opts.metadataFilePath}. Booleans and numbers are stored as-is; everything else as text.`
    );

    new Setting(contentEl)
      .addButton((b) =>
        b.setButtonText("Cancel").onClick(() => this.close())
      )
      .addButton((b) =>
        b
          .setButtonText("Save")
          .setCta()
          .onClick(() => void this.save())
      );
  }

  private async save(): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(
      this.opts.metadataFilePath
    );
    if (!(file instanceof TFile)) {
      new Notice("Could not find the project's metadata.json.");
      return;
    }

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(await this.app.vault.read(file)) as Record<
        string,
        unknown
      >;
    } catch (e) {
      new Notice(`metadata.json is not valid JSON: ${(e as Error).message}`);
      return;
    }
    if (typeof data !== "object" || data === null || Array.isArray(data)) {
      new Notice("metadata.json must be a JSON object.");
      return;
    }

    const coerced = coerceScalar(this.value);
    if (!setByPath(data, this.opts.varPath, coerced)) {
      new Notice(
        `Can't set "${this.opts.varPath}" here — edit it from “Edit metadata…”.`
      );
      return;
    }

    try {
      await this.app.vault.modify(file, JSON.stringify(data, null, 2) + "\n");
    } catch (e) {
      new Notice(`Failed to save: ${(e as Error).message}`);
      return;
    }

    this.opts.onSaved(formatPlaceholderValue(coerced));
    this.close();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
