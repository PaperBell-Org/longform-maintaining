import { describe, expect, it } from "vitest";
import {
  extractSectionTitles,
  getYamlScalar,
  removeYamlBlock,
  setYamlScalar,
  splitFrontmatter,
  summarizeSections,
  SUPPLEMENTARY_PREAMBLE,
  transformToSupplementary,
} from "src/compile/steps/supplementary-info-utils";

const FM = [
  "---",
  'title: "A Study"',
  'date: "2026-07-01"',
  "authors:",
  '  - name: "Doe, Jane"',
  'abstract: "Original manuscript abstract."',
  "keywords:",
  '  - "alpha"',
  '  - "beta"',
  'target: "Journal X"',
  "---",
  "",
  "# Methods",
  "",
  "Some text.",
  "",
  "# Results",
  "",
  "More text.",
].join("\n");

describe("splitFrontmatter", () => {
  it("separates the YAML block from the body", () => {
    const { yaml, body } = splitFrontmatter(FM);
    expect(yaml).toContain('title: "A Study"');
    expect(yaml).not.toContain("---");
    expect(body.startsWith("# Methods")).toBe(true);
  });

  it("returns null yaml when there is no frontmatter", () => {
    const { yaml, body } = splitFrontmatter("# Just a body\n");
    expect(yaml).toBeNull();
    expect(body).toBe("# Just a body\n");
  });
});

describe("getYamlScalar", () => {
  it("reads and unquotes a scalar", () => {
    expect(getYamlScalar('title: "A \\"Q\\" B"', "title")).toBe('A "Q" B');
    expect(getYamlScalar('x: "y"', "missing")).toBeNull();
  });
});

describe("setYamlScalar", () => {
  it("replaces an existing key and collapses newlines", () => {
    const y = setYamlScalar('abstract: "old"', "abstract", "new\nline");
    expect(y).toBe('abstract: "new line"');
  });

  it("appends the key when absent", () => {
    expect(setYamlScalar('title: "t"', "abstract", "x")).toBe(
      'title: "t"\nabstract: "x"'
    );
  });
});

describe("removeYamlBlock", () => {
  it("drops a key and its indented children, keeping the next key", () => {
    const y = ["keywords:", '  - "a"', '  - "b"', 'target: "J"'].join("\n");
    expect(removeYamlBlock(y, "keywords")).toBe('target: "J"');
  });

  it("is a no-op when the key is absent", () => {
    expect(removeYamlBlock('title: "t"', "keywords")).toBe('title: "t"');
  });
});

describe("extractSectionTitles", () => {
  it("returns the shallowest-level headings", () => {
    expect(extractSectionTitles("# A\n\n## sub\n\n# B")).toEqual(["A", "B"]);
    expect(extractSectionTitles("## X\n\n## Y")).toEqual(["X", "Y"]);
  });

  it("ignores headings inside fenced code blocks", () => {
    const body = "# Real\n\n```\n# not a heading\n```\n\n# Also Real";
    expect(extractSectionTitles(body)).toEqual(["Real", "Also Real"]);
  });

  it("returns [] when there are no headings", () => {
    expect(extractSectionTitles("just prose")).toEqual([]);
  });
});

describe("summarizeSections", () => {
  it("lists the sections", () => {
    expect(summarizeSections(["Methods", "Results"])).toBe(
      "This document provides supplementary information for the main manuscript, comprising: Methods; Results."
    );
  });

  it("degrades gracefully with no sections", () => {
    expect(summarizeSections([])).toBe(
      "This document provides supplementary information for the main manuscript."
    );
  });
});

describe("transformToSupplementary", () => {
  it("retitles, drops keywords, auto-summarizes, and prepends S-numbering", () => {
    const out = transformToSupplementary(FM);
    expect(out).toContain(
      'title: "Supplementary Information for \\"A Study\\""'
    );
    expect(out).not.toContain("keywords:");
    expect(out).not.toContain('"alpha"');
    expect(out).toContain(
      'abstract: "This document provides supplementary information for the main manuscript, comprising: Methods; Results."'
    );
    // S-numbering block sits at the top of the body, right after the frontmatter.
    expect(out).toContain(SUPPLEMENTARY_PREAMBLE);
    expect(out).toMatch(/---\n\n```\{=latex\}/);
    expect(out.indexOf(SUPPLEMENTARY_PREAMBLE)).toBeLessThan(
      out.indexOf("# Methods")
    );
    // Original abstract is gone.
    expect(out).not.toContain("Original manuscript abstract.");
  });

  it("honors a manual abstract over the auto-summary", () => {
    const out = transformToSupplementary(FM, { abstract: "  My SI note.  " });
    expect(out).toContain('abstract: "My SI note."');
    expect(out).not.toContain("comprising:");
  });

  it("leaves the abstract empty when summarization is disabled and none given", () => {
    const out = transformToSupplementary(FM, { summarizeSections: false });
    expect(out).toContain('abstract: ""');
    expect(out).not.toContain("comprising:");
  });

  it("still adds S-numbering when there is no frontmatter", () => {
    const out = transformToSupplementary("# SI Body\n\ntext");
    expect(out).toBe(`${SUPPLEMENTARY_PREAMBLE}\n\n# SI Body\n\ntext`);
  });

  it("produces frontmatter that round-trips through splitFrontmatter", () => {
    const out = transformToSupplementary(FM);
    const { yaml } = splitFrontmatter(out);
    expect(getYamlScalar(yaml as string, "title")).toBe(
      'Supplementary Information for "A Study"'
    );
  });
});
