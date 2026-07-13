import * as path from "path";

/**
 * Default vault-relative folder the Pandoc assets are downloaded into. Used as
 * the fallback when the "Pandoc assets folder" setting is empty.
 */
export const DEFAULT_ASSETS_DIR = "PaperBell/pandoc";

/**
 * Directories to add to PATH for the pandoc subprocess. Obsidian's GUI process
 * does not inherit the login shell PATH, so pandoc/xelatex/pandoc-crossref are
 * otherwise not found (spawn ENOENT).
 */
export const COMMON_BIN_DIRS = [
  "/opt/homebrew/bin", // Apple-Silicon Homebrew: pandoc, pandoc-crossref
  "/usr/local/bin", // Intel Homebrew
  "/usr/bin",
  "/bin",
  "/Library/TeX/texbin", // MacTeX: xelatex
];

export function homeBinDirs(home: string): string[] {
  return [
    path.join(home, ".local", "bin"),
    path.join(home, ".cargo", "bin"),
    path.join(home, "bin"),
  ];
}

/** All directories to search for binaries / prepend to PATH. */
export function binSearchDirs(home: string): string[] {
  return COMMON_BIN_DIRS.concat(homeBinDirs(home));
}

/**
 * Build a PATH string with the common binary dirs prepended (deduplicated),
 * so a spawned pandoc can find itself and its own subprocesses (xelatex,
 * pandoc-crossref) regardless of the GUI process's inherited PATH.
 */
export function buildExecPath(currentPath: string, home: string): string {
  const parts = binSearchDirs(home).concat((currentPath || "").split(":"));
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const p of parts) {
    if (p && !seen.has(p)) {
      seen.add(p);
      merged.push(p);
    }
  }
  return merged.join(":");
}

/**
 * Resolve a binary to an absolute path: honor an explicit path, else search the
 * given dirs. `exists` is injected for testability. Returns null if not found.
 */
export function resolveBinary(
  name: string,
  exists: (p: string) => boolean,
  dirs: string[]
): string | null {
  if (!name) return null;
  if (name.includes("/")) return exists(name) ? name : null;
  for (const d of dirs) {
    const p = path.join(d, name);
    if (exists(p)) return p;
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
 * vault base path.
 */
export function resolveUserPath(p: string, base: string, home: string): string {
  if (!p) return p;
  if (p.startsWith("/") || p.startsWith("~")) {
    return path.resolve(expandHome(p, home));
  }
  return path.join(base, p);
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
 * Resolve the export PDF file name: render the user's pattern (or fall back to
 * `fallbackName` when the pattern is blank), sanitize it, and ensure exactly one
 * `.pdf` extension.
 */
export function buildExportFilename(
  pattern: string,
  vars: Record<string, string>,
  fallbackName: string
): string {
  const rendered = pattern.trim()
    ? renderFilenamePattern(pattern.trim(), vars)
    : fallbackName;
  const base = sanitizeExportFilename(rendered);
  return /\.pdf$/i.test(base) ? base : base + ".pdf";
}

export type PandocArgPaths = {
  inputFile: string;
  defaultsFile: string;
  cslFile: string;
  projectAbs: string;
  outputPath: string;
  bibliography?: string | null;
};

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
  const args = [
    p.inputFile,
    "--defaults=" + p.defaultsFile,
    "--csl=" + p.cslFile,
    "--resource-path=" + p.projectAbs,
    "--resource-path=" + path.join(p.projectAbs, "figs"),
    "--resource-path=" + path.join(p.projectAbs, "..", "figs"),
  ];
  if (p.bibliography) {
    args.push("--bibliography=" + p.bibliography);
  }
  args.push("-o", p.outputPath);
  return args;
}
