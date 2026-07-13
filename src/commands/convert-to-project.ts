import { get } from "svelte/store";
import { Notice, TFile, type App } from "obsidian";

import type { CommandBuilder } from "./types";
import { translate } from "src/i18n";
import { projects, selectedDraftVaultPath } from "src/model/stores";
import { JumpModal } from "./helpers";
import { projectRootPath } from "src/model/project-resources";
import { syntheticAssetPath, assetIdFor } from "src/model/project-index";
import type { Draft } from "src/model/types";
import {
  buildProjectIndexFromDrafts,
  type ProjectIndexPlan,
} from "./convert-to-project-utils";

/** Create the new single index note, writing its `longform` frontmatter. */
async function writeProjectIndex(
  app: App,
  plan: ProjectIndexPlan
): Promise<void> {
  const exists = await app.vault.adapter.exists(plan.indexPath);
  if (!exists) {
    await app.vault.create(plan.indexPath, "");
  }
  const file = app.vault.getAbstractFileByPath(plan.indexPath);
  if (!(file instanceof TFile)) return;
  await app.fileManager.processFrontMatter(file, (fm) => {
    fm["longform"] = plan.indexEntry;
  });
}

/**
 * Non-destructively retire a legacy index file: strip only its `longform`
 * entry so it is no longer discovered as its own project. The note and any
 * other frontmatter (e.g. a cover letter's to/date/manuscript) are preserved.
 */
async function stripLongform(app: App, path: string): Promise<void> {
  const file = app.vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) return;
  await app.fileManager.processFrontMatter(file, (fm) => {
    delete fm["longform"];
  });
}

async function convertProject(
  app: App,
  title: string,
  projectDrafts: Draft[]
): Promise<void> {
  if (projectDrafts.every((d) => d.indexPath)) {
    new Notice(`“${title}” already uses a single index.`);
    return;
  }

  const projectRoot = projectRootPath(projectDrafts);
  const plan = buildProjectIndexFromDrafts(projectDrafts, projectRoot, title);

  // Guard against overwriting an existing note at the target index path.
  if (await app.vault.adapter.exists(plan.indexPath)) {
    new Notice(
      `Cannot convert “${title}”: ${plan.indexPath} already exists. ` +
        `Rename or move it and try again.`
    );
    return;
  }

  try {
    // Create the new index first so the project is never left without one; then
    // retire the old index files.
    await writeProjectIndex(app, plan);
    for (const p of plan.stripPaths) {
      await stripLongform(app, p);
    }
  } catch (error) {
    console.error("[PaperOut] convert-to-project failed:", error);
    new Notice(`Failed to convert “${title}”. See console for details.`);
    return;
  }

  // Select the first asset of the new project.
  const firstAsset = plan.indexEntry.assets[0];
  if (firstAsset) {
    selectedDraftVaultPath.set(
      syntheticAssetPath(plan.indexPath, assetIdFor(firstAsset))
    );
  }

  new Notice(
    `Converted “${title}” into ${plan.indexPath}. ` +
      `${plan.stripPaths.length} old index file(s) kept but detached.`
  );
}

export const convertToProject: CommandBuilder = (plugin) => ({
  id: "longform-convert-to-project",
  name: translate("cmd.convertToProject"),
  checkCallback: (checking: boolean) => {
    const allProjects = get(projects);
    // Only offer projects that still have at least one legacy (non-asset) draft.
    const convertible = Object.keys(allProjects).filter((title) =>
      allProjects[title].some((d) => !d.indexPath)
    );
    if (checking) {
      return convertible.length > 0;
    }

    const opts = new Map(convertible.map((t) => [t, t]));
    new JumpModal(
      plugin.app,
      opts,
      [
        { command: "↑↓", purpose: "to navigate" },
        { command: "↵", purpose: "to convert" },
        { command: "esc", purpose: "to dismiss" },
      ],
      (title: string) => {
        const projectDrafts = allProjects[title];
        if (!projectDrafts || projectDrafts.length === 0) return;
        convertProject(plugin.app, title, projectDrafts);
      }
    ).open();
  },
});
