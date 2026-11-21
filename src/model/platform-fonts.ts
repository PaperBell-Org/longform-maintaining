/**
 * Adapting a preset's fonts to the machine that runs the export.
 *
 * Market presets are written once, usually on a Mac, so they name macOS fonts
 * (`CJKmainfont: Songti SC`). xelatex aborts on a font that isn't installed, and
 * Word silently substitutes — differently on each OS — for one named in a
 * reference.docx. Rather than ship a copy of every preset per platform, the
 * export translates font names through equivalence groups: each group lists the
 * fonts that play the same role on each OS, and any member found in a preset is
 * swapped for the current OS's first member.
 *
 * Pure logic, no `process`/`obsidian` access — the OS is passed in so every
 * platform is testable from any other.
 */

export type OsId = "mac" | "win" | "linux";

export function osIdFromPlatform(platform: string): OsId {
  if (platform === "darwin") return "mac";
  if (platform === "win32") return "win";
  return "linux";
}

export const OS_LABELS: Record<OsId, string> = {
  mac: "macOS",
  win: "Windows",
  linux: "Linux",
};

/**
 * Fonts native to each OS for one typographic role. The first entry per OS is
 * what other platforms' fonts translate *to*; the rest are recognised and left
 * alone on their own OS (a Windows user who chose Microsoft YaHei keeps it).
 */
export type FontGroup = { id: string } & Record<OsId, readonly string[]>;

/**
 * Order matters: a name is looked up in the first group listing it, so the
 * generic Linux fallback (Noto Serif CJK SC) resolves to the serif group.
 *
 * The Latin groups only ever change anything on Linux or for a mac-only name
 * (Helvetica, Times): Times New Roman, Arial and Courier New ship with both
 * macOS and Windows. On Linux they become the metric-compatible Liberation
 * fonts, which every major distribution ships — the Microsoft originals are an
 * optional extra (ttf-mscorefonts) xelatex cannot count on.
 */
export const FONT_GROUPS: readonly FontGroup[] = [
  {
    id: "serif-cjk",
    mac: ["Songti SC", "STSong"],
    win: ["SimSun", "NSimSun", "宋体", "新宋体"],
    linux: ["Noto Serif CJK SC", "Source Han Serif SC", "思源宋体"],
  },
  {
    id: "sans-cjk",
    mac: ["Heiti SC", "PingFang SC", "STHeiti", "苹方-简", "黑体-简"],
    win: ["SimHei", "Microsoft YaHei", "黑体", "微软雅黑"],
    linux: ["Noto Sans CJK SC", "Source Han Sans SC", "思源黑体"],
  },
  {
    id: "fangsong-cjk",
    mac: ["STFangsong", "华文仿宋"],
    win: ["FangSong", "FangSong_GB2312", "仿宋", "仿宋_GB2312"],
    linux: ["Noto Serif CJK SC"],
  },
  {
    id: "kai-cjk",
    mac: ["Kaiti SC", "STKaiti", "楷体-简", "华文楷体"],
    win: ["KaiTi", "KaiTi_GB2312", "楷体", "楷体_GB2312"],
    linux: ["Noto Serif CJK SC"],
  },
  {
    id: "serif-latin",
    mac: ["Times New Roman", "Times"],
    win: ["Times New Roman"],
    linux: ["Liberation Serif", "TeX Gyre Termes"],
  },
  {
    id: "sans-latin",
    mac: ["Arial", "Helvetica", "Helvetica Neue"],
    win: ["Arial"],
    linux: ["Liberation Sans", "TeX Gyre Heros"],
  },
  {
    id: "mono-latin",
    mac: ["Courier New", "Courier", "Menlo", "Consolas"],
    win: ["Courier New", "Consolas"],
    linux: ["Liberation Mono", "TeX Gyre Cursor"],
  },
];

const OS_IDS: readonly OsId[] = ["mac", "win", "linux"];

/** Case-, space-, hyphen- and underscore-insensitive key for a font name. */
function fontKey(name: string): string {
  return name.toLowerCase().replace(/[\s_-]+/g, "");
}

function groupOf(name: string): FontGroup | null {
  const key = fontKey(name);
  for (const g of FONT_GROUPS) {
    for (const os of OS_IDS) {
      if (g[os].some((f) => fontKey(f) === key)) return g;
    }
  }
  return null;
}

/**
 * The font to use on `os` in place of `name`, or `null` when nothing should
 * change — the font is in no group, or is already native to `os`.
 */
export function translateFont(name: string, os: OsId): string | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const g = groupOf(trimmed);
  if (!g) return null;
  const key = fontKey(trimmed);
  if (g[os].some((f) => fontKey(f) === key)) return null;
  return g[os][0];
}

/**
 * Template variables that name a single font, across the templates in use:
 * pandoc's own LaTeX template, plus the `cjkfont`/`cjksffont` of the response
 * letter template. `*fallback` keys hold lists and are deliberately left alone.
 */
export const FONT_KEYS: readonly string[] = [
  "mainfont",
  "sansfont",
  "monofont",
  "mathfont",
  "CJKmainfont",
  "CJKsansfont",
  "CJKmonofont",
  "cjkfont",
  "cjksffont",
];

export type FontChange = { key: string; from: string; to: string };

/**
 * The `-V key=value` overrides that adapt a preset's fonts to `os`.
 *
 * `presetFonts` is the font keys read from the preset's `metadata:` and
 * `variables:` maps. Keys in `userKeys` — fonts the exported note names in its
 * own frontmatter — are skipped: `-V` outranks metadata in pandoc, so passing
 * one would silently override the writer's explicit choice.
 */
export function fontOverrides(
  presetFonts: Record<string, string>,
  os: OsId,
  userKeys: ReadonlySet<string> = new Set()
): FontChange[] {
  const changes: FontChange[] = [];
  for (const key of FONT_KEYS) {
    if (userKeys.has(key)) continue;
    const from = presetFonts[key];
    if (typeof from !== "string") continue;
    const to = translateFont(from, os);
    if (to) changes.push({ key, from, to });
  }
  return changes;
}

/**
 * The CJK font a preset-free PDF export hands xelatex, chosen so it ships with
 * the platform: naming a font that isn't installed makes xelatex fail outright.
 * Callers only pass it when the document contains CJK and the note doesn't name
 * its own `CJKmainfont`. Linux gets the sans face, as before this table existed:
 * it is the one Noto CJK package distributions install by default.
 */
export function defaultCjkFontFor(os: OsId): string {
  if (os === "mac") return "Songti SC";
  if (os === "win") return "SimSun";
  return "Noto Sans CJK SC";
}

/** "Songti SC→SimSun, Heiti SC→SimHei" — each distinct swap once. */
export function describeFontChanges(changes: readonly FontChange[]): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const c of changes) {
    const s = `${c.from}→${c.to}`;
    if (!seen.has(s)) {
      seen.add(s);
      parts.push(s);
    }
  }
  return parts.join(", ");
}
