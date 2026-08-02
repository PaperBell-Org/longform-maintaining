import {
  App,
  debounce,
  Notice,
  normalizePath,
  PluginSettingTab,
  Setting,
} from "obsidian";
import { get } from "svelte/store";

import type LongformPlugin from "../../main";
import { pluginSettings, userScriptSteps } from "src/model/stores";
import { paperbell } from "src/paperbell/store";
import { locale, translate as t } from "src/i18n";
import { FolderSuggest } from "./folder-suggest";
import { DEFAULT_SESSION_FILE, DEFAULT_SETTINGS } from "src/model/types";
import type { LongformPluginSettings } from "src/model/types";
import { FileSuggest } from "./file-suggest";
import { syncSceneIndices } from "src/model/store-vault-sync";
import { PandocSetupModal } from "../pandoc-setup-modal";
import PandocMarketModal from "../pandoc-market";
import { DEFAULT_MARKET_INDEX_URL } from "src/model/pandoc-market";
import { SubscriptionSet } from "src/utils/subscription-set";

export class LongformSettingsTab extends PluginSettingTab {
  plugin: LongformPlugin;
  // One set rather than three fields: an unsubscriber must never be called
  // twice (svelte 3 throws), and both display() and hide() tear down. See
  // src/utils/subscription-set.ts.
  private subs = new SubscriptionSet();
  private pendingRerender: number | null = null;
  private stepsSummary: HTMLElement;
  private stepsList: HTMLUListElement;

  constructor(app: App, plugin: LongformPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;

    // NOTHING here may throw out of display(): Obsidian's openTab() empties the
    // tab container before calling renderTab(), and wraps neither that nor
    // hide() in a try/catch — so an escaping error leaves the pane blank with no
    // way back. Hence the whole body, teardown and subscribe included, is
    // guarded (the previous version guarded only renderSettings, and the real
    // throw was in the teardown above it).
    try {
      // display() can be re-invoked (locale change, PaperBell refresh); tear down
      // any subscriptions from the previous render before rebuilding.
      this.teardown();

      // Never deref a null store (defensive: settings are loaded at onload, but a
      // re-entrant display() must not blow up on a transient null).
      const settings = get(pluginSettings) ?? DEFAULT_SETTINGS;

      containerEl.empty();

      // Re-render in the new language whenever the resolved locale changes. Skip
      // the immediate emission svelte stores send on subscribe (we're rendering
      // now). Subscribed BEFORE the render so a throw mid-render can't leak it.
      let firstLocaleEmission = true;
      this.subs.add(
        locale.subscribe(() => {
          if (firstLocaleEmission) {
            firstLocaleEmission = false;
            return;
          }
          // Deferred, never synchronous: a PaperBell refresh updates `paperbell`
          // → the derived effective locale → `locale`, all inside the awaited
          // fetch, which would otherwise re-enter display() mid-flush and leave
          // the outer call rebuilding a container the inner one already replaced.
          // Cancelled by teardown(), so the refresh button's own re-render
          // supersedes this one instead of the pane rebuilding twice — and so a
          // hidden tab never re-renders into a detached container.
          this.pendingRerender = window.setTimeout(() => {
            this.pendingRerender = null;
            this.display();
          }, 0);
        })
      );

      this.renderSettings(settings, containerEl);
    } catch (e) {
      console.error("[PaperOut] Failed to render settings:", e);
      try {
        containerEl.empty();
        containerEl.createEl("p", { cls: "setting-item-description" }, (el) => {
          el.setText(t("settings.renderError"));
        });
      } catch (nested) {
        console.error("[PaperOut] Could not render the settings error:", nested);
      }
    }
  }

  private renderSettings(
    settings: LongformPluginSettings,
    containerEl: HTMLElement
  ): void {
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
          .setValue(settings.sceneTemplate ?? "")
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
          .setValue(settings.pandocMarketIndexUrl ?? "")
          .onChange((v) => {
            pluginSettings.update((s) => ({ ...s, pandocMarketIndexUrl: v }));
          });
      });

    new Setting(containerEl)
      .setName(t("settings.pandocUrl.name"))
      .setDesc(t("settings.pandocUrl.desc"))
      .addText((cb) => {
        cb.setPlaceholder("https://…/pandoc-assets.zip")
          .setValue(settings.pandocAssetsUrl ?? "")
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
          .setValue(settings.pandocAssetsFolder ?? "")
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
          .setValue(settings.pandocOutputFolder ?? "")
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
          .setValue(settings.pandocBibliography ?? "")
          .onChange((v) => {
            pluginSettings.update((s) => ({ ...s, pandocBibliography: v }));
          });
      });

    new Setting(containerEl)
      .setName(t("settings.globalBibliography.name"))
      .setDesc(t("settings.globalBibliography.desc"))
      .addTextArea((cb) => {
        cb.setPlaceholder("Library/global.bib\nLibrary/methods-refs.bib")
          .setValue(settings.pandocGlobalBibliography ?? "")
          .onChange((v) => {
            pluginSettings.update((s) => ({
              ...s,
              pandocGlobalBibliography: v,
            }));
          });
      });

    new Setting(containerEl)
      .setName(t("settings.pandocBinary.name"))
      .setDesc(t("settings.pandocBinary.desc"))
      .addText((cb) => {
        cb.setPlaceholder("pandoc")
          .setValue(settings.pandocBinary ?? "")
          .onChange((v) => {
            pluginSettings.update((s) => ({ ...s, pandocBinary: v }));
          });
      });

    new Setting(containerEl)
      .setName(t("settings.extraBinFolders.name"))
      .setDesc(t("settings.extraBinFolders.desc"))
      .addTextArea((cb) => {
        cb.setPlaceholder("C:\\Tools\\pandoc\n/opt/local/bin")
          .setValue(settings.pandocExtraBinFolders ?? "")
          .onChange((v) => {
            pluginSettings.update((s) => ({ ...s, pandocExtraBinFolders: v }));
          });
      });

    new Setting(containerEl)
      .setName(t("settings.userScriptFolder.name"))
      .setDesc(t("settings.userScriptFolder.desc"))
      .addSearch((cb) => {
        new FolderSuggest(this.app, cb.inputEl);
        cb.setPlaceholder("my/script/steps/")
          .setValue(settings.userScriptFolder ?? "")
          .onChange((v) => {
            pluginSettings.update((s) => ({ ...s, userScriptFolder: v }));
          });
      });

    this.stepsSummary = containerEl.createSpan();
    this.stepsList = containerEl.createEl("ul", {
      cls: "longform-settings-user-steps",
    });
    this.subs.add(
      userScriptSteps.subscribe((steps) => {
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
      })
    );
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
        cb.setValue(String(settings.sessionGoal ?? DEFAULT_SETTINGS.sessionGoal));
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
        cb.setValue(
          String(settings.keepSessionCount ?? DEFAULT_SETTINGS.keepSessionCount)
        );
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

    this.subs.add(
      pluginSettings.subscribe((settings) => {
        sessionFileStorageSettings.settingEl.style.display =
          settings.sessionStorage === "file" ? "flex" : "none";
      })
    );

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
        cb.setValue(
          String(settings.fallbackWaitTime ?? DEFAULT_SETTINGS.fallbackWaitTime)
        );
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
              // The contract says this resolves to null when the scope is
              // denied (docs/PAPERBELL_INTEGRATION.md, "Failing safe"), but the
              // host is a separate plugin we don't control: an unhandled
              // rejection here would leave the button silently doing nothing.
              try {
                await this.plugin.paperBell.fetchSharedConfig();
              } catch (e) {
                console.error("[PaperOut] PaperBell refresh failed:", e);
                new Notice(
                  t("settings.paperbell.refreshFailed", {
                    error: (e as Error)?.message ?? String(e),
                  })
                );
              }
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
  }

  hide(): void {
    // Obsidian calls hide() on tab switch and on closing the settings modal,
    // then display() on the way back in. teardown() is idempotent so that pair
    // cannot double-call the same unsubscriber.
    this.teardown();
  }

  /** Drop every subscription and any queued re-render. Idempotent. */
  private teardown(): void {
    if (this.pendingRerender !== null) {
      window.clearTimeout(this.pendingRerender);
      this.pendingRerender = null;
    }
    this.subs.teardown();
  }
}
