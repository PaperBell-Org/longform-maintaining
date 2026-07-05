import { App, FileSystemAdapter } from "obsidian";
import { get } from "svelte/store";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { pandocTemplates, pluginSettings } from "./stores";
import {
  DEFAULT_ASSETS_DIR,
  resolveUserPath,
} from "src/compile/steps/pandoc-export-utils";

/**
 * Preset basenames that aren't user-selectable manuscript templates: `crossref`
 * is an include fragment, `undefined` is the no-template fallback.
 */
const EXCLUDED = new Set(["crossref", "undefined"]);

/**
 * List the downloaded Pandoc presets — the basenames (without `.yaml`) of the
 * files in `<assets>/defaults/`. Desktop only (needs Node fs to read outside the
 * vault); returns `[]` on mobile or if the folder can't be read.
 */
export function listPandocTemplates(app: App): string[] {
  const adapter = app.vault.adapter;
  if (!(adapter instanceof FileSystemAdapter)) return [];

  const settings = get(pluginSettings);
  const assetsSetting =
    (settings?.pandocAssetsFolder ?? "").trim() || DEFAULT_ASSETS_DIR;
  const defaultsDir = path.join(
    resolveUserPath(assetsSetting, adapter.getBasePath(), os.homedir()),
    "defaults"
  );

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
