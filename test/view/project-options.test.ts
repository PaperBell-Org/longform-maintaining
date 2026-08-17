import { describe, it, expect } from "vitest";

import { projectOptions } from "src/view/project-lifecycle/new-paper-modal/project-options";
import type { PPBProject } from "src/paperbell/shared-config";

const project = (p: Partial<PPBProject>): PPBProject => ({
  id: "id",
  name: "Name",
  ...p,
});

describe("projectOptions", () => {
  it("uses the acronym as the value and shows the name alongside it", () => {
    // The value is what lands in `project:` frontmatter — the acronym is the
    // interop key, not the display name.
    expect(
      projectOptions([
        project({ id: "p1", name: "Collective Memory", acronym: "ColMemo" }),
      ])
    ).toEqual([{ value: "ColMemo", label: "Collective Memory (ColMemo)" }]);
  });

  it("falls back to the name when the host omits the acronym", () => {
    // `acronym` is optional in the contract; dropping such a project would hide
    // it from the user with no explanation.
    expect(projectOptions([project({ name: "Sea Level" })])).toEqual([
      { value: "Sea Level", label: "Sea Level" },
    ]);
  });

  it("drops entries with nothing usable", () => {
    // An option that writes an empty `project:` is worse than an absent one.
    expect(
      projectOptions([
        project({ name: "", acronym: "" }),
        project({ name: "   ", acronym: "  " }),
        project({ name: "Real", acronym: "R" }),
      ])
    ).toEqual([{ value: "R", label: "Real (R)" }]);
  });

  it("trims whitespace around the value", () => {
    expect(projectOptions([project({ name: "X", acronym: "  ColMemo " })])).toEqual(
      [{ value: "ColMemo", label: "X (ColMemo)" }]
    );
  });

  it("sorts by label so the dropdown order does not follow host internals", () => {
    const labels = projectOptions([
      project({ id: "3", name: "Zebra", acronym: "Z" }),
      project({ id: "1", name: "Alpha", acronym: "A" }),
      project({ id: "2", name: "Mango", acronym: "M" }),
    ]).map((o) => o.label);

    expect(labels).toEqual(["Alpha (A)", "Mango (M)", "Zebra (Z)"]);
  });

  it("returns an empty list for an empty input", () => {
    expect(projectOptions([])).toEqual([]);
  });

  it("never produces a value that could collide with the manual-entry sentinel", () => {
    // The modal's MANUAL_ENTRY sentinel is a space-prefixed string, and its safety
    // rests on this guarantee holding here. Relaxing the trim without noticing
    // would let a host-supplied project hijack the "type it myself" option.
    const values = projectOptions([
      project({ name: " leading", acronym: " lead " }),
      project({ name: " spaced name only" }),
      project({ name: "Normal", acronym: "N" }),
    ]).map((o) => o.value);

    expect(values.length).toBeGreaterThan(0);
    for (const value of values) {
      expect(value, JSON.stringify(value)).toBe(value.trim());
      expect(value.startsWith(" "), JSON.stringify(value)).toBe(false);
    }
  });
});
