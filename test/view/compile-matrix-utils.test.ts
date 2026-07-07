import { describe, it, expect } from "vitest";
import {
  applyBatchOverrides,
  statusToRowState,
  draftAbbrev,
  rowProgress,
  IDLE_ROW,
  type RowState,
} from "src/view/compile/compile-matrix/compile-matrix-utils";

// Minimal Workflow/step fixtures (only the fields the utils read).
function step(canonicalID: string, optionValues: Record<string, unknown> = {}) {
  return {
    id: canonicalID,
    description: { canonicalID },
    optionValues,
    compile: (a: unknown) => a,
  } as never;
}
function workflow(steps: unknown[]) {
  return { name: "w", description: "", steps } as never;
}

describe("applyBatchOverrides", () => {
  const wf = workflow([
    step("strip-frontmatter"),
    step("write-to-note", { target: "x.md", "open-after": true }),
    step("run-pandoc-export", { "dry-run": false, "open-after": true, template: "" }),
    step("harvest-manuscript-lines", { enabled: true }),
  ]);

  it("overrides the matching step options", () => {
    const out = applyBatchOverrides(wf, {
      dryRun: true,
      openAfter: false,
      harvest: false,
    });
    const byId = (id: string) =>
      out.steps.find((s: never) => (s as { id: string }).id === id) as never as {
        optionValues: Record<string, unknown>;
      };
    expect(byId("run-pandoc-export").optionValues["dry-run"]).toBe(true);
    expect(byId("run-pandoc-export").optionValues["open-after"]).toBe(false);
    expect(byId("write-to-note").optionValues["open-after"]).toBe(false);
    expect(byId("harvest-manuscript-lines").optionValues["enabled"]).toBe(false);
  });

  it("is non-destructive (original workflow untouched)", () => {
    const before = JSON.parse(
      JSON.stringify((wf as never as { steps: unknown[] }).steps)
    );
    applyBatchOverrides(wf, { dryRun: true, openAfter: false, harvest: false });
    expect(
      JSON.parse(JSON.stringify((wf as never as { steps: unknown[] }).steps))
    ).toEqual(before);
  });

  it("only touches specified overrides (undefined leaves values)", () => {
    const out = applyBatchOverrides(wf, { dryRun: true });
    const rpe = out.steps.find(
      (s: never) => (s as { id: string }).id === "run-pandoc-export"
    ) as never as { optionValues: Record<string, unknown> };
    expect(rpe.optionValues["dry-run"]).toBe(true);
    expect(rpe.optionValues["open-after"]).toBe(true); // unchanged
  });
});

describe("statusToRowState", () => {
  it("Step → running with the active index + total", () => {
    expect(
      statusToRowState(
        { kind: "CompileStatusStep", stepIndex: 2, totalSteps: 5 } as never,
        IDLE_ROW
      )
    ).toEqual({ status: "running", activeStep: 2, totalSteps: 5 });
  });
  it("Success → done", () => {
    const prev: RowState = { status: "running", activeStep: 4, totalSteps: 5 };
    expect(statusToRowState({ kind: "CompileStatusSuccess" } as never, prev)).toEqual(
      { status: "done", activeStep: 5, totalSteps: 5 }
    );
  });
  it("Error → error, keeps the failed step", () => {
    const prev: RowState = { status: "running", activeStep: 3, totalSteps: 5 };
    const out = statusToRowState(
      { kind: "CompileStatusError", error: "boom" } as never,
      prev
    );
    expect(out.status).toBe("error");
    expect(out.activeStep).toBe(3);
    expect(out.error).toBe("boom");
  });
});

describe("draftAbbrev", () => {
  it("maps known academic drafts", () => {
    expect(draftAbbrev("Main Manuscript")).toBe("MS");
    expect(draftAbbrev("Supplementary Information")).toBe("SI");
    expect(draftAbbrev("Response Letter")).toBe("RL");
    expect(draftAbbrev("Cover Letter")).toBe("CL");
  });
  it("falls back to word initials", () => {
    expect(draftAbbrev("Grant Proposal")).toBe("GP");
    expect(draftAbbrev("")).toBe("··");
  });
});

describe("rowProgress", () => {
  it("0 when idle, 1 when done, fractional while running", () => {
    expect(rowProgress(IDLE_ROW, 4)).toBe(0);
    expect(rowProgress({ status: "done", activeStep: 4, totalSteps: 4 }, 4)).toBe(1);
    expect(
      rowProgress({ status: "running", activeStep: 1, totalSteps: 4 }, 4)
    ).toBeCloseTo(0.375);
  });
});
