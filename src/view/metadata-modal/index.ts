import { App, Modal } from "obsidian";
import MetadataModalSvelte from "./MetadataModal.svelte";
import { appContext } from "src/view/utils";

export default class MetadataModal extends Modal {
  private projectPath: string;
  private projectTitle: string;
  private component: MetadataModalSvelte | null = null;

  constructor(app: App, projectPath: string, projectTitle: string) {
    super(app);
    this.projectPath = projectPath;
    this.projectTitle = projectTitle;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h1", { text: "Project Metadata" }, (el) => {
      el.style.margin = "0 0 var(--size-4-4) 0";
    });
    const target = contentEl.createDiv("longform-metadata-modal-root");

    const context = appContext(this);
    context.set("close", () => this.close());

    this.component = new MetadataModalSvelte({
      target,
      context,
      props: {
        projectPath: this.projectPath,
        projectTitle: this.projectTitle,
      },
    });
  }

  onClose(): void {
    if (this.component) {
      this.component.$destroy();
      this.component = null;
    }
    this.contentEl.empty();
  }
}
