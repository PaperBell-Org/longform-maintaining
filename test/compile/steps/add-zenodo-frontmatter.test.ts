import { describe, expect, it } from "vitest";
import {
  buildPandocYaml,
  type ZenodoMetadata,
} from "src/compile/steps/add-zenodo-frontmatter-utils";

const baseMetadata: ZenodoMetadata = {
  title: "A Study",
  publication_date: "2026-01-01",
  description: "An abstract.",
  creators: [{ name: "Doe, Jane", affiliation: "Org A" }],
};

describe("buildPandocYaml", () => {
  it("emits required fields for a minimal metadata", () => {
    const yaml = buildPandocYaml(baseMetadata);
    expect(yaml).toContain('title: "A Study"');
    expect(yaml).toContain('date: "2026-01-01"');
    expect(yaml).toContain('abstract: "An abstract."');
    expect(yaml).toContain("authors:");
    expect(yaml).toContain('  - name: "Doe, Jane"');
    expect(yaml).toContain("    affiliation: [1]");
    expect(yaml).toContain("affiliations:");
    expect(yaml).toContain("  - index: 1");
    expect(yaml).toContain('    name: "Org A"');
    expect(yaml.endsWith("\n")).toBe(true);
  });

  it("falls back to today's date when publication_date is missing", () => {
    const { publication_date: _omitted, ...rest } = baseMetadata;
    void _omitted;
    const yaml = buildPandocYaml(rest);
    const today = new Date().toISOString().slice(0, 10);
    expect(yaml).toContain(`date: "${today}"`);
  });

  it("deduplicates affiliations across multiple authors", () => {
    const yaml = buildPandocYaml({
      ...baseMetadata,
      creators: [
        { name: "Doe, Jane", affiliation: "Org A" },
        { name: "Roe, Rick", affiliation: "Org B" },
        { name: "Lee, Lin", affiliation: "Org A" },
      ],
    });
    expect(yaml).toMatch(/- name: "Doe, Jane"\n {4}affiliation: \[1\]/);
    expect(yaml).toMatch(/- name: "Roe, Rick"\n {4}affiliation: \[2\]/);
    expect(yaml).toMatch(/- name: "Lee, Lin"\n {4}affiliation: \[1\]/);
    expect(yaml).toContain('  - index: 1\n    name: "Org A"');
    expect(yaml).toContain('  - index: 2\n    name: "Org B"');
    expect((yaml.match(/index: /g) ?? []).length).toBe(2);
  });

  it("supports multi-affiliation authors via _longform.author_affiliations", () => {
    const yaml = buildPandocYaml({
      ...baseMetadata,
      creators: [
        { name: "Doe, Jane", affiliation: "Org A" },
        { name: "Roe, Rick", affiliation: "Org B" },
      ],
      _longform: {
        author_affiliations: { "Doe, Jane": ["Org A", "Org C"] },
      },
    });
    expect(yaml).toMatch(/- name: "Doe, Jane"\n {4}affiliation: \[1, 2\]/);
    expect(yaml).toMatch(/- name: "Roe, Rick"\n {4}affiliation: \[3\]/);
    expect(yaml).toContain('    name: "Org A"');
    expect(yaml).toContain('    name: "Org C"');
    expect(yaml).toContain('    name: "Org B"');
  });

  it("flags corresponding authors", () => {
    const yaml = buildPandocYaml({
      ...baseMetadata,
      creators: [
        { name: "Doe, Jane", affiliation: "Org A" },
        { name: "Roe, Rick", affiliation: "Org B" },
      ],
      _longform: { corresponding: ["Roe, Rick"] },
    });
    expect((yaml.match(/corresponding: "yes"/g) ?? []).length).toBe(1);
    expect(yaml).toMatch(/Roe, Rick"\n {4}affiliation: \[2\]\n {4}corresponding: "yes"/);
  });

  it("emits keywords, journal, csl, template, and toggles", () => {
    const yaml = buildPandocYaml({
      ...baseMetadata,
      keywords: ["alpha", "beta"],
      journal_title: "Nature",
      _longform: {
        acronym: "STUDY",
        csl: "nature",
        template: "default",
        lineno: true,
        figures_at_end: true,
      },
    });
    expect(yaml).toContain("keywords:\n  - \"alpha\"\n  - \"beta\"");
    expect(yaml).toContain('target: "Nature"');
    expect(yaml).toContain('acronym: "STUDY"');
    expect(yaml).toContain('csl: "nature"');
    expect(yaml).toContain('template: "default"');
    expect(yaml).toContain('lineno: "true"');
    expect(yaml).toContain('figures-at-end: "true"');
  });

  it("omits template/lineno/figures-at-end when not set", () => {
    const yaml = buildPandocYaml(baseMetadata);
    expect(yaml).not.toContain("template:");
    expect(yaml).not.toContain("lineno:");
    expect(yaml).not.toContain("figures-at-end:");
  });

  it("appends extra_yaml verbatim", () => {
    const yaml = buildPandocYaml({
      ...baseMetadata,
      _longform: { extra_yaml: "numbersections: true\nfontsize: 11pt" },
    });
    expect(yaml).toContain("numbersections: true\nfontsize: 11pt\n");
  });

  it("escapes double quotes and backslashes in string values", () => {
    const yaml = buildPandocYaml({
      ...baseMetadata,
      title: 'Quoted "title" with \\backslash',
    });
    expect(yaml).toContain('title: "Quoted \\"title\\" with \\\\backslash"');
  });

  it("throws when title is missing", () => {
    const { title: _omitted, ...rest } = baseMetadata;
    void _omitted;
    expect(() => buildPandocYaml(rest)).toThrow(/title/);
  });

  it("throws when creators is missing or empty", () => {
    expect(() =>
      buildPandocYaml({ ...baseMetadata, creators: [] })
    ).toThrow(/creators/);
    const { creators: _omitted, ...rest } = baseMetadata;
    void _omitted;
    expect(() => buildPandocYaml(rest)).toThrow(/creators/);
  });

  it("throws when a creator lacks a name", () => {
    expect(() =>
      buildPandocYaml({
        ...baseMetadata,
        creators: [{ name: "", affiliation: "Org A" }],
      })
    ).toThrow(/creators/);
  });

  it("omits affiliations table when no author has affiliations", () => {
    const yaml = buildPandocYaml({
      ...baseMetadata,
      creators: [{ name: "Solo, Han" }],
    });
    expect(yaml).not.toContain("affiliations:");
    expect(yaml).not.toContain("affiliation: [");
  });
});
