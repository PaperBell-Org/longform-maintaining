import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildPandocYaml } from "src/compile/steps/add-zenodo-frontmatter-utils";
import type { ZenodoMetadata } from "src/compile/steps/add-zenodo-frontmatter-utils";
import {
  buildPlaceholderRegex,
  formatPlaceholderValue,
  getByPath,
} from "src/compile/steps/replace-json-placeholders-utils";

// Vitest runs with the repo root as cwd.
const FIXTURE = resolve(
  process.cwd(),
  "test-longform-vault/paperbell-minimal"
);

function readJson<T = unknown>(rel: string): T {
  return JSON.parse(readFileSync(resolve(FIXTURE, rel), "utf8")) as T;
}

/** Mimic the Replace JSON Placeholders compile step against one data source. */
function substitute(text: string, data: unknown): string {
  const re = buildPlaceholderRegex("{{", "}}");
  return text.replace(re, (match, rawPath) => {
    const value = getByPath(data, String(rawPath).trim());
    return value === undefined ? match : formatPlaceholderValue(value);
  });
}

describe("paperbell-minimal fixture: Add Zenodo Frontmatter", () => {
  it("builds academic Pandoc YAML from the shared root metadata.json", () => {
    const meta = readJson<ZenodoMetadata>("metadata.json");
    const yaml = buildPandocYaml(meta);

    expect(yaml).toContain('title: "A Minimal PaperBell Manuscript"');
    expect(yaml).toContain('csl: "nature"');
    expect(yaml).toContain('template: "default"');
    expect(yaml).toContain('acronym: "PBMIN"');
    expect(yaml).toContain('lineno: "true"');

    // Corresponding author is flagged.
    expect(yaml).toMatch(
      /- name: "Song, Shuang"\n {4}affiliation: \[1, 2\]\n {4}corresponding: "yes"/
    );
    expect(yaml).toMatch(/- name: "Roe, Rick"\n {4}affiliation: \[3\]/);

    // Indexed affiliations table, in order of first appearance.
    expect(yaml).toContain('  - index: 1\n    name: "Institute for Worked Examples"');
    expect(yaml).toContain('  - index: 2\n    name: "Aspen Institute"');
    expect(yaml).toContain('  - index: 3\n    name: "Center for Placeholder Studies"');

    // extra_yaml is appended verbatim.
    expect(yaml).toContain("numbersections: true");
    expect(yaml).not.toContain("supplementary: true");
  });

  it("injects supplementary: true from the supplementary override metadata.json", () => {
    const meta = readJson<ZenodoMetadata>("supplementary/metadata.json");
    const yaml = buildPandocYaml(meta);
    expect(yaml).toContain("supplementary: true");
    expect(yaml).toContain("numbersections: true");
  });
});

describe("paperbell-minimal fixture: {{Variable}} placeholders", () => {
  const metadata = readJson("metadata.json");
  const results = readJson("results.json");

  it("resolves metadata.json placeholders (also live-rendered in reading mode)", () => {
    const text =
      "*{{title}}* (acronym {{_longform.acronym}}, version {{version}})";
    expect(substitute(text, metadata)).toBe(
      "*A Minimal PaperBell Manuscript* (acronym PBMIN, version v1.0)"
    );
  });

  it("resolves results.json placeholders (compile-time only)", () => {
    const text =
      "{{ summary.n }} {{ summary.unit }} (mean {{ summary.mean }}); first {{ samples[0].id }} on {{ computed_date }}";
    expect(substitute(text, results)).toBe(
      "42 samples (mean 3.14); first S-01 on 2026-06-30"
    );
  });

  it("leaves the other source's placeholders untouched (two-pass design)", () => {
    // A metadata placeholder is not in results.json, so pass 1 (results) leaves it.
    expect(substitute("{{version}}", results)).toBe("{{version}}");
    // Two passes (metadata then results) resolve both kinds; each leaves the
    // other's placeholders for its sibling pass, so nothing is lost.
    const mixed = "v{{version}} / n={{summary.n}}";
    const compiled = substitute(substitute(mixed, metadata), results);
    expect(compiled).toBe("vv1.0 / n=42");
  });
});

describe("paperbell-minimal fixture: PaperBell Manuscript workflow", () => {
  it("is registered in the vault with the expected step order", () => {
    const data = JSON.parse(
      readFileSync(
        resolve(
          process.cwd(),
          "test-longform-vault/.obsidian/plugins/longform-paperbell/data.json"
        ),
        "utf8"
      )
    ) as {
      workflows: Record<string, { steps: { id: string }[] }>;
    };

    const wf = data.workflows["PaperBell Manuscript"];
    expect(wf).toBeDefined();
    expect(wf.steps.map((s) => s.id)).toEqual([
      "strip-frontmatter",
      "concatenate-text",
      "replace-json-placeholders",
      "replace-json-placeholders",
      "add-zenodo-frontmatter",
      "write-to-note",
    ]);
    // The existing starter workflow is left intact.
    expect(data.workflows["Default Workflow"]).toBeDefined();
  });
});
