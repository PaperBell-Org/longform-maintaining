import { describe, expect, it } from "vitest";

import {
  pandocSetupError,
  recoverableKindOf,
  RECOVERABLE_PANDOC_SETUP,
} from "src/compile/recoverable";

describe("recoverable compile failures", () => {
  it("round-trips the tag through the property compile() reads", () => {
    const err = pandocSetupError("missing pandoc");
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe("missing pandoc");
    expect(recoverableKindOf(err)).toBe(RECOVERABLE_PANDOC_SETUP);
  });

  it("reports nothing for ordinary failures", () => {
    const others: unknown[] = [new Error("boom"), null, undefined, "boom", {}];
    for (const other of others) {
      expect(recoverableKindOf(other)).toBeUndefined();
    }
  });

  it("ignores an unrecognized tag value", () => {
    // Guards against a stale or hand-set marker widening into the UI's switch.
    const err = Object.assign(new Error("x"), { longformRecoverable: "nope" });
    expect(recoverableKindOf(err)).toBeUndefined();
  });
});
