import { describe, it, expect } from "vitest";

import {
  buildPaperbellScaffold,
  acronymFromTitle,
  renderTree,
  SCAFFOLD_PRIMARY_DRAFT,
} from "src/model/scaffold/paperbell-scaffold";
import {
  ALL_PAPER_PARTS,
  PAPER_PARTS,
  yamlScalar,
  type PaperPartId,
  type ScaffoldFile,
} from "src/model/scaffold/parts";

const ALL: PaperPartId[] = [...ALL_PAPER_PARTS];

/** Everything selected, matching the behavior before parts became optional. */
const full = (extra: { title: string; acronym?: string } = { title: "My Paper" }) =>
  buildPaperbellScaffold({ ...extra, parts: ALL, examples: true });

const textOf = (files: ScaffoldFile[], path: string): string => {
  const f = files.find((f) => f.path === path);
  if (!f || !("text" in f)) throw new Error(`no text file at ${path}`);
  return f.text;
};

const pathsOf = (files: ScaffoldFile[]): string[] => files.map((f) => f.path);

/**
 * Reconstruct the full file paths an ASCII tree lists, by tracking indentation.
 * Comparing leaf names alone would not catch a misplaced entry, and would trip
 * over the two `metadata.json` files.
 */
function pathsFromTree(tree: string): string[] {
  const stack: string[] = [];
  const out: string[] = [];
  for (const line of tree.split("\n")) {
    const m = /^([\s│]*)(?:├── |└── )(.*)$/.exec(line);
    if (!m) continue;
    const depth = m[1].length / 4;
    const name = m[2].split("  #")[0].trim();
    const isDir = name.endsWith("/");
    stack.length = depth;
    stack.push(isDir ? name.slice(0, -1) : name);
    if (!isDir) out.push(stack.join("/"));
  }
  return out;
}

/**
 * Expected paths per selection, written out independently of the source so the
 * test does not simply restate the implementation's own table.
 */
const COMMON = ["metadata.json", "results.json", "references.bib"];
const EXAMPLES = ["figs/example_figure.png", "figs/example_data.xlsx", "README.md"];
const PART_PATHS: Record<PaperPartId, string[]> = {
  main: [
    "Main Manuscript (Index).md",
    "manuscript/introduction.md",
    "manuscript/methods.md",
    "manuscript/results.md",
  ],
  supplementary: [
    "supplementary/Supplementary (Index).md",
    "supplementary/metadata.json",
    "supplementary/supplementary results.md",
  ],
  cover: ["Cover Letter.md"],
  response: ["Response Letter (Index).md", "response/response.md"],
};

function expectedPaths(parts: PaperPartId[], examples: boolean): string[] {
  const out = [...COMMON, ...(examples ? EXAMPLES : [])];
  for (const part of parts) out.push(...PART_PATHS[part]);
  return out.sort();
}

/** Every subset of the four parts that includes "main". */
const SUBSETS: PaperPartId[][] = (() => {
  const optional: PaperPartId[] = ["supplementary", "cover", "response"];
  const out: PaperPartId[][] = [];
  for (let mask = 0; mask < 8; mask++) {
    out.push([
      "main",
      ...optional.filter((_, i) => mask & (1 << i)),
    ] as PaperPartId[]);
  }
  return out;
})();

/** Every subset crossed with the example-content switch. */
const CASES: { parts: PaperPartId[]; examples: boolean }[] = [];
for (const parts of SUBSETS) {
  for (const examples of [true, false]) CASES.push({ parts, examples });
}

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

describe("buildPaperbellScaffold — the full selection", () => {
  const files = full();
  const paths = pathsOf(files);

  it("emits the full four-part project layout", () => {
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
    // Unchanged from before parts became optional.
    expect(paths).toHaveLength(16);
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
    // These strings key DEFAULT_WORKFLOWS. A typo does not fail — it silently
    // leaves the new draft with no workflow bound.
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
    const custom = full({ title: "My Paper", acronym: "ZZZ" });
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
    expect(pathsOf(files)).toContain(SCAFFOLD_PRIMARY_DRAFT);
  });
});

describe("buildPaperbellScaffold — selections", () => {
  it.each(CASES.map((c) => ({ ...c, name: `${c.parts.join("+")} examples=${c.examples}` })))(
    "emits exactly the selected files: $name",
    ({ parts, examples }) => {
      const files = buildPaperbellScaffold({ title: "My Paper", parts, examples });
      expect(pathsOf(files).sort()).toEqual(expectedPaths(parts, examples));
    }
  );

  it("emits only the manuscript and shared files at the minimum", () => {
    const files = buildPaperbellScaffold({
      title: "My Paper",
      parts: ["main"],
      examples: false,
    });
    expect(pathsOf(files).sort()).toEqual([
      "Main Manuscript (Index).md",
      "manuscript/introduction.md",
      "manuscript/methods.md",
      "manuscript/results.md",
      "metadata.json",
      "references.bib",
      "results.json",
    ]);
  });
});

describe("buildPaperbellScaffold — the PaperBell project link", () => {
  /** The index notes that carry a draft's frontmatter, for every part. */
  const INDEX_NOTES = [
    "Main Manuscript (Index).md",
    "supplementary/Supplementary (Index).md",
    "Response Letter (Index).md",
    "Cover Letter.md",
  ];

  const withProject = (project?: string) =>
    buildPaperbellScaffold({
      title: "My Paper",
      project,
      parts: ALL,
      examples: false,
    });

  it("writes project: on every index note as a top-level key", () => {
    const files = withProject("ColMemo");
    for (const path of INDEX_NOTES) {
      const text = textOf(files, path);
      // Top-level means column 0 — indented, it would land inside `longform:`
      // and be read as part of the draft definition instead of the note's own
      // frontmatter, which is what sibling plugins query.
      expect(text, path).toMatch(/^project: ColMemo$/m);
      // …and inside the frontmatter block, not the body.
      const frontmatter = text.split("---")[1];
      expect(frontmatter, path).toContain("project: ColMemo");
    }
  });

  it("omits the key entirely when no project is chosen", () => {
    // An empty `project:` reads as a null association to a plugin querying
    // frontmatter — worse than no key at all.
    for (const files of [withProject(undefined), withProject("   ")]) {
      for (const path of INDEX_NOTES) {
        expect(textOf(files, path), path).not.toMatch(/^project:/m);
      }
    }
  });

  it("does not touch metadata.json — it stays pure publication metadata", () => {
    const metadata = JSON.parse(textOf(withProject("ColMemo"), "metadata.json"));
    expect(metadata._longform).not.toHaveProperty("project");
    expect(metadata).not.toHaveProperty("project");
  });

  it("keeps the paper's own acronym distinct from the project's", () => {
    const text = textOf(
      buildPaperbellScaffold({
        title: "Sea Level Memory",
        acronym: "SLM",
        project: "ColMemo",
        parts: ["main", "cover"],
        examples: false,
      }),
      "Cover Letter.md"
    );
    expect(text).toMatch(/^acronym: SLM$/m);
    expect(text).toMatch(/^project: ColMemo$/m);
  });

  it("quotes a hand-typed value that would break the YAML", () => {
    const text = textOf(withProject("Ocean: Memory"), "Main Manuscript (Index).md");
    expect(text).toMatch(/^project: "Ocean: Memory"$/m);
  });

  it("leaves the frontmatter well-formed for every part", () => {
    // Interpolating an optional line is exactly the kind of edit that leaves a
    // stray blank line behind — which ends the YAML block early in some parsers.
    for (const files of [withProject("ColMemo"), withProject(undefined)]) {
      for (const path of INDEX_NOTES) {
        const text = textOf(files, path);
        expect(text.startsWith("---\n"), path).toBe(true);
        const frontmatter = text.split("\n---\n")[0].slice("---\n".length);
        expect(frontmatter.split("\n"), path).not.toContain("");
      }
    }
  });
});

describe("yamlScalar", () => {
  it("writes plain identifiers bare", () => {
    for (const value of ["ColMemo", "PROJ-1", "my project", "v1.0", "A_B"]) {
      expect(yamlScalar(value)).toBe(value);
    }
  });

  it("quotes anything that could confuse a YAML parser", () => {
    expect(yamlScalar("Ocean: Memory")).toBe('"Ocean: Memory"');
    expect(yamlScalar("[bracket]")).toBe('"[bracket]"');
    expect(yamlScalar("#hash")).toBe('"#hash"');
    expect(yamlScalar("集体记忆")).toBe('"集体记忆"');
    expect(yamlScalar('say "hi"')).toBe('"say \\"hi\\""');
    expect(yamlScalar("- leading dash")).toBe('"- leading dash"');
  });

  it("quotes bare words YAML would read back as a non-string", () => {
    // `project: 2024` would come back as a number and `project: no` as a boolean,
    // so a sibling reading the key would not get the string that was written.
    for (const value of ["2024", "1.5", "-3", "no", "yes", "true", "off", "null", "~"]) {
      expect(yamlScalar(value), value).toBe(`"${value}"`);
    }
    // Case-insensitively, since YAML resolves NO/False/On too.
    expect(yamlScalar("NO")).toBe('"NO"');
    // …but a word that merely starts with one is a perfectly good acronym.
    expect(yamlScalar("Nova")).toBe("Nova");
    expect(yamlScalar("2024Project")).toBe("2024Project");
  });
});

describe("buildPaperbellScaffold — the Main Manuscript is mandatory", () => {
  it("refuses a selection without it", () => {
    // Not merely a disabled toggle: the project root is the lowest common
    // ancestor of its drafts' index folders, and a project whose only draft sat
    // in supplementary/ would resolve metadata.json from there.
    expect(() =>
      buildPaperbellScaffold({
        title: "My Paper",
        parts: ["supplementary"],
        examples: false,
      })
    ).toThrow(/Main Manuscript/);
  });
});

describe("buildPaperbellScaffold — invariants across every selection", () => {
  const every = CASES.map((c) => ({
    ...c,
    files: buildPaperbellScaffold({
      title: "My Paper",
      parts: c.parts,
      examples: c.examples,
    }),
  }));

  it("never emits a path twice", () => {
    for (const { files } of every) {
      const paths = pathsOf(files);
      expect(new Set(paths).size).toBe(paths.length);
    }
  });

  it("keeps figs/ out of the parts entirely", () => {
    // The example bundle owns figs/, so two selected parts can never both claim
    // the same asset path — the collision is impossible rather than de-duped.
    const ctx = {
      title: "My Paper",
      acronym: "MP",
      author: "A, B",
      examples: true,
      present: new Set<PaperPartId>(ALL),
    };
    for (const part of PAPER_PARTS) {
      for (const form of ["legacy", "project"] as const) {
        for (const file of part.build(ctx, form).files) {
          expect(file.path.startsWith("figs/")).toBe(false);
        }
      }
    }
  });

  it("leaves no reference to the example assets when they are not created", () => {
    for (const { examples, files } of every) {
      if (examples) continue;
      for (const f of files) {
        if (!("text" in f)) continue;
        expect(f.text).not.toContain("example_figure.png");
        expect(f.text).not.toContain("example_data.xlsx");
        expect(f.text).not.toContain("```xlsx-table");
      }
    }
  });

  it("emits manuscript references only when their target exists", () => {
    for (const { parts, examples, files } of every) {
      if (!parts.includes("response")) continue;
      const resp = textOf(files, "response/response.md");
      // @intro-gap is defined in the manuscript's introduction…
      expect(resp.includes("@intro-gap")).toBe(parts.includes("main"));
      // …and @fig:demo only exists when the example figure was written too.
      expect(resp.includes("@fig:demo")).toBe(
        parts.includes("main") && examples
      );
    }
  });

  it("documents exactly the files it created — no more, no less", () => {
    for (const { examples, files } of every) {
      if (!examples) continue;
      const tree = textOf(files, "README.md").split("```")[1];
      expect(pathsFromTree(tree).sort()).toEqual(pathsOf(files).sort());
    }
  });
});

describe("renderTree", () => {
  it("renders a flat list", () => {
    expect(renderTree("Proj", ["a.md", "b.md"])).toBe(
      ["Proj/", "├── a.md", "└── b.md"].join("\n")
    );
  });

  it("nests folders and marks them with a trailing slash", () => {
    expect(renderTree("Proj", ["dir/a.md", "dir/b.md", "c.md"])).toBe(
      ["Proj/", "├── dir/", "│   ├── a.md", "│   └── b.md", "└── c.md"].join("\n")
    );
  });

  it("renders an empty project as just its root", () => {
    expect(renderTree("Proj", [])).toBe("Proj/");
  });
});
