import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { patchReferenceDocx } from "src/model/docx-font-patch";

const STYLES = `<?xml version="1.0"?><w:styles xmlns:w="w">
<w:style w:styleId="Normal"><w:rPr><w:rFonts w:ascii="Times New Roman" w:eastAsia="宋体" w:hAnsi="Times New Roman"/></w:rPr></w:style>
<w:style w:styleId="Heading1"><w:rPr><w:rFonts w:eastAsia="黑体" w:cstheme="majorBidi"/></w:rPr></w:style>
<w:style w:styleId="Code"><w:rPr><w:rFonts w:asciiTheme="minorHAnsi" w:eastAsiaTheme="minorEastAsia"/></w:rPr></w:style>
</w:styles>`;
const THEME = `<a:theme xmlns:a="a"><a:fontScheme><a:minorFont>
<a:latin typeface="Aptos"/><a:ea typeface=""/><a:cs typeface=""/>
<a:font script="Hans" typeface="宋体"/><a:font script="Hant" typeface="新細明體"/>
</a:minorFont></a:fontScheme></a:theme>`;
const FONT_TABLE = `<w:fonts xmlns:w="w"><w:font w:name="宋体"/></w:fonts>`;

function makeDocx(): Uint8Array {
  return zipSync({
    "[Content_Types].xml": strToU8("<Types/>"),
    "word/styles.xml": strToU8(STYLES),
    "word/theme/theme1.xml": strToU8(THEME),
    "word/fontTable.xml": strToU8(FONT_TABLE),
    "word/document.xml": strToU8("<w:document/>"),
  });
}

describe("patchReferenceDocx", () => {
  it("swaps Windows fonts in styles and the theme's Hans font on mac", () => {
    const res = patchReferenceDocx(makeDocx(), "mac");
    if (!res) throw new Error("expected a patch");
    const out = unzipSync(res.bytes);
    const styles = strFromU8(out["word/styles.xml"]);
    expect(styles).toContain('w:eastAsia="Songti SC"');
    expect(styles).toContain('w:eastAsia="Heiti SC"');
    // Theme references and the Latin core fonts are left as they are.
    expect(styles).toContain('w:ascii="Times New Roman"');
    expect(styles).toContain('w:eastAsiaTheme="minorEastAsia"');

    const theme = strFromU8(out["word/theme/theme1.xml"]);
    expect(theme).toContain('<a:font script="Hans" typeface="Songti SC"/>');
    expect(theme).toContain('<a:font script="Hant" typeface="新細明體"/>');
    expect(theme).toContain('<a:latin typeface="Aptos"/>');

    // Everything else survives byte for byte.
    expect(strFromU8(out["word/fontTable.xml"])).toBe(FONT_TABLE);
    expect(strFromU8(out["word/document.xml"])).toBe("<w:document/>");
    expect(res.changes.map((c) => c.to)).toContain("Songti SC");
  });

  it("returns null when the doc already suits the OS", () => {
    expect(patchReferenceDocx(makeDocx(), "win")).toBeNull();
  });

  const REAL = path.resolve(
    process.cwd(),
    "pandoc-assets/templates/demo-reference.docx"
  );
  it.skipIf(!fs.existsSync(REAL))(
    "adapts the market's demo reference doc for macOS",
    () => {
      const res = patchReferenceDocx(new Uint8Array(fs.readFileSync(REAL)), "mac");
      if (!res) throw new Error("expected a patch");
      const styles = strFromU8(unzipSync(res.bytes)["word/styles.xml"]);
      expect(styles).not.toContain('w:eastAsia="宋体"');
      expect(styles).toContain('w:eastAsia="Songti SC"');
    }
  );
});
