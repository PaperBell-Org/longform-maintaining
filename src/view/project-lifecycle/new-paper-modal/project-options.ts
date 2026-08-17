import type { PPBProject } from "src/paperbell/shared-config";

/** One entry of the project dropdown. */
export interface ProjectOption {
  /** What lands in the note's `project:` frontmatter. */
  value: string;
  /** What the dropdown shows. */
  label: string;
}

/**
 * Turn the host's project list into dropdown options.
 *
 * Kept pure and DOM-free so the interesting parts — which field becomes the
 * frontmatter value, and what happens to a project the host returned without an
 * acronym — are unit-testable without an Obsidian environment.
 *
 * `acronym` is the interop key (see docs/PROPOSAL_PROJECTS_SCOPE.md), but it is
 * optional in the contract, so we fall back to the name rather than silently
 * dropping the project. Entries with nothing usable at all are dropped: an option
 * that would write an empty `project:` is worse than an absent one.
 */
export function projectOptions(projects: PPBProject[]): ProjectOption[] {
  return projects
    .map((project) => {
      const value = (project.acronym || project.name || "").trim();
      const name = (project.name || "").trim();
      return {
        value,
        label: name && value !== name ? `${name} (${value})` : value,
      };
    })
    .filter((option) => option.value.length > 0)
    .sort((a, b) => a.label.localeCompare(b.label));
}
