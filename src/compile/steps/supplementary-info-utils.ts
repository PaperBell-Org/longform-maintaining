/**
 * Helpers for the "Supplementary Information" compile step, which turns a
 * compiled manuscript into an SI document. Kept pure (no Obsidian/Node imports)
 * so they can be unit-tested directly.
 */

/**
 * Raw-LaTeX block prepended to an SI document's body so figures and tables are
 * numbered with an "S" prefix (S1, S2, …). Because each SI is compiled to its
 * own PDF the counters start at zero, so no counter reset is needed — only the
 * display format is redefined. This is the only mechanism that produces S-
 * numbering; neither the template nor the Lua filters do it on their own.
 */
export const SUPPLEMENTARY_PREAMBLE = [
  "```{=latex}",
  '%% Supplementary numbering: prefix figures/tables with "S" (S1, S2, …). SI-only',
  "\\renewcommand{\\thefigure}{S\\arabic{figure}}",
  "\\renewcommand{\\thetable}{S\\arabic{table}}",
  "```",
].join("\n");

/** Quote a value as a YAML double-quoted string, escaping `\` and `"`. */
function yamlDouble(s: string): string {
  return `"${String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Split leading `--- … ---` frontmatter from the body. `yaml` is null if none. */
export function splitFrontmatter(contents: string): {
  yaml: string | null;
  body: string;
} {
  // Consume the closing `---`, its newline, and the single blank-line separator
  // that add-zenodo-frontmatter writes (`---\n<yaml>---\n\n<body>`), so the body
  // starts at real content.
  const m = /^---\n([\s\S]*?)\n---\n?\n?/.exec(contents);
  if (!m) return { yaml: null, body: contents };
  return { yaml: m[1], body: contents.slice(m[0].length) };
}

/** Read a flat scalar key's value from a YAML block, unquoting if needed. */
export function getYamlScalar(yaml: string, key: string): string | null {
  const m = new RegExp(`^${key}:\\s*(.*)$`, "m").exec(yaml);
  if (!m) return null;
  let v = m[1].trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1).replace(/\\(["\\])/g, "$1");
  }
  return v;
}

/**
 * Replace a flat scalar key's line with `key: "value"`, appending the key if it
 * is not already present. Newlines in the value are collapsed to spaces so the
 * result stays a valid single-line double-quoted scalar.
 */
export function setYamlScalar(yaml: string, key: string, value: string): string {
  const flat = String(value).replace(/\s*\n\s*/g, " ").trim();
  const re = new RegExp(`^${key}:\\s`);
  const lines = yaml.split("\n");
  let found = false;
  const out = lines.map((l) => {
    if (!found && re.test(l)) {
      found = true;
      return `${key}: ${yamlDouble(flat)}`;
    }
    return l;
  });
  if (!found) out.push(`${key}: ${yamlDouble(flat)}`);
  return out.join("\n");
}

/**
 * Remove a top-level YAML key and any indented child lines that belong to it
 * (e.g. a `keywords:` list). No-op if the key is absent.
 */
export function removeYamlBlock(yaml: string, key: string): string {
  const keyRe = new RegExp(`^${key}:(\\s|$)`);
  const out: string[] = [];
  let skipping = false;
  for (const l of yaml.split("\n")) {
    if (skipping) {
      if (/^\s/.test(l)) continue; // indented child → still part of the block
      skipping = false; // dedented → block ended; fall through to keep this line
    }
    if (keyRe.test(l)) {
      skipping = true;
      continue;
    }
    out.push(l);
  }
  return out.join("\n");
}

/**
 * Extract the titles of a document's top-level sections: the headings at the
 * shallowest heading level present (so `#` when the doc uses `#`, else `##`, …).
 * Headings inside fenced code blocks are ignored.
 */
export function extractSectionTitles(body: string): string[] {
  const headings: { level: number; text: string }[] = [];
  let inFence = false;
  let fenceChar = "";
  for (const line of body.split("\n")) {
    const fence = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fence) {
      const ch = fence[1][0];
      if (!inFence) {
        inFence = true;
        fenceChar = ch;
      } else if (ch === fenceChar) {
        inFence = false;
      }
      continue;
    }
    if (inFence) continue;
    const h = /^(#{1,6})\s+(.*\S)\s*$/.exec(line);
    if (h) {
      const text = h[2].replace(/\s+#+\s*$/, "").trim(); // drop trailing ### markers
      if (text) headings.push({ level: h[1].length, text });
    }
  }
  if (headings.length === 0) return [];
  const min = Math.min(...headings.map((h) => h.level));
  return headings.filter((h) => h.level === min).map((h) => h.text);
}

/** One-line abstract listing the SI's section titles (no AI, no metadata). */
export function summarizeSections(titles: string[]): string {
  const base =
    "This document provides supplementary information for the main manuscript";
  return titles.length === 0
    ? `${base}.`
    : `${base}, comprising: ${titles.join("; ")}.`;
}

export interface SupplementaryOptions {
  /** Manual abstract; overrides the auto-summary when non-blank. */
  abstract?: string;
  /** When true (default) and no manual abstract, summarize the section titles. */
  summarizeSections?: boolean;
}

/**
 * Transform a compiled manuscript into a Supplementary Information document:
 *
 * 1. Prepend the S-numbering raw-LaTeX block (figures/tables → S1, S2, …).
 * 2. Retitle it `Supplementary Information for "<original title>"`.
 * 3. Drop the `keywords:` block.
 * 4. Replace the abstract with the manual one, else an auto-summary of the
 *    section titles, else empty.
 *
 * When the input has no frontmatter, only step 1 is applied (there is nothing to
 * retitle) so the step still produces valid S-numbered output.
 */
export function transformToSupplementary(
  contents: string,
  opts: SupplementaryOptions = {}
): string {
  const { yaml, body } = splitFrontmatter(contents);

  const manual = (opts.abstract ?? "").trim();
  const summarize = opts.summarizeSections !== false;
  const abstract = manual
    ? manual
    : summarize
    ? summarizeSections(extractSectionTitles(body))
    : "";

  if (yaml === null) {
    return `${SUPPLEMENTARY_PREAMBLE}\n\n${body}`;
  }

  let y = yaml;
  const title = getYamlScalar(y, "title");
  if (title !== null) {
    y = setYamlScalar(y, "title", `Supplementary Information for "${title}"`);
  }
  y = removeYamlBlock(y, "keywords");
  y = setYamlScalar(y, "abstract", abstract);

  return `---\n${y}\n---\n\n${SUPPLEMENTARY_PREAMBLE}\n\n${body}`;
}
