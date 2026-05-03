/**
 * Resolve a dot/bracket path expression against a value.
 * Supports `a.b.c` and `a.b[0].c` mixed notation. Returns `undefined`
 * for any segment that does not resolve.
 */
export function getByPath(root: unknown, pathExpr: string): unknown {
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
