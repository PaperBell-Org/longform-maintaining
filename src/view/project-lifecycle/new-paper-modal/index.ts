import {
  App,
  ButtonComponent,
  Modal,
  Notice,
  Setting,
  TextComponent,
  TFolder,
} from "obsidian";

import { translate } from "src/i18n";
import { selectedDraftVaultPath } from "src/model/stores";
import { selectedTab } from "src/view/stores";
import {
  acronymFromTitle,
  PAPER_PARTS,
  writePaperbellScaffold,
  type PaperPartId,
} from "src/model/scaffold";

const ILLEGAL = /[:\\/]/;

/**
 * Prompts for a project title, an optional acronym, and which parts the paper
 * needs, then scaffolds the project under `parent`.
 *
 * Only the Main Manuscript is created by default: a short paper often needs no
 * supplement and never needs a response letter before review. Anything left out
 * can be added later with "Add paper components…".
 */
export default class NewPaperModal extends Modal {
  private parent: TFolder;
  private titleValue = "";
  private acronymValue = "";
  private acronymEdited = false;
  /** Main is mandatory — see the note on the toggle below. */
  private parts = new Set<PaperPartId>(["main"]);
  private examples = true;

  constructor(app: App, parent: TFolder) {
    super(app);
    this.parent = parent;
  }

  onOpen(): void {
    const { contentEl } = this;

    contentEl.createEl("h1", { text: translate("scaffold.title") }, (el) => {
      el.style.margin = "0 0 var(--size-4-2) 0";
    });
    contentEl.createEl("p", {
      text: translate("scaffold.desc"),
      cls: "setting-item-description",
    });

    let acronymInput: TextComponent;
    let createButton: ButtonComponent;

    const validate = () => {
      const title = this.titleValue.trim();
      const ok = !!title && !ILLEGAL.test(title);
      createButton?.setDisabled(!ok);
    };

    new Setting(contentEl)
      .setName(translate("scaffold.nameLabel"))
      .setDesc(translate("scaffold.nameDesc"))
      .addText((text) => {
        text.setPlaceholder("My Paper").onChange((value) => {
          this.titleValue = value;
          if (!this.acronymEdited) {
            this.acronymValue = acronymFromTitle(value);
            acronymInput?.setValue(this.acronymValue);
          }
          validate();
        });
        window.setTimeout(() => text.inputEl.focus(), 0);
      });

    new Setting(contentEl)
      .setName(translate("scaffold.acronymLabel"))
      .setDesc(translate("scaffold.acronymDesc"))
      .addText((text) => {
        acronymInput = text;
        text.setPlaceholder("MP").onChange((value) => {
          this.acronymEdited = true;
          this.acronymValue = value;
        });
      });

    contentEl.createEl("h4", { text: translate("scaffold.partsHeading") });

    for (const part of PAPER_PARTS) {
      const setting = new Setting(contentEl)
        .setName(translate(part.labelKey))
        .setDesc(translate(part.descKey));
      setting.addToggle((toggle) => {
        toggle.setValue(this.parts.has(part.id)).onChange((value) => {
          if (value) this.parts.add(part.id);
          else this.parts.delete(part.id);
        });
        // The Main Manuscript is not optional: it anchors the project root that
        // every nearest-wins metadata.json lookup is bounded by, and a project
        // whose only draft sits in supplementary/ would search from there.
        if (part.id === "main") {
          toggle.setDisabled(true);
        }
      });
    }

    new Setting(contentEl)
      .setName(translate("scaffold.examplesLabel"))
      .setDesc(translate("scaffold.examplesDesc"))
      .addToggle((toggle) => {
        toggle.setValue(this.examples).onChange((value) => {
          this.examples = value;
        });
      });

    new Setting(contentEl).addButton((button) => {
      createButton = button;
      button
        .setButtonText(translate("scaffold.create"))
        .setCta()
        .setDisabled(true)
        .onClick(() => this.create());
    });

    validate();
  }

  private async create(): Promise<void> {
    const title = this.titleValue.trim();
    if (!title || ILLEGAL.test(title)) {
      new Notice(translate("scaffold.invalidName"));
      return;
    }
    try {
      const primaryPath = await writePaperbellScaffold(this.app, this.parent.path, {
        title,
        acronym: this.acronymValue.trim() || undefined,
        parts: [...this.parts],
        examples: this.examples,
      });
      selectedDraftVaultPath.set(primaryPath);
      selectedTab.set("Scenes");
      this.app.workspace.openLinkText(primaryPath, "/", false);
      new Notice(translate("scaffold.created", { title }));
      this.close();
    } catch (e) {
      new Notice(
        translate("scaffold.failed", { error: String((e as Error)?.message ?? e) })
      );
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
