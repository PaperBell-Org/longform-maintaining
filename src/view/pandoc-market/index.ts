import { App, Modal } from "obsidian";
import { get } from "svelte/store";

import PandocMarket from "./PandocMarket.svelte";
import { appContext } from "src/view/utils";
import { refreshPandocTemplates } from "src/model/pandoc-templates";
import { workflows } from "src/model/stores";
import { deserializeWorkflow } from "src/compile/serialization";
import { BUILTIN_STEPS } from "src/compile/steps";
import type LongformPlugin from "src/main";
import type { SerializedWorkflow } from "src/model/types";

/**
 * The Pandoc asset marketplace: browse the external index, install bundles or
 * individual assets (with their dependency closure) into the vault's assets root,
 * and register them so recipes appear in the template dropdown immediately.
 */
export default class PandocMarketModal extends Modal {
  private view: PandocMarket | null = null;
  private plugin: LongformPlugin;

  constructor(app: App, plugin: LongformPlugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen(): void {
    this.modalEl.style.width = "min(820px, 94vw)";
    const entrypoint = this.contentEl.createDiv("longform-pandoc-market-root");
    const context = appContext(this);
    context.set("close", () => this.close());
    context.set("refresh", () => refreshPandocTemplates(this.app));
    context.set("installWorkflows", (incoming: SerializedWorkflow[]) =>
      this.installWorkflows(incoming)
    );
    this.view = new PandocMarket({ target: entrypoint, context });
  }

  /**
   * Inject a bundle's recommended workflows: add only ones the user doesn't have,
   * skip any that reference a non-built-in step (marketplace workflows must not
   * carry user scripts), then persist. Returns the names actually added.
   */
  private async installWorkflows(
    incoming: SerializedWorkflow[]
  ): Promise<string[]> {
    const current = get(workflows);
    const next = { ...current };
    const added: string[] = [];
    for (const wf of incoming) {
      if (wf.name in next) continue; // never overwrite the user's own
      const unknown = wf.steps.filter(
        (s) => !BUILTIN_STEPS.some((b) => b.id === s.id)
      );
      if (unknown.length > 0) {
        console.warn(
          `[PaperOut] Skipping bundle workflow "${wf.name}": unknown step id(s) ${unknown
            .map((s) => s.id)
            .join(", ")}.`
        );
        continue;
      }
      next[wf.name] = deserializeWorkflow(wf);
      added.push(wf.name);
    }
    if (added.length > 0) {
      workflows.set(next);
      await this.plugin.saveSettings();
    }
    return added;
  }

  onClose(): void {
    this.view?.$destroy();
    this.view = null;
    this.contentEl.empty();
  }
}
