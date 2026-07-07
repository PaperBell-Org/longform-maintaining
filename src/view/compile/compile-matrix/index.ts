import { App, Modal } from "obsidian";

import CompileMatrix from "./CompileMatrix.svelte";
import { appContext } from "src/view/utils";

/**
 * Opens the Compile Matrix: a board of the project's drafts that shows each one's
 * live compile progress, reorders the compile order by drag, batch-overrides a few
 * options for the run, and runs them sequentially on demand.
 */
export default class CompileMatrixModal extends Modal {
  private view: CompileMatrix | null = null;

  constructor(app: App) {
    super(app);
  }

  onOpen(): void {
    // Wider than the default modal so the step runways have room.
    this.modalEl.style.width = "min(760px, 92vw)";
    const entrypoint = this.contentEl.createDiv("longform-compile-matrix-root");
    const context = appContext(this);
    context.set("close", () => this.close());
    this.view = new CompileMatrix({ target: entrypoint, context });
  }

  onClose(): void {
    this.view?.$destroy();
    this.view = null;
    this.contentEl.empty();
  }
}
