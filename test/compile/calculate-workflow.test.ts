import { describe, expect, it } from "vitest";

import {
  DEFAULT_WORKFLOWS,
  WorkflowError,
  calculateWorkflow,
} from "src/compile";
import { deserializeWorkflow } from "src/compile/serialization";
import { CompileStepKind } from "src/compile/steps/abstract-compile-step";
import { effectiveWorkflow } from "src/compile/workflow-for-draft";

const manuscript = () =>
  deserializeWorkflow(DEFAULT_WORKFLOWS["PaperBell Manuscript"]);
const coverLetter = () =>
  deserializeWorkflow(DEFAULT_WORKFLOWS["PaperBell Cover Letter"]);

describe("calculateWorkflow for single-file drafts", () => {
  it("rejects the untouched PaperBell Manuscript workflow", () => {
    // The workflow contains concatenate-text, and a single draft has nothing to
    // join. This is the wall that used to make single-file export impossible.
    const [validation] = calculateWorkflow(manuscript(), false);
    expect(validation.error).toBe(WorkflowError.JoinForSingle);
  });

  it("accepts it once the Join step is stripped", () => {
    const workflow = effectiveWorkflow(manuscript(), false);
    const [validation, kinds] = calculateWorkflow(workflow, false);

    expect(validation.error).toBe(WorkflowError.Valid);
    expect(kinds).toHaveLength(workflow.steps.length);
    // Everything a single draft runs is either a Scene or a Manuscript step;
    // compile() has no Join branch for the single-input case.
    expect(kinds).not.toContain(CompileStepKind.Join);
  });

  it("assigns Scene to steps that offer both kinds, Manuscript to the rest", () => {
    const workflow = effectiveWorkflow(manuscript(), false);
    const [, kinds] = calculateWorkflow(workflow, false);

    workflow.steps.forEach((step, i) => {
      const expected = step.description.availableKinds.includes(
        CompileStepKind.Scene
      )
        ? CompileStepKind.Scene
        : CompileStepKind.Manuscript;
      expect(kinds[i]).toBe(expected);
    });
  });

  it("leaves a join-free workflow alone", () => {
    const workflow = effectiveWorkflow(coverLetter(), false);
    const [validation, kinds] = calculateWorkflow(workflow, false);
    expect(validation.error).toBe(WorkflowError.Valid);
    expect(kinds).toEqual([CompileStepKind.Manuscript]);
  });
});

describe("calculateWorkflow for multi-scene drafts", () => {
  it("keeps the Join step and the pre/post-join kinds", () => {
    const workflow = effectiveWorkflow(manuscript(), true);
    const [validation, kinds] = calculateWorkflow(workflow, true);

    expect(validation.error).toBe(WorkflowError.Valid);
    const joinIndex = workflow.steps.findIndex(
      (s) => s.description.canonicalID === "concatenate-text"
    );
    expect(joinIndex).toBeGreaterThan(-1);
    expect(kinds[joinIndex]).toBe(CompileStepKind.Join);
    expect(kinds.slice(0, joinIndex)).toEqual(
      kinds.slice(0, joinIndex).map(() => CompileStepKind.Scene)
    );
    expect(kinds.slice(joinIndex + 1)).toEqual(
      kinds.slice(joinIndex + 1).map(() => CompileStepKind.Manuscript)
    );
  });
});
