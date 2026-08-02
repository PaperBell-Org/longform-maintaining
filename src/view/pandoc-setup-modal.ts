import { App, Modal, Notice, Platform, Setting } from "obsidian";
import * as fs from "fs";
import * as path from "path";
import { get } from "svelte/store";

import { pluginSettings } from "src/model/stores";
import {
  binSearchDirs,
  currentPlatformEnv,
  DEFAULT_ASSETS_DIR,
  resolveBinary,
  resolveUserPath,
} from "src/compile/steps/pandoc-export-utils";
import { downloadPandocAssets } from "src/model/pandoc-assets";
import { refreshPandocTemplates } from "src/model/pandoc-templates";
import { translate } from "src/i18n";
import PandocMarketModal from "./pandoc-market";
import type LongformPlugin from "src/main";

/**
 * `required` — the export cannot run without it.
 * `optional` — only some presets need it, so a miss is a warning, not a failure.
 *   The export step already decides per preset (a `to: docx` preset needs
 *   neither a TeX engine nor pandoc-crossref); showing a bare ✗ here told users
 *   with a Word workflow to go fix something that was never in their way.
 */
type Check = {
  ok: boolean;
  label: string;
  detail: string;
  optional?: boolean;
};

function statusGlyph(c: Check): string {
  return c.ok ? "✓" : c.optional ? "⚠" : "✗";
}

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
  private plugin?: LongformPlugin;

  constructor(app: App, plugin?: LongformPlugin) {
    super(app);
    this.plugin = plugin;
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
    return resolveUserPath(rel, base, currentPlatformEnv());
  }

  private gatherChecks(): {
    checks: Check[];
    assets: string;
    dirs: string[];
  } {
    const settings = get(pluginSettings);
    const platform = currentPlatformEnv(settings.pandocExtraBinFolders);
    const dirs = binSearchDirs(platform);
    const nf = translate("setup.notFound");
    const pandoc = resolveBinary(
      (settings.pandocBinary ?? "pandoc").trim() || "pandoc",
      fs.existsSync,
      dirs,
      platform.isWindows
    );
    const xelatex = resolveBinary(
      "xelatex",
      fs.existsSync,
      dirs,
      platform.isWindows
    );
    const crossref = resolveBinary(
      "pandoc-crossref",
      fs.existsSync,
      dirs,
      platform.isWindows
    );
    const assets = this.assetsAbs();
    const assetsOk =
      fs.existsSync(path.join(assets, "defaults")) &&
      fs.existsSync(path.join(assets, "csl"));

    const checks: Check[] = [
      {
        ok: !!pandoc,
        label: "pandoc — " + (pandoc || nf),
        detail: pandoc ? "" : installHint("pandoc"),
      },
      {
        ok: !!xelatex,
        optional: true,
        label: `xelatex (${translate("setup.pdfEngine")}) — ` + (xelatex || nf),
        detail: xelatex
          ? ""
          : translate("setup.optionalPdfEngine") + " " + installHint("xelatex"),
      },
      {
        ok: !!crossref,
        optional: true,
        label: "pandoc-crossref — " + (crossref || nf),
        detail: crossref
          ? ""
          : translate("setup.optionalCrossref") +
            " " +
            installHint("pandoc-crossref"),
      },
      {
        // Not optional: `hardOk` in pandoc-export.ts refuses to run without
        // defaults/ and csl/, so a warning here would understate a hard stop.
        ok: assetsOk,
        label: translate("setup.assets") + " — " + assets,
        detail: assetsOk
          ? translate("setup.assetsOk")
          : translate("setup.assetsMissing"),
      },
    ];
    return { checks, assets, dirs };
  }

  private reportText(checks: Check[], dirs: string[]): string {
    return (
      "Pandoc export setup:\n\n" +
      checks
        .map(
          (c) =>
            `[${statusGlyph(c)}] ${c.label}` + (c.detail ? `\n       ${c.detail}` : "")
        )
        .join("\n") +
      // The single most useful line when a binary "isn't found" but is clearly
      // installed: it says exactly where we looked.
      `\n\nSearched (in order):\n${dirs.map((d) => "  " + d).join("\n")}`
    );
  }

  onOpen(): void {
    this.render();
  }

  private render(): void {
    const { contentEl, titleEl } = this;
    titleEl.setText(translate("setup.title"));
    contentEl.empty();

    contentEl.createEl("p", { text: translate("setup.intro") });

    const { checks, dirs } = this.gatherChecks();

    const list = contentEl.createEl("div", { cls: "longform-pandoc-checklist" });
    for (const c of checks) {
      const item = list.createDiv({ cls: "longform-pandoc-check" });
      item.createSpan({
        text: statusGlyph(c) + " ",
        cls: c.ok
          ? "longform-check-ok"
          : c.optional
          ? "longform-check-warn"
          : "longform-check-bad",
      });
      item.createSpan({ text: c.label });
      if (c.detail) {
        item.createEl("div", { text: c.detail, cls: "longform-pandoc-check-detail" });
      }
    }

    // Primary path: the asset marketplace (needs the plugin for its modal).
    if (this.plugin) {
      new Setting(contentEl)
        .setName(translate("setup.market.name"))
        .setDesc(translate("setup.market.desc"))
        .addButton((cb) =>
          cb
            .setButtonText(translate("setup.market.button"))
            .setCta()
            .onClick(() => {
              this.close();
              new PandocMarketModal(this.app, this.plugin as LongformPlugin).open();
            })
        );
    }

    new Setting(contentEl)
      .setName(translate("setup.url.name"))
      .setDesc(translate("setup.url.desc"))
      .addText((cb) => {
        cb.setPlaceholder("https://…/pandoc-assets.zip")
          .setValue(get(pluginSettings).pandocAssetsUrl)
          .onChange((v) => {
            pluginSettings.update((s) => ({ ...s, pandocAssetsUrl: v }));
          });
      });

    new Setting(contentEl)
      .setName(translate("setup.download.name"))
      .setDesc(
        translate("setup.download.desc", { folder: this.assetsFolderRel() })
      )
      .addButton((cb) =>
        cb
          .setButtonText(translate("setup.download.button"))
          .onClick(async () => {
            await this.download();
          })
      );

    const buttons = contentEl.createDiv({ cls: "longform-error-modal-buttons" });
    const recheck = buttons.createEl("button", { text: translate("setup.recheck") });
    recheck.addEventListener("click", () => this.render());
    const copy = buttons.createEl("button", { text: translate("setup.copyReport") });
    copy.addEventListener("click", async () => {
      await navigator.clipboard.writeText(this.reportText(checks, dirs));
      copy.setText(translate("setup.copied"));
      window.setTimeout(() => copy.setText(translate("setup.copyReport")), 1500);
    });
    const done = buttons.createEl("button", {
      text: translate("setup.done"),
      cls: "mod-cta",
    });
    done.addEventListener("click", () => {
      pluginSettings.update((s) => ({ ...s, pandocSetupDismissed: true }));
      this.close();
    });
  }

  private async download(): Promise<void> {
    const url = (get(pluginSettings).pandocAssetsUrl ?? "").trim();
    const dest = DEFAULT_ASSETS_DIR;
    const notice = new Notice(translate("setup.downloading"), 0);
    try {
      const { count } = await downloadPandocAssets(this.app, url, dest);
      pluginSettings.update((s) => ({ ...s, pandocAssetsFolder: dest }));
      refreshPandocTemplates(this.app);
      notice.hide();
      new Notice(translate("setup.downloaded", { count: String(count), dest }));
      this.render();
    } catch (e) {
      notice.hide();
      new Notice(
        translate("setup.downloadFailed", { error: (e as Error).message }),
        8000
      );
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
