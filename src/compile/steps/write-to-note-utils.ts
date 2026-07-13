import type { Draft } from "src/model/types";
import { draftIndexPath } from "src/model/project-resources";

/**
 * The per-draft name used by the `$2` placeholder in the Save-as-Note output path.
 * Uses the draft's explicit `draftTitle` when set, otherwise falls back to the
 * index file's basename (without the `.md` extension) so the name is always
 * distinct across the drafts of a project. Uses the real index path, never the
 * synthetic `vaultPath` of a project asset.
 */
export function draftOutputName(draft: Draft): string {
  const indexBasename = (draftIndexPath(draft).split("/").pop() ?? "").replace(
    /\.md$/,
    ""
  );
  return draft.draftTitle ?? indexBasename;
}

/**
 * Substitutes the Save-as-Note output-path placeholders for a given draft:
 *   - `$1` → the project title (shared across a project's drafts)
 *   - `$2` → this draft's name (see {@link draftOutputName})
 * All occurrences of each token are replaced.
 */
export function applyTargetPlaceholders(target: string, draft: Draft): string {
  const draftName = draftOutputName(draft);
  return target.split("$2").join(draftName).split("$1").join(draft.title);
}
