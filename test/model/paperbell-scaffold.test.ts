import { describe, it, expect } from "vitest";

import {
  buildPaperbellScaffold,
  acronymFromTitle,
  SCAFFOLD_PRIMARY_DRAFT,
  type ScaffoldFile,
} from "src/model/scaffold/paperbell-scaffold";

const textOf = (files: ScaffoldFile[], path: string): string => {
  const f = files.find((f) => f.path === path);
  if (!f || !("text" in f)) throw new Error(`no text file at ${path}`);
  return f.text;
};

describe("acronymFromTitle", () => {
  it("takes upper-cased initials of each word", () => {
    expect(acronymFromTitle("Sea Level Memory")).toBe("SLM");
    expect(acronymFromTitle("a-b_c")).toBe("ABC");
  });
  it("falls back to PAPER for an empty title", () => {
    expect(acronymFromTitle("")).toBe("PAPER");
    expect(acronymFromTitle("   ")).toBe("PAPER");
  });
  it("caps at six characters", () => {
    expect(acronymFromTitle("a b c d e f g h").length).toBe(6);
  });
});

describe("buildPaperbellScaffold", () => {
  const files = buildPaperbellScaffold({ title: "My Paper" });
  const paths = files.map((f) => f.path);

  it("emits the full three-draft project layout", () => {
    expect(paths).toEqual(
      expect.arrayContaining([
        "metadata.json",
        "results.json",
        "references.bib",
        "README.md",
        "figs/example_figure.png",
        "figs/example_data.xlsx",
        "Main Manuscript (Index).md",
        "manuscript/introduction.md",
        "manuscript/methods.md",
        "manuscript/results.md",
        "Response Letter (Index).md",
        "response/response.md",
        "Cover Letter.md",
        "supplementary/Supplementary (Index).md",
        "supplementary/metadata.json",
        "supplementary/supplementary results.md",
      ])
    );
  });

  it("ships the example assets as non-empty base64 binaries", () => {
    for (const p of ["figs/example_figure.png", "figs/example_data.xlsx"]) {
      const f = files.find((f) => f.path === p);
      expect(f && "base64" in f && f.base64.length).toBeTruthy();
    }
  });

  it("groups all four drafts under one project title with distinct draftTitles", () => {
    for (const idx of [
      "Main Manuscript (Index).md",
      "Response Letter (Index).md",
      "Cover Letter.md",
      "supplementary/Supplementary (Index).md",
    ]) {
      expect(textOf(files, idx)).toContain("title: My Paper");
    }
    expect(textOf(files, "Main Manuscript (Index).md")).toContain(
      "draftTitle: Main Manuscript"
    );
    expect(textOf(files, "Response Letter (Index).md")).toContain(
      "draftTitle: Response Letter"
    );
    expect(textOf(files, "Cover Letter.md")).toContain(
      "draftTitle: Cover Letter"
    );
    expect(textOf(files, "supplementary/Supplementary (Index).md")).toContain(
      "draftTitle: Supplementary"
    );
  });

  it("references the built-in PaperBell workflows by their exact names", () => {
    expect(textOf(files, "Main Manuscript (Index).md")).toContain(
      "workflow: PaperBell Manuscript"
    );
    expect(textOf(files, "Response Letter (Index).md")).toContain(
      "workflow: PaperBell Response Letter"
    );
    expect(textOf(files, "Cover Letter.md")).toContain(
      "workflow: PaperBell Cover Letter"
    );
    expect(textOf(files, "supplementary/Supplementary (Index).md")).toContain(
      "workflow: PaperBell Supplementary"
    );
  });

  it("makes the cover letter a single-file draft with letterhead frontmatter", () => {
    const cover = textOf(files, "Cover Letter.md");
    expect(cover).toContain("format: single");
    expect(cover).toContain("to: Dear Editor");
    expect(cover).toContain("manuscript: My Paper");
    // cover_letter.lua substitutes {{JournalName}} from metadata.json at compile time.
    expect(cover).toContain("{{JournalName}}");
    // The corresponding email the letterhead reads lives in _longform.extra_yaml.
    expect(textOf(files, "metadata.json")).toContain("corresponding_email:");
  });

  it("derives the acronym into metadata unless overridden", () => {
    expect(textOf(files, "metadata.json")).toContain('"acronym": "MP"');
    const custom = buildPaperbellScaffold({ title: "My Paper", acronym: "ZZZ" });
    expect(textOf(custom, "metadata.json")).toContain('"acronym": "ZZZ"');
  });

  it("marks the supplementary metadata for S-numbering", () => {
    expect(textOf(files, "supplementary/metadata.json")).toContain(
      "supplementary: true"
    );
  });

  it("keeps the reference-sync ids the response letter pulls", () => {
    // The response letter cites @intro-gap and @fig:demo; the manuscript must define them.
    expect(textOf(files, "manuscript/introduction.md")).toContain(
      "<!--ms:intro-gap-->"
    );
    expect(textOf(files, "manuscript/results.md")).toContain("{#fig:demo");
    const resp = textOf(files, "response/response.md");
    expect(resp).toContain("@intro-gap");
    expect(resp).toContain("@fig:demo");
  });

  it("emits valid JSON for every .json file", () => {
    for (const f of files) {
      if (f.path.endsWith(".json") && "text" in f) {
        expect(() => JSON.parse(f.text)).not.toThrow();
      }
    }
  });

  it("exposes the primary draft path", () => {
    expect(paths).toContain(SCAFFOLD_PRIMARY_DRAFT);
  });
});
