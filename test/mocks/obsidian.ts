/**
 * Minimal stand-in for the `obsidian` module under vitest.
 *
 * The real package ships types only (`"main": ""`), so any `src` module with a
 * *value* import from `obsidian` — `normalizePath`, or a class used at runtime —
 * cannot be loaded in tests at all. That is why pure logic in this repo is
 * conventionally split into `*-utils.ts` siblings.
 *
 * This stub exists so the compile core itself (`src/compile/index.ts`, which
 * needs only `normalizePath`) can be tested directly. It is deliberately thin:
 * add an export when a test needs one, and prefer testing pure modules over
 * growing fake Obsidian behavior here.
 *
 * Wired up via the `obsidian` alias in `vitest.config.ts`.
 */

/** Faithful port of Obsidian's path normalization: collapse slashes, trim edges. */
export function normalizePath(path: string): string {
  const collapsed = path.replace(/([\\/])+/g, "/").replace(/(^\/+|\/+$)/g, "");
  return collapsed === "" ? "/" : collapsed;
}

export class App {}
export class Vault {}
export class TAbstractFile {}
export class TFile extends TAbstractFile {}
export class TFolder extends TAbstractFile {}
export class Component {}
export class Plugin extends Component {}
export class Modal {}
export class FuzzySuggestModal extends Modal {}
export class PluginSettingTab {}
export class Setting {}
export class Notice {}
export class FileSystemAdapter {}
export class MarkdownView {}
export class FileView {}

export const Keymap = { isModEvent: () => false };

export function debounce<T extends (...args: never[]) => unknown>(fn: T): T {
  return fn;
}

export async function requestUrl(): Promise<never> {
  throw new Error("requestUrl is not available in tests.");
}
