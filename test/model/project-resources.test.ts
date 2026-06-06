import { describe, expect, it } from "vitest";
import {
  draftParentFolder,
  lowestCommonAncestorFolder,
  projectResourceCandidatePaths,
  projectRootPath,
} from "src/model/project-resources";
import type { Draft } from "src/model/types";

function draftAt(vaultPath: string): Draft {
  return {
    format: "scenes",
    title: "Project",
    titleInFrontmatter: true,
    draftTitle: null,
    vaultPath,
    workflow: "Default Workflow",
    sceneFolder: "/",
    scenes: [],
    ignoredFiles: [],
    unknownFiles: [],
    sceneTemplate: null,
  } as Draft;
}

describe("draftParentFolder", () => {
  it("returns the folder containing the index", () => {
    expect(draftParentFolder("project/draft A/A index.md")).toBe(
      "project/draft A"
    );
  });

  it("returns empty string for a vault-root index", () => {
    expect(draftParentFolder("index.md")).toBe("");
  });
});

describe("lowestCommonAncestorFolder", () => {
  it("finds the common ancestor of sibling folders", () => {
    expect(
      lowestCommonAncestorFolder(["project/draft A", "project/draft B"])
    ).toBe("project");
  });

  it("returns the folder itself when all paths are identical", () => {
    expect(
      lowestCommonAncestorFolder(["submission", "submission", "submission"])
    ).toBe("submission");
  });

  it("returns empty string when there is no shared prefix", () => {
    expect(lowestCommonAncestorFolder(["alpha/x", "beta/y"])).toBe("");
  });

  it("does not treat a partial segment match as common", () => {
    // "project" and "project-two" share characters but not a path segment.
    expect(
      lowestCommonAncestorFolder(["project/a", "project-two/b"])
    ).toBe("");
  });

  it("handles a single folder", () => {
    expect(lowestCommonAncestorFolder(["a/b/c"])).toBe("a/b/c");
  });

  it("returns empty for an empty list", () => {
    expect(lowestCommonAncestorFolder([])).toBe("");
  });
});

describe("projectRootPath", () => {
  it("is the common ancestor of every draft's folder", () => {
    const root = projectRootPath([
      draftAt("project/draft A/A index.md"),
      draftAt("project/draft B/B index.md"),
    ]);
    expect(root).toBe("project");
  });

  it("equals the shared folder when all indexes sit together", () => {
    const root = projectRootPath([
      draftAt("submission/Main (Index).md"),
      draftAt("submission/Cover (Index).md"),
    ]);
    expect(root).toBe("submission");
  });

  it("is the index folder for a single-draft project", () => {
    expect(projectRootPath([draftAt("projects/An Essay.md")])).toBe("projects");
  });
});

describe("projectResourceCandidatePaths", () => {
  it("walks from the draft folder up to the project root, inclusive", () => {
    expect(
      projectResourceCandidatePaths(
        "project/draft A",
        "project",
        "metadata.json"
      )
    ).toEqual([
      "project/draft A/metadata.json",
      "project/draft A/source/metadata.json",
      "project/metadata.json",
      "project/source/metadata.json",
    ]);
  });

  it("stops at the project root and never reaches the vault root", () => {
    const paths = projectResourceCandidatePaths(
      "a/b/c/draft",
      "a/b",
      "metadata.json"
    );
    expect(paths).toContain("a/b/metadata.json");
    expect(paths).not.toContain("a/metadata.json");
    expect(paths).not.toContain("metadata.json");
  });

  it("searches only the start folder when root equals it (no regression)", () => {
    expect(
      projectResourceCandidatePaths("project", "project", "metadata.json")
    ).toEqual(["project/metadata.json", "project/source/metadata.json"]);
  });

  it("searches only the start folder when root is not an ancestor", () => {
    expect(
      projectResourceCandidatePaths("project/a", "elsewhere", "metadata.json")
    ).toEqual([
      "project/a/metadata.json",
      "project/a/source/metadata.json",
    ]);
  });

  it("handles a vault-root resource (empty dirs)", () => {
    expect(projectResourceCandidatePaths("", "", "metadata.json")).toEqual([
      "metadata.json",
      "source/metadata.json",
    ]);
  });

  it("respects a custom base filename", () => {
    expect(
      projectResourceCandidatePaths("p/d", "p", "results.json")
    ).toEqual([
      "p/d/results.json",
      "p/d/source/results.json",
      "p/results.json",
      "p/source/results.json",
    ]);
  });
});
