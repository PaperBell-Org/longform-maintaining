import { describe, expect, it } from "vitest";

import {
  CompileStepKind,
  type CompileStep,
  type Workflow,
} from "src/compile/steps/abstract-compile-step";
import {
  alignStepPosition,
  alignToOriginalSteps,
  effectiveWorkflow,
  stripJoinStepsForSingle,
} from "src/compile/workflow-for-draft";

function step(
  canonicalID: string,
  availableKinds: CompileStepKind[],
  isScript = false
): CompileStep {
  return {
    id: `${canonicalID}-1`,
    description: {
      canonicalID,
      name: canonicalID,
      description: "",
      isScript,
      availableKinds,
      options: [],
    },
    optionValues: {},
    compile: (input) => input,
  };
}

function workflow(steps: CompileStep[]): Workflow {
  return { name: "Test Workflow", description: "", steps };
}

// A trimmed-down "PaperBell Manuscript": scene work, a join, then manuscript work.
const STRIP = step("strip-frontmatter", [
  CompileStepKind.Scene,
  CompileStepKind.Manuscript,
]);
const JOIN = step("concatenate-text", [CompileStepKind.Join]);
const WRITE = step("write-to-note", [CompileStepKind.Manuscript]);

describe("stripJoinStepsForSingle", () => {
  it("drops the built-in concatenate-text step", () => {
    const result = stripJoinStepsForSingle(workflow([STRIP, JOIN, WRITE]));
    expect(result.steps).toEqual([STRIP, WRITE]);
  });

  it("returns the same object when there is nothing to strip", () => {
    const original = workflow([STRIP, WRITE]);
    expect(stripJoinStepsForSingle(original)).toBe(original);
  });

  it("keeps a user script step even when it is Join-only", () => {
    // Matching on "Join-only kind" instead of the canonical id would silently
    // swallow someone's custom step.
    const scripted = step("my-join-script", [CompileStepKind.Join], true);
    const original = workflow([STRIP, scripted, WRITE]);
    expect(stripJoinStepsForSingle(original).steps).toEqual([
      STRIP,
      scripted,
      WRITE,
    ]);
  });
});

describe("effectiveWorkflow", () => {
  it("leaves a multi-scene workflow untouched", () => {
    const original = workflow([STRIP, JOIN, WRITE]);
    expect(effectiveWorkflow(original, true)).toBe(original);
  });

  it("strips joins for a single-file draft", () => {
    expect(effectiveWorkflow(workflow([STRIP, JOIN, WRITE]), false).steps).toEqual(
      [STRIP, WRITE]
    );
  });
});

describe("alignToOriginalSteps", () => {
  it("puts null where a step was skipped", () => {
    const original = workflow([STRIP, JOIN, WRITE]);
    const effective = stripJoinStepsForSingle(original);
    expect(
      alignToOriginalSteps(original, effective, [
        CompileStepKind.Scene,
        CompileStepKind.Manuscript,
      ])
    ).toEqual([CompileStepKind.Scene, null, CompileStepKind.Manuscript]);
  });

  it("is an identity mapping when nothing was stripped", () => {
    const original = workflow([STRIP, WRITE]);
    expect(alignToOriginalSteps(original, original, ["a", "b"])).toEqual([
      "a",
      "b",
    ]);
  });
});

describe("alignStepPosition", () => {
  it("maps an effective-workflow position back onto the displayed list", () => {
    const original = workflow([STRIP, JOIN, WRITE]);
    const effective = stripJoinStepsForSingle(original);
    expect(alignStepPosition(original, effective, 0)).toBe(0);
    // write-to-note is index 1 after stripping, but index 2 as displayed.
    expect(alignStepPosition(original, effective, 1)).toBe(2);
  });
});
