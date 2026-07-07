import { derived, type Unsubscriber } from "svelte/store";

import { pluginSettings } from "src/model/stores";
import { paperbell } from "src/paperbell/store";
import { locale, type Locale } from "./index";

/** The stored preference: an explicit locale, or "auto" to follow the environment. */
export type LanguagePreference = "auto" | Locale;

/** Best-effort read of Obsidian's own UI language (falls back to English). */
function obsidianLocale(): Locale {
  try {
    const lang = (window.localStorage.getItem("language") || "en").toLowerCase();
    return lang.startsWith("zh") ? "zh" : "en";
  } catch {
    return "en";
  }
}

/**
 * Resolve the effective locale from three inputs, in priority order:
 *   1. an explicit user preference ("en" / "zh") always wins;
 *   2. otherwise ("auto") follow the connected PaperBell host's language;
 *   3. otherwise fall back to Obsidian's UI language.
 */
export function resolveLocale(
  preference: LanguagePreference,
  hostLanguage: Locale | undefined
): Locale {
  if (preference === "en" || preference === "zh") return preference;
  return hostLanguage ?? obsidianLocale();
}

/**
 * Keep the active `locale` in sync with the plugin's language preference and the
 * PaperBell host's language. Returns an unsubscriber; call it on plugin unload.
 */
export function startLocaleSync(): Unsubscriber {
  const effective = derived(
    [pluginSettings, paperbell],
    ([$settings, $paperbell]): Locale => {
      const preference: LanguagePreference = $settings?.language ?? "auto";
      const hostLanguage = $paperbell.connected
        ? $paperbell.config?.language
        : undefined;
      return resolveLocale(preference, hostLanguage);
    }
  );
  return effective.subscribe((loc) => locale.set(loc));
}
