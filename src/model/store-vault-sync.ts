import {
  normalizePath,
  TFile,
  type App,
  type CachedMetadata,
  type MetadataCache,
  type Vault,
} from "obsidian";
import { cloneDeep, isEqual } from "lodash";
import { get, type Unsubscriber } from "svelte/store";

import type { Draft, MultipleSceneDraft } from "./types";
import {
  drafts as draftsStore,
  pluginSettings,
  waitingForSync,
  selectedDraftVaultPath,
} from "./stores";
import {
  formatSceneNumber,
  numberScenes,
  scenesForCompileNumbering,
  setDraftOnFrontmatterObject,
} from "src/model/draft-utils";
import {
  expandProjectIndex,
  setProjectAssetsOnFrontmatterObject,
  syntheticAssetPath,
} from "./project-index";
import {
  draftIndexFolder,
  draftIndexPath,
  draftParentFolder,
} from "./project-resources";
import { fileNameFromPath } from "./note-utils";
import { findScene, sceneFolderPath, scenePath } from "./scene-navigation";

type FileWithMetadata = {
  file: TFile;
  metadata: CachedMetadata;
};

export function resolveIfLongformFile(
  metadataCache: MetadataCache,
  file: TFile
): FileWithMetadata | null {
  const metadata = metadataCache.getFileCache(file);
  if (metadata && metadata.frontmatter && metadata.frontmatter["longform"]) {
    return { file, metadata };
  }
  return null;
}

/**
 * Observes any file with a `longform` metadata entry and keeps its
 * metadata and associated scenes (if any) updated in the `drafts`
 * store.
 *
 * Subscribes to the `drafts` store and records changes in it to disk.
 *
 * Thus, keeps both store and vault in sync.
 */
export class StoreVaultSync {
  private app: App;
  private vault: Vault;
  private metadataCache: MetadataCache;
  private isInitializing = true;
  private settlingTime = 30000; // fallback settling time

  private lastKnownDraftsByPath: Record<string, Draft> = {};
  private unsubscribeDraftsStore: Unsubscriber;

  private pathsToIgnoreNextChange: Set<string> = new Set();

  constructor(app: App) {
    this.app = app;
    this.vault = app.vault;
    this.metadataCache = app.metadataCache;
  }

  destroy(): void {
    this.unsubscribeDraftsStore();
  }

  private isSyncEnabled(): boolean {
    try {
      // @ts-ignore - accessing private API
      const syncPlugin = this.app.internalPlugins?.plugins?.sync;
      return syncPlugin?.enabled === true;
    } catch {
      return false;
    }
  }

  private async waitForSync(): Promise<void> {
    const settings = get(pluginSettings);

    // First check if "wait for sync" in setting or the Sync plugin itself is enabled
    if (!settings.waitForSync || !this.isSyncEnabled()) {
      return Promise.resolve();
    }

    try {
      // @ts-ignore - accessing private API
      const sync = this.app.internalPlugins.plugins.sync.instance;

      // Set waitingForSync to disable watchers and enable loading spinner
      waitingForSync.set(true);

      // Check if we can't access the sync status (possibly due to Sync plugin API changes), use fallback wait if not
      if (!sync?.syncing) {
        return this.fallbackWait();
      }

      return new Promise((resolve) => {
        if (!sync.syncing) {
          waitingForSync.set(false);
          resolve();
          return;
        }

        console.log("[PaperOut] Waiting for active sync to complete...");

        // Poll sync status every second
        const interval = setInterval(() => {
          if (!sync.syncing) {
            clearInterval(interval);
            clearTimeout(timeout);  // Clear the timeout when sync completes
            console.log("[PaperOut] Sync complete.");
            waitingForSync.set(false);
            resolve();
          }
          console.log("[PaperOut] Sync status:", sync.syncStatus);
        }, 1000);

        // Add a timeout just in case sync never completes
        const timeout = setTimeout(() => {
          clearInterval(interval);
          console.log("[PaperOut] Sync wait timed out");
          waitingForSync.set(false);
          resolve();
        }, this.settlingTime);
      });
    } catch (error) {
      waitingForSync.set(false);
      return this.fallbackWait();
    }
  }

  private async fallbackWait(): Promise<void> {
    const settings = get(pluginSettings);
    if (!settings.fallbackWaitEnabled) {
      return Promise.resolve();
    }

    return new Promise(resolve =>
      setTimeout(resolve, settings.fallbackWaitTime * 1000)
    );
  }

  async initialize() {
    try {
      await this.waitForSync();
      await this.discoverDrafts();

      this.isInitializing = false;
    } catch (error) {
      this.isInitializing = false;
    }
  }

  async discoverDrafts() {
    const start = new Date().getTime();

    const files = this.vault.getMarkdownFiles();
    const resolvedFiles = files.map((f) =>
      resolveIfLongformFile(this.metadataCache, f)
    );
    const draftFiles = resolvedFiles.filter((f) => f !== null);

    // Each file yields one draft (legacy) or many (a `format: project` index).
    const perFile = await Promise.all(draftFiles.map((f) => this.draftsFor(f)));
    const drafts: { draft: Draft; dirty: boolean }[] = ([] as {
      draft: Draft;
      dirty: boolean;
    }[]).concat(...perFile);

    // Write discovered drafts to draft store
    const draftsToWrite = drafts.map((d) => d.draft);

    // Write dirty drafts back to their index files — once per index file, since
    // a project index's assets all share one file.
    const dirtyIndexes = new Set<string>();
    for (const d of drafts) {
      if (!d.dirty) continue;
      const indexPath = draftIndexPath(d.draft);
      if (dirtyIndexes.has(indexPath)) continue;
      dirtyIndexes.add(indexPath);
      await this.writeDraftFrontmatter(d.draft, draftsToWrite);
    }

    this.lastKnownDraftsByPath = cloneDeep(
      draftsToWrite.reduce((acc: Record<string, Draft>, d) => {
        acc[d.vaultPath] = d;
        return acc;
      }, {})
    );
    draftsStore.set(draftsToWrite);

    const message = `[PaperOut] Loaded and watching projects. Found ${draftFiles.length
      } drafts in ${(new Date().getTime() - start) / 1000.0}s.`;

    console.log(message);

    this.unsubscribeDraftsStore = draftsStore.subscribe(
      this.draftsStoreChanged.bind(this)
    );
  }

  async fileMetadataChanged(file: TFile, _data: string, cache: CachedMetadata) {
    if (this.isInitializing) return;
    if (this.pathsToIgnoreNextChange.delete(file.path)) {
      return;
    }

    // One index file yields one draft (legacy) or many (a project index); we
    // reconcile all drafts belonging to this index at once.
    const results = await this.draftsFor({ file, metadata: cache });
    const newDrafts = results.map((r) => r.draft);
    const current = get(draftsStore);
    const oldForIndex = current.filter(
      (d) => draftIndexPath(d) === file.path
    );

    if (newDrafts.length === 0) {
      if (oldForIndex.length > 0) {
        // this file's `longform` YAML was removed or became invalid
        draftsStore.update((drafts) =>
          drafts.filter((d) => draftIndexPath(d) !== file.path)
        );
      }
      return;
    }

    const byPath = (arr: Draft[]) =>
      [...arr].sort((a, b) => a.vaultPath.localeCompare(b.vaultPath));
    if (isEqual(byPath(oldForIndex), byPath(newDrafts))) {
      return;
    }

    for (const d of newDrafts) {
      this.lastKnownDraftsByPath[d.vaultPath] = d;
    }
    draftsStore.update((drafts) => {
      const others = drafts.filter((d) => draftIndexPath(d) !== file.path);
      return [...others, ...newDrafts];
    });
  }

  async fileCreated(file: TFile) {
    if (this.isInitializing) return;
    const drafts = get(draftsStore);

    // check if a new scene has been moved into this folder
    const scenePath = file.parent.path;
    const memberOfDraft = drafts.find((d) => {
      if (d.format !== "scenes") {
        return false;
      }
      const parentPath = draftIndexFolder(d);
      const targetPath = normalizePath(`${parentPath}/${d.sceneFolder}`);
      return (
        // file is in the scene folder
        targetPath === scenePath &&
        // file isn't already a scene
        !d.scenes.map((s) => s.title).contains(file.basename)
      );
    });
    if (memberOfDraft) {
      draftsStore.update((allDrafts) => {
        return allDrafts.map((d) => {
          if (
            d.vaultPath === memberOfDraft.vaultPath &&
            d.format === "scenes" &&
            !d.unknownFiles.contains(file.basename)
          ) {
            d.unknownFiles.push(file.basename);
          }
          return d;
        });
      });
    }
  }

  async fileDeleted(file: TFile) {
    if (this.isInitializing) return;
    const drafts = get(draftsStore);
    // index file deletion = delete every draft backed by that index (all the
    // assets of a project index, or the single legacy draft).
    const removedPaths = new Set(
      drafts.filter((d) => draftIndexPath(d) === file.path).map((d) => d.vaultPath)
    );
    if (removedPaths.size > 0) {
      const newDrafts = drafts.filter((d) => !removedPaths.has(d.vaultPath));
      draftsStore.set(newDrafts);
      if (removedPaths.has(get(selectedDraftVaultPath))) {
        selectedDraftVaultPath.set(
          newDrafts.length > 0 ? newDrafts[0].vaultPath : null
        );
      }
    } else {
      // scene deletion = remove scene from draft
      const found = findScene(file.path, drafts);
      if (found) {
        draftsStore.update((_drafts) => {
          return _drafts.map((d) => {
            if (
              d.vaultPath === found.draft.vaultPath &&
              d.format === "scenes"
            ) {
              d.scenes.splice(found.index, 1);
            }
            return d;
          });
        });
      } else {
        // check unknown files, delete from there if present
        const inDraftUnknown = drafts.find(
          (d) => d.format === "scenes" && d.unknownFiles.contains(file.basename)
        );
        if (inDraftUnknown) {
          draftsStore.update((allDrafts) => {
            return allDrafts.map((d) => {
              if (
                d.vaultPath === inDraftUnknown.vaultPath &&
                d.format === "scenes"
              ) {
                d.unknownFiles = d.unknownFiles.filter(
                  (f) => f !== file.basename
                );
              }
              return d;
            });
          });
        }
      }
    }
  }

  async fileRenamed(file: TFile, oldPath: string) {
    if (this.isInitializing) return;
    const drafts = get(draftsStore);
    const indexDrafts = drafts.filter((d) => draftIndexPath(d) === oldPath);
    if (indexDrafts.length > 0) {
      // index file renamed/moved — rekey every draft it backs. For a project
      // index that means rebuilding each asset's synthetic vaultPath and
      // rebasing single-asset body paths so they follow the index folder.
      const oldFolder = draftParentFolder(oldPath);
      const newFolder = draftParentFolder(file.path);
      const selected = get(selectedDraftVaultPath);
      let newSelected = selected;
      draftsStore.update((_drafts) => {
        return _drafts.map((d) => {
          if (draftIndexPath(d) !== oldPath) return d;
          const oldVaultPath = d.vaultPath;
          if (d.indexPath) {
            // asset of a project index
            const updated: Draft = {
              ...d,
              indexPath: file.path,
              vaultPath: syntheticAssetPath(file.path, d.assetId ?? ""),
            };
            if (updated.format === "single" && updated.bodyPath) {
              updated.bodyPath = rebasePath(
                updated.bodyPath,
                oldFolder,
                newFolder
              );
            }
            if (selected === oldVaultPath) newSelected = updated.vaultPath;
            return updated;
          }
          // legacy single-file index
          const updated: Draft = { ...d, vaultPath: file.path };
          if (!updated.titleInFrontmatter) {
            updated.title = fileNameFromPath(file.path);
          }
          if (selected === oldVaultPath) newSelected = file.path;
          return updated;
        });
      });
      if (newSelected !== selected) {
        selectedDraftVaultPath.set(newSelected);
      }
    } else {
      // scene renamed
      const newTitle = fileNameFromPath(file.path);
      const foundOld = findScene(oldPath, drafts);

      // possibilities here:
      // 1. note was renamed in-place: rename the scene in the associated draft
      // 2. note was moved out of a draft: remove it from the old draft
      // 3. note was moved into a draft: add it to the new draft
      // (2) and (3) can occur for the same note.

      // in-place
      const oldParent = oldPath.split("/").slice(0, -1).join("/");
      if (foundOld && oldParent === file.parent.path) {
        draftsStore.update((_drafts) => {
          return _drafts.map((d) => {
            if (
              d.vaultPath === foundOld.draft.vaultPath &&
              d.format === "scenes"
            ) {
              d.scenes[foundOld.index].title = newTitle;
            }
            return d;
          });
        });
      } else {
        //in and/or out

        // moved out of a draft
        const oldDraft = drafts.find((d) => {
          return (
            d.format === "scenes" &&
            sceneFolderPath(d, this.vault) === oldParent
          );
        });
        if (oldDraft) {
          draftsStore.update((_drafts) => {
            return _drafts.map((d) => {
              if (d.vaultPath === oldDraft.vaultPath && d.format === "scenes") {
                d.scenes = d.scenes.filter((s) => s.title !== file.basename);
                d.unknownFiles = d.unknownFiles.filter(
                  (f) => f !== file.basename
                );
              }
              return d;
            });
          });
        }

        // moved into a draft
        const newDraft = drafts.find((d) => {
          return (
            d.format === "scenes" &&
            sceneFolderPath(d, this.vault) === file.parent.path
          );
        });
        if (newDraft) {
          draftsStore.update((_drafts) => {
            return _drafts.map((d) => {
              if (d.vaultPath === newDraft.vaultPath && d.format === "scenes") {
                d.unknownFiles.push(file.basename);
              }
              return d;
            });
          });
        }
      }
    }
  }

  async draftsStoreChanged(newValue: Draft[]) {
    // Write each backing index file at most once per flush: a project index's
    // assets share one file, so N changed assets must not trigger N rewrites
    // (and N re-parses). We ignore the next change on the *index* path, which is
    // the file actually written — never the synthetic per-asset vaultPath.
    const writtenIndexes = new Set<string>();
    for (const draft of newValue) {
      const old = this.lastKnownDraftsByPath[draft.vaultPath];
      if (!old || !isEqual(draft, old)) {
        const indexPath = draftIndexPath(draft);
        if (writtenIndexes.has(indexPath)) continue;
        writtenIndexes.add(indexPath);
        this.pathsToIgnoreNextChange.add(indexPath);
        await this.writeDraftFrontmatter(draft, newValue);
      }
    }

    this.lastKnownDraftsByPath = cloneDeep(
      newValue.reduce((acc: Record<string, Draft>, d) => {
        acc[d.vaultPath] = d;
        return acc;
      }, {})
    );
  }

  // Expand an index file into its draft(s): one for a legacy scenes/single
  // index, several for a `format: project` index. Each scenes draft is
  // reconciled against its real scene folder; a scenes draft is "dirty" when the
  // frontmatter lists scenes that no longer exist on disk and must be rewritten.
  private async draftsFor(
    fileWithMetadata: FileWithMetadata
  ): Promise<{ draft: Draft; dirty: boolean }[]> {
    if (!fileWithMetadata.metadata.frontmatter) return [];
    const longformEntry = fileWithMetadata.metadata.frontmatter["longform"];
    if (!longformEntry) return [];

    const indexPath = fileWithMetadata.file.path;
    const fallbackTitle = fileNameFromPath(indexPath);

    let baseDrafts = expandProjectIndex(longformEntry, indexPath, fallbackTitle);
    if (baseDrafts.length === 0) {
      console.log(
        `[PaperOut] Error loading draft at ${indexPath}: invalid longform.format. Ignoring.`
      );
      return [];
    }

    // Metadata-cache quirk: it sometimes reports a scenes YAML array as empty.
    // If any scenes draft came back empty, re-read the frontmatter directly and
    // re-expand (covers legacy `scenes` and every asset of a project index).
    // discord: https://discord.com/channels/686053708261228577/840286264964022302/994589562082951219
    const anyEmptyScenes = baseDrafts.some(
      (d) => d.format === "scenes" && d.scenes.length === 0
    );
    if (anyEmptyScenes) {
      let fm: any = null;
      try {
        await this.app.fileManager.processFrontMatter(
          fileWithMetadata.file,
          (_fm) => {
            fm = _fm;
          }
        );
      } catch (error) {
        console.error("[PaperOut] error manually loading frontmatter:", error);
      }
      if (fm && fm["longform"]) {
        baseDrafts = expandProjectIndex(
          fm["longform"],
          indexPath,
          fallbackTitle
        );
      }
    }

    const results: { draft: Draft; dirty: boolean }[] = [];
    for (const base of baseDrafts) {
      if (base.format === "scenes") {
        results.push(await this.reconcileScenesDraft(base, indexPath));
      } else {
        results.push({ draft: base, dirty: false });
      }
    }
    return results;
  }

  // Reconcile a scenes draft's frontmatter scene list against the files that
  // actually exist in its scene folder: drop removed scenes (marking the draft
  // dirty so it is rewritten) and collect not-yet-tracked `.md` files as unknown.
  private async reconcileScenesDraft(
    base: MultipleSceneDraft,
    indexPath: string
  ): Promise<{ draft: MultipleSceneDraft; dirty: boolean }> {
    const indexFolder = draftParentFolder(indexPath);
    const normalizedSceneFolder = normalizePath(
      `${indexFolder}/${base.sceneFolder}`
    );

    let filenamesInSceneFolder: string[] = [];
    if (await this.vault.adapter.exists(normalizedSceneFolder)) {
      filenamesInSceneFolder = (
        await this.vault.adapter.list(normalizedSceneFolder)
      ).files
        .filter((f) => f !== indexPath && f.endsWith(".md"))
        .map((f) => this.vault.getAbstractFileByPath(f)?.name.slice(0, -3))
        .filter(
          (maybeName) => maybeName !== null && maybeName !== undefined
        ) as string[];
    }

    const knownScenes = base.scenes.filter(({ title }) =>
      filenamesInSceneFolder.contains(title)
    );
    const dirty = knownScenes.length !== base.scenes.length;

    const sceneTitles = new Set(base.scenes.map((s) => s.title));
    const newScenes = filenamesInSceneFolder.filter((s) => !sceneTitles.has(s));
    const ignoredRegexes = (base.ignoredFiles ?? [])
      .filter((n) => n)
      .map((p) => ignoredPatternToRegex(p));
    const unknownFiles = newScenes.filter(
      (s) => ignoredRegexes.find((r) => r.test(s)) === undefined
    );

    return {
      draft: { ...base, scenes: knownScenes, unknownFiles },
      dirty,
    };
  }

  // Write a draft's frontmatter back to its index file. For a project asset this
  // writes the WHOLE `longform.assets` array (all siblings) once; for a legacy
  // draft it writes that draft's own `longform` entry. `allDrafts` supplies the
  // sibling set (the live store, or the freshly-discovered list during startup).
  private async writeDraftFrontmatter(
    draft: Draft,
    allDrafts: Draft[] = get(draftsStore)
  ) {
    const indexPath = draftIndexPath(draft);
    const file = this.app.vault.getAbstractFileByPath(indexPath);
    if (!file || !(file instanceof TFile)) {
      return;
    }

    let scenesToNumber: MultipleSceneDraft[] = [];
    if (draft.indexPath) {
      const siblings = allDrafts.filter((d) => draftIndexPath(d) === indexPath);
      const assets = siblings.length > 0 ? siblings : [draft];
      const title = assets[0].title;
      await this.app.fileManager.processFrontMatter(file, (fm) => {
        setProjectAssetsOnFrontmatterObject(fm, title, assets);
      });
      scenesToNumber = assets.filter(
        (d): d is MultipleSceneDraft => d.format === "scenes"
      );
    } else {
      await this.app.fileManager.processFrontMatter(file, (fm) => {
        setDraftOnFrontmatterObject(fm, draft);
      });
      if (draft.format === "scenes") scenesToNumber = [draft];
    }

    // for multi-scene projects, optionally set a property on each scene that
    // holds its order within the project
    if (get(pluginSettings).writeProperty) {
      for (const multiDraft of scenesToNumber) {
        await this.writeSceneNumbersFor(multiDraft);
      }
    }
  }

  private async writeSceneNumbersFor(multiDraft: MultipleSceneDraft) {
    const writes: Promise<void>[] = [];
    const sceneNumbers = numberScenes(
      scenesForCompileNumbering(this.app, multiDraft)
    );
    const includedTitles = new Set(sceneNumbers.map((s) => s.title));
    sceneNumbers.forEach((numberedScene, index) => {
      const sceneFilePath = scenePath(
        numberedScene.title,
        multiDraft,
        this.app.vault
      );
      const sceneFile = this.app.vault.getAbstractFileByPath(sceneFilePath);
      // false if a folder, or not found
      if (!(sceneFile instanceof TFile)) {
        return;
      }
      writes.push(
        writeSceneNumbers(this.app, sceneFile, index, numberedScene.numbering)
      );
    });

    for (const scene of multiDraft.scenes) {
      if (includedTitles.has(scene.title)) {
        continue;
      }
      const sceneFilePath = scenePath(scene.title, multiDraft, this.app.vault);
      const sceneFile = this.app.vault.getAbstractFileByPath(sceneFilePath);
      if (!(sceneFile instanceof TFile)) {
        continue;
      }
      writes.push(clearSceneNumbers(this.app, sceneFile));
    }

    await Promise.all(writes);
  }
}

export function syncSceneIndices(app: App): void | Promise<void[]> {
  const writes: Promise<void>[] = [];
  get(draftsStore).forEach((draft) => {
    if (draft.format !== "scenes") return;
    const multiDraft = draft as MultipleSceneDraft;
    const sceneNumbers = numberScenes(
      scenesForCompileNumbering(app, multiDraft)
    );
    const includedTitles = new Set(sceneNumbers.map((s) => s.title));
    sceneNumbers.forEach((numberedScene, index) => {
      const sceneFilePath = scenePath(numberedScene.title, multiDraft, app.vault);

      const sceneFile = app.vault.getAbstractFileByPath(sceneFilePath);
      if (!(sceneFile instanceof TFile)) {
        return;
      }
      writes.push(
        writeSceneNumbers(app, sceneFile, index, numberedScene.numbering)
      );
    });
    for (const scene of multiDraft.scenes) {
      if (includedTitles.has(scene.title)) {
        continue;
      }
      const sceneFilePath = scenePath(scene.title, multiDraft, app.vault);
      const sceneFile = app.vault.getAbstractFileByPath(sceneFilePath);
      if (!(sceneFile instanceof TFile)) {
        continue;
      }
      writes.push(clearSceneNumbers(app, sceneFile));
    }
  });
  if (writes.length === 0) return;
  return Promise.all(writes);
}

function clearSceneNumbers(app: App, file: TFile): Promise<void> {
  return app.fileManager.processFrontMatter(file, (fm) => {
    delete fm["longform-order"];
    delete fm["longform-number"];
  });
}

function writeSceneNumbers(
  app: App,
  file: TFile,
  index: number,
  numbering: number[]
) {
  return app.fileManager.processFrontMatter(file, (fm) => {
    fm["longform-order"] = index;
    fm["longform-number"] = formatSceneNumber(numbering);
  });
}

/** Move a path from under `oldFolder` to under `newFolder`, if it lies within. */
function rebasePath(
  path: string,
  oldFolder: string,
  newFolder: string
): string {
  if (oldFolder === newFolder) return path;
  if (oldFolder && path.startsWith(`${oldFolder}/`)) {
    const rest = path.slice(oldFolder.length + 1);
    return newFolder ? `${newFolder}/${rest}` : rest;
  }
  if (!oldFolder) {
    // index was at the vault root
    return newFolder ? `${newFolder}/${path}` : path;
  }
  return path;
}

const ESCAPED_CHARACTERS = new Set("/&$^+.()=!|[]{},".split(""));
function ignoredPatternToRegex(pattern: string): RegExp {
  let regex = "";

  for (let index = 0; index < pattern.length; index++) {
    const c = pattern[index];

    if (ESCAPED_CHARACTERS.has(c)) {
      regex += "\\" + c;
    } else if (c === "*") {
      regex += ".*";
    } else if (c === "?") {
      regex += ".";
    } else {
      regex += c;
    }
  }

  return new RegExp(`^${regex}$`);
}
