import { App, Modal, Notice, Platform, Setting } from "obsidian";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { get } from "svelte/store";

import { pluginSettings } from "src/model/stores";
import {
  binSearchDirs,
  DEFAULT_ASSETS_DIR,
  resolveBinary,
} from "src/compile/steps/pandoc-export-utils";
import { downloadPandocAssets } from "src/model/pandoc-assets";
import { refreshPandocTemplates } from "src/model/pandoc-templates";

type Check = { ok: boolean; label: string; detail: string };

function installHint(bin: string): string {
  if (Platform.isMacOS) {
    if (bin === "xelatex")
      return "Install MacTeX: https://www.tug.org/mactex/ (or `brew install --cask mactex-no-gui`).";
    return `Install with Homebrew: \`brew install ${bin}\``;
  }
  if (Platform.isWin) {
    if (bin === "xelatex") return "Install MiKTeX (https://miktex.org) or TeX Live.";
    return `Install ${bin} from https://pandoc.org/installing.html (or \`choco install ${bin}\`).`;
  }
  if (bin === "xelatex")
    return "Install TeX Live: `sudo apt install texlive-xetex` (or your distro's package).";
  return `Install ${bin} via your package manager (e.g. \`sudo apt install ${bin}\`) or https://pandoc.org/installing.html`;
}

export class PandocSetupModal extends Modal {
  constructor(app: App) {
    super(app);
  }

  private assetsFolderRel(): string {
    return (get(pluginSettings).pandocAssetsFolder ?? "").trim() || DEFAULT_ASSETS_DIR;
  }

  private assetsAbs(): string {
    const rel = this.assetsFolderRel();
    const adapter = this.app.vault.adapter as unknown as {
      getBasePath?: () => string;
    };
    const base = adapter.getBasePath ? adapter.getBasePath() : "";
    if (rel.startsWith("/") || rel.startsWith("~")) {
      return path.resolve(rel.startsWith("~") ? os.homedir() + rel.slice(1) : rel);
    }
    return path.join(base, rel);
  }

  private gatherChecks(): { checks: Check[]; assets: string } {
    const home = os.homedir();
    const dirs = binSearchDirs(home);
    const settings = get(pluginSettings);
    const pandoc = resolveBinary(
      (settings.pandocBinary ?? "pandoc").trim() || "pandoc",
      fs.existsSync,
      dirs
    );
    const xelatex = resolveBinary("xelatex", fs.existsSync, dirs);
    const crossref = resolveBinary("pandoc-crossref", fs.existsSync, dirs);
    const assets = this.assetsAbs();
    const assetsOk =
      fs.existsSync(path.join(assets, "defaults")) &&
      fs.existsSync(path.join(assets, "csl"));

    const checks: Check[] = [
      {
        ok: !!pandoc,
        label: "pandoc — " + (pandoc || "not found"),
        detail: pandoc ? "" : installHint("pandoc"),
      },
      {
        ok: !!xelatex,
        label: "xelatex (PDF engine) — " + (xelatex || "not found"),
        detail: xelatex ? "" : installHint("xelatex"),
      },
      {
        ok: !!crossref,
        label: "pandoc-crossref — " + (crossref || "not found"),
        detail: crossref ? "" : installHint("pandoc-crossref"),
      },
      {
        ok: assetsOk,
        label: "Pandoc assets — " + assets,
        detail: assetsOk
          ? "defaults/ and csl/ found."
          : "Not downloaded yet. Set the assets URL below and click Download.",
      },
    ];
    return { checks, assets };
  }

  private reportText(checks: Check[]): string {
    return (
      "Pandoc export setup:\n\n" +
      checks
        .map(
          (c) =>
            `[${c.ok ? "✓" : "✗"}] ${c.label}` +
            (c.detail ? `\n       ${c.detail}` : "")
        )
        .join("\n")
    );
  }

  onOpen(): void {
    this.render();
  }

  private render(): void {
    const { contentEl, titleEl } = this;
    titleEl.setText("Set up Pandoc export");
    contentEl.empty();

    contentEl.createEl("p", {
      text:
        "PDF export needs three system tools plus the PaperBell Pandoc toolchain (filters, templates, CSL). The toolchain lives in a separate assets repository — download it once with the button below.",
    });

    const { checks } = this.gatherChecks();

    const list = contentEl.createEl("div", { cls: "longform-pandoc-checklist" });
    for (const c of checks) {
      const item = list.createDiv({ cls: "longform-pandoc-check" });
      item.createSpan({
        text: c.ok ? "✓ " : "✗ ",
        cls: c.ok ? "longform-check-ok" : "longform-check-bad",
      });
      item.createSpan({ text: c.label });
      if (c.detail) {
        item.createEl("div", { text: c.detail, cls: "longform-pandoc-check-detail" });
      }
    }

    new Setting(contentEl)
      .setName("Assets URL")
      .setDesc(
        "Link to the PaperBell Pandoc toolchain .zip (a release asset of your assets repository)."
      )
      .addText((cb) => {
        cb.setPlaceholder("https://…/pandoc-assets.zip")
          .setValue(get(pluginSettings).pandocAssetsUrl)
          .onChange((v) => {
            pluginSettings.update((s) => ({ ...s, pandocAssetsUrl: v }));
          });
      });

    new Setting(contentEl)
      .setName("Download / update assets")
      .setDesc(
        `Downloads and extracts the toolchain into ${this.assetsFolderRel()} in your vault. Your edits there survive plugin updates.`
      )
      .addButton((cb) =>
        cb.setButtonText("Download assets").setCta().onClick(async () => {
          await this.download();
        })
      );

    const buttons = contentEl.createDiv({ cls: "longform-error-modal-buttons" });
    const recheck = buttons.createEl("button", { text: "Recheck" });
    recheck.addEventListener("click", () => this.render());
    const copy = buttons.createEl("button", { text: "Copy report" });
    copy.addEventListener("click", async () => {
      await navigator.clipboard.writeText(this.reportText(checks));
      copy.setText("Copied!");
      window.setTimeout(() => copy.setText("Copy report"), 1500);
    });
    const done = buttons.createEl("button", { text: "Done", cls: "mod-cta" });
    done.addEventListener("click", () => {
      pluginSettings.update((s) => ({ ...s, pandocSetupDismissed: true }));
      this.close();
    });
  }

  private async download(): Promise<void> {
    const url = (get(pluginSettings).pandocAssetsUrl ?? "").trim();
    const dest = DEFAULT_ASSETS_DIR;
    const notice = new Notice("Downloading Pandoc assets…", 0);
    try {
      const { count } = await downloadPandocAssets(this.app, url, dest);
      pluginSettings.update((s) => ({ ...s, pandocAssetsFolder: dest }));
      refreshPandocTemplates(this.app);
      notice.hide();
      new Notice(`Downloaded ${count} asset files to ${dest}.`);
      this.render();
    } catch (e) {
      notice.hide();
      new Notice("Assets download failed: " + (e as Error).message, 8000);
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
