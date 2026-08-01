import { get } from "svelte/store";
import { Notice, TFile, type App, type TFolder } from "obsidian";

import type LongformPlugin from "src/main";
import type { CommandBuilder } from "./types";
import { translate } from "src/i18n";
import { drafts as draftsStore, projects, selectedProject } from "src/model/stores";
import type { Draft, ProjectAsset } from "src/model/types";
import { selectedDraftVaultPath } from "src/model/stores";
import {
  paperPart,
  primaryPathFor,
  scaffoldContext,
  writeScaffoldFiles,
  ScaffoldConflictError,
  type PaperPartId,
  type ScaffoldFile,
} from "src/model/scaffold";
import { showErrorModal } from "src/view/error-modal";
import { AddComponentsModal } from "src/view/project-lifecycle/add-components-modal";
import { JumpModal } from "./helpers";
import { joinPath } from "src/model/project-index";
import {
  planAddComponents,
  projectsUnderFolder,
  uniqueAssetId,
  usedAssetIds,
  type AddComponentsPlan,
} from "./add-components-utils";


/** Build the plan for a project, wiring the pure planner to the vault. */
function planFor(app: App, projectDrafts: Draft[]): AddComponentsPlan {
  const exists = (path: string): boolean =>
    app.vault.getAbstractFileByPath(path) !== null;
  return planAddComponents(projectDrafts, {
    pathExists: exists,
    hasMetadata: (folder) => exists(joinPath(folder, "metadata.json")),
  });
}

/**
 * Open the "Add paper components…" flow for a project.
 *
 * `folder` scopes the project choice when invoked from a folder's context menu;
 * without it the pane's current project is used, falling back to a picker.
 */
export async function openAddComponents(
  plugin: LongformPlugin,
  folder?: TFolder
): Promise<void> {
  const allDrafts = get(draftsStore);
  const allProjects = get(projects);

  const titles = folder
    ? projectsUnderFolder(folder.path, allDrafts)
    : Object.keys(allProjects);

  if (titles.length === 0) {
    new Notice(translate("components.noProject"));
    return;
  }

  const open = (title: string): void => {
    const projectDrafts = allProjects[title] ?? [];
    const plan = planFor(plugin.app, projectDrafts);

    if (plan.form === "mixed") {
      new Notice(translate("components.mixedForm"), 10000);
      return;
    }
    if (plan.form === "empty") {
      new Notice(translate("components.noProject"));
      return;
    }
    if (plan.addable.length === 0) {
      new Notice(translate("components.allPresent", { title }));
      return;
    }
    new AddComponentsModal(plugin.app, title, plan, (selected) =>
      addComponents(plugin, title, plan, selected)
    ).open();
  };

  if (titles.length === 1) {
    open(titles[0]);
    return;
  }
  // Prefer the pane's selection when the command is run with several candidates.
  const current = get(selectedProject);
  const currentTitle = current?.[0]?.title;
  if (!folder && currentTitle && titles.includes(currentTitle)) {
    open(currentTitle);
    return;
  }
  const opts = new Map(titles.map((t) => [t, t]));
  new JumpModal(
    plugin.app,
    opts,
    [
      { command: "↑↓", purpose: "to navigate" },
      { command: "↵", purpose: "to choose project" },
      { command: "esc", purpose: "to dismiss" },
    ],
    (title: string) => open(title)
  ).open();
}

/** Create the selected parts in an existing project. */
async function addComponents(
  plugin: LongformPlugin,
  title: string,
  plan: AddComponentsPlan,
  selected: PaperPartId[]
): Promise<void> {
  if (selected.length === 0) return;
  const app = plugin.app;
  const form = plan.form === "project" ? "project" : "legacy";

  const acronym = await acronymOf(app, plan.anchor);
  const ctx = scaffoldContext({
    title,
    acronym,
    // Only the shared fields are used; the parts are built one by one below.
    parts: ["main"],
    examples: plan.examples,
  });
  // Cross-part references must see the project as it will be *after* this run.
  const present = new Set<PaperPartId>([...plan.present, ...selected]);
  const partCtx = { ...ctx, present };

  const files: ScaffoldFile[] = [];
  const assets: ProjectAsset[] = [];
  for (const id of selected) {
    const built = paperPart(id).build(partCtx, form);
    files.push(...built.files);
    if (built.asset) assets.push(built.asset);
  }

  try {
    await writeScaffoldFiles(app, plan.anchor, files);

    if (form === "project" && plan.indexPath && assets.length > 0) {
      const indexFile = app.vault.getAbstractFileByPath(plan.indexPath);
      if (!(indexFile instanceof TFile)) {
        throw new Error(`Could not locate the project index at ${plan.indexPath}.`);
      }
      // Append rather than rebuild: re-serializing the whole array from drafts
      // would drop any field the Draft model doesn't carry.
      await app.fileManager.processFrontMatter(indexFile, (fm) => {
        const longform = (fm["longform"] ??= {});
        const existing: ProjectAsset[] = longform["assets"] ?? [];
        const used = usedAssetIds(existing);
        for (const asset of assets) {
          const id = uniqueAssetId(asset.name, used);
          used.add(id);
          existing.push({ ...asset, id });
        }
        longform["assets"] = existing;
      });
    }

    if (form === "legacy") {
      // Select the first new draft so the pane lands on it. Project form has no
      // per-part index note to open, so it is left on the current selection.
      const target = primaryPathFor(selected);
      if (target) {
        selectedDraftVaultPath.set(joinPath(plan.anchor, target));
      }
    }

    new Notice(
      translate("components.added", {
        names: selected.map((id) => paperPart(id).draftTitle).join(", "),
      })
    );

    // Known gap: in project form the compile steps resolve metadata.json from
    // the index's own folder, so a Supplementary's nearer override is not seen.
    if (form === "project" && selected.includes("supplementary")) {
      new Notice(translate("components.siProjectFormWarning"), 12000);
    }
  } catch (error) {
    if (error instanceof ScaffoldConflictError) {
      showErrorModal(
        app,
        translate("components.conflictTitle"),
        `${translate("components.conflictBody")}\n\n${error.conflicts.join("\n")}`
      );
      return;
    }
    showErrorModal(app, translate("components.failed"), String(error));
  }
}

/**
 * The project's acronym, read from its metadata.json so a part added later
 * matches the one created with the project. Undefined when it can't be read —
 * `scaffoldContext` then derives one from the title, as it does at creation.
 */
async function acronymOf(app: App, anchor: string): Promise<string | undefined> {
  const path = joinPath(anchor, "metadata.json");
  const file = app.vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) return undefined;
  try {
    const parsed = JSON.parse(await app.vault.read(file));
    const acronym = parsed?._longform?.acronym;
    return typeof acronym === "string" && acronym.trim() ? acronym : undefined;
  } catch (e) {
    console.warn(`[PaperOut] Could not read the acronym from ${path}:`, e);
    return undefined;
  }
}

export const addComponentsCommand: CommandBuilder = (plugin) => ({
  id: "longform-add-components",
  name: translate("cmd.addComponents"),
  checkCallback: (checking: boolean) => {
    if (checking) {
      return Object.keys(get(projects)).length > 0;
    }
    void openAddComponents(plugin);
  },
});
