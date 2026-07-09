import {
  App,
  debounce,
  normalizePath,
  PluginSettingTab,
  Setting,
} from "obsidian";
import type { Unsubscriber } from "svelte/store";
import { get } from "svelte/store";

import type LongformPlugin from "../../main";
import { pluginSettings, userScriptSteps } from "src/model/stores";
import { paperbell } from "src/paperbell/store";
import { locale, translate as t } from "src/i18n";
import { FolderSuggest } from "./folder-suggest";
import { DEFAULT_SESSION_FILE } from "src/model/types";
import { FileSuggest } from "./file-suggest";
import { syncSceneIndices } from "src/model/store-vault-sync";
import { PandocSetupModal } from "../pandoc-setup-modal";
import PandocMarketModal from "../pandoc-market";
import { DEFAULT_MARKET_INDEX_URL } from "src/model/pandoc-market";

export class LongformSettingsTab extends PluginSettingTab {
  plugin: LongformPlugin;
  private unsubscribeUserScripts: Unsubscriber;
  private unsubscribeSettings: Unsubscriber;
  private unsubscribeLocale: Unsubscriber;
  private stepsSummary: HTMLElement;
  private stepsList: HTMLUListElement;

  constructor(app: App, plugin: LongformPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    // display() can be re-invoked (locale change, PaperBell refresh); tear down any
    // subscriptions from the previous render before rebuilding.
    this.unsubscribeUserScripts?.();
    this.unsubscribeSettings?.();
    this.unsubscribeLocale?.();

    const settings = get(pluginSettings);

    const { containerEl } = this;

    containerEl.empty();

    // ── Language ──────────────────────────────────────────────────────────
    new Setting(containerEl).setName(t("settings.language.heading")).setHeading();
    new Setting(containerEl)
      .setName(t("settings.language.name"))
      .setDesc(t("settings.language.desc"))
      .addDropdown((cb) => {
        cb.addOption("auto", t("settings.language.auto"));
        cb.addOption("en", t("settings.language.en"));
        cb.addOption("zh", t("settings.language.zh"));
        cb.setValue(settings.language ?? "auto");
        cb.onChange((value: "auto" | "en" | "zh") => {
          pluginSettings.update((s) => ({ ...s, language: value }));
        });
      });

    // ── Composition ───────────────────────────────────────────────────────
    new Setting(containerEl)
      .setName(t("settings.composition.heading"))
      .setHeading();
    new Setting(containerEl)
      .setName(t("settings.sceneTemplate.name"))
      .addSearch((cb) => {
        new FileSuggest(this.app, cb.inputEl);
        cb.setPlaceholder("templates/Scene.md")
          .setValue(settings.sceneTemplate)
          .onChange((v) => {
            pluginSettings.update((s) => ({ ...s, sceneTemplate: v }));
          });
      });
    containerEl.createEl("p", { cls: "setting-item-description" }, (el) => {
      el.setText(t("settings.sceneTemplate.desc"));
    });

    new Setting(containerEl)
      .setName(t("settings.numberScenes.name"))
      .setDesc(t("settings.numberScenes.desc"))
      .addToggle((cb) => {
        cb.setValue(settings.numberScenes);
        cb.onChange((value) => {
          pluginSettings.update((s) => ({ ...s, numberScenes: value }));
        });
      });

    new Setting(containerEl)
      .setName(t("settings.writeProperty.name"))
      .setDesc(t("settings.writeProperty.desc"))
      .addToggle((toggle) => {
        toggle.setValue(settings.writeProperty);
        toggle.onChange((value) => {
          pluginSettings.update((s) => ({ ...s, writeProperty: value }));
          if (value) {
            syncSceneIndices(this.app);
          }
        });
      });

    // ── Compile ───────────────────────────────────────────────────────────
    new Setting(containerEl).setName(t("settings.compile.heading")).setHeading();

    new Setting(containerEl)
      .setName(t("settings.pandocExport.name"))
      .setDesc(t("settings.pandocExport.desc"))
      .addButton((cb) => {
        cb.setButtonText(t("settings.pandocExport.button"))
          .setCta()
          .onClick(() => new PandocSetupModal(this.app, this.plugin).open());
      });

    new Setting(containerEl)
      .setName(t("settings.market.name"))
      .setDesc(t("settings.market.desc"))
      .addButton((cb) => {
        cb.setButtonText(t("settings.market.button"))
          .setCta()
          .onClick(() => new PandocMarketModal(this.app, this.plugin).open());
      });

    new Setting(containerEl)
      .setName(t("settings.market.url.name"))
      .setDesc(t("settings.market.url.desc"))
      .addText((cb) => {
        cb.setPlaceholder(DEFAULT_MARKET_INDEX_URL)
          .setValue(settings.pandocMarketIndexUrl)
          .onChange((v) => {
            pluginSettings.update((s) => ({ ...s, pandocMarketIndexUrl: v }));
          });
      });

    new Setting(containerEl)
      .setName(t("settings.pandocUrl.name"))
      .setDesc(t("settings.pandocUrl.desc"))
      .addText((cb) => {
        cb.setPlaceholder("https://…/pandoc-assets.zip")
          .setValue(settings.pandocAssetsUrl)
          .onChange((v) => {
            pluginSettings.update((s) => ({ ...s, pandocAssetsUrl: v }));
          });
      });

    new Setting(containerEl)
      .setName(t("settings.pandocFolder.name"))
      .setDesc(t("settings.pandocFolder.desc"))
      .addSearch((cb) => {
        new FolderSuggest(this.app, cb.inputEl);
        cb.setPlaceholder("PaperBell/pandoc")
          .setValue(settings.pandocAssetsFolder)
          .onChange((v) => {
            pluginSettings.update((s) => ({ ...s, pandocAssetsFolder: v }));
          });
      });

    new Setting(containerEl)
      .setName(t("settings.pandocOutput.name"))
      .setDesc(t("settings.pandocOutput.desc"))
      .addSearch((cb) => {
        new FolderSuggest(this.app, cb.inputEl);
        cb.setPlaceholder("(next to manuscript, or e.g. ~/Papers)")
          .setValue(settings.pandocOutputFolder)
          .onChange((v) => {
            pluginSettings.update((s) => ({ ...s, pandocOutputFolder: v }));
          });
      });

    new Setting(containerEl)
      .setName(t("settings.bibliography.name"))
      .setDesc(t("settings.bibliography.desc"))
      .addSearch((cb) => {
        new FileSuggest(this.app, cb.inputEl);
        cb.setPlaceholder("(auto-detect)")
          .setValue(settings.pandocBibliography)
          .onChange((v) => {
            pluginSettings.update((s) => ({ ...s, pandocBibliography: v }));
          });
      });

    new Setting(containerEl)
      .setName(t("settings.pandocBinary.name"))
      .setDesc(t("settings.pandocBinary.desc"))
      .addText((cb) => {
        cb.setPlaceholder("pandoc")
          .setValue(settings.pandocBinary)
          .onChange((v) => {
            pluginSettings.update((s) => ({ ...s, pandocBinary: v }));
          });
      });

    new Setting(containerEl)
      .setName(t("settings.userScriptFolder.name"))
      .setDesc(t("settings.userScriptFolder.desc"))
      .addSearch((cb) => {
        new FolderSuggest(this.app, cb.inputEl);
        cb.setPlaceholder("my/script/steps/")
          .setValue(settings.userScriptFolder)
          .onChange((v) => {
            pluginSettings.update((s) => ({ ...s, userScriptFolder: v }));
          });
      });

    this.stepsSummary = containerEl.createSpan();
    this.stepsList = containerEl.createEl("ul", {
      cls: "longform-settings-user-steps",
    });
    this.unsubscribeUserScripts = userScriptSteps.subscribe((steps) => {
      if (steps && steps.length > 0) {
        this.stepsSummary.innerText = t("settings.userSteps.loaded", {
          count: steps.length,
          plural: steps.length !== 1 ? "s" : "",
        });
      } else {
        this.stepsSummary.innerText = t("settings.userSteps.none");
      }
      if (this.stepsList) {
        this.stepsList.empty();
        if (steps) {
          steps.forEach((s) => {
            const stepEl = this.stepsList.createEl("li");
            stepEl.createSpan({
              text: s.description.name,
              cls: "longform-settings-user-step-name",
            });
            stepEl.createSpan({
              text: `(${s.description.canonicalID})`,
              cls: "longform-settings-user-step-id",
            });
          });
        }
      }
    });
    containerEl.createEl("p", { cls: "setting-item-description" }, (el) => {
      el.setText(t("settings.userSteps.desc"));
    });

    // ── Word Counts & Sessions ────────────────────────────────────────────
    new Setting(containerEl)
      .setName(t("settings.wordCounts.heading"))
      .setHeading();
    new Setting(containerEl)
      .setName(t("settings.showWordCount.name"))
      .setDesc(t("settings.showWordCount.desc"))
      .addToggle((cb) => {
        cb.setValue(settings.showWordCountInStatusBar);
        cb.onChange((value) => {
          pluginSettings.update((s) => ({
            ...s,
            showWordCountInStatusBar: value,
          }));
        });
      });
    new Setting(containerEl)
      .setName(t("settings.newSessionDaily.name"))
      .setDesc(t("settings.newSessionDaily.desc"))
      .addToggle((cb) => {
        cb.setValue(settings.startNewSessionEachDay);
        cb.onChange((value) => {
          pluginSettings.update((s) => ({
            ...s,
            startNewSessionEachDay: value,
          }));
        });
      });
    new Setting(containerEl)
      .setName(t("settings.sessionGoal.name"))
      .setDesc(t("settings.sessionGoal.desc"))
      .addText((cb) => {
        cb.setValue(settings.sessionGoal.toString());
        cb.onChange((value) => {
          const numberValue = +value;
          if (numberValue && numberValue > 0) {
            pluginSettings.update((s) => ({ ...s, sessionGoal: numberValue }));
          }
        });
      });
    new Setting(containerEl)
      .setName(t("settings.goalAppliesTo.name"))
      .setDesc(t("settings.goalAppliesTo.desc"))
      .addDropdown((cb) => {
        cb.addOption("all", t("settings.goalAppliesTo.all"));
        cb.addOption("project", t("settings.goalAppliesTo.project"));
        cb.addOption("note", t("settings.goalAppliesTo.note"));
        cb.setValue(settings.applyGoalTo);
        cb.onChange((value: "all" | "project" | "note") => {
          pluginSettings.update((s) => ({ ...s, applyGoalTo: value }));
        });
      });
    new Setting(containerEl)
      .setName(t("settings.notifyOnGoal.name"))
      .addToggle((cb) => {
        cb.setValue(settings.notifyOnGoal);
        cb.onChange((value) => {
          pluginSettings.update((s) => ({ ...s, notifyOnGoal: value }));
        });
      });
    new Setting(containerEl)
      .setName(t("settings.countDeletions.name"))
      .setDesc(t("settings.countDeletions.desc"))
      .addToggle((cb) => {
        cb.setValue(settings.countDeletionsForGoal);
        cb.onChange((value) => {
          pluginSettings.update((s) => ({
            ...s,
            countDeletionsForGoal: value,
          }));
        });
      });
    new Setting(containerEl)
      .setName(t("settings.sessionsToKeep.name"))
      .setDesc(t("settings.sessionsToKeep.desc"))
      .addText((cb) => {
        cb.setValue(settings.keepSessionCount.toString());
        cb.onChange((value) => {
          const numberValue = +value;
          if (numberValue && numberValue > 0) {
            pluginSettings.update((s) => ({
              ...s,
              keepSessionCount: numberValue,
            }));
          }
        });
      });
    new Setting(containerEl)
      .setName(t("settings.storeSession.name"))
      .setDesc(t("settings.storeSession.desc"))
      .addDropdown((cb) => {
        cb.addOption("data", t("settings.storeSession.data"));
        cb.addOption("plugin-folder", t("settings.storeSession.pluginFolder"));
        cb.addOption("file", t("settings.storeSession.file"));
        cb.setValue(settings.sessionStorage);
        cb.onChange((value: "data" | "plugin-folder" | "file") => {
          pluginSettings.update((s) => ({ ...s, sessionStorage: value }));
        });
      });

    const updateSessionFile = debounce((value: string) => {
      // Normalize file to end in .json
      let fileName = value;
      if (!fileName || fileName.length === 0) {
        fileName = DEFAULT_SESSION_FILE;
      }
      fileName = normalizePath(fileName);
      if (!fileName.endsWith(".json")) {
        fileName = `${fileName}.json`;
      }
      pluginSettings.update((s) => ({ ...s, sessionFile: fileName }));
    }, 1000);

    const sessionFileStorageSettings = new Setting(containerEl)
      .setName(t("settings.sessionFile.name"))
      .setDesc(t("settings.sessionFile.desc"))
      .addText((cb) => {
        cb.setPlaceholder(DEFAULT_SESSION_FILE);
        cb.setValue(settings.sessionFile ?? DEFAULT_SESSION_FILE);
        cb.onChange(updateSessionFile);
      });
    sessionFileStorageSettings.settingEl.style.display = "none";

    this.unsubscribeSettings = pluginSettings.subscribe((settings) => {
      sessionFileStorageSettings.settingEl.style.display =
        settings.sessionStorage === "file" ? "flex" : "none";
    });

    // ── Troubleshooting ───────────────────────────────────────────────────
    new Setting(containerEl)
      .setName(t("settings.troubleshooting.heading"))
      .setHeading();

    new Setting(containerEl)
      .setName(t("settings.waitForSync.name"))
      .setDesc(t("settings.waitForSync.desc"))
      .addToggle((cb) => {
        cb.setValue(settings.waitForSync);
        cb.onChange((value) => {
          pluginSettings.update((s) => ({ ...s, waitForSync: value }));
        });
      });

    new Setting(containerEl)
      .setName(t("settings.fallbackWait.name"))
      .setDesc(t("settings.fallbackWait.desc"))
      .addToggle((cb) => {
        cb.setValue(settings.fallbackWaitEnabled);
        cb.onChange((value) => {
          pluginSettings.update((s) => ({ ...s, fallbackWaitEnabled: value }));
        });
      });

    new Setting(containerEl)
      .setName(t("settings.fallbackWaitTime.name"))
      .setDesc(t("settings.fallbackWaitTime.desc"))
      .addText((cb) => {
        cb.setValue(settings.fallbackWaitTime.toString());
        cb.onChange((value) => {
          const numberValue = parseInt(value);
          if (!isNaN(numberValue) && numberValue > 0) {
            pluginSettings.update((s) => ({
              ...s,
              fallbackWaitTime: numberValue,
            }));
          }
        });
      });

    // ── PaperBell host integration (optional; standalone-safe) ────────────
    new Setting(containerEl).setName(t("settings.paperbell.heading")).setHeading();
    const pb = get(paperbell);
    if (pb.connected) {
      const account = pb.config?.account;
      const status = account?.displayName
        ? t("settings.paperbell.connectedWithName", {
            name: account.displayName,
            plan: account.plan ? ` (${account.plan})` : "",
          })
        : t("settings.paperbell.connected");
      containerEl.createEl("p", { cls: "setting-item-description" }, (el) => {
        el.setText(status);
      });
      new Setting(containerEl)
        .setName(t("settings.paperbell.account.name"))
        .setDesc(t("settings.paperbell.account.desc"))
        .addButton((b) =>
          b
            .setButtonText(
              pb.config
                ? t("settings.paperbell.button.refresh")
                : t("settings.paperbell.button.connect")
            )
            .onClick(async () => {
              await this.plugin.paperBell.fetchSharedConfig();
              this.display();
            })
        );
      if (pb.capabilities.includes("llm-invoke")) {
        containerEl.createEl("p", { cls: "setting-item-description" }, (el) => {
          el.setText(t("settings.paperbell.aiAvailable"));
        });
      }
    } else {
      containerEl.createEl("p", { cls: "setting-item-description" }, (el) => {
        el.setText(t("settings.paperbell.notConnected"));
      });
    }

    // ── Credits ───────────────────────────────────────────────────────────
    new Setting(containerEl).setName(t("settings.credits.heading")).setHeading();

    containerEl.createEl("p", {}, (el) => {
      el.innerHTML = t("settings.credits.body");
    });
    containerEl.createEl("p", {}, (el) => {
      el.innerHTML = t("settings.credits.source");
    });
    containerEl.createEl("p", {}, (el) => {
      el.innerHTML = t("settings.credits.icon");
    });

    // Re-render in the new language whenever the resolved locale changes. Skip the
    // immediate emission svelte stores send on subscribe (we just rendered).
    let firstLocaleEmission = true;
    this.unsubscribeLocale = locale.subscribe(() => {
      if (firstLocaleEmission) {
        firstLocaleEmission = false;
        return;
      }
      this.display();
    });
  }

  hide(): void {
    this.unsubscribeUserScripts?.();
    this.unsubscribeSettings?.();
    this.unsubscribeLocale?.();
  }
}
