import {
  ButtonComponent,
  Modal,
  Notice,
  Setting,
  TextComponent,
  TFolder,
} from "obsidian";

import { translate } from "src/i18n";
import type LongformPlugin from "src/main";
import { selectedDraftVaultPath } from "src/model/stores";
import { selectedTab } from "src/view/stores";
import {
  acronymFromTitle,
  PAPER_PARTS,
  writePaperbellScaffold,
  type PaperPartId,
} from "src/model/scaffold";
import { projectOptions, type ProjectOption } from "./project-options";

const ILLEGAL = /[:\\/]/;

/**
 * Dropdown value meaning "let me type it myself".
 *
 * Cannot collide with a real project: `projectOptions` trims every value and drops
 * the empty ones, so no option it produces can start with a space.
 */
const MANUAL_ENTRY = " manual entry";

/**
 * Prompts for a project title, an optional acronym, the PaperBell project the
 * paper is a deliverable of, and which parts it needs, then scaffolds the project
 * under `parent`.
 *
 * Only the Main Manuscript is created by default: a short paper often needs no
 * supplement and never needs a response letter before review. Anything left out
 * can be added later with "Add paper components…".
 */
export default class NewPaperModal extends Modal {
  private plugin: LongformPlugin;
  private parent: TFolder;
  private titleValue = "";
  private acronymValue = "";
  private acronymEdited = false;
  /** The PaperBell project's acronym, or "" for no association. */
  private projectValue = "";
  /** True once the user has typed into the project field by hand. */
  private projectEdited = false;
  private projectSetting: Setting | null = null;
  /**
   * The host's projects, once fetched. Kept so switching to manual entry is not a
   * one-way door — the text field offers a button back to the list.
   */
  private hostProjects: ProjectOption[] = [];
  /** Main is mandatory — see the note on the toggle below. */
  private parts = new Set<PaperPartId>(["main"]);
  private examples = true;

  constructor(plugin: LongformPlugin, parent: TFolder) {
    super(plugin.app);
    this.plugin = plugin;
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

    // Starts as a plain text field — the control that always works. If the host
    // turns out to have a project list, it is swapped for a dropdown below.
    //
    // Known limitation: the `projects` scope is consent-gated, and the contract has
    // no way to cancel a pending request. Close the modal while the host's
    // permission dialog is up and that dialog outlives it. Asking the host for a
    // consent-free "do you have projects?" probe is filed in
    // docs/PROPOSAL_PROJECTS_SCOPE.md; until then the render is guarded instead.
    this.projectSetting = new Setting(contentEl)
      .setName(translate("scaffold.projectLabel"))
      .setDesc(translate("scaffold.projectDesc"));
    this.renderProjectTextInput();
    void this.loadHostProjects();

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

  /**
   * Ask the host for its project list and, if it has one, upgrade the field to a
   * dropdown. Deliberately fire-and-forget: `fetchProjects` returns null for a
   * missing host, an older host, a denied consent prompt, or a host-side error,
   * and every one of those just leaves the text field in place. Creating a paper
   * never waits on — or fails because of — PaperBell.
   */
  private async loadHostProjects(): Promise<void> {
    const projects = await this.plugin.paperBell?.fetchProjects();
    if (!projects || projects.length === 0) return;
    // The modal may already be gone — `onClose` nulls the Setting, which is what
    // makes this safe. We cannot cancel the host's consent prompt itself; see the
    // note on the call site.
    if (!this.projectSetting) return;
    this.hostProjects = projectOptions(projects);
    // Don't yank the field out from under someone who gave up waiting on the
    // consent prompt and typed the acronym themselves.
    if (this.projectEdited) return;
    this.renderProjectDropdown();
  }

  /** Swap the project field's control, keeping `projectValue` as the source of truth. */
  private replaceProjectControl(render: (setting: Setting) => void): void {
    const setting = this.projectSetting;
    if (!setting) return;
    // `clear()` (not `controlEl.empty()`) so the discarded component is also
    // dropped from the Setting's `components` array.
    setting.clear();
    render(setting);
  }

  private renderProjectTextInput(focus = false): void {
    this.replaceProjectControl((setting) => {
      // Only offered once a host list exists, so manual entry is not a one-way door.
      if (this.hostProjects.length > 0) {
        setting.addExtraButton((button) => {
          button
            .setIcon("list")
            .setTooltip(translate("scaffold.projectBackToList"))
            .onClick(() => this.renderProjectDropdown());
        });
      }
      setting.addText((text) => {
        text
          .setPlaceholder(translate("scaffold.projectPlaceholder"))
          .setValue(this.projectValue)
          .onChange((value) => {
            this.projectEdited = true;
            this.projectValue = value;
          });
        if (focus) text.inputEl.focus();
      });
    });
  }

  private renderProjectDropdown(): void {
    this.replaceProjectControl((setting) => {
      setting.addDropdown((dropdown) => {
        dropdown.addOption("", translate("scaffold.projectNone"));
        for (const option of this.hostProjects) {
          dropdown.addOption(option.value, option.label);
        }
        dropdown.addOption(MANUAL_ENTRY, translate("scaffold.projectManual"));
        // A hand-typed value need not be in the list; fall back to "no project"
        // rather than letting the select silently show the wrong row.
        const known = this.hostProjects.some((o) => o.value === this.projectValue);
        dropdown.setValue(known ? this.projectValue : "");
        dropdown.onChange((value) => {
          if (value === MANUAL_ENTRY) {
            // Keep whatever was selected as the starting text — switching input
            // method should not throw away the answer.
            this.renderProjectTextInput(true);
            return;
          }
          this.projectValue = value;
        });
      });
    });
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
        project: this.projectValue.trim() || undefined,
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
    this.projectSetting = null;
    this.contentEl.empty();
  }
}
