import type { Workflow } from "./steps/abstract-compile-step";

/**
 * The canonical id of the only built-in Join step. {@link stripJoinStepsForSingle}
 * matches on it exactly rather than on "this step is Join-only" — see the note there.
 */
export const CONCATENATE_TEXT_ID = "concatenate-text";

/**
 * A copy of `workflow` with Join steps removed, for compiling a single-file draft.
 *
 * `compile()` feeds a single-format draft a one-element input array and keeps it
 * that way, unwrapping and rewrapping around Manuscript steps. There is nothing
 * to concatenate, and letting a Join step run would replace the array with a
 * bare `{ contents }` that the next Manuscript step would index into and crash
 * on. Dropping the step is the equivalent no-op, and it lets the PaperBell
 * workflows (three of the four contain `concatenate-text`) run against a single
 * note instead of failing validation with `WorkflowError.JoinForSingle`.
 *
 * Matches `concatenate-text` by canonical id on purpose: a user script step may
 * also declare a Join-only kind, and silently dropping someone's custom step
 * would be a far worse surprise than a validation error.
 *
 * Deliberately silent: this runs inside the compile pane's reactive block, which
 * re-evaluates on every keystroke in the workflow description field, so logging
 * here would flood the console. The skip is already visible — the pane's step
 * count and `compile()`'s own per-step logging both reflect the reduced list.
 */
export function stripJoinStepsForSingle(workflow: Workflow): Workflow {
  const steps = workflow.steps.filter(
    (s) => s.description.canonicalID !== CONCATENATE_TEXT_ID
  );
  return steps.length === workflow.steps.length ? workflow : { ...workflow, steps };
}

/**
 * The workflow to actually run for a draft of this shape. Pair this with
 * `calculateWorkflow(effective, isMultiScene)` and pass the same `effective`
 * workflow to `compile()` — every call site must agree, or a workflow would
 * validate in one place and fail in another.
 */
export function effectiveWorkflow(
  workflow: Workflow,
  isMultiScene: boolean
): Workflow {
  return isMultiScene ? workflow : stripJoinStepsForSingle(workflow);
}

/**
 * For each step of `effective`, its index in `original`. Relies on the stripped
 * workflow reusing the very same step objects, which `stripJoinStepsForSingle`
 * guarantees (it filters, never clones).
 */
function originalStepIndices(original: Workflow, effective: Workflow): number[] {
  if (effective === original) {
    return original.steps.map((_s, i) => i);
  }
  const indices: number[] = [];
  let e = 0;
  for (let o = 0; o < original.steps.length && e < effective.steps.length; o++) {
    if (original.steps[o] === effective.steps[e]) {
      indices.push(o);
      e++;
    }
  }
  return indices;
}

/**
 * Re-align per-step results computed against `effective` back onto `original`'s
 * step list, with `null` where a step was skipped. The compile pane edits and
 * renders the original workflow, so anything derived from the effective one
 * (step kinds, error positions) has to be mapped back or it will label the
 * wrong rows.
 */
export function alignToOriginalSteps<T>(
  original: Workflow,
  effective: Workflow,
  values: T[]
): (T | null)[] {
  const indices = originalStepIndices(original, effective);
  const aligned: (T | null)[] = original.steps.map(() => null);
  indices.forEach((originalIndex, effectiveIndex) => {
    if (effectiveIndex < values.length) {
      aligned[originalIndex] = values[effectiveIndex];
    }
  });
  return aligned;
}

/** A step position reported against `effective`, expressed against `original`. */
export function alignStepPosition(
  original: Workflow,
  effective: Workflow,
  position: number
): number {
  const indices = originalStepIndices(original, effective);
  return position < indices.length ? indices[position] : position;
}
