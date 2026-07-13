import { describe, expect, it } from "vitest";
import {
  expandProjectIndex,
  assetEntryFromDraft,
  setProjectAssetsOnFrontmatterObject,
  assetIdFor,
  syntheticAssetPath,
} from "src/model/project-index";
import type { MultipleSceneDraft, SingleSceneDraft } from "src/model/types";

const PROJECT_ENTRY = {
  format: "project",
  title: "My Paper",
  assets: [
    {
      name: "正文",
      id: "main",
      format: "scenes",
      folder: "manuscript",
      workflow: "PaperBell Manuscript",
      scenes: ["introduction", ["methods", "sub-methods"], "results"],
    },
    {
      name: "补充材料",
      format: "scenes",
      folder: "supplementary",
      scenes: ["supp-results"],
    },
    {
      name: "投稿信",
      format: "single",
      file: "cover-letter.md",
      workflow: "PaperBell Cover Letter",
    },
  ],
};

describe("expandProjectIndex — project index", () => {
  const drafts = expandProjectIndex(
    PROJECT_ENTRY,
    "My Paper/My Paper (Index).md",
    "My Paper (Index)"
  );

  it("expands one draft per asset, all sharing the project title", () => {
    expect(drafts).toHaveLength(3);
    expect(drafts.map((d) => d.title)).toEqual([
      "My Paper",
      "My Paper",
      "My Paper",
    ]);
  });

  it("gives each asset a unique synthetic vaultPath and the shared indexPath", () => {
    expect(drafts[0].vaultPath).toBe(
      "My Paper/My Paper (Index).md::main"
    );
    // assetId falls back to the display name when no explicit id is given
    expect(drafts[1].vaultPath).toBe(
      "My Paper/My Paper (Index).md::补充材料"
    );
    for (const d of drafts) {
      expect(d.indexPath).toBe("My Paper/My Paper (Index).md");
    }
    expect(drafts[0].assetId).toBe("main");
    expect(drafts[1].assetId).toBe("补充材料");
  });

  it("parses scene nesting and carries per-asset fields", () => {
    const main = drafts[0] as MultipleSceneDraft;
    expect(main.format).toBe("scenes");
    expect(main.sceneFolder).toBe("manuscript");
    expect(main.workflow).toBe("PaperBell Manuscript");
    expect(main.draftTitle).toBe("正文");
    expect(main.unknownFiles).toEqual([]);
    expect(main.scenes).toEqual([
      { title: "introduction", indent: 0 },
      { title: "methods", indent: 1 },
      { title: "sub-methods", indent: 1 },
      { title: "results", indent: 0 },
    ]);
  });

  it("resolves a single asset's external body note relative to the index folder", () => {
    const cover = drafts[2] as SingleSceneDraft;
    expect(cover.format).toBe("single");
    expect(cover.bodyPath).toBe("My Paper/cover-letter.md");
    expect(cover.workflow).toBe("PaperBell Cover Letter");
    expect(cover.draftTitle).toBe("投稿信");
  });

  it("returns empty scenes for an asset with none (caller re-reads via the cache fallback)", () => {
    const drafts = expandProjectIndex(
      {
        format: "project",
        title: "T",
        assets: [{ name: "a", format: "scenes", folder: "x", scenes: [] }],
      },
      "T/Index.md",
      "Index"
    );
    expect((drafts[0] as MultipleSceneDraft).scenes).toEqual([]);
  });
});

describe("expandProjectIndex — legacy backward compatibility", () => {
  it("expands a legacy scenes index to one draft with a null indexPath", () => {
    const drafts = expandProjectIndex(
      {
        format: "scenes",
        title: "Legacy",
        sceneFolder: "manuscript",
        scenes: ["a", "b"],
        ignoredFiles: ["ignore-me"],
      },
      "Legacy/Index.md",
      "Index"
    );
    expect(drafts).toHaveLength(1);
    const d = drafts[0] as MultipleSceneDraft;
    expect(d.indexPath).toBeNull();
    expect(d.assetId).toBeNull();
    expect(d.vaultPath).toBe("Legacy/Index.md");
    expect(d.titleInFrontmatter).toBe(true);
    expect(d.scenes).toEqual([
      { title: "a", indent: 0 },
      { title: "b", indent: 0 },
    ]);
    expect(d.ignoredFiles).toEqual(["ignore-me"]);
  });

  it("expands a legacy single index to one draft with a null bodyPath", () => {
    const drafts = expandProjectIndex(
      { format: "single", title: "Legacy" },
      "Legacy/Note.md",
      "Note"
    );
    expect(drafts).toHaveLength(1);
    const d = drafts[0] as SingleSceneDraft;
    expect(d.format).toBe("single");
    expect(d.indexPath).toBeNull();
    expect(d.bodyPath).toBeNull();
    expect(d.vaultPath).toBe("Legacy/Note.md");
  });

  it("falls back to the file name when no title is in frontmatter", () => {
    const drafts = expandProjectIndex(
      { format: "single" },
      "somewhere/An Essay.md",
      "An Essay"
    );
    expect(drafts[0].title).toBe("An Essay");
    expect(drafts[0].titleInFrontmatter).toBe(false);
  });

  it("returns no drafts for an unrecognized format", () => {
    expect(expandProjectIndex({ format: "nonsense" }, "x.md", "x")).toEqual([]);
    expect(expandProjectIndex(null, "x.md", "x")).toEqual([]);
  });
});

describe("assetEntryFromDraft / setProjectAssetsOnFrontmatterObject round-trip", () => {
  const drafts = expandProjectIndex(
    PROJECT_ENTRY,
    "My Paper/My Paper (Index).md",
    "My Paper (Index)"
  );

  it("serializes a scenes asset back to its on-disk shape (nested arrays preserved)", () => {
    expect(assetEntryFromDraft(drafts[0])).toEqual({
      name: "正文",
      id: "main",
      workflow: "PaperBell Manuscript",
      format: "scenes",
      folder: "manuscript",
      scenes: ["introduction", ["methods", "sub-methods"], "results"],
    });
  });

  it("serializes a single asset back to a folder-relative file path", () => {
    expect(assetEntryFromDraft(drafts[2])).toEqual({
      name: "投稿信",
      id: "投稿信",
      workflow: "PaperBell Cover Letter",
      format: "single",
      file: "cover-letter.md",
    });
  });

  it("writes a `format: project` frontmatter object that re-expands to the same drafts", () => {
    const obj: Record<string, any> = {};
    setProjectAssetsOnFrontmatterObject(obj, "My Paper", drafts);
    expect(obj.longform.format).toBe("project");
    expect(obj.longform.title).toBe("My Paper");
    expect(obj.longform.assets).toHaveLength(3);

    const reExpanded = expandProjectIndex(
      obj.longform,
      "My Paper/My Paper (Index).md",
      "My Paper (Index)"
    );
    expect(reExpanded).toEqual(drafts);
  });
});

describe("asset id + path helpers", () => {
  it("prefers an explicit id, else the name", () => {
    expect(assetIdFor({ id: "main", name: "正文" })).toBe("main");
    expect(assetIdFor({ name: "补充材料" })).toBe("补充材料");
    expect(assetIdFor({ name: "" })).toBe("asset");
  });

  it("builds a synthetic path from index path and asset id", () => {
    expect(syntheticAssetPath("P/Index.md", "main")).toBe("P/Index.md::main");
  });
});
