import { describe, expect, it } from "vitest";
import {
  buildProjectIndexFromDrafts,
  assetFromLegacyDraft,
  slugifyAssetName,
} from "src/commands/convert-to-project-utils";
import type { MultipleSceneDraft, SingleSceneDraft } from "src/model/types";

function scenesDraft(
  overrides: Partial<MultipleSceneDraft>
): MultipleSceneDraft {
  return {
    format: "scenes",
    title: "P",
    titleInFrontmatter: true,
    draftTitle: null,
    vaultPath: "P/Index.md",
    workflow: null,
    sceneFolder: "/",
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
    title: "P",
    titleInFrontmatter: true,
    draftTitle: null,
    vaultPath: "P/Note.md",
    workflow: null,
    indexPath: null,
    assetId: null,
    bodyPath: null,
    ...overrides,
  };
}

describe("slugifyAssetName", () => {
  it("slugs ascii names", () => {
    expect(slugifyAssetName("Main Manuscript")).toBe("main-manuscript");
    expect(slugifyAssetName("Cover Letter")).toBe("cover-letter");
  });
  it("keeps unicode (CJK) names rather than collapsing to empty", () => {
    expect(slugifyAssetName("正文")).toBe("正文");
    expect(slugifyAssetName("  ")).toBe("asset");
  });
});

describe("assetFromLegacyDraft", () => {
  it("makes a scenes asset's folder relative to the project root", () => {
    const d = scenesDraft({
      draftTitle: "Main Manuscript",
      vaultPath: "P/Main (Index).md",
      workflow: "PaperBell Manuscript",
      sceneFolder: "manuscript",
      scenes: [
        { title: "introduction", indent: 0 },
        { title: "methods", indent: 1 },
      ],
    });
    expect(assetFromLegacyDraft(d, "P")).toEqual({
      name: "Main Manuscript",
      id: "main-manuscript",
      format: "scenes",
      folder: "manuscript",
      workflow: "PaperBell Manuscript",
      scenes: ["introduction", ["methods"]],
    });
  });

  it("keeps a nested scene folder that sits below the project root", () => {
    const d = scenesDraft({
      draftTitle: "Supplementary",
      vaultPath: "P/supplementary/Supp (Index).md",
      sceneFolder: "/",
      scenes: [{ title: "supp", indent: 0 }],
    });
    // index folder is P/supplementary, sceneFolder "/" → folder "supplementary"
    const asset = assetFromLegacyDraft(d, "P");
    expect(asset.format).toBe("scenes");
    if (asset.format === "scenes") {
      expect(asset.folder).toBe("supplementary");
    }
  });

  it("points a single asset's file at its old note, relative to the root", () => {
    const d = singleDraft({
      draftTitle: "Cover Letter",
      vaultPath: "P/Cover Letter.md",
      workflow: "PaperBell Cover Letter",
    });
    expect(assetFromLegacyDraft(d, "P")).toEqual({
      name: "Cover Letter",
      id: "cover-letter",
      format: "single",
      file: "Cover Letter.md",
      workflow: "PaperBell Cover Letter",
    });
  });
});

describe("buildProjectIndexFromDrafts", () => {
  it("builds one index entry, listing every draft as an asset, and lists strip paths", () => {
    const main = scenesDraft({
      draftTitle: "Main Manuscript",
      vaultPath: "P/Main (Index).md",
      sceneFolder: "manuscript",
      scenes: [{ title: "introduction", indent: 0 }],
    });
    const cover = singleDraft({
      draftTitle: "Cover Letter",
      vaultPath: "P/Cover Letter.md",
    });

    const plan = buildProjectIndexFromDrafts([main, cover], "P", "My Paper");

    expect(plan.indexPath).toBe("P/My Paper (Index).md");
    expect(plan.stripPaths).toEqual(["P/Main (Index).md", "P/Cover Letter.md"]);
    expect(plan.indexEntry.format).toBe("project");
    expect(plan.indexEntry.title).toBe("My Paper");
    expect(plan.indexEntry.assets).toEqual([
      {
        name: "Main Manuscript",
        id: "main-manuscript",
        format: "scenes",
        folder: "manuscript",
        workflow: undefined,
        scenes: ["introduction"],
      },
      {
        name: "Cover Letter",
        id: "cover-letter",
        format: "single",
        file: "Cover Letter.md",
        workflow: undefined,
      },
    ]);
  });

  it("disambiguates colliding asset ids", () => {
    const a = scenesDraft({ draftTitle: "Notes", vaultPath: "P/A.md" });
    const b = scenesDraft({ draftTitle: "Notes", vaultPath: "P/B.md" });
    const plan = buildProjectIndexFromDrafts([a, b], "P", "P");
    expect(plan.indexEntry.assets.map((x) => x.id)).toEqual([
      "notes",
      "notes-2",
    ]);
  });
});
