import { describe, expect, it } from "vitest";
import {
  buildPlaceholderRegex,
  deepMerge,
  formatPlaceholderValue,
  getByPath,
  parseJsonFileList,
  setByPath,
} from "src/compile/steps/replace-json-placeholders-utils";

describe("getByPath", () => {
  const data: Record<string, unknown> = {
    a: { b: { c: 42 } },
    list: [{ name: "first" }, { name: "second" }],
    deep: { arr: [{ x: [{ y: "hit" }] }] },
    nullish: null,
    zero: 0,
  };

  it("resolves simple dot paths", () => {
    expect(getByPath(data, "a.b.c")).toBe(42);
  });

  it("resolves bracket index paths", () => {
    expect(getByPath(data, "list[0].name")).toBe("first");
    expect(getByPath(data, "list[1].name")).toBe("second");
  });

  it("resolves mixed dot and bracket paths", () => {
    expect(getByPath(data, "deep.arr[0].x[0].y")).toBe("hit");
  });

  it("returns falsy values directly", () => {
    expect(getByPath(data, "zero")).toBe(0);
    expect(getByPath(data, "nullish")).toBeNull();
  });

  it("returns undefined for missing keys", () => {
    expect(getByPath(data, "a.missing")).toBeUndefined();
    expect(getByPath(data, "a.b.c.d")).toBeUndefined();
    expect(getByPath(data, "list[5].name")).toBeUndefined();
    expect(getByPath(data, "nullish.anything")).toBeUndefined();
  });

  it("does not resolve inherited prototype properties", () => {
    expect(getByPath(data, "toString")).toBeUndefined();
  });
});

describe("setByPath", () => {
  it("creates a new top-level key", () => {
    const data: Record<string, unknown> = { title: "Paper" };
    expect(setByPath(data, "deadline", "2026-07-01")).toBe(true);
    expect(data).toEqual({ title: "Paper", deadline: "2026-07-01" });
  });

  it("overwrites an existing scalar leaf", () => {
    const data: Record<string, unknown> = { version: "1" };
    expect(setByPath(data, "version", "2")).toBe(true);
    expect(data.version).toBe("2");
  });

  it("sets a nested existing leaf, creating intermediate objects", () => {
    const data: Record<string, unknown> = { _longform: { acronym: "LF" } };
    expect(setByPath(data, "_longform.csl", "nature")).toBe(true);
    expect(data._longform).toEqual({ acronym: "LF", csl: "nature" });
    expect(setByPath(data, "meta.author.name", "Ada")).toBe(true);
    expect(data.meta).toEqual({ author: { name: "Ada" } });
  });

  it("refuses array-index paths", () => {
    const data: Record<string, unknown> = {
      creators: [{ name: "Ada" }],
    };
    expect(setByPath(data, "creators[0].name", "Grace")).toBe(false);
    expect(data.creators).toEqual([{ name: "Ada" }]);
  });

  it("refuses to overwrite a scalar with an object", () => {
    const data: Record<string, unknown> = { title: "Paper" };
    expect(setByPath(data, "title.sub", "x")).toBe(false);
    expect(data.title).toBe("Paper");
  });

  it("refuses an empty path", () => {
    const data: Record<string, unknown> = {};
    expect(setByPath(data, "", "x")).toBe(false);
    expect(data).toEqual({});
  });
});

describe("formatPlaceholderValue", () => {
  it("renders null and undefined as empty string", () => {
    expect(formatPlaceholderValue(null)).toBe("");
    expect(formatPlaceholderValue(undefined)).toBe("");
  });

  it("stringifies objects and arrays", () => {
    expect(formatPlaceholderValue({ a: 1 })).toBe('{"a":1}');
    expect(formatPlaceholderValue([1, 2])).toBe("[1,2]");
  });

  it("coerces scalars with String", () => {
    expect(formatPlaceholderValue("hi")).toBe("hi");
    expect(formatPlaceholderValue(42)).toBe("42");
    expect(formatPlaceholderValue(0)).toBe("0");
    expect(formatPlaceholderValue(true)).toBe("true");
  });
});

function findCaptures(re: RegExp, s: string): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    out.push(m[1].trim());
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  return out;
}

describe("parseJsonFileList", () => {
  it("parses a single filename and adds .json", () => {
    expect(parseJsonFileList("results")).toEqual(["results.json"]);
    expect(parseJsonFileList("results.json")).toEqual(["results.json"]);
  });

  it("splits comma/semicolon/newline lists and trims", () => {
    expect(parseJsonFileList("metadata.json, results.json")).toEqual([
      "metadata.json",
      "results.json",
    ]);
    expect(parseJsonFileList("a ; b\nc")).toEqual([
      "a.json",
      "b.json",
      "c.json",
    ]);
  });

  it("drops empty entries", () => {
    expect(parseJsonFileList("metadata.json,,")).toEqual(["metadata.json"]);
    expect(parseJsonFileList("")).toEqual([]);
  });
});

describe("deepMerge", () => {
  it("merges disjoint keys from both objects", () => {
    expect(
      deepMerge({ title: "Paper" }, { summary: { n: 42 } })
    ).toEqual({ title: "Paper", summary: { n: 42 } });
  });

  it("lets the later value win on scalar conflicts", () => {
    expect(deepMerge({ v: "1" }, { v: "2" })).toEqual({ v: "2" });
  });

  it("recurses into shared object keys", () => {
    expect(
      deepMerge(
        { _longform: { acronym: "PB", csl: "nature" } },
        { _longform: { csl: "science" } }
      )
    ).toEqual({ _longform: { acronym: "PB", csl: "science" } });
  });

  it("replaces arrays wholesale rather than merging by index", () => {
    expect(deepMerge({ a: [1, 2, 3] }, { a: [9] })).toEqual({ a: [9] });
  });

  it("keeps the earlier value when the later is undefined", () => {
    expect(deepMerge({ a: 1 }, { a: undefined })).toEqual({ a: 1 });
  });

  it("resolves cross-file placeholders after merge", () => {
    const merged = deepMerge(
      { title: "A Paper", _longform: { acronym: "PBMIN" } },
      { summary: { n: 42 }, computed_date: "2026-06-30" }
    );
    expect(getByPath(merged, "title")).toBe("A Paper");
    expect(getByPath(merged, "_longform.acronym")).toBe("PBMIN");
    expect(getByPath(merged, "summary.n")).toBe(42);
    expect(getByPath(merged, "computed_date")).toBe("2026-06-30");
  });
});

describe("buildPlaceholderRegex", () => {
  it("matches default {{ x }} delimiters", () => {
    const re = buildPlaceholderRegex("{{", "}}");
    expect(findCaptures(re, "hello {{ a.b }} and {{c}}")).toEqual([
      "a.b",
      "c",
    ]);
  });

  it("matches bracket and dollar paths", () => {
    const re = buildPlaceholderRegex("{{", "}}");
    expect(findCaptures(re, "x {{ list[0].name }} y {{ a.$b }}")).toEqual([
      "list[0].name",
      "a.$b",
    ]);
  });

  it("escapes regex-special delimiter characters", () => {
    const re = buildPlaceholderRegex("$(", ")$");
    expect(findCaptures(re, "$( a.b )$ and $(c)$")).toEqual(["a.b", "c"]);
  });

  it("ignores text without placeholders", () => {
    const re = buildPlaceholderRegex("{{", "}}");
    expect("plain text".match(re)).toBeNull();
  });
});
