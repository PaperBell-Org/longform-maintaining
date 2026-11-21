import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from "fflate";

import { translateFont, type FontChange, type OsId } from "./platform-fonts";

/**
 * Rewrite the font names a reference.docx's styles name, so Word on this OS
 * finds them installed instead of substituting its own guess.
 *
 * pandoc copies a reference doc's styles (styles.xml), numbering and theme into
 * the output, so those are the parts that matter:
 *  - `<w:rFonts w:ascii|w:hAnsi|w:eastAsia|w:cs="…">` in styles.xml and
 *    numbering.xml — the explicit per-style fonts.
 *  - `<a:latin|a:ea typeface>` and `<a:font script="Hans" typeface>` in the
 *    theme — what `w:*Theme="minorEastAsia"` style references resolve to.
 *
 * fontTable.xml is left alone: it only records metrics hints for the fonts the
 * document was saved with, and Word rebuilds it on save.
 *
 * Returns `null` when no font needed translating, so the caller keeps using the
 * original file untouched.
 */
export function patchReferenceDocx(
  bytes: Uint8Array,
  os: OsId
): { bytes: Uint8Array; changes: FontChange[] } | null {
  const files = unzipSync(bytes);
  const changes: FontChange[] = [];
  let touched = false;

  for (const name of Object.keys(files)) {
    let rewrite: ((xml: string) => string) | null = null;
    if (name === "word/styles.xml" || name === "word/numbering.xml") {
      rewrite = (xml) => patchRunFonts(xml, os, changes);
    } else if (/^word\/theme\/theme\d*\.xml$/.test(name)) {
      rewrite = (xml) => patchThemeFonts(xml, os, changes);
    }
    if (!rewrite) continue;
    const before = strFromU8(files[name]);
    const after = rewrite(before);
    if (after !== before) {
      files[name] = strToU8(after);
      touched = true;
    }
  }

  if (!touched) return null;
  return { bytes: zipSync(files as Zippable), changes };
}

const RUN_FONT_ATTR = /\bw:(ascii|hAnsi|eastAsia|cs)="([^"]*)"/g;

function patchRunFonts(xml: string, os: OsId, changes: FontChange[]): string {
  return xml.replace(/<w:rFonts\b[^>]*>/g, (tag) =>
    tag.replace(RUN_FONT_ATTR, (attr, which: string, value: string) => {
      const to = translateFont(decodeXml(value), os);
      if (!to) return attr;
      changes.push({ key: `w:${which}`, from: decodeXml(value), to });
      return `w:${which}="${encodeXml(to)}"`;
    })
  );
}

function patchThemeFonts(xml: string, os: OsId, changes: FontChange[]): string {
  return xml.replace(
    /<a:(latin|ea|font)\b[^>]*>/g,
    (tag, kind: string) => {
      // Of the per-script fonts only Simplified Chinese is ours to adapt.
      if (kind === "font" && !/\bscript="Hans"/.test(tag)) return tag;
      return tag.replace(/\btypeface="([^"]*)"/, (attr, value: string) => {
        const to = translateFont(decodeXml(value), os);
        if (!to) return attr;
        changes.push({ key: `theme:${kind}`, from: decodeXml(value), to });
        return `typeface="${encodeXml(to)}"`;
      });
    }
  );
}

function decodeXml(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function encodeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
