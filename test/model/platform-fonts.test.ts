import { describe, expect, it } from "vitest";
import {
  defaultCjkFontFor,
  describeFontChanges,
  FONT_GROUPS,
  fontOverrides,
  osIdFromPlatform,
  translateFont,
  type OsId,
} from "src/model/platform-fonts";

const OSES: OsId[] = ["mac", "win", "linux"];

describe("osIdFromPlatform", () => {
  it("maps process.platform values", () => {
    expect(osIdFromPlatform("darwin")).toBe("mac");
    expect(osIdFromPlatform("win32")).toBe("win");
    expect(osIdFromPlatform("linux")).toBe("linux");
    expect(osIdFromPlatform("freebsd")).toBe("linux");
  });
});

describe("translateFont", () => {
  it("swaps each group's primary font for every other OS's primary", () => {
    for (const g of FONT_GROUPS) {
      for (const from of OSES) {
        for (const to of OSES) {
          const name = g[from][0];
          // Linux stands Noto Serif CJK SC in for fangsong and kai too; a
          // shared name can only resolve to the first group listing it.
          const owner = FONT_GROUPS.find((x) => OSES.some((o) => x[o].includes(name)));
          if (owner !== g) continue;
          const got = translateFont(name, to);
          // Native on the target → untouched; otherwise the target's primary.
          if (g[to].includes(name)) expect(got).toBeNull();
          else expect(got).toBe(g[to][0]);
        }
      }
    }
  });

  it("translates the fonts the shipped presets hardcode", () => {
    expect(translateFont("Songti SC", "win")).toBe("SimSun");
    expect(translateFont("Heiti SC", "win")).toBe("SimHei");
    expect(translateFont("STFangsong", "win")).toBe("FangSong");
    expect(translateFont("Songti SC", "linux")).toBe("Noto Serif CJK SC");
    expect(translateFont("宋体", "mac")).toBe("Songti SC");
    expect(translateFont("黑体", "mac")).toBe("Heiti SC");
  });

  it("leaves a font native to the OS alone, even a non-primary one", () => {
    expect(translateFont("Microsoft YaHei", "win")).toBeNull();
    expect(translateFont("PingFang SC", "mac")).toBeNull();
    expect(translateFont("Songti SC", "mac")).toBeNull();
  });

  it("keeps the Latin core fonts on mac and Windows", () => {
    for (const f of ["Times New Roman", "Arial", "Courier New"]) {
      expect(translateFont(f, "mac")).toBeNull();
      expect(translateFont(f, "win")).toBeNull();
    }
    expect(translateFont("Helvetica", "win")).toBe("Arial");
  });

  it("swaps the Microsoft core fonts for Liberation on Linux", () => {
    expect(translateFont("Times New Roman", "linux")).toBe("Liberation Serif");
    expect(translateFont("Arial", "linux")).toBe("Liberation Sans");
    expect(translateFont("Courier New", "linux")).toBe("Liberation Mono");
    expect(translateFont("Liberation Serif", "mac")).toBe("Times New Roman");
  });

  it("matches ignoring case, spaces and hyphens", () => {
    expect(translateFont("songti sc", "win")).toBe("SimSun");
    expect(translateFont("  Songti-SC ", "win")).toBe("SimSun");
    expect(translateFont("MicrosoftYaHei", "mac")).toBe("Heiti SC");
  });

  it("passes unknown fonts and empty names through", () => {
    expect(translateFont("Aptos", "win")).toBeNull();
    expect(translateFont("等线", "mac")).toBeNull();
    expect(translateFont("", "win")).toBeNull();
  });
});

describe("fontOverrides", () => {
  const paperbell = {
    CJKmainfont: "Songti SC",
    CJKsansfont: "Heiti SC",
    CJKmonofont: "STFangsong",
    mainfont: "Times New Roman",
    sansfont: "Arial",
    monofont: "Courier New",
  };

  it("adapts the paperbell preset for Windows, CJK keys only", () => {
    expect(fontOverrides(paperbell, "win")).toEqual([
      { key: "CJKmainfont", from: "Songti SC", to: "SimSun" },
      { key: "CJKsansfont", from: "Heiti SC", to: "SimHei" },
      { key: "CJKmonofont", from: "STFangsong", to: "FangSong" },
    ]);
  });

  it("changes nothing on the OS the preset was written for", () => {
    expect(fontOverrides(paperbell, "mac")).toEqual([]);
  });

  it("never overrides a font the note names itself", () => {
    const keys = fontOverrides(paperbell, "win", new Set(["CJKmainfont"])).map(
      (c) => c.key
    );
    expect(keys).not.toContain("CJKmainfont");
    expect(keys).toContain("CJKsansfont");
  });
});

describe("defaultCjkFontFor / describeFontChanges", () => {
  it("picks a font shipped with each OS", () => {
    expect(defaultCjkFontFor("mac")).toBe("Songti SC");
    expect(defaultCjkFontFor("win")).toBe("SimSun");
    expect(defaultCjkFontFor("linux")).toBe("Noto Sans CJK SC");
  });

  it("lists each distinct swap once", () => {
    expect(
      describeFontChanges([
        { key: "a", from: "宋体", to: "Songti SC" },
        { key: "b", from: "宋体", to: "Songti SC" },
        { key: "c", from: "黑体", to: "Heiti SC" },
      ])
    ).toBe("宋体→Songti SC, 黑体→Heiti SC");
  });
});
