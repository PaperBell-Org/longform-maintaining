import { App, Modal, Notice } from "obsidian";

/**
 * A simple modal for surfacing a (potentially long) error message with a
 * "Copy" button, so users can grab the full log instead of squinting at a
 * truncated inline line or digging through the developer console.
 */
export class LongformErrorModal extends Modal {
  private titleText: string;
  private message: string;

  constructor(app: App, title: string, message: string) {
    super(app);
    this.titleText = title;
    this.message = message;
  }

  onOpen(): void {
    const { contentEl, titleEl } = this;
    titleEl.setText(this.titleText);
    contentEl.empty();

    const pre = contentEl.createEl("pre", { cls: "longform-error-modal-log" });
    pre.setText(this.message);

    const buttons = contentEl.createDiv({
      cls: "longform-error-modal-buttons",
    });
    const copyButton = buttons.createEl("button", {
      text: "Copy error",
      cls: "mod-cta",
    });
    copyButton.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(this.message);
        copyButton.setText("Copied!");
        window.setTimeout(() => copyButton.setText("Copy error"), 1500);
      } catch (e) {
        new Notice("Could not copy to clipboard.");
      }
    });
    const closeButton = buttons.createEl("button", { text: "Close" });
    closeButton.addEventListener("click", () => this.close());
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

/** Convenience helper: construct and open a {@link LongformErrorModal}. */
export function showErrorModal(
  app: App,
  title: string,
  message: string
): void {
  new LongformErrorModal(app, title, message).open();
}
