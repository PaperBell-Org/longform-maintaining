import * as os from "os";
import * as path from "path";

/**
 * Default vault-relative folder the Pandoc assets are downloaded into. Used as
 * the fallback when the "Pandoc assets folder" setting is empty.
 */
export const DEFAULT_ASSETS_DIR = "PaperBell/pandoc";

/**
 * Directories to add to PATH for the pandoc subprocess on macOS and Linux.
 * Obsidian's GUI process does not inherit the login shell PATH there, so
 * pandoc/xelatex/pandoc-crossref are otherwise not found (spawn ENOENT).
 */
export const COMMON_BIN_DIRS = [
  "/opt/homebrew/bin", // Apple-Silicon Homebrew: pandoc, pandoc-crossref
  "/usr/local/bin", // Intel Homebrew
  "/usr/bin",
  "/bin",
  "/Library/TeX/texbin", // MacTeX: xelatex
];

/**
 * Windows fallbacks, for an install that never made it onto PATH. Deliberately
 * short: Windows processes *do* inherit PATH and every installer writes to it,
 * so PATH is the real mechanism and this is only a safety net. Chasing vendor
 * layouts here is a losing game — MiKTeX and TeX Live are absent on purpose
 * (they add themselves to PATH, and TeX Live's directory carries a year).
 */
export function windowsBinDirs(home: string): string[] {
  const P = path.win32;
  const localAppData = P.join(home, "AppData", "Local");
  return [
    P.join(localAppData, "Pandoc"), // per-user MSI (the default)
    P.join("C:\\Program Files", "Pandoc"), // per-machine MSI
    "C:\\ProgramData\\chocolatey\\bin",
    P.join(home, "scoop", "shims"),
    P.join(localAppData, "Microsoft", "WinGet", "Links"),
  ];
}

/**
 * Everything path resolution needs to know about the machine it runs on.
 *
 * Passed in rather than read from `process`/`os` so Windows behaviour is
 * testable from a mac — the same reason `resolveBinary` takes an `exists`
 * callback.
 */
export interface PlatformEnv {
  isWindows: boolean;
  home: string;
  /** `process.env.PATH`. Searched for binaries, and inherited by the child. */
  envPath: string;
  /** Folders from the "Extra binary folders" setting; searched before all else. */
  extraDirs: string[];
}

/** The `path` flavour for this platform — `path.win32` semantics on Windows. */
function flavour(env: PlatformEnv): path.PlatformPath {
  return env.isWindows ? path.win32 : path.posix;
}

/**
 * The `PlatformEnv` for the machine we're running on, plus the user's
 * "Extra binary folders" setting. The single place that reads `process`/`os`,
 * so every function above stays injectable and testable off-platform.
 */
export function currentPlatformEnv(extraBinFolders?: string | null): PlatformEnv {
  return {
    isWindows: process.platform === "win32",
    home: os.homedir(),
    envPath: process.env.PATH ?? "",
    extraDirs: splitDirList(extraBinFolders),
  };
}

/**
 * Split the "Extra binary folders" textarea: one folder per line. Unlike the
 * bibliography list this does NOT split on commas — a Windows directory name
 * may legally contain one.
 */
export function splitDirList(raw: string | null | undefined): string[] {
  return (raw ?? "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function homeBinDirs(home: string, P: path.PlatformPath): string[] {
  return [
    P.join(home, ".local", "bin"),
    P.join(home, ".cargo", "bin"),
    P.join(home, "bin"),
  ];
}

/**
 * Every directory to search for binaries, in priority order: the user's own
 * folders, the platform's install locations, home-relative bins, then PATH.
 *
 * PATH last but present — that omission is what made every Windows install
 * fail, since there the process *does* inherit it and every installer writes
 * to it.
 */
export function binSearchDirs(env: PlatformEnv): string[] {
  const P = flavour(env);
  const platformDirs = env.isWindows
    ? windowsBinDirs(env.home)
    : COMMON_BIN_DIRS;
  return [
    ...env.extraDirs,
    ...platformDirs,
    ...homeBinDirs(env.home, P),
    ...env.envPath.split(P.delimiter),
  ]
    .map((d) => d.trim())
    .filter((d) => d.length > 0);
}

/**
 * Build a PATH string with the common binary dirs prepended (deduplicated),
 * so a spawned pandoc can find itself and its own subprocesses (xelatex,
 * pandoc-crossref) regardless of the GUI process's inherited PATH.
 *
 * The separator is the platform's, not a hardcoded ":" — on Windows the latter
 * splits `C:\Program Files\Pandoc` into `C` and `\Program Files\Pandoc`, so
 * pandoc's own lookups fail even when pandoc itself was found.
 */
export function buildExecPath(env: PlatformEnv): string {
  const parts = binSearchDirs(env);
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const p of parts) {
    if (p && !seen.has(p)) {
      seen.add(p);
      merged.push(p);
    }
  }
  return merged.join(flavour(env).delimiter);
}

/**
 * Executable suffixes tried on Windows, where `pandoc` is `pandoc.exe` on disk.
 * A practical subset of PATHEXT — `.cmd`/`.bat` cover shim-style installs
 * (scoop, some npm-distributed tools).
 */
const WINDOWS_EXEC_SUFFIXES = ["", ".exe", ".cmd", ".bat"];

/**
 * Is this a path the user handed us, rather than a bare name to look up? Any
 * separator settles it — including the forward-slash form Windows users type
 * today as a workaround, which must keep working.
 */
function looksLikePath(name: string, isWindows: boolean): boolean {
  return name.includes("/") || (isWindows && name.includes("\\"));
}

/**
 * Resolve a binary to an absolute path: honor an explicit path, else search the
 * given dirs. `exists` is injected for testability. Returns null if not found.
 *
 * `isWindows` controls two things a Unix-only implementation gets wrong: the
 * name on disk carries an extension, and an absolute path looks like
 * `C:\…` rather than `/…`.
 */
export function resolveBinary(
  name: string,
  exists: (p: string) => boolean,
  dirs: string[],
  isWindows: boolean
): string | null {
  if (!name) return null;
  const P = isWindows ? path.win32 : path.posix;
  const suffixes = isWindows ? WINDOWS_EXEC_SUFFIXES : [""];

  // A name that carries its own extension must not gain a second one.
  const candidates = P.extname(name) ? [""] : suffixes;

  if (looksLikePath(name, isWindows)) {
    for (const suffix of candidates) {
      if (exists(name + suffix)) return name + suffix;
    }
    return null;
  }

  for (const d of dirs) {
    for (const suffix of candidates) {
      const p = P.join(d, name + suffix);
      if (exists(p)) return p;
    }
  }
  return null;
}

export function expandHome(p: string, home: string): string {
  if (!p) return p;
  if (p === "~") return home;
  if (p.startsWith("~/")) return home + p.slice(1);
  return p;
}

/**
 * Resolve a user-supplied path: absolute / `~` as-is, otherwise relative to the
 * vault base path. "Absolute" is platform-aware — `C:\Papers` is absolute on
 * Windows, where a `startsWith("/")` test would call it relative and resolve it
 * to `<vault>\C:\Papers`.
 */
export function resolveUserPath(
  p: string,
  base: string,
  env: PlatformEnv
): string {
  if (!p) return p;
  const P = flavour(env);
  if (P.isAbsolute(p) || p.startsWith("~")) {
    return P.resolve(expandHome(p, env.home));
  }
  return P.join(base, p);
}

/**
 * Parse the leading `--- ... ---` YAML block for the flat scalar keys the export
 * needs (acronym/date/csl/template/supplementary). Not a full YAML parser — only
 * reads the keys buildPandocYaml emits.
 */
export function parseExportFrontmatter(
  contents: string
): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  const m = /^---\n([\s\S]*?)\n---/.exec(contents);
  if (!m) return out;
  for (const line of m[1].split("\n")) {
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!kv) continue;
    let val = kv[2].trim();
    if (val === "") continue;
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (val === "true") out[kv[1]] = true;
    else if (val === "false") out[kv[1]] = false;
    else out[kv[1]] = val;
  }
  return out;
}

/**
 * Does the manuscript body contain real bibliography citations (`[@key]` or a
 * bare `@key`)? Used to decide whether a bibliography is required — without one,
 * citeproc emits `\citeproc` commands the LaTeX template can't typeset and the
 * PDF fails. The leading YAML frontmatter is ignored, and pandoc-crossref
 * references (`@fig:`, `@tbl:`, `@eq:`, `@sec:`, `@lst:`, `@thm:`) are excluded,
 * as is `a@b.com`-style text (an `@` preceded by an alphanumeric).
 */
export function hasCitations(contents: string): boolean {
  const body = contents.replace(/^---\n[\s\S]*?\n---/, "");
  return /(?:^|[^A-Za-z0-9_@])@(?!(?:fig|tbl|eq|sec|lst|thm)s?:)[A-Za-z0-9_][\w:.#$-]*/u.test(
    body
  );
}

/**
 * Substitute `{var}` tokens in an output file-name pattern from `vars` (e.g.
 * `{acronym}_{date}` → `PBMIN_2026-07-01`). Unknown tokens are left literally so
 * a typo stays visible in the resulting name rather than silently vanishing.
 */
export function renderFilenamePattern(
  pattern: string,
  vars: Record<string, string>
): string {
  return pattern.replace(/\{(\w+)\}/g, (m, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : m
  );
}

/**
 * Make a string safe as a file name: drop path separators and characters
 * illegal on common filesystems, collapse whitespace, and strip leading dots
 * (no accidental hidden files). Falls back to "manuscript" if nothing is left.
 */
export function sanitizeExportFilename(name: string): string {
  const cleaned = String(name)
    .replace(/[/\\]+/g, "-")
    // eslint-disable-next-line no-control-regex
    .replace(/[:*?"<>|\u0000-\u001f]+/g, "-") // illegal / control chars (spaces kept)
    .replace(/\s+/g, " ") // collapse whitespace runs
    .replace(/^[.\-\s]+|[.\-\s]+$/g, "") // trim surrounding dots/dashes/space
    .trim();
  return cleaned || "manuscript";
}

/**
 * Resolve the exported file's name: render the user's pattern (or fall back to
 * `fallbackName` when the pattern is blank), sanitize it, and ensure exactly one
 * `ext` extension. `ext` comes from the Pandoc preset — see
 * {@link exportTargetForDefaults} — so a `to: docx` preset yields `.docx`.
 */
export function buildExportFilename(
  pattern: string,
  vars: Record<string, string>,
  fallbackName: string,
  ext = ".pdf"
): string {
  const rendered = pattern.trim()
    ? renderFilenamePattern(pattern.trim(), vars)
    : fallbackName;
  const base = sanitizeExportFilename(rendered);
  return base.toLowerCase().endsWith(ext.toLowerCase()) ? base : base + ext;
}

/**
 * Extensions we recognize as "this path names a file, not a folder". Used to
 * decide whether the "Pandoc output folder" setting is really a full output
 * path. Without a set like this, `~/Papers/out.docx` would be treated as a
 * directory and `mkdirSync` would create a *folder* named `out.docx`.
 */
const EXPORT_EXTENSIONS = new Set([
  ".pdf",
  ".docx",
  ".odt",
  ".pptx",
  ".html",
  ".htm",
  ".epub",
  ".tex",
  ".rtf",
  ".md",
  ".txt",
]);

/** Does this user-entered output path name a file rather than a folder? */
export function isFullOutputPath(p: string): boolean {
  return EXPORT_EXTENSIONS.has(path.extname((p ?? "").trim()).toLowerCase());
}

/**
 * Pandoc writers that cannot emit a binary document directly — pandoc renders
 * them through a PDF engine when the output file ends in `.pdf`. Everything
 * else (docx, odt, pptx, …) produces its own format and *fails* if asked for
 * `.pdf`: pandoc 3.x exits with "cannot produce pdf output from docx".
 */
const PDF_CAPABLE_WRITERS = new Set([
  "latex",
  "beamer",
  "context",
  "ms",
  "typst",
]);

/** Writers whose conventional file extension differs from the format name. */
const WRITER_EXTENSIONS: Record<string, string> = {
  markdown: ".md",
  markdown_strict: ".md",
  gfm: ".md",
  commonmark: ".md",
  commonmark_x: ".md",
  html5: ".html",
  html4: ".html",
  plain: ".txt",
  revealjs: ".html",
  slidy: ".html",
  slideous: ".html",
  dzslides: ".html",
  s5: ".html",
};

/**
 * A scalar value read out of a defaults preset, defensively cleaned.
 *
 * The shipped presets carry trailing `#!` comments on the very keys read here
 * (`pdf-engine: xelatex    #! use xelatex to support CJK`). A conforming YAML
 * parser strips those, but getting it wrong would turn a working preset's
 * engine into an unresolvable binary name and make preflight reject an export
 * that used to succeed — too costly to leave to trust. Mirrors YAML's rule that
 * a `#` only opens a comment when preceded by whitespace, so paths keep their
 * spaces. Also drops quoting and any stray `\r` from CRLF files.
 */
function scalar(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/\s+#.*$/, "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .trim();
}

/** The bare writer name: drop pandoc's `+ext`/`-ext` syntax and any quoting. */
function baseWriterName(raw: string): string {
  return scalar(raw).split(/[+-]/)[0].trim().toLowerCase();
}

export type ExportTarget = {
  /** File extension to write, including the leading dot. */
  ext: string;
  /** The `pdf-engine` the preset asks for, if any. */
  pdfEngine: string | null;
  /** Whether the preset's filter list includes pandoc-crossref. */
  needsCrossref: boolean;
};

/**
 * What a Pandoc defaults preset actually produces, read off its parsed YAML.
 *
 * Extension resolution, in order:
 *  1. `to:` names a writer that emits its own binary/text format (docx, odt,
 *     pptx, epub, …) — use that writer's extension and ignore `output-file`,
 *     since asking pandoc for `.pdf` there is a hard error.
 *  2. `to:` names a PDF-capable writer (latex, beamer, …) — honor an explicit
 *     `output-file` extension (the author may really want `.tex`), else `.pdf`.
 *  3. No `to:` — use `output-file`'s extension, else `.pdf`.
 *
 * Unknown writer names fall back to using the format name as the extension
 * (`to: rst` → `.rst`), which ages better than an exhaustive table.
 *
 * `pdfEngine` and `needsCrossref` ride along because the caller needs them for
 * the same preflight check and they come from the same parse.
 */
export function exportTargetForDefaults(parsed: unknown): ExportTarget {
  const doc =
    typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};

  const pdfEngine = scalar(doc["pdf-engine"]) || null;

  const filters = Array.isArray(doc["filters"]) ? doc["filters"] : [];
  const needsCrossref = filters.some(
    (f) => scalar(f).toLowerCase().endsWith("pandoc-crossref")
  );

  const outputExt = path.extname(scalar(doc["output-file"])).toLowerCase();

  const to = baseWriterName(scalar(doc["to"]));

  // A writer that emits its own format wins outright; asking pandoc for .pdf
  // there is a hard error, so an `output-file: out.pdf` left over in the preset
  // must not override it. Otherwise the author's `output-file` decides.
  const ext =
    to && !PDF_CAPABLE_WRITERS.has(to)
      ? WRITER_EXTENSIONS[to] ?? `.${to}`
      : outputExt || ".pdf";

  return { ext, pdfEngine, needsCrossref };
}

/** Output formats the built-in, preset-free export can produce. */
export const BUILTIN_FORMATS = ["pdf", "docx", "html"] as const;
export type BuiltinFormat = (typeof BUILTIN_FORMATS)[number];

export function isBuiltinFormat(value: string): value is BuiltinFormat {
  return (BUILTIN_FORMATS as readonly string[]).indexOf(value) !== -1;
}

/**
 * Which preset-free format to export in, if any — `null` means "use a preset".
 *
 * Only the step's own *Template / preset* dropdown outranks the *Format* option:
 * both are explicit choices made in the same step, and naming a preset there is
 * the more specific of the two. The `template:` key in the exported note's
 * frontmatter deliberately does **not** appear here. It is inherited, not chosen
 * — Add Zenodo Frontmatter copies it out of `metadata.json`, and every scaffolded
 * PaperBell project has one — so letting it win made an explicit "Format: docx"
 * silently produce a PDF.
 *
 * The PaperBell pipelines are unaffected: they leave Format blank, so a missing
 * preset still fails loudly instead of dropping their submission layout.
 */
export function resolveBuiltinFormat(
  optionTemplate: string,
  formatOption: string
): BuiltinFormat | null {
  if (optionTemplate.trim()) {
    return null;
  }
  const format = formatOption.trim();
  return isBuiltinFormat(format) ? format : null;
}

const BUILTIN_FROM_BASE =
  "markdown+tex_math_single_backslash+wikilinks_title_after_pipe" +
  "+autolink_bare_uris+pipe_tables";

/**
 * The markdown dialect the built-in export reads: the same `from:` the
 * downloaded presets declare, so a note exports much the same either way —
 * `[[wikilinks]]` and `\(x\)` are Obsidian syntax that plain `markdown` passes
 * through as literal text.
 *
 * PDF is the exception and omits `+mark`. Pandoc renders `==highlight==` into
 * LaTeX via the `soul` package, whose `\hl` cannot break CJK: it aborts the
 * whole run with "Package soul Error: Reconstruction failed" and writes no
 * file. Dropping the extension costs a literal `==…==` in the PDF; keeping it
 * costs every CJK note that highlights anything. docx and html mark up
 * highlights natively, so they keep it.
 */
export function builtinFrom(format: BuiltinFormat): string {
  return format === "pdf" ? BUILTIN_FROM_BASE : BUILTIN_FROM_BASE + "+mark";
}

const BUILTIN_EXTENSIONS: Record<BuiltinFormat, string> = {
  pdf: ".pdf",
  docx: ".docx",
  html: ".html",
};

/**
 * What the built-in export produces. Only PDF needs an engine, and nothing here
 * needs pandoc-crossref — `@fig:` references are a preset feature.
 */
export function builtinExportTarget(format: BuiltinFormat): ExportTarget {
  return {
    ext: BUILTIN_EXTENSIONS[format],
    // Resolved by the caller against what's actually installed; xelatex is the
    // only common engine that can typeset CJK.
    pdfEngine: format === "pdf" ? "xelatex" : null,
    needsCrossref: false,
  };
}

/** CJK ideographs, kana and hangul — the ranges pdflatex cannot typeset. */
const CJK_RANGE =
  /[぀-ヿ㐀-䶿一-鿿豈-﫿가-힯]/;

export function hasCjk(text: string): boolean {
  return CJK_RANGE.test(text);
}

/**
 * A CJK font to hand xelatex, chosen so it ships with the platform: naming a
 * font that isn't installed makes xelatex fail outright and write nothing, so
 * this must never be a guess. Callers only pass it when the document actually
 * contains CJK and the note doesn't name its own `CJKmainfont`.
 */
export function defaultCjkFont(platform: string): string {
  if (platform === "darwin") return "Songti SC";
  if (platform === "win32") return "SimSun";
  return "Noto Sans CJK SC";
}

/** What a built-in export needs in place of a preset's directives. */
export type BuiltinExportOptions = {
  format: BuiltinFormat;
  from: string;
  /** Absolute path to the PDF engine; null for non-PDF output. */
  pdfEngine: string | null;
  /** `-V CJKmainfont=…`; null leaves the choice to the document's metadata. */
  cjkFont: string | null;
  /** Adds `--citeproc`, which a preset would normally supply via `filters:`. */
  citeproc: boolean;
};

export type PandocArgPaths = {
  inputFile: string;
  /** The preset to export with, or null for the built-in preset-free export. */
  defaultsFile: string | null;
  /**
   * The CSL style to pass. `null` when the manuscript has no citations — a
   * style is then neither needed nor worth failing over, so `--csl` is omitted.
   */
  cslFile: string | null;
  projectAbs: string;
  outputPath: string;
  /** Zero or more .bib paths; pandoc merges them (earlier ones win on dupes). */
  bibliographies?: string[] | null;
  /**
   * Extra `--resource-path` entries searched after the project ones — the vault
   * root and Obsidian's attachment folder, so images pasted into a loose note
   * (which Obsidian files outside the note's own folder) still resolve.
   */
  extraResourcePaths?: string[] | null;
  /** Required when `defaultsFile` is null; ignored otherwise. */
  builtin?: BuiltinExportOptions | null;
};

/**
 * Split a user-entered bibliography list into individual paths. Accepts commas
 * and/or newlines as separators; blank entries are dropped. Used for the
 * vault-wide "Global bibliography" setting, which may name more than one .bib.
 */
export function splitBibList(raw: string | null | undefined): string[] {
  return (raw ?? "")
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * The BibTeX cite keys declared in a `.bib` file's text — the `key` in
 * `@article{key, …}`. Skips `@string`/`@preamble`/`@comment`, which aren't
 * reference entries. Used to warn about keys that collide across merged bibs.
 */
export function extractCiteKeys(bib: string): string[] {
  const keys: string[] = [];
  const re = /@(\w+)\s*\{\s*([^,\s}]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(bib))) {
    const type = m[1].toLowerCase();
    if (type === "string" || type === "preamble" || type === "comment") {
      continue;
    }
    keys.push(m[2]);
  }
  return keys;
}

/**
 * Cite keys defined in more than one of the given bib files. pandoc silently
 * lets the LAST `--bibliography` win on a collision, so we surface these so the
 * user knows an override happened. `paths` is in the order given; the winner is
 * the last one (each file is counted once per key).
 */
export function findDuplicateCiteKeys(
  bibs: { path: string; content: string }[]
): { key: string; paths: string[] }[] {
  const byKey = new Map<string, string[]>();
  for (const { path: p, content } of bibs) {
    const seen = new Set<string>();
    for (const key of extractCiteKeys(content)) {
      if (seen.has(key)) continue;
      seen.add(key);
      byKey.set(key, [...(byKey.get(key) ?? []), p]);
    }
  }
  const dups: { key: string; paths: string[] }[] = [];
  for (const [key, paths] of byKey) {
    if (paths.length > 1) dups.push({ key, paths });
  }
  return dups;
}

/**
 * Determine a single common top-level directory shared by every entry (e.g. the
 * `repo-main/` wrapper GitHub adds to source zipballs), so it can be stripped on
 * extraction. Returns "" when entries live at the archive root (a clean release
 * asset with `defaults/`, `csl/`, … at the top).
 */
export function commonTopDir(paths: string[]): string {
  if (paths.length === 0) return "";
  const first = paths[0].split("/")[0] + "/";
  return paths.every((p) => p.startsWith(first)) ? first : "";
}

/** Normalize a CSL style id: drop any `.csl` suffix and path separators. */
export function normalizeCslId(csl: string): string {
  return (csl || "")
    .trim()
    .replace(/\.csl$/i, "")
    .replace(/[\\/]/g, "");
}

/**
 * Zotero's default styles directory. Zotero stores every installed CSL style as
 * `<dataDir>/styles/<id>.csl`, and its default data dir is `~/Zotero` on every
 * platform. (A relocated data dir isn't auto-detected.)
 */
export function zoteroStylesDir(home: string): string {
  return path.join(home, "Zotero", "styles");
}

/**
 * Candidate raw URLs for a style in the official CSL styles repository
 * (https://github.com/citation-style-language/styles). Independent styles live
 * at the repo root; dependent styles under `dependent/`, so try both.
 */
export function officialCslUrls(csl: string): string[] {
  const id = normalizeCslId(csl);
  const raw = "https://raw.githubusercontent.com/citation-style-language/styles/master";
  return [`${raw}/${id}.csl`, `${raw}/dependent/${id}.csl`];
}

/** Build the pandoc argument vector, mirroring PaperBell spec §11. */
export function buildPandocArgs(p: PandocArgPaths): string[] {
  const args = [p.inputFile];
  if (p.defaultsFile) {
    args.push("--defaults=" + p.defaultsFile);
  } else if (p.builtin) {
    // Everything a preset would have declared, spelled out. Nothing here reads
    // a downloaded file, so this path works with pandoc alone.
    args.push("--from=" + p.builtin.from, "--standalone");
    if (p.builtin.format === "html") {
      // Inline images and CSS so the .html is one shareable file. Pandoc
      // rejects this flag for non-HTML writers.
      args.push("--embed-resources");
    }
    if (p.builtin.pdfEngine) {
      args.push("--pdf-engine=" + p.builtin.pdfEngine);
    }
    if (p.builtin.cjkFont) {
      args.push("-V", "CJKmainfont=" + p.builtin.cjkFont);
    }
    if (p.builtin.citeproc) {
      args.push("--citeproc");
    }
  }
  if (p.cslFile) {
    args.push("--csl=" + p.cslFile);
  }
  const resourcePaths = [
    p.projectAbs,
    path.join(p.projectAbs, "figs"),
    path.join(p.projectAbs, "..", "figs"),
  ].concat(p.extraResourcePaths ?? []);
  const seen = new Set<string>();
  for (const dir of resourcePaths) {
    if (dir && !seen.has(dir)) {
      seen.add(dir);
      args.push("--resource-path=" + dir);
    }
  }
  for (const bib of p.bibliographies ?? []) {
    args.push("--bibliography=" + bib);
  }
  args.push("-o", p.outputPath);
  return args;
}
