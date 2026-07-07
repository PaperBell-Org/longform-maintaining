import * as path from "path";

/**
 * Pure logic for the "Harvest manuscript line numbers" compile step — the
 * TS reimplementation of the vault's `manuscript-lines.sh`. Everything here is
 * side-effect free and unit-tested; the step file wires it to pandoc/xelatex and
 * the vault. See docs: 回复信手稿引用规范 §4.
 */

/** A resolved `<!--ms:id-->` span: a line range on a page, or a figure number. */
export type LineEntry =
  | { sline: number; eline: number; page: number }
  | { fig: string };

/** `manuscript-lines.json` / `si-lines.json` shape: span id → entry. */
export type LinesSidecar = Record<string, LineEntry>;
/** `figure-numbers.json` / `table-numbers.json` shape: label → number ("1" | "S1"). */
export type NumberSidecar = Record<string, string>;

export interface AuxLabels {
  lines: LinesSidecar;
  figures: NumberSidecar;
  tables: NumberSidecar;
}

/** Keep only alphanumerics ("S1" stays, "\relax 1" → "1"). */
function alnum(s: string): string {
  return s.replace(/[^A-Za-z0-9]/g, "");
}

/**
 * Parse a xelatex `.aux` for the labels our pipeline emits:
 *  - `\newlabel{msl-<id>}{{<line>}{<page>}…}` from lineno `\linelabel`s
 *    (injected by manuscript_linelabel.lua / block_ids.lua under `-M mslabels`);
 *    ids ending `-end` carry the end line, others the start line.
 *  - `\newlabel{fig:<label>}{{<num>}…}` / `\newlabel{tbl:<label>}{{<num>}…}`.
 */
export function parseAuxLabels(aux: string): AuxLabels {
  const partial: Record<
    string,
    { sline?: number; eline?: number; page: number }
  > = {};
  const mslRe = /\\newlabel\{msl-([\w-]+?)\}\{\{(\d+)\}\{(\d+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = mslRe.exec(aux)) !== null) {
    const rawId = m[1];
    const lineNo = parseInt(m[2], 10);
    const page = parseInt(m[3], 10);
    const isEnd = rawId.endsWith("-end");
    const id = isEnd ? rawId.slice(0, -"-end".length) : rawId;
    const entry = partial[id] ?? { page };
    if (isEnd) entry.eline = lineNo;
    else entry.sline = lineNo;
    entry.page = page;
    partial[id] = entry;
  }

  const lines: LinesSidecar = {};
  for (const id of Object.keys(partial)) {
    const e = partial[id];
    // Fill a missing side from the other so a lone start/end still yields a range.
    const sline = e.sline ?? e.eline;
    const eline = e.eline ?? e.sline;
    if (sline != null && eline != null) {
      lines[id] = { sline, eline, page: e.page };
    }
  }

  const figures = parseNumberLabels(aux, "fig");
  const tables = parseNumberLabels(aux, "tbl");
  return { lines, figures, tables };
}

function parseNumberLabels(aux: string, kind: "fig" | "tbl"): NumberSidecar {
  const out: NumberSidecar = {};
  const re = new RegExp(
    "\\\\newlabel\\{(" + kind + ":[\\w:.-]+)\\}\\{\\{([^{}]+)\\}",
    "g"
  );
  let m: RegExpExecArray | null;
  while ((m = re.exec(aux)) !== null) {
    const num = alnum(m[2]);
    if (num) out[m[1]] = num;
  }
  return out;
}

/**
 * A `<!--ms:id-->` marker inside a figure caption produces no lineno label
 * (`\linelabel` in `\caption` is dropped), so record the figure's number for
 * that id instead. Scans the compiled markdown for
 * `![caption …<!--ms:id-->… ](img){#fig:label}` and maps id → figure number.
 */
export function captionSpanFigs(
  markdown: string,
  figures: NumberSidecar
): LinesSidecar {
  const out: LinesSidecar = {};
  // Image line: ![CAP](PATH){#fig:LABEL} — CAP is non-greedy up to the closing
  // ] that precedes the (path){#fig:...}. Tolerant of parentheses in the path.
  const imgRe = /!\[([^\]]*(?:<!--ms:[\w-]+-->)[^\]]*)\]\([^\n]*?\)\{#(fig:[\w:.-]+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(markdown)) !== null) {
    const caption = m[1];
    const label = m[2];
    const num = figures[label];
    if (!num) continue;
    const idRe = /<!--ms:([\w-]+)-->/g;
    let idMatch: RegExpExecArray | null;
    while ((idMatch = idRe.exec(caption)) !== null) {
      out[idMatch[1]] = { fig: num };
    }
  }
  return out;
}

/**
 * Merge freshly-harvested entries into an existing sidecar object. Incoming keys
 * win; existing keys not present in `incoming` are kept — so a Manuscript run and
 * an SI run accumulate their disjoint labels rather than clobbering each other.
 */
export function mergeSidecar<T>(
  existing: Record<string, T>,
  incoming: Record<string, T>
): Record<string, T> {
  return { ...existing, ...incoming };
}

/** Which line sidecar this pass writes to. Supplementary drafts get their own. */
export function lineSidecarName(isSupplementary: boolean): string {
  return isSupplementary ? "si-lines.json" : "manuscript-lines.json";
}

/**
 * Is this compiled manuscript the Supplementary Information? The authoritative
 * signal is the `supplementary: true` frontmatter key that the Supplementary
 * Information step injects — replacing the vault's three divergent heuristics.
 */
export function isSupplementaryFrontmatter(
  frontmatter: Record<string, string | boolean>
): boolean {
  return frontmatter["supplementary"] === true;
}

export type CaptureArgPaths = {
  inputFile: string;
  defaultsFile: string;
  cslFile: string;
  projectAbs: string;
  texOutput: string;
  bibliography?: string | null;
};

/**
 * pandoc args for the capture pass: same defaults/csl/resource-paths as the real
 * export, but `-M mslabels=true` (turns `<!--ms:-->` into `\linelabel`s) and a
 * standalone LaTeX output (`-t latex -s`) whose .aux we harvest — no PDF here.
 */
export function buildCaptureArgs(p: CaptureArgPaths): string[] {
  const args = [
    p.inputFile,
    "--defaults=" + p.defaultsFile,
    "-M",
    "mslabels=true",
    "--csl=" + p.cslFile,
    "--resource-path=" + p.projectAbs,
    "--resource-path=" + path.join(p.projectAbs, "figs"),
    "--resource-path=" + path.join(p.projectAbs, "..", "figs"),
  ];
  if (p.bibliography) {
    args.push("--bibliography=" + p.bibliography);
  }
  args.push("-t", "latex", "-s", "-o", p.texOutput);
  return args;
}

/**
 * TEXINPUTS value so xelatex finds figures/templates when building the capture
 * .tex outside the project folder. Trailing empty entry keeps the default paths.
 */
export function buildTexInputs(projectAbs: string, assetsAbs: string): string {
  return [
    projectAbs,
    path.join(projectAbs, "figs"),
    path.join(projectAbs, "..", "figs"),
    path.join(assetsAbs, "templates"),
    "", // keep default TEXINPUTS search
  ].join(path.delimiter);
}
