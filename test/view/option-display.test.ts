import { describe, it, expect } from "vitest";
import {
  CompileStepOptionType,
  type CompileStepOption,
} from "src/compile/steps/abstract-compile-step";
import {
  dropdownChoices,
  optionDescription,
  optionIsInert,
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
  disabledDescription:
    'Ignored — the preset "{value}" decides the output format{format}.',
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
      'Ignored — the preset "paperbell" decides the output format.'
    );
  });

  it("names the format that preset produces, when the list knows it", () => {
    // The whole point of the disabled state: not just "you don't decide this",
    // but what was decided instead.
    expect(
      optionDescription(FORMAT, { template: "manuscript-obsidian" }, [
        { name: "paperbell", ext: ".pdf" },
        { name: "manuscript-obsidian", ext: ".docx" },
      ])
    ).toBe(
      'Ignored — the preset "manuscript-obsidian" decides the output format (DOCX).'
    );
  });

  it("omits the aside for a preset whose yaml could not be read", () => {
    expect(
      optionDescription(FORMAT, { template: "broken" }, [
        { name: "broken", ext: "" },
      ])
    ).toBe('Ignored — the preset "broken" decides the output format.');
  });

  it("keeps its own description while nothing overrides it", () => {
    expect(optionDescription(FORMAT, { template: "" })).toBe(
      FORMAT.description
    );
  });

  it("leaves an unknown placeholder standing rather than blanking it", () => {
    const option: CompileStepOption = {
      ...FORMAT,
      disabledDescription: "Set by {value}, see {nowhere}.",
    };
    expect(optionDescription(option, { template: "paperbell" })).toBe(
      "Set by paperbell, see {nowhere}."
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
