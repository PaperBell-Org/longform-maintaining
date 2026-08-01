/**
 * Tagging for compile failures that are really *configuration* problems — the
 * user is missing a tool or an asset — rather than the export genuinely going
 * wrong. The UI reads the tag to offer a way to fix it instead of just showing
 * the log.
 *
 * The tag rides as a property on the thrown Error rather than an Error subclass
 * on purpose: the reader is `compile()` in this same folder, and an `instanceof`
 * check would force the compile core to import a step-side module. Keeping both
 * halves here means the dependency runs core → step, never the reverse.
 */

/** The Pandoc toolchain or its assets are missing or misconfigured. */
export const RECOVERABLE_PANDOC_SETUP = "pandoc-setup";

/** Every failure kind the UI knows how to offer a fix for. */
export type RecoverableKind = typeof RECOVERABLE_PANDOC_SETUP;

/** The property {@link RecoverableKind} rides on. */
const RECOVERABLE_PROPERTY = "longformRecoverable";

/** Build an Error tagged as a recoverable Pandoc setup problem. */
export function pandocSetupError(message: string): Error {
  const error = new Error(message);
  (error as Error & Record<string, unknown>)[RECOVERABLE_PROPERTY] =
    RECOVERABLE_PANDOC_SETUP;
  return error;
}

/** Read the recoverable tag off an unknown thrown value, if it has one. */
export function recoverableKindOf(error: unknown): RecoverableKind | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const value = (error as Record<string, unknown>)[RECOVERABLE_PROPERTY];
  return value === RECOVERABLE_PANDOC_SETUP ? value : undefined;
}
