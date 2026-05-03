import { describe, expect, it } from "vitest";
import {
  buildPlaceholderRegex,
  getByPath,
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

function findCaptures(re: RegExp, s: string): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    out.push(m[1].trim());
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  return out;
}

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
