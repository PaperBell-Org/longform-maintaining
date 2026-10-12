import type { SerializedWorkflow } from "src/model/types";

/**
 * Merge `incoming` workflows into `existing`, adding only keys that are missing —
 * never overwriting a workflow the user already has (possibly customized).
 * Idempotent. Shared by two callers: back-filling `DEFAULT_WORKFLOWS` on load
 * (`src/main.ts`) and injecting a marketplace bundle's recommended workflows on
 * install. Returns the merged map plus the names that were added (for logging/UI).
 */
export function mergeMissingWorkflows(
  existing: Record<string, SerializedWorkflow>,
  incoming: Record<string, SerializedWorkflow>
): { workflows: Record<string, SerializedWorkflow>; added: string[] } {
  const added = Object.keys(incoming).filter((key) => !(key in existing));
  if (added.length === 0) {
    return { workflows: existing, added };
  }
  const workflows = { ...existing };
  for (const key of added) {
    workflows[key] = incoming[key];
  }
  return { workflows, added };
}

/**
 * Fix option values older defaults saved with the wrong type, so the compile
 * view shows them correctly. Today: the Supplementary Information step's text
 * option `abstract`, once stored as the boolean `true` (#43), which the step
 * already reads as blank but the Abstract field still displays as "true".
 * Returns the input unchanged (same object) when nothing needed fixing.
 */
export function repairWorkflowOptions(
  workflows: Record<string, SerializedWorkflow>
): { workflows: Record<string, SerializedWorkflow>; repaired: string[] } {
  const repaired: string[] = [];
  const out: Record<string, SerializedWorkflow> = {};
  for (const [key, wf] of Object.entries(workflows)) {
    let changed = false;
    const steps = wf.steps.map((step) => {
      const abstract = step.optionValues?.["abstract"];
      if (
        step.id !== "supplementary-info" ||
        abstract === undefined ||
        typeof abstract === "string"
      ) {
        return step;
      }
      changed = true;
      return { ...step, optionValues: { ...step.optionValues, abstract: "" } };
    });
    out[key] = changed ? { ...wf, steps } : wf;
    if (changed) repaired.push(key);
  }
  return { workflows: repaired.length > 0 ? out : workflows, repaired };
}
