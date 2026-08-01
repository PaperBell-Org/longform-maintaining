import { App, Modal, Notice } from "obsidian";

/**
 * A simple modal for surfacing a (potentially long) error message with a
 * "Copy" button, so users can grab the full log instead of squinting at a
 * truncated inline line or digging through the developer console.
 */
/** A "fix this" button shown alongside Copy / Close. */
export type ErrorModalAction = {
  text: string;
  onClick: () => void;
};

export class LongformErrorModal extends Modal {
  private titleText: string;
  private message: string;
  private actions: ErrorModalAction[];

  constructor(
    app: App,
    title: string,
    message: string,
    actions: ErrorModalAction[] = []
  ) {
    super(app);
    this.titleText = title;
    this.message = message;
    this.actions = actions;
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

    // Fix-it actions come first and take the CTA styling: when the failure is a
    // known setup problem, acting on it beats copying the log.
    for (const action of this.actions) {
      const actionButton = buttons.createEl("button", {
        text: action.text,
        cls: "mod-cta",
      });
      actionButton.addEventListener("click", () => {
        this.close();
        action.onClick();
      });
    }

    const copyButton = buttons.createEl("button", {
      text: "Copy error",
      cls: this.actions.length > 0 ? "" : "mod-cta",
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
  message: string,
  actions: ErrorModalAction[] = []
): void {
  new LongformErrorModal(app, title, message, actions).open();
}
