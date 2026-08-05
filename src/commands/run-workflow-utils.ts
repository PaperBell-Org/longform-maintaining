import type { Draft } from "src/model/types";
import {
  draftIndexFolder,
  draftIndexPath,
  draftParentFolder,
  projectRootPath,
} from "src/model/project-resources";
import { findScene } from "src/model/scene-navigation";
import { calculateWorkflow, WorkflowError } from "src/compile";
import type { Workflow } from "src/compile/steps/abstract-compile-step";

/** Is this a note a workflow can be run against? */
export function isExportableNote(file: { extension: string } | null): boolean {
  return !!file && file.extension === "md";
}

/**
 * Every draft the given note belongs to.
 *
 * Returns *all* matches, unlike `draftForPath`: the assets of a
 * `format: project` index share one index file, so an active index note maps to
 * several drafts and taking the first would silently compile the wrong asset.
 */
export function draftsForNote(path: string, allDrafts: Draft[]): Draft[] {
  const direct = allDrafts.filter(
    (d) =>
      d.vaultPath === path ||
      draftIndexPath(d) === path ||
      (d.format === "single" && d.bodyPath === path)
  );
  if (direct.length > 0) {
    return direct;
  }
  const scene = findScene(path, allDrafts);
  return scene ? [scene.draft] : [];
}

/**
 * The candidates this workflow can actually compile.
 *
 * A workflow that cannot start on a scene list — Quick Export and Cover Letter,
 * whose lone step is Manuscript-only — has no valid multi-scene target, and
 * `draftsForNote` resolves any scene of a project to that project's scenes
 * draft. Dropping those candidates lets the caller fall back to the ephemeral
 * single-file draft: "export the note you have open" is Quick Export's whole
 * premise, and it now holds inside a project as well as outside one.
 *
 * The verdict comes from `calculateWorkflow` rather than a copy of its first-step
 * rule, so a workflow that fails validation for some *other* reason (an unloaded
 * step, say) is left alone and reports its own error.
 *
 * Only scenes drafts are dropped: a single-file draft runs such a workflow fine
 * and keeps its project context (metadata.json, references.bib, title).
 */
export function draftsRunnableBy(
  candidates: Draft[],
  workflow: Workflow
): Draft[] {
  // A multi-scene draft never has Join steps stripped, so the workflow is its
  // own `effectiveWorkflow` here.
  const [validation] = calculateWorkflow(workflow, true);
  return validation.error === WorkflowError.BadFirstStep
    ? candidates.filter((d) => d.format !== "scenes")
    : candidates;
}

/**
 * The Obsidian command id for the "run this workflow" command of a workflow.
 *
 * The name is percent-encoded rather than slugified or used verbatim, for two
 * reasons:
 *
 *  - **No colons.** Obsidian registers the command as
 *    `<plugin id>:<command id>` and splits on the colon to find the owning
 *    plugin, so a colon inside the command id makes ids collide.
 *  - **No lossy collapsing.** Slugifying would map "PaperBell Manuscript",
 *    "PaperBell-Manuscript", and "paperbell manuscript" onto one id, silently
 *    making all but one of them unreachable. Percent-encoding is injective.
 *
 * The id is not user-facing — the command palette and hotkeys page show the
 * command's *name* — so readability here costs nothing.
 *
 * Because the id is derived from the name, renaming a workflow loses any hotkey
 * bound to it; `Workflow` has no stable id to key off of.
 */
export function workflowCommandId(name: string): string {
  // encodeURIComponent leaves !'()* alone; escape them too so nothing but
  // [A-Za-z0-9-_.~%] survives.
  const encoded = encodeURIComponent(name).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
  return `run-workflow-${encoded}`;
}

/** `true` if `folder` is `ancestor` or lives inside it. Segment-wise, so that
 * `Papers/Foo` is not treated as an ancestor of `Papers/Foobar`. */
function isAncestorFolder(ancestor: string, folder: string): boolean {
  const a = ancestor.split("/").filter((s) => s.length > 0);
  const f = folder.split("/").filter((s) => s.length > 0);
  return a.length <= f.length && a.every((s, i) => s === f[i]);
}

/**
 * The project root to use when compiling a note that is not itself a draft: the
 * root of the innermost project the note happens to sit inside, or `undefined`
 * when it sits inside none.
 *
 * `undefined` — never `""` — is the fallback, because steps resolve shared
 * resources with `context.projectRoot ?? context.projectPath` and `??` does not
 * catch the empty string. An empty root makes `projectResourceCandidatePaths`
 * walk all the way to the vault root, so a loose note in `Inbox/` would pick up
 * an unrelated `metadata.json` or `references.bib` and quietly stamp another
 * paper's authors and DOI onto the export. Returning `undefined` restricts the
 * search to the note's own folder, which is the documented conservative default.
 */
export function resolveEphemeralProjectRoot(
  notePath: string,
  drafts: Draft[]
): string | undefined {
  const noteFolder = draftParentFolder(notePath);

  let best: Draft | null = null;
  let bestDepth = -1;
  for (const draft of drafts) {
    const folder = draftIndexFolder(draft);
    if (!isAncestorFolder(folder, noteFolder)) {
      continue;
    }
    const depth = folder.split("/").filter((s) => s.length > 0).length;
    if (depth > bestDepth) {
      best = draft;
      bestDepth = depth;
    }
  }

  if (!best) {
    return undefined;
  }

  const root = projectRootPath(drafts.filter((d) => d.title === best.title));
  // A project whose drafts share no common folder yields "" (the vault root),
  // which is exactly the over-broad search this function exists to avoid.
  return root === "" ? undefined : root;
}

/**
 * An ephemeral single-file draft wrapping an arbitrary note, so a plain markdown
 * file can be compiled without first being turned into a Longform project. Not
 * added to any store — it exists only for the duration of one compile.
 */
export function ephemeralDraftForNote(
  notePath: string,
  workflowName: string
): Draft {
  const basename = (notePath.split("/").pop() ?? notePath).replace(/\.md$/, "");
  return {
    format: "single",
    title: basename,
    titleInFrontmatter: false,
    draftTitle: null,
    vaultPath: notePath,
    workflow: workflowName,
    indexPath: null,
    // `vaultPath` is itself the body; compile() reads `bodyPath ?? vaultPath`.
    bodyPath: null,
    assetId: null,
  };
}
