/**
 * Pure logic for the manuscript-reference authoring commands (the TS
 * reimplementation of the QuickAdd `mark-manuscript-span` / `insert-manuscript-ref`
 * scripts). Side-effect free and unit-tested; the command file wires it to the
 * Obsidian editor + a fuzzy picker. See 回复信手稿引用规范 §2.1, §6.
 */

/** Scene basename → span-id prefix. Falls back to the first letters of the name. */
const SECTION_PREFIX: Record<string, string> = {
  introduction: "intro",
  intro: "intro",
  background: "bg",
  results: "res",
  result: "res",
  methods: "meth",
  method: "meth",
  discussion: "disc",
  conclusion: "concl",
  abstract: "abs",
  "odd+": "odd",
  odd: "odd",
};

const STOPWORDS = new Set([
  "the","a","an","of","and","or","to","in","on","for","with","that","this",
  "is","are","was","were","be","by","as","at","from","it","we","our","their",
]);

export function sectionPrefix(sceneName: string): string {
  const key = sceneName.trim().toLowerCase();
  if (SECTION_PREFIX[key]) return SECTION_PREFIX[key];
  const letters = key.replace(/[^a-z0-9]/g, "");
  return letters ? letters.slice(0, 4) : "ms";
}

/** A short semantic slug from selected text: drop citations/stopwords, first few words. */
export function slugFromText(text: string): string {
  const cleaned = text
    .replace(/\[@[^\]]*\]/g, " ") // drop [@cite]
    .replace(/[^\p{L}\p{N}\s-]/gu, " ") // keep letters/numbers/space/hyphen
    .toLowerCase();
  const words = cleaned
    .split(/\s+/)
    .filter((w) => w.length > 0 && !STOPWORDS.has(w));
  const slug = words.slice(0, 4).join("-").slice(0, 40).replace(/-+$/g, "");
  return slug || "span";
}

/** A unique span id `prefix-slug`, disambiguated with `-2`, `-3`… against `existing`. */
export function generateSpanId(
  sceneName: string,
  selection: string,
  existing: Iterable<string>
): string {
  const taken = new Set(existing);
  const base = `${sectionPrefix(sceneName)}-${slugFromText(selection)}`;
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** Sanitize a user-edited id to the allowed character set. */
export function sanitizeSpanId(id: string): string {
  return id.trim().replace(/[^\w-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

export function wrapSelection(selection: string, id: string): string {
  return `<!--ms:${id}-->${selection}<!--/ms:${id}-->`;
}

export function insertRefText(id: string): string {
  return "```manuscript\n@" + id + "\n```\n";
}

export interface ManuscriptSpan {
  id: string;
  preview: string;
  file: string;
}

/**
 * Extract `<!--ms:id-->body<!--/ms:id-->` spans from a set of source files.
 * `preview` is the whitespace-collapsed body. Ids are `[\w-]` (hyphens survive).
 */
export function scanSpans(
  files: { name: string; content: string }[]
): ManuscriptSpan[] {
  const spans: ManuscriptSpan[] = [];
  const re = /<!--ms:([\w-]+)-->([\s\S]*?)<!--\/ms:\1-->/g;
  for (const f of files) {
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(f.content)) !== null) {
      spans.push({
        id: m[1],
        preview: m[2].replace(/\s+/g, " ").trim(),
        file: f.name,
      });
    }
  }
  spans.sort((a, b) => a.id.localeCompare(b.id));
  return spans;
}

/** All existing span ids across the given files (for uniqueness checks). */
export function existingSpanIds(
  files: { name: string; content: string }[]
): Set<string> {
  return new Set(scanSpans(files).map((s) => s.id));
}

/** Display string for the fuzzy picker: `id — preview…`. */
export function spanDisplay(span: ManuscriptSpan): string {
  const preview = span.preview.slice(0, 60);
  return `${span.id} — ${preview}${span.preview.length > 60 ? "…" : ""}`;
}
