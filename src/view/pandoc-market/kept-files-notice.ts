import { Notice } from "obsidian";
import { translate } from "src/i18n";

/**
 * List the asset files an install or uninstall left alone because the user had
 * changed them (#48). `key` is `market.preservedFiles` (a `.new` was written
 * beside each) or `market.keptFiles` (uninstall).
 */
export function noticeKeptFiles(
  key: "market.preservedFiles" | "market.keptFiles",
  files: string[]
): void {
  if (files.length === 0) return;
  new Notice(
    translate(key, { count: String(files.length), files: files.join("\n") }),
    15000
  );
}
