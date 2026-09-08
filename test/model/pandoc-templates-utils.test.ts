import { describe, expect, it, vi } from "vitest";
import {
  formatAside,
  formatName,
  pandocTemplateChoices,
  templateLabel,
} from "src/model/pandoc-templates-utils";

/**
 * The half of the preset listing that can be tested: pairing each name with the
 * format its yaml exports to, and what happens when a yaml won't read. The
 * mapping itself (`exportTargetForDefaults`) is covered against every shipped
 * preset shape in `test/compile/steps/pandoc-export.test.ts`; the fs + `parseYaml`
 * half stays in `pandoc-templates.ts`, which vitest cannot load.
 */
describe("pandocTemplateChoices", () => {
  /** Parsed yaml of the presets the asset repo actually ships. */
  const PRESETS: Record<string, unknown> = {
    paperbell: { "output-file": "output.pdf", "pdf-engine": "xelatex" },
    "manuscript-obsidian": { to: "docx" },
    cover_letter: { to: "latex", "pdf-engine": "xelatex" },
  };

  it("pairs every name with the extension its preset exports to", () => {
    expect(
      pandocTemplateChoices(Object.keys(PRESETS), (name) => PRESETS[name])
    ).toEqual([
      { name: "paperbell", ext: ".pdf" },
      { name: "manuscript-obsidian", ext: ".docx" },
      { name: "cover_letter", ext: ".pdf" },
    ]);
  });

  it("keeps an unreadable preset in the list, without a format", () => {
    // A yaml we cannot peek at may still export fine — dropping it from the
    // dropdown would take away a preset that works.
    const warn = vi.spyOn(console, "warn").mockImplementation((): void => undefined);
    const choices = pandocTemplateChoices(
      ["paperbell", "broken"],
      (name): unknown => {
        if (name === "broken") throw new Error("ENOENT");
        return PRESETS[name];
      }
    );

    expect(choices).toEqual([
      { name: "paperbell", ext: ".pdf" },
      { name: "broken", ext: "" },
    ]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("survives a preset that parses to nothing at all", () => {
    // An empty or comment-only yaml parses to null, which must not throw.
    expect(pandocTemplateChoices(["empty"], () => null)).toEqual([
      { name: "empty", ext: ".pdf" },
    ]);
  });

  it("has nothing to say about an empty assets folder", () => {
    expect(
      pandocTemplateChoices([], (): unknown => {
        throw new Error("should not be called");
      })
    ).toEqual([]);
  });
});

describe("templateLabel", () => {
  it("names the format beside the preset", () => {
    expect(templateLabel({ name: "beamer", ext: ".pdf" })).toBe("beamer — PDF");
  });

  it("leaves an unread preset its bare name", () => {
    expect(templateLabel({ name: "broken", ext: "" })).toBe("broken");
  });
});

describe("formatName / formatAside", () => {
  it("drops the dot and upper-cases", () => {
    expect(formatName(".docx")).toBe("DOCX");
    expect(formatAside(".docx")).toBe(" (DOCX)");
  });

  it("yields nothing at all for an unknown extension", () => {
    // So a sentence ending `…output format{format}.` still reads correctly.
    expect(formatName("")).toBe("");
    expect(formatAside("")).toBe("");
  });
});
