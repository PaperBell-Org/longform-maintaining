import { exportTargetForDefaults } from "src/compile/steps/pandoc-export-utils";

/**
 * A downloaded preset, with the file extension it exports to. Knowing the
 * extension is what lets the compile UI label a preset `paperbell — PDF` and
 * name the format a preset imposes on the Format option — until now the only way
 * to learn that a preset produces Word was to open its yaml.
 */
export interface PandocTemplateChoice {
  /** Basename of the preset file, without `.yaml`. The value written to the step. */
  name: string;
  /** Extension the preset exports to, e.g. `".pdf"`. Empty when it couldn't be read. */
  ext: string;
}

/**
 * Pair each preset name with the extension it exports to, given a `readPreset`
 * that yields one preset's *parsed* yaml.
 *
 * Reading is best-effort, exactly as the export step's own preflight is (see
 * `pandoc-export.ts`, "assuming PDF output"): a preset that cannot be read or
 * parsed loses its format label and nothing else — it stays in the list and
 * stays selectable, because the export may well succeed where our peek failed.
 *
 * The reader is injected because the real one needs `fs` and Obsidian's
 * `parseYaml`, neither of which loads under vitest; this half is the half worth
 * testing. See `pandoc-templates.ts` for the wiring.
 */
export function pandocTemplateChoices(
  names: string[],
  readPreset: (name: string) => unknown
): PandocTemplateChoice[] {
  return names.map((name) => ({ name, ext: presetExtension(name, readPreset) }));
}

function presetExtension(
  name: string,
  readPreset: (name: string) => unknown
): string {
  try {
    return exportTargetForDefaults(readPreset(name)).ext;
  } catch (e) {
    console.warn(`[Pandoc Export] Could not read the preset ${name}.yaml.`, e);
    return "";
  }
}

/** `paperbell` + `.pdf` → `paperbell — PDF`; an unread preset keeps its bare name. */
export function templateLabel(template: PandocTemplateChoice): string {
  const ext = formatName(template.ext);
  return ext ? `${template.name} — ${ext}` : template.name;
}

/** `.pdf` → `PDF`, for prose and labels. `""` when the extension is unknown. */
export function formatName(ext: string): string {
  return ext.replace(/^\./, "").toUpperCase();
}

/**
 * The same format as a parenthetical aside — `" (PDF)"`, or `""` when we could
 * not read it. It carries its own leading space so a sentence can end with
 * `…output format{format}.` and read correctly either way.
 */
export function formatAside(ext: string): string {
  const name = formatName(ext);
  return name ? ` (${name})` : "";
}
