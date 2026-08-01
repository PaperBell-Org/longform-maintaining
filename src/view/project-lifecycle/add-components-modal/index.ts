import { App, ButtonComponent, Modal, Setting } from "obsidian";

import { translate } from "src/i18n";
import { paperPart, type PaperPartId } from "src/model/scaffold";
import type { AddComponentsPlan } from "src/commands/add-components-utils";

/**
 * Offers the paper parts a project does not have yet.
 *
 * Deliberately narrower than the new-project modal: no example-assets toggle,
 * because whether the starter text may reference `figs/example_*` is read from
 * what is already on disk rather than asked again — which also means this flow
 * never rewrites `figs/` or `README.md`.
 */
export class AddComponentsModal extends Modal {
  private selected = new Set<PaperPartId>();

  constructor(
    app: App,
    private projectTitle: string,
    private plan: AddComponentsPlan,
    private onAdd: (parts: PaperPartId[]) => Promise<void>
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;

    contentEl.createEl("h1", { text: translate("components.title") }, (el) => {
      el.style.margin = "0 0 var(--size-4-2) 0";
    });
    contentEl.createEl("p", {
      text: translate("components.desc", { title: this.projectTitle }),
      cls: "setting-item-description",
    });

    let addButton: ButtonComponent;
    const validate = () => addButton?.setDisabled(this.selected.size === 0);

    for (const id of this.plan.addable) {
      const part = paperPart(id);
      new Setting(contentEl)
        .setName(translate(part.labelKey))
        .setDesc(translate(part.descKey))
        .addToggle((toggle) => {
          toggle.setValue(false).onChange((value) => {
            if (value) this.selected.add(id);
            else this.selected.delete(id);
            validate();
          });
        });
    }

    new Setting(contentEl).addButton((button) => {
      addButton = button;
      button
        .setButtonText(translate("components.add"))
        .setCta()
        .setDisabled(true)
        .onClick(async () => {
          const parts = [...this.selected];
          this.close();
          await this.onAdd(parts);
        });
    });

    validate();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
