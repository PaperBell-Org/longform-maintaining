/** True for a non-null, non-array object literal. */
export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Deep-merge two parsed JSON values. Plain objects are merged key-by-key
 * (recursing on shared keys); everything else (scalars, arrays) from `b`
 * overrides `a`. `undefined` in `b` leaves `a` untouched. Used to combine
 * several data files (e.g. metadata.json + results.json) into one namespace.
 */
export function deepMerge(a: unknown, b: unknown): unknown {
  if (isPlainObject(a) && isPlainObject(b)) {
    const out: Record<string, unknown> = { ...a };
    for (const key of Object.keys(b)) {
      out[key] = key in a ? deepMerge(a[key], b[key]) : b[key];
    }
    return out;
  }
  return b === undefined ? a : b;
}
