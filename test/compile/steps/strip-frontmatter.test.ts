import { describe, expect, it } from "vitest";
import { StripFrontmatterStep } from "src/compile/steps/strip-frontmatter";
import {
  CompileStepKind,
  type CompileContext,
  type CompileManuscriptInput,
  type CompileSceneInput,
} from "src/compile/steps/abstract-compile-step";

/**
 * The step reads nothing from the context but `kind`, so a cast is honest here —
 * building a whole App/Draft would only obscure what is under test.
 */
function context(kind: CompileStepKind): CompileContext {
  return { kind } as CompileContext;
}

/**
 * A scaffolded draft index note: the `project:` key #25 added sits OUTSIDE the
 * `longform:` block, as a plain top-level key. This asserts what that change's
 * plan could not close by unit test — that the new key leaves with the rest of
 * the frontmatter and reaches no compiled output.
 */
const INDEX_NOTE = [
  "---",
  "longform:",
  "  format: scenes",
  "  title: Sea Level Memory",
  "  draftTitle: Main Manuscript",
  "  workflow: PaperBell Manuscript",
  "  sceneFolder: manuscript",
  "  scenes:",
  "    - introduction",
  "  ignoredFiles: []",
  "project: ColMemo",
  "---",
  "",
  "# Introduction",
  "",
  "Body text mentioning nothing sensitive.",
  "",
].join("\n");

function scene(contents: string): CompileSceneInput {
  return {
    path: "Sea Level Memory/Main Manuscript.md",
    name: "Main Manuscript",
    contents,
    metadata: {} as CompileSceneInput["metadata"],
    indentationLevel: 0,
    numbering: [1],
  };
}

describe("Strip Frontmatter", () => {
  it("strips the whole block, top-level `project:` included, from a scene", () => {
    const [out] = StripFrontmatterStep.compile(
      [scene(INDEX_NOTE)],
      context(CompileStepKind.Scene)
    ) as CompileSceneInput[];

    expect(out.contents).not.toContain("project:");
    expect(out.contents).not.toContain("ColMemo");
    expect(out.contents).not.toContain("longform:");
    expect(out.contents.trim()).toBe(
      "# Introduction\n\nBody text mentioning nothing sensitive."
    );
  });

  it("strips it from a joined manuscript too", () => {
    const out = StripFrontmatterStep.compile(
      { contents: INDEX_NOTE },
      context(CompileStepKind.Manuscript)
    ) as CompileManuscriptInput;

    expect(out.contents).not.toContain("ColMemo");
    expect(out.contents.trim()).toBe(
      "# Introduction\n\nBody text mentioning nothing sensitive."
    );
  });

  it("leaves a `project:` written in the body alone", () => {
    // Only the frontmatter block goes; prose that happens to say the word stays.
    const out = StripFrontmatterStep.compile(
      { contents: "---\nproject: ColMemo\n---\n\nWe call the project: ColMemo.\n" },
      context(CompileStepKind.Manuscript)
    ) as CompileManuscriptInput;

    expect(out.contents.trim()).toBe("We call the project: ColMemo.");
  });
});
