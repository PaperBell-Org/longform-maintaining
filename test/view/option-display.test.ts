import { describe, it, expect } from "vitest";
import {
  CompileStepOptionType,
  type CompileStepOption,
} from "src/compile/steps/abstract-compile-step";
import {
  dropdownChoices,
  optionDescription,
  optionIsInert,
  templateLabel,
} from "src/view/compile/option-display";

/** The real Run Pandoc Export `format` option, trimmed to the fields these read. */
const FORMAT: CompileStepOption = {
  id: "format",
  name: "Format (no preset)",
  description: "Export without any preset.",
  type: CompileStepOptionType.Dropdown,
  choices: ["pdf", "docx", "html"],
  emptyLabel: "(require a preset)",
  default: "",
  disabledBy: "template",
  disabledDescription: 'Ignored — the preset "{value}" decides the format.',
};

const TEMPLATE: CompileStepOption = {
  id: "template",
  name: "Template / preset",
  description: "Which downloaded preset to export with.",
  type: CompileStepOptionType.Dropdown,
  dynamicChoices: "pandoc-templates",
  default: "",
};

describe("optionIsInert", () => {
  it("is inert exactly while the overriding option holds a value", () => {
    expect(optionIsInert(FORMAT, { template: "paperbell" })).toBe(true);
    expect(optionIsInert(FORMAT, { template: "" })).toBe(false);
    expect(optionIsInert(FORMAT, {})).toBe(false);
  });

  it("ignores a whitespace-only value, as the step's own resolver does", () => {
    expect(optionIsInert(FORMAT, { template: "   " })).toBe(false);
  });

  it("leaves an option that declares no override alone", () => {
    expect(optionIsInert(TEMPLATE, { template: "paperbell" })).toBe(false);
  });
});

describe("optionDescription", () => {
  it("swaps in the disabled text, naming the preset that won", () => {
    expect(optionDescription(FORMAT, { template: "paperbell" })).toBe(
      'Ignored — the preset "paperbell" decides the format.'
    );
  });

  it("keeps its own description while nothing overrides it", () => {
    expect(optionDescription(FORMAT, { template: "" })).toBe(
      FORMAT.description
    );
  });

  it("falls back to its own description when no disabled text was given", () => {
    const option: CompileStepOption = {
      ...FORMAT,
      disabledDescription: undefined,
    };
    expect(optionDescription(option, { template: "paperbell" })).toBe(
      FORMAT.description
    );
  });
});

describe("dropdownChoices", () => {
  it("labels each downloaded preset with the format it exports to", () => {
    expect(
      dropdownChoices(TEMPLATE, [
        { name: "paperbell", ext: ".pdf" },
        { name: "manuscript-obsidian", ext: ".docx" },
      ])
    ).toEqual([
      { value: "paperbell", label: "paperbell — PDF" },
      { value: "manuscript-obsidian", label: "manuscript-obsidian — DOCX" },
    ]);
  });

  it("keeps a preset whose yaml could not be read selectable, unlabelled", () => {
    expect(dropdownChoices(TEMPLATE, [{ name: "broken", ext: "" }])).toEqual([
      { value: "broken", label: "broken" },
    ]);
  });

  it("passes static choices through as their own labels", () => {
    expect(dropdownChoices(FORMAT, [{ name: "paperbell", ext: ".pdf" }])).toEqual([
      { value: "pdf", label: "pdf" },
      { value: "docx", label: "docx" },
      { value: "html", label: "html" },
    ]);
  });

  it("yields nothing for a dropdown with neither source", () => {
    expect(dropdownChoices({ ...FORMAT, choices: undefined }, [])).toEqual([]);
  });
});

describe("templateLabel", () => {
  it("upper-cases the extension and drops its dot", () => {
    expect(templateLabel({ name: "beamer", ext: ".pdf" })).toBe("beamer — PDF");
  });
});
