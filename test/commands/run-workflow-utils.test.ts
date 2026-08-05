import { describe, expect, it } from "vitest";

import {
  draftsForNote,
  draftsRunnableBy,
  ephemeralDraftForNote,
  isExportableNote,
  resolveEphemeralProjectRoot,
  workflowCommandId,
} from "src/commands/run-workflow-utils";
import { DEFAULT_WORKFLOWS } from "src/compile";
import { deserializeWorkflow } from "src/compile/serialization";
import { PLACEHOLDER_MISSING_STEP } from "src/compile/steps/abstract-compile-step";
import type { Draft } from "src/model/types";

function singleDraft(vaultPath: string, title: string): Draft {
  return {
    format: "single",
    title,
    titleInFrontmatter: false,
    draftTitle: null,
    vaultPath,
    workflow: null,
  };
}

function scenesDraft(vaultPath: string, title: string): Draft {
  return {
    format: "scenes",
    title,
    titleInFrontmatter: false,
    draftTitle: null,
    vaultPath,
    workflow: null,
    sceneFolder: "Scenes",
    scenes: [{ title: "One", indent: 0 }],
    ignoredFiles: [],
    unknownFiles: [],
    sceneTemplate: null,
  };
}

const builtinWorkflow = (name: string) =>
  deserializeWorkflow(DEFAULT_WORKFLOWS[name]);

describe("workflowCommandId", () => {
  it("percent-encodes the workflow name", () => {
    expect(workflowCommandId("PaperBell Manuscript")).toBe(
      "run-workflow-PaperBell%20Manuscript"
    );
  });

  it("never emits a colon", () => {
    // Obsidian registers commands as `<plugin id>:<command id>` and splits on
    // the colon to find the owning plugin, so a colon here makes ids collide.
    const names = [
      "PaperBell Manuscript",
      "Draft: final",
      "a:b:c",
      "工作流：手稿",
    ];
    for (const name of names) {
      expect(workflowCommandId(name)).not.toContain(":");
    }
  });

  it("keeps names distinct that a slug would collapse", () => {
    // Slugifying would map all three onto one id and silently make two of the
    // workflows unreachable from the command palette.
    const ids = [
      "PaperBell Manuscript",
      "PaperBell-Manuscript",
      "paperbell manuscript",
    ].map(workflowCommandId);
    expect(new Set(ids).size).toBe(3);
  });

  it("produces ids safe for an Obsidian command id", () => {
    expect(workflowCommandId("Cover Letter (v2)!")).toMatch(
      /^run-workflow-[A-Za-z0-9\-_.~%]+$/
    );
  });
});

describe("draftsRunnableBy", () => {
  it("drops a scenes draft for a Manuscript-first workflow", () => {
    // Quick Export cannot take a scene list; the caller falls back to exporting
    // the open note instead of failing validation with BadFirstStep.
    const candidates = [scenesDraft("Papers/Alpha/Alpha.md", "Alpha")];
    expect(draftsRunnableBy(candidates, builtinWorkflow("Quick Export"))).toEqual(
      []
    );
  });

  it("keeps a single-file draft for a Manuscript-first workflow", () => {
    const candidates = [singleDraft("Papers/Alpha/Cover Letter.md", "Alpha")];
    expect(
      draftsRunnableBy(candidates, builtinWorkflow("PaperBell Cover Letter"))
    ).toEqual(candidates);
  });

  it("keeps every candidate for a workflow that starts on scenes", () => {
    const candidates = [
      scenesDraft("Papers/Alpha/Alpha.md", "Alpha"),
      singleDraft("Papers/Alpha/SI.md", "Alpha"),
    ];
    expect(
      draftsRunnableBy(candidates, builtinWorkflow("PaperBell Manuscript"))
    ).toEqual(candidates);
  });

  it("leaves a workflow that fails validation for another reason alone", () => {
    // An unloaded first step offers no kinds either, but it must report its own
    // UnloadedStep error rather than being silently rerouted to the open note.
    const broken = {
      name: "Broken",
      description: "",
      steps: [PLACEHOLDER_MISSING_STEP],
    };
    const candidates = [scenesDraft("Papers/Alpha/Alpha.md", "Alpha")];
    expect(draftsRunnableBy(candidates, broken)).toEqual(candidates);
  });
});

describe("resolveEphemeralProjectRoot", () => {
  const drafts = [
    singleDraft("Papers/Alpha/Alpha.md", "Alpha"),
    singleDraft("Papers/Alpha/SI/Alpha SI.md", "Alpha"),
    singleDraft("Papers/Beta/Beta.md", "Beta"),
  ];

  it("returns undefined — never '' — for a note outside every project", () => {
    // "" would make projectResourceCandidatePaths walk to the vault root, so a
    // loose note could pick up an unrelated metadata.json or references.bib.
    // Steps fall back with `?? projectPath`, which does not catch "".
    expect(resolveEphemeralProjectRoot("Inbox/loose.md", drafts)).toBeUndefined();
  });

  it("returns the enclosing project's root", () => {
    expect(resolveEphemeralProjectRoot("Papers/Alpha/notes.md", drafts)).toBe(
      "Papers/Alpha"
    );
  });

  it("prefers the innermost enclosing project", () => {
    expect(
      resolveEphemeralProjectRoot("Papers/Alpha/SI/notes.md", drafts)
    ).toBe("Papers/Alpha");
  });

  it("does not treat a sibling with a shared name prefix as an ancestor", () => {
    const alphabet = [singleDraft("Papers/Alph/Alph.md", "Alph")];
    expect(
      resolveEphemeralProjectRoot("Papers/Alphabet/notes.md", alphabet)
    ).toBeUndefined();
  });

  it("returns undefined for a note at the vault root", () => {
    expect(resolveEphemeralProjectRoot("loose.md", drafts)).toBeUndefined();
  });
});

describe("ephemeralDraftForNote", () => {
  it("wraps a note as a single-file draft whose own path is the body", () => {
    const draft = ephemeralDraftForNote("Papers/Alpha/cover.md", "Cover Letter");
    expect(draft.format).toBe("single");
    expect(draft.title).toBe("cover");
    expect(draft.vaultPath).toBe("Papers/Alpha/cover.md");
    expect(draft.workflow).toBe("Cover Letter");
    // compile() reads `bodyPath ?? vaultPath`; a null bodyPath means "read me".
    expect(draft.format === "single" && draft.bodyPath).toBeNull();
    expect(draft.indexPath).toBeNull();
  });

  it("keeps dots in the basename", () => {
    expect(ephemeralDraftForNote("v1.2 notes.md", "W").title).toBe("v1.2 notes");
  });
});

describe("isExportableNote", () => {
  it("accepts markdown and rejects everything else", () => {
    expect(isExportableNote({ extension: "md" })).toBe(true);
    expect(isExportableNote({ extension: "pdf" })).toBe(false);
    expect(isExportableNote({ extension: "canvas" })).toBe(false);
    expect(isExportableNote(null)).toBe(false);
  });
});

describe("draftsForNote", () => {
  const legacy = singleDraft("Papers/Solo/Solo.md", "Solo");

  // One `format: project` index expands into several drafts that all share the
  // same indexPath — the case a first-match lookup gets wrong.
  const asset = (name: string, file: string, workflow: string | null): Draft => ({
    format: "single",
    title: "Alpha",
    titleInFrontmatter: false,
    draftTitle: name,
    vaultPath: `Papers/Alpha/Alpha (Index).md::${name}`,
    indexPath: "Papers/Alpha/Alpha (Index).md",
    bodyPath: file,
    assetId: name,
    workflow,
  });
  const manuscript = asset("Main", "Papers/Alpha/Main.md", "PaperBell Manuscript");
  const response = asset("Response", "Papers/Alpha/Response.md", "PaperBell Response Letter");
  const all = [legacy, manuscript, response];

  it("matches a legacy draft by its own path", () => {
    expect(draftsForNote("Papers/Solo/Solo.md", all)).toEqual([legacy]);
  });

  it("matches a project asset by its external body note", () => {
    expect(draftsForNote("Papers/Alpha/Response.md", all)).toEqual([response]);
  });

  it("returns every asset sharing an index note, not just the first", () => {
    // Taking [0] here would silently compile the manuscript when the user asked
    // for the response letter.
    expect(draftsForNote("Papers/Alpha/Alpha (Index).md", all)).toEqual([
      manuscript,
      response,
    ]);
  });

  it("returns nothing for a note that belongs to no draft", () => {
    expect(draftsForNote("Inbox/loose.md", all)).toEqual([]);
  });
});
