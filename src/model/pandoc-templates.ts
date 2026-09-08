import { App, FileSystemAdapter, parseYaml } from "obsidian";
import { get } from "svelte/store";
import * as fs from "fs";
import * as path from "path";

import { pandocTemplates, pluginSettings } from "./stores";
import {
  currentPlatformEnv,
  DEFAULT_ASSETS_DIR,
  exportTargetForDefaults,
  resolveUserPath,
} from "src/compile/steps/pandoc-export-utils";

/**
 * A downloaded preset, with the file extension it exports to. Knowing the
 * extension is what lets the compile UI label a preset `paperbell — PDF` — until
 * now the only way to learn that a preset produces Word was to open its yaml.
 */
export interface PandocTemplateChoice {
  /** Basename of the preset file, without `.yaml`. The value written to the step. */
  name: string;
  /** Extension the preset exports to, e.g. `".pdf"`. Empty when it couldn't be read. */
  ext: string;
}

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
 * Reading each preset is best-effort, exactly as the export step's own preflight
 * is (see `pandoc-export.ts`, "assuming PDF output"): one unreadable or malformed
 * yaml costs that entry its format label, never the whole list.
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

  let names: string[];
  try {
    names = fs
      .readdirSync(defaultsDir)
      .filter((f) => f.endsWith(".yaml"))
      .map((f) => f.slice(0, -".yaml".length))
      .filter((name) => !EXCLUDED.has(name))
      .sort();
  } catch {
    return [];
  }

  return names.map((name) => ({
    name,
    ext: presetExtension(path.join(defaultsDir, name + ".yaml")),
  }));
}

/** The extension one preset exports to, or `""` when it can't be determined. */
function presetExtension(file: string): string {
  try {
    return exportTargetForDefaults(parseYaml(fs.readFileSync(file, "utf8"))).ext;
  } catch (e) {
    console.warn(`[Pandoc Export] Could not read preset ${file}.`, e);
    return "";
  }
}

/** Refresh the `pandocTemplates` store from the current assets folder. */
export function refreshPandocTemplates(app: App): void {
  pandocTemplates.set(listPandocTemplates(app));
}
