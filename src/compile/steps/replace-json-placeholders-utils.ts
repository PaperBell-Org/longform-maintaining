/**
 * Tokenize a dot/bracket path expression into its segments.
 * Supports `a.b.c` and `a.b[0].c` mixed notation.
 */
export function tokenizePath(pathExpr: string): string[] {
  const tokens: string[] = [];
  let buf = "";
  for (let i = 0; i < pathExpr.length; i++) {
    const ch = pathExpr[i];
    if (ch === ".") {
      if (buf) {
        tokens.push(buf);
        buf = "";
      }
    } else if (ch === "[") {
      if (buf) {
        tokens.push(buf);
        buf = "";
      }
      let j = i + 1;
      let idx = "";
      while (j < pathExpr.length && pathExpr[j] !== "]") {
        idx += pathExpr[j++];
      }
      i = j;
      tokens.push(idx.trim());
    } else {
      buf += ch;
    }
  }
  if (buf) tokens.push(buf);
  return tokens;
}

/**
 * Resolve a dot/bracket path expression against a value.
 * Supports `a.b.c` and `a.b[0].c` mixed notation. Returns `undefined`
 * for any segment that does not resolve.
 */
export function getByPath(root: unknown, pathExpr: string): unknown {
  const tokens = tokenizePath(pathExpr);

  let cur: unknown = root;
  for (const t of tokens) {
    if (cur === null || cur === undefined) return undefined;
    if (/^\d+$/.test(t)) {
      const idx = parseInt(t, 10);
      if (!Array.isArray(cur) || idx < 0 || idx >= cur.length) return undefined;
      cur = cur[idx];
    } else if (typeof cur === "object") {
      const obj = cur as Record<string, unknown>;
      cur = Object.prototype.hasOwnProperty.call(obj, t) ? obj[t] : undefined;
    } else {
      return undefined;
    }
  }
  return cur;
}

/**
 * Set a value at a dot/bracket path on `root`, mutating and returning it.
 *
 * Intermediate object keys that are missing are created as plain objects so a
 * brand-new top-level variable (e.g. `{{deadline}}`) can be defined. Existing
 * scalar leaves are overwritten. Returns `false` (and makes no change) when the
 * path traverses through an array index or a non-object value that can't be
 * safely created/updated — callers should surface a "use the full editor"
 * message in that case.
 */
export function setByPath(
  root: Record<string, unknown>,
  pathExpr: string,
  value: unknown
): boolean {
  const tokens = tokenizePath(pathExpr);
  if (tokens.length === 0) return false;
  // Only support object-key paths for in-place editing; array creation/indexing
  // is out of scope for the lightweight double-click editor.
  if (tokens.some((t) => /^\d+$/.test(t))) return false;

  let cur: Record<string, unknown> = root;
  for (let i = 0; i < tokens.length - 1; i++) {
    const t = tokens[i];
    const next = cur[t];
    if (next === undefined || next === null) {
      const created: Record<string, unknown> = {};
      cur[t] = created;
      cur = created;
    } else if (typeof next === "object" && !Array.isArray(next)) {
      cur = next as Record<string, unknown>;
    } else {
      // would have to overwrite a scalar/array with an object — refuse
      return false;
    }
  }
  cur[tokens[tokens.length - 1]] = value;
  return true;
}

/**
 * Render a resolved JSON value the way placeholders are substituted: `null`
 * becomes the empty string, objects/arrays are JSON-stringified, everything
 * else is coerced with `String`. Shared by the compile step and live rendering
 * so previewed and compiled output agree.
 */
export function formatPlaceholderValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

/** Build a global regex matching `<start> path <end>` placeholders. */
export function buildPlaceholderRegex(
  startDelim: string,
  endDelim: string
): RegExp {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `${esc(startDelim)}\\s*([a-zA-Z0-9_.$\\[\\]-]+)\\s*${esc(endDelim)}`,
    "g"
  );
}
