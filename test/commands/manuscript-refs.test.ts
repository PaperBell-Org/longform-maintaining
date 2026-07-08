import { describe, it, expect } from "vitest";
import {
  sectionPrefix,
  slugFromText,
  generateSpanId,
  sanitizeSpanId,
  wrapSelection,
  insertRefText,
  scanSpans,
  existingSpanIds,
  spanDisplay,
} from "src/commands/manuscript-refs-utils";

describe("sectionPrefix", () => {
  it("maps known section names", () => {
    expect(sectionPrefix("Introduction")).toBe("intro");
    expect(sectionPrefix("Methods")).toBe("meth");
    expect(sectionPrefix("Results")).toBe("res");
  });
  it("falls back to first letters, or 'ms' for non-latin", () => {
    expect(sectionPrefix("Historical data")).toBe("hist");
    expect(sectionPrefix("你好")).toBe("ms");
  });
});

describe("slugFromText", () => {
  it("drops citations and stopwords, keeps the first few content words", () => {
    expect(
      slugFromText("Among the many perceptual biases [@pauly1995] that remain")
    ).toBe("among-many-perceptual-biases");
  });
  it("falls back to 'span' when nothing is left", () => {
    expect(slugFromText("the a of and")).toBe("span");
  });
});

describe("generateSpanId", () => {
  it("builds prefix-slug and disambiguates against existing ids", () => {
    expect(generateSpanId("Introduction", "shifting baseline syndrome", [])).toBe(
      "intro-shifting-baseline-syndrome"
    );
    const taken = ["meth-record-comparison"];
    expect(generateSpanId("Methods", "record comparison", taken)).toBe(
      "meth-record-comparison-2"
    );
    expect(
      generateSpanId("Methods", "record comparison", [
        "meth-record-comparison",
        "meth-record-comparison-2",
      ])
    ).toBe("meth-record-comparison-3");
  });
});

describe("sanitizeSpanId", () => {
  it("keeps [\\w-], collapses/trims separators", () => {
    expect(sanitizeSpanId("  intro sbs! def  ")).toBe("intro-sbs-def");
  });
});

describe("wrap / insert text", () => {
  it("wraps a selection with paired markers", () => {
    expect(wrapSelection("hello", "intro-x")).toBe(
      "<!--ms:intro-x-->hello<!--/ms:intro-x-->"
    );
  });
  it("builds the manuscript fence", () => {
    expect(insertRefText("intro-x")).toBe("```manuscript\n@intro-x\n```\n");
  });
});

describe("scanSpans / existingSpanIds", () => {
  const files = [
    {
      name: "Introduction",
      content:
        "Foo <!--ms:intro-sbs-->Shifting  baseline\nsyndrome<!--/ms:intro-sbs--> bar. " +
        "<!--ms:intro-two-->second<!--/ms:intro-two-->",
    },
    { name: "Methods", content: "no spans here" },
  ];
  it("extracts paired spans with collapsed preview, sorted by id", () => {
    const spans = scanSpans(files);
    expect(spans.map((s) => s.id)).toEqual(["intro-sbs", "intro-two"]);
    expect(spans[0]).toEqual({
      id: "intro-sbs",
      preview: "Shifting baseline syndrome",
      file: "Introduction",
    });
  });
  it("collects existing ids as a set", () => {
    expect([...existingSpanIds(files)].sort()).toEqual([
      "intro-sbs",
      "intro-two",
    ]);
  });
  it("does not match mismatched open/close ids (backreference)", () => {
    expect(
      scanSpans([{ name: "x", content: "<!--ms:a-->t<!--/ms:b-->" }])
    ).toEqual([]);
  });
});

describe("spanDisplay", () => {
  it("truncates long previews", () => {
    const long = "x".repeat(80);
    const d = spanDisplay({ id: "meth-1", preview: long, file: "Methods" });
    expect(d.startsWith("meth-1 — ")).toBe(true);
    expect(d.endsWith("…")).toBe(true);
  });
});
