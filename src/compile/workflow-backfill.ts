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
