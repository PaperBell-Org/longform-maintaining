import { describe, expect, it } from "vitest";
import {
  applyTargetPlaceholders,
  draftOutputName,
} from "src/compile/steps/write-to-note-utils";
import type { Draft } from "src/model/types";

function makeDraft(overrides: Partial<Draft> = {}): Draft {
  return {
    format: "scenes",
    title: "PaperDraft",
    titleInFrontmatter: true,
    draftTitle: "Main Manuscript",
    vaultPath: "submission-project/Main Manuscript (Index).md",
    workflow: "Default Workflow",
    sceneFolder: "manuscript",
    scenes: [],
    ignoredFiles: [],
    unknownFiles: [],
    sceneTemplate: null,
    ...overrides,
  } as Draft;
}

describe("draftOutputName", () => {
  it("uses draftTitle when present", () => {
    expect(draftOutputName(makeDraft({ draftTitle: "Cover Letter" }))).toBe(
      "Cover Letter"
    );
  });

  it("falls back to the index basename (without .md) when draftTitle is null", () => {
    expect(
      draftOutputName(
        makeDraft({
          draftTitle: null,
          vaultPath: "submission-project/Main Manuscript (Index).md",
        })
      )
    ).toBe("Main Manuscript (Index)");
  });

  it("handles a vaultPath with no folder segment", () => {
    expect(
      draftOutputName(makeDraft({ draftTitle: null, vaultPath: "lonely.md" }))
    ).toBe("lonely");
  });
});

describe("applyTargetPlaceholders", () => {
  it("replaces $2 with the draft name", () => {
    expect(
      applyTargetPlaceholders("compiled/$2.md", makeDraft({ draftTitle: "Cover Letter" }))
    ).toBe("compiled/Cover Letter.md");
  });

  it("replaces $1 with the project title", () => {
    expect(applyTargetPlaceholders("$1.md", makeDraft())).toBe("PaperDraft.md");
  });

  it("replaces both $1 and $2 in one target", () => {
    expect(
      applyTargetPlaceholders(
        "out/$1 - $2.md",
        makeDraft({ title: "PaperDraft", draftTitle: "Response to Reviewers" })
      )
    ).toBe("out/PaperDraft - Response to Reviewers.md");
  });

  it("replaces every occurrence of a token", () => {
    expect(
      applyTargetPlaceholders("$2/$2.md", makeDraft({ draftTitle: "Cover" }))
    ).toBe("Cover/Cover.md");
  });

  it("leaves a target without placeholders untouched", () => {
    expect(applyTargetPlaceholders("manuscript.md", makeDraft())).toBe(
      "manuscript.md"
    );
  });

  it("uses the index basename for $2 when draftTitle is null", () => {
    expect(
      applyTargetPlaceholders(
        "$2.md",
        makeDraft({
          draftTitle: null,
          vaultPath: "project/An Essay.md",
        })
      )
    ).toBe("An Essay.md");
  });

  it("produces distinct names for sibling drafts of the same project", () => {
    const drafts = [
      makeDraft({ draftTitle: "Main Manuscript" }),
      makeDraft({ draftTitle: "Supplementary Materials" }),
      makeDraft({ draftTitle: "Response to Reviewers" }),
      makeDraft({ draftTitle: "Cover Letter" }),
    ];
    const outputs = drafts.map((d) => applyTargetPlaceholders("compiled/$2.md", d));
    expect(new Set(outputs).size).toBe(drafts.length);
    expect(outputs).toEqual([
      "compiled/Main Manuscript.md",
      "compiled/Supplementary Materials.md",
      "compiled/Response to Reviewers.md",
      "compiled/Cover Letter.md",
    ]);
  });
});
