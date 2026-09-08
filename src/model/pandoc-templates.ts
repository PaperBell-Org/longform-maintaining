import { App, FileSystemAdapter, parseYaml } from "obsidian";
import { get } from "svelte/store";
import * as fs from "fs";
import * as path from "path";

import { pandocTemplates, pluginSettings } from "./stores";
import {
  currentPlatformEnv,
  DEFAULT_ASSETS_DIR,
  resolveUserPath,
} from "src/compile/steps/pandoc-export-utils";
import {
  pandocTemplateChoices,
  type PandocTemplateChoice,
} from "./pandoc-templates-utils";

/**
 * Preset basenames that aren't user-selectable manuscript templates: `crossref`
 * is an include fragment, `undefined` is the no-template fallback.
 */
const EXCLUDED = new Set(["crossref", "undefined"]);

/**
 * List the downloaded Pandoc presets — the files in `<assets>/defaults/`, by
 * basename, each paired with the extension it exports to. Desktop only (needs
 * Node fs to read outside the vault); returns `[]` on mobile or if the folder
 * can't be read.
 *
 * This is the Obsidian-bound half: locate the folder, read the files. The
 * pairing and its degradation live in `pandoc-templates-utils.ts`, where they
 * can be tested.
 */
export function listPandocTemplates(app: App): PandocTemplateChoice[] {
  const adapter = app.vault.adapter;
  if (!(adapter instanceof FileSystemAdapter)) return [];

  const settings = get(pluginSettings);
  const assetsSetting =
    (settings?.pandocAssetsFolder ?? "").trim() || DEFAULT_ASSETS_DIR;
  const defaultsDir = path.join(
    resolveUserPath(assetsSetting, adapter.getBasePath(), currentPlatformEnv()),
    "defaults"
  );

  return pandocTemplateChoices(presetNames(defaultsDir), (name) =>
    parseYaml(fs.readFileSync(path.join(defaultsDir, name + ".yaml"), "utf8"))
  );
}

/**
 * Just the preset names, for callers that have no use for the formats — reading
 * every yaml to throw the answer away would be silly on an error path.
 */
export function listPandocTemplateNames(app: App): string[] {
  return listPandocTemplates(app).map((t) => t.name);
}

function presetNames(defaultsDir: string): string[] {
  try {
    return fs
      .readdirSync(defaultsDir)
      .filter((f) => f.endsWith(".yaml"))
      .map((f) => f.slice(0, -".yaml".length))
      .filter((name) => !EXCLUDED.has(name))
      .sort();
  } catch {
    return [];
  }
}

/** Refresh the `pandocTemplates` store from the current assets folder. */
export function refreshPandocTemplates(app: App): void {
  pandocTemplates.set(listPandocTemplates(app));
}
