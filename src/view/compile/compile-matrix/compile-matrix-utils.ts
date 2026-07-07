import type { Workflow } from "src/compile/steps/abstract-compile-step";
import type { CompileStatus } from "src/compile";

/**
 * Pure logic for the Compile Matrix (the batch-compile progress board). Side-effect
 * free and unit-tested; the Svelte component wires it to `compile()` + the DOM.
 */

/** Per-run batch overrides applied across every draft's workflow before compiling. */
export interface BatchOverrides {
  /** run-pandoc-export `dry-run` (log the command instead of exporting). */
  dryRun?: boolean;
  /** open the PDF after export — run-pandoc-export + write-to-note `open-after`. */
  openAfter?: boolean;
  /** harvest-manuscript-lines `enabled`. */
  harvest?: boolean;
}

/**
 * Return a NEW workflow (cloned steps + optionValues) with the batch overrides
 * applied to the matching steps. The input workflow is never mutated, so a run's
 * overrides don't touch the user's saved workflows.
 */
export function applyBatchOverrides(
  workflow: Workflow,
  o: BatchOverrides
): Workflow {
  const steps = workflow.steps.map((step) => {
    const ov = { ...step.optionValues };
    const id = step.description.canonicalID ?? step.id;
    if (id === "run-pandoc-export") {
      if (o.dryRun !== undefined) ov["dry-run"] = o.dryRun;
      if (o.openAfter !== undefined) ov["open-after"] = o.openAfter;
    } else if (id === "write-to-note") {
      if (o.openAfter !== undefined) ov["open-after"] = o.openAfter;
    } else if (id === "harvest-manuscript-lines") {
      if (o.harvest !== undefined) ov["enabled"] = o.harvest;
    }
    return { ...step, optionValues: ov };
  });
  return { ...workflow, steps };
}

export type RowStatus = "idle" | "running" | "done" | "error" | "skipped";

export interface RowState {
  status: RowStatus;
  /** Index of the step currently running (or that failed). */
  activeStep: number;
  totalSteps?: number;
  error?: string;
}

export const IDLE_ROW: RowState = { status: "idle", activeStep: -1 };

/**
 * Fold a `CompileStatus` from the runner into the next row state. The runner emits
 * a Step event at the START of each step (so `activeStep` is the running one), a
 * single Success at the end, and Error on a throw.
 */
export function statusToRowState(
  status: CompileStatus,
  prev: RowState
): RowState {
  switch (status.kind) {
    case "CompileStatusStep":
      return {
        status: "running",
        activeStep: status.stepIndex,
        totalSteps: status.totalSteps,
      };
    case "CompileStatusSuccess":
      return {
        status: "done",
        activeStep: prev.totalSteps ?? prev.activeStep + 1,
        totalSteps: prev.totalSteps,
      };
    case "CompileStatusError":
      return { ...prev, status: "error", error: status.error };
  }
}

/**
 * A short 2-letter chip for a draft, matching the schematic's MS / SI / RL. Known
 * academic drafts get a mnemonic; anything else falls back to word initials.
 */
export function draftAbbrev(name: string): string {
  const n = (name || "").toLowerCase();
  if (n.includes("supplement")) return "SI";
  if (n.includes("response")) return "RL";
  if (n.includes("cover")) return "CL";
  if (n.includes("manuscript") || n.includes("main")) return "MS";
  const initials = (name || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return initials || "··";
}

/** How far along a row is, 0..1, for the progress-line fill. */
export function rowProgress(state: RowState, totalSteps: number): number {
  if (totalSteps <= 0) return 0;
  if (state.status === "done") return 1;
  if (state.status === "idle" || state.activeStep < 0) return 0;
  // active step is in-flight → fill up to (but not including) it, plus a nudge.
  return Math.min(1, (state.activeStep + 0.5) / totalSteps);
}
