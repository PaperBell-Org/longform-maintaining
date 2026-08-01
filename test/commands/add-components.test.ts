import { describe, expect, it } from "vitest";

import {
  anchorFolderFor,
  planAddComponents,
  presentParts,
  projectFormOf,
  projectsUnderFolder,
  uniqueAssetId,
  usedAssetIds,
} from "src/commands/add-components-utils";
import {
  isIndexNote,
  paperPart,
  primaryPathFor,
  scenesBeforeIndexes,
} from "src/model/scaffold/parts";
import type { MultipleSceneDraft, SingleSceneDraft } from "src/model/types";

function scenesDraft(
  overrides: Partial<MultipleSceneDraft>
): MultipleSceneDraft {
  return {
    format: "scenes",
    title: "My Paper",
    titleInFrontmatter: true,
    draftTitle: null,
    vaultPath: "My Paper/Main Manuscript (Index).md",
    workflow: null,
    sceneFolder: "manuscript",
    scenes: [],
    ignoredFiles: [],
    unknownFiles: [],
    sceneTemplate: null,
    indexPath: null,
    assetId: null,
    ...overrides,
  };
}

function singleDraft(overrides: Partial<SingleSceneDraft>): SingleSceneDraft {
  return {
    format: "single",
    title: "My Paper",
    titleInFrontmatter: true,
    draftTitle: null,
    vaultPath: "My Paper/Cover Letter.md",
    workflow: null,
    indexPath: null,
    assetId: null,
    bodyPath: null,
    ...overrides,
  };
}

/** A legacy project with just a Main Manuscript. */
const legacyMain = scenesDraft({
  draftTitle: "Main Manuscript",
  workflow: "PaperBell Manuscript",
});

/** The same project after "Convert project to single index…". */
const INDEX = "My Paper/My Paper (Index).md";
const assetMain = scenesDraft({
  draftTitle: "Main Manuscript",
  workflow: "PaperBell Manuscript",
  vaultPath: `${INDEX}::main-manuscript`,
  indexPath: INDEX,
  assetId: "main-manuscript",
});

const never = () => false;
const always = () => true;

describe("projectFormOf", () => {
  it("reads standalone index notes as the legacy form", () => {
    expect(projectFormOf([legacyMain])).toBe("legacy");
  });

  it("reads assets of one index as the project form", () => {
    expect(projectFormOf([assetMain])).toBe("project");
  });

  it("refuses a half-converted project", () => {
    // Neither write path is right for all of these drafts.
    expect(projectFormOf([legacyMain, assetMain])).toBe("mixed");
  });

  it("refuses two indexes sharing a title", () => {
    const other = scenesDraft({
      indexPath: "My Paper/Other (Index).md",
      vaultPath: "My Paper/Other (Index).md::x",
      assetId: "x",
    });
    expect(projectFormOf([assetMain, other])).toBe("mixed");
  });

  it("reports an empty project", () => {
    expect(projectFormOf([])).toBe("empty");
  });
});

describe("anchorFolderFor", () => {
  it("uses the index note's own folder in project form", () => {
    // Asset folder/file paths are resolved relative to the index, so anchoring
    // anywhere else would need every path translated twice.
    expect(anchorFolderFor([assetMain], "project", always)).toBe("My Paper");
  });

  it("uses the project root in legacy form", () => {
    expect(anchorFolderFor([legacyMain], "legacy", always)).toBe("My Paper");
  });

  it("steps up one level for a project left with only its Supplementary", () => {
    // The SI index lives inside supplementary/, so the lowest common ancestor
    // is that subfolder — writing a Main Manuscript there would nest it wrongly.
    const siOnly = scenesDraft({
      draftTitle: "Supplementary",
      workflow: "PaperBell Supplementary",
      vaultPath: "My Paper/supplementary/Supplementary (Index).md",
      sceneFolder: "/",
    });
    const hasMetadata = (folder: string) => folder === "My Paper";
    expect(anchorFolderFor([siOnly], "legacy", hasMetadata)).toBe("My Paper");
  });

  it("stops after one level rather than escaping toward the vault root", () => {
    const deep = scenesDraft({
      vaultPath: "a/b/c/Main Manuscript (Index).md",
    });
    expect(anchorFolderFor([deep], "legacy", never)).toBe("a/b/c");
  });
});

describe("presentParts", () => {
  it("matches on draftTitle, which covers both project forms", () => {
    expect([...presentParts([legacyMain], never, "My Paper")]).toEqual(["main"]);
    expect([...presentParts([assetMain], never, "My Paper")]).toEqual(["main"]);
  });

  it("falls back to the workflow when a draft was renamed", () => {
    const renamed = scenesDraft({
      draftTitle: "Paper Body",
      workflow: "PaperBell Manuscript",
    });
    expect(presentParts([renamed], never, "My Paper").has("main")).toBe(true);
  });

  it("falls back to the part's own paths when both labels were changed", () => {
    const renamed = scenesDraft({ draftTitle: "Paper Body", workflow: null });
    const exists = (p: string) => p === "My Paper/Cover Letter.md";
    expect(presentParts([renamed], exists, "My Paper").has("cover")).toBe(true);
  });

  it("reports nothing present for an unrelated draft", () => {
    const unrelated = scenesDraft({ draftTitle: "Notes", workflow: null });
    expect([...presentParts([unrelated], never, "My Paper")]).toEqual([]);
  });
});

describe("uniqueAssetId", () => {
  it("slugifies the asset name", () => {
    expect(uniqueAssetId("Response Letter", new Set())).toBe("response-letter");
  });

  it("suffixes until free", () => {
    const used = new Set(["response-letter", "response-letter-2"]);
    expect(uniqueAssetId("Response Letter", used)).toBe("response-letter-3");
  });

  it("reads the ids already in an index, falling back to the name", () => {
    const used = usedAssetIds([
      { name: "Main Manuscript", id: "main-manuscript", format: "single", file: "a.md" },
      { name: "Cover Letter", format: "single", file: "b.md" },
    ]);
    expect(used).toEqual(new Set(["main-manuscript", "Cover Letter"]));
  });
});

describe("projectsUnderFolder", () => {
  const drafts = [
    legacyMain,
    scenesDraft({ title: "Other", vaultPath: "Other/Other (Index).md" }),
    // A project asset: its own vaultPath is synthetic and must not be parsed.
    assetMain,
  ];

  it("finds projects whose files live in the folder", () => {
    expect(projectsUnderFolder("My Paper", drafts)).toEqual(["My Paper"]);
    expect(projectsUnderFolder("Other", drafts)).toEqual(["Other"]);
  });

  it("finds projects nested deeper", () => {
    const nested = scenesDraft({
      title: "Deep",
      vaultPath: "Papers/2026/Deep/Deep (Index).md",
    });
    expect(projectsUnderFolder("Papers", [nested])).toEqual(["Deep"]);
  });

  it("returns nothing for an unrelated folder", () => {
    expect(projectsUnderFolder("Inbox", drafts)).toEqual([]);
  });
});

describe("planAddComponents", () => {
  const deps = { pathExists: never, hasMetadata: always };

  it("offers every part a legacy project is missing", () => {
    const plan = planAddComponents([legacyMain], deps);
    expect(plan.form).toBe("legacy");
    expect(plan.anchor).toBe("My Paper");
    expect(plan.indexPath).toBeNull();
    expect(plan.addable).toEqual(["supplementary", "cover", "response"]);
  });

  it("carries the index path in project form", () => {
    const plan = planAddComponents([assetMain], deps);
    expect(plan.form).toBe("project");
    expect(plan.indexPath).toBe(INDEX);
    expect(plan.anchor).toBe("My Paper");
  });

  it("offers nothing for a mixed project", () => {
    const plan = planAddComponents([legacyMain, assetMain], deps);
    expect(plan.form).toBe("mixed");
    expect(plan.addable).toEqual([]);
  });

  it("drops a part that is already there", () => {
    const cover = singleDraft({
      draftTitle: "Cover Letter",
      workflow: "PaperBell Cover Letter",
    });
    const plan = planAddComponents([legacyMain, cover], deps);
    expect(plan.addable).toEqual(["supplementary", "response"]);
  });
});

describe("part builders in project form", () => {
  const ctx = {
    title: "My Paper",
    acronym: "MP",
    author: "Lastname, Firstname",
    examples: true,
    present: new Set<"main" | "supplementary" | "cover" | "response">(["main"]),
  };

  it("emits no index note, only an assets entry", () => {
    const built = paperPart("response").build(ctx, "project");
    expect(built.files.map((f) => f.path)).toEqual(["response/response.md"]);
    expect(built.asset).toMatchObject({
      name: "Response Letter",
      format: "scenes",
      folder: "response",
      workflow: "PaperBell Response Letter",
      scenes: ["response"],
    });
  });

  it("strips longform from the cover letter's body note", () => {
    // In project form the note is an asset's body; a stray longform block would
    // register it as a second, competing draft — exactly what the convert
    // command's stripLongform removes.
    const built = paperPart("cover").build(ctx, "project");
    const cover = built.files[0];
    expect("text" in cover && cover.text).not.toContain("longform:");
    expect("text" in cover && cover.text).toContain("to: Dear Editor");
    expect(built.asset).toMatchObject({
      format: "single",
      file: "Cover Letter.md",
    });
  });

  it("keeps longform on the cover letter in legacy form", () => {
    const built = paperPart("cover").build(ctx, "legacy");
    const cover = built.files[0];
    expect("text" in cover && cover.text).toContain("format: single");
    expect(built.asset).toBeUndefined();
  });

  it("puts the supplementary under its own folder relative to the index", () => {
    const built = paperPart("supplementary").build(ctx, "project");
    expect(built.asset).toMatchObject({
      folder: "supplementary",
      scenes: ["supplementary results"],
    });
    expect(built.files.map((f) => f.path)).toContain("supplementary/metadata.json");
  });
});

describe("write ordering", () => {
  const index = { path: "X (Index).md", text: "---\nlongform:\n  format: scenes\n---\n" };
  const scene = { path: "x/scene.md", text: "# Scene\n" };
  const body = { path: "Cover Letter.md", text: "---\ntitle: Cover letter\n---\n" };
  const binary = { path: "figs/a.png", base64: "AAAA" };

  it("recognizes an index note by its leading longform block", () => {
    expect(isIndexNote(index)).toBe(true);
    // A project-form body note carries frontmatter but no longform block.
    expect(isIndexNote(body)).toBe(false);
    expect(isIndexNote(scene)).toBe(false);
    expect(isIndexNote(binary)).toBe(false);
  });

  it("writes scenes before the index that lists them", () => {
    // Otherwise reconcileScenesDraft sees scenes that aren't on disk yet and
    // writes back a shortened `scenes:` list.
    const ordered = scenesBeforeIndexes(
      [index, scene, binary].map((file) => ({ file }))
    );
    expect(ordered.map((e) => e.file.path)).toEqual([
      "x/scene.md",
      "figs/a.png",
      "X (Index).md",
    ]);
  });

  it("is a no-op when there is no index note", () => {
    const entries = [scene, body].map((file) => ({ file }));
    expect(scenesBeforeIndexes(entries).map((e) => e.file.path)).toEqual([
      "x/scene.md",
      "Cover Letter.md",
    ]);
  });
});

describe("primaryPathFor", () => {
  it("picks the first selected part in canonical order", () => {
    expect(primaryPathFor(["main", "cover"])).toBe("Main Manuscript (Index).md");
    // Canonical order wins over argument order.
    expect(primaryPathFor(["response", "cover"])).toBe("Cover Letter.md");
    expect(primaryPathFor(["response"])).toBe("Response Letter (Index).md");
  });

  it("returns null for an empty selection", () => {
    expect(primaryPathFor([])).toBeNull();
  });
});

describe("the context handed to part builders", () => {
  it("sees parts added in the same run, not just the ones already there", () => {
    // A response letter added alongside a manuscript must get the working
    // fences, even though the manuscript does not exist on disk yet.
    const present = new Set<"main" | "supplementary" | "cover" | "response">([
      "main",
      "response",
    ]);
    const built = paperPart("response").build(
      {
        title: "My Paper",
        acronym: "MP",
        author: "A, B",
        examples: false,
        present,
      },
      "legacy"
    );
    const scene = built.files.find((f) => f.path === "response/response.md");
    expect(scene && "text" in scene && scene.text).toContain("@intro-gap");
  });

  it("omits the fences when the manuscript is absent", () => {
    const built = paperPart("response").build(
      {
        title: "My Paper",
        acronym: "MP",
        author: "A, B",
        examples: false,
        present: new Set<"main" | "supplementary" | "cover" | "response">([
          "response",
        ]),
      },
      "legacy"
    );
    const scene = built.files.find((f) => f.path === "response/response.md");
    expect(scene && "text" in scene && scene.text).not.toContain("@intro-gap");
  });
});

describe("planAddComponents — example detection", () => {
  const deps = (figs: boolean) => ({
    pathExists: (p: string) => figs && p === "My Paper/figs/example_figure.png",
    hasMetadata: () => true,
  });

  it("reports the example assets when they are on disk", () => {
    expect(planAddComponents([legacyMain], deps(true)).examples).toBe(true);
  });

  it("reports none when they are not, so new body text omits them", () => {
    expect(planAddComponents([legacyMain], deps(false)).examples).toBe(false);
  });
});
