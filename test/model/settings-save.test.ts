import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  settingsNeedSave,
  type LongformPluginSettings,
} from "src/model/types";

/**
 * Every setting a user edits in the settings tab must be written to disk the
 * moment it changes — otherwise the edit silently vanishes on the next reload
 * unless some *other* setting happened to change in the same session.
 */
describe("settingsNeedSave", () => {
  const prev = DEFAULT_SETTINGS;
  const changed = (patch: Partial<LongformPluginSettings>) =>
    settingsNeedSave(prev, { ...prev, ...patch });

  it("does not save the first value the store emits (the load itself)", () => {
    expect(settingsNeedSave(null, prev)).toBe(false);
  });

  it("does not save when nothing changed", () => {
    expect(settingsNeedSave(prev, { ...prev })).toBe(false);
  });

  it("saves a change to the Pandoc binary", () => {
    expect(changed({ pandocBinary: "/opt/bin/pandoc" })).toBe(true);
  });

  it("saves a change to the extra binary folders", () => {
    expect(changed({ pandocExtraBinFolders: "C:\\Tools\\pandoc" })).toBe(true);
  });

  it("saves a change to the global bibliography", () => {
    expect(changed({ pandocGlobalBibliography: "Library/global.bib" })).toBe(
      true
    );
  });

  it("saves turning OS font adaptation off", () => {
    expect(changed({ pandocAdaptFontsToOS: false })).toBe(true);
  });
});
