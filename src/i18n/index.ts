import { derived, get, writable } from "svelte/store";

import { en } from "./en";
import { zh } from "./zh";

export type Locale = "en" | "zh";
/** All valid message keys, derived from the English source catalog. */
export type MessageKey = keyof typeof en;
/** Shape every locale catalog must satisfy. */
export type Messages = Record<MessageKey, string>;

const catalogs: Record<Locale, Messages> = { en, zh };

/** The active UI locale. Driven by `controller.ts`; defaults to English. */
export const locale = writable<Locale>("en");

type Vars = Record<string, string | number>;

function format(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (whole, key) =>
    key in vars ? String(vars[key]) : whole
  );
}

function lookup(loc: Locale, key: MessageKey, vars?: Vars): string {
  const message = catalogs[loc]?.[key] ?? en[key] ?? key;
  return format(message, vars);
}

/**
 * Imperative translator for non-reactive contexts (.ts: command names, notices).
 * Reads the current locale at call time.
 */
export function translate(key: MessageKey, vars?: Vars): string {
  return lookup(get(locale), key, vars);
}

/**
 * Reactive translator store for Svelte components: `{$t("key")}` re-renders when
 * the locale changes.
 */
export const t = derived(
  locale,
  ($locale) =>
    (key: MessageKey, vars?: Vars): string =>
      lookup($locale, key, vars)
);

export function setLocale(loc: Locale): void {
  locale.set(loc);
}
