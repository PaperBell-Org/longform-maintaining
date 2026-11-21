import { App, Modal } from "obsidian";
import MetadataModalSvelte from "./MetadataModal.svelte";
import { appContext } from "src/view/utils";

export default class MetadataModal extends Modal {
  private projectPath: string;
  private projectTitle: string;
  private startDir: string;
  private component: MetadataModalSvelte | null = null;

  /**
   * @param startDir Where the selected draft's metadata walk starts; nearer
   *   files between it and `projectPath` are shown as overrides.
   */
  constructor(
    app: App,
    projectPath: string,
    projectTitle: string,
    startDir: string = projectPath
  ) {
    super(app);
    this.projectPath = projectPath;
    this.projectTitle = projectTitle;
    this.startDir = startDir;
  }

  onOpen(): void {
    const { contentEl, titleEl, modalEl } = this;
    titleEl.empty();
    contentEl.empty();
    modalEl.addClass("longform-metadata-modal");
    contentEl.addClass("longform-metadata-modal-content");
    const target = contentEl.createDiv("longform-metadata-modal-root");

    const context = appContext(this);
    context.set("close", () => this.close());

    this.component = new MetadataModalSvelte({
      target,
      context,
      props: {
        projectPath: this.projectPath,
        projectTitle: this.projectTitle,
        startDir: this.startDir,
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
