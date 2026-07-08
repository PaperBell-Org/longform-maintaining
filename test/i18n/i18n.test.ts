import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { get } from "svelte/store";

import { en } from "src/i18n/en";
import { zh } from "src/i18n/zh";
import { locale, setLocale, translate, t } from "src/i18n";
import { resolveLocale } from "src/i18n/controller";

beforeEach(() => {
  setLocale("en");
});

describe("catalog completeness", () => {
  it("zh covers exactly the same keys as en", () => {
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort());
  });

  it("no message is left empty in either locale", () => {
    for (const [key, value] of Object.entries(en)) {
      expect(value, `en.${key}`).not.toBe("");
    }
    for (const [key, value] of Object.entries(zh)) {
      expect(value, `zh.${key}`).not.toBe("");
    }
  });
});

describe("translate", () => {
  it("returns the message for the active locale", () => {
    setLocale("en");
    expect(translate("explorer.tab.scenes")).toBe("Scenes");
    setLocale("zh");
    expect(translate("explorer.tab.scenes")).toBe("场景");
  });

  it("interpolates named placeholders", () => {
    setLocale("en");
    expect(
      translate("settings.userSteps.loaded", { count: 3, plural: "s" })
    ).toBe("Loaded 3 steps:");
    setLocale("zh");
    expect(
      translate("settings.userSteps.loaded", { count: 3, plural: "s" })
    ).toBe("已加载 3 个步骤:");
  });

  it("leaves unknown placeholders untouched", () => {
    setLocale("en");
    // 'plural' omitted -> the {plural} token stays literally.
    expect(translate("settings.userSteps.loaded", { count: 1 })).toBe(
      "Loaded 1 step{plural}:"
    );
  });
});

describe("reactive t store", () => {
  it("re-evaluates when the locale changes", () => {
    setLocale("en");
    expect(get(t)("explorer.tab.compile")).toBe("Compile");
    setLocale("zh");
    expect(get(t)("explorer.tab.compile")).toBe("编译");
  });

  it("locale store holds the active value", () => {
    setLocale("zh");
    expect(get(locale)).toBe("zh");
  });
});

describe("resolveLocale", () => {
  it("an explicit preference always wins, ignoring the host", () => {
    expect(resolveLocale("en", "zh")).toBe("en");
    expect(resolveLocale("zh", "en")).toBe("zh");
  });

  it("auto follows the connected host language", () => {
    expect(resolveLocale("auto", "zh")).toBe("zh");
    expect(resolveLocale("auto", "en")).toBe("en");
  });

  describe("auto with no host — falls back to Obsidian's language", () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("reads a zh UI language from localStorage", () => {
      vi.stubGlobal("window", {
        localStorage: { getItem: () => "zh-CN" },
      });
      expect(resolveLocale("auto", undefined)).toBe("zh");
    });

    it("defaults to en when the UI language is not Chinese", () => {
      vi.stubGlobal("window", {
        localStorage: { getItem: () => "en" },
      });
      expect(resolveLocale("auto", undefined)).toBe("en");
    });

    it("defaults to en when window/localStorage is unavailable", () => {
      // In the node test env `window` is undefined; obsidianLocale swallows it.
      expect(resolveLocale("auto", undefined)).toBe("en");
    });
  });
});
