import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { strFromU8, unzipSync } from "fflate";

import { ASSETS, hasBin } from "./golden-harness";
import {
  buildPandocArgs,
  planFontAdaptation,
} from "src/compile/steps/pandoc-export-utils";
import { fontOverrides } from "src/model/platform-fonts";
import { patchReferenceDocx } from "src/model/docx-font-patch";

/**
 * The OS font adaptation has to survive pandoc itself. Passing `-V` is only
 * useful if pandoc ranks it above the `metadata:` fonts a real preset sets, and
 * a patched reference doc only helps if pandoc carries its styles into the
 * output. Both are checked against real pandoc and the synced market assets.
 *
 * LaTeX and docx output only, so no TeX engine is needed. Skips without pandoc
 * or the synced assets.
 */
const PAPERBELL = path.join(ASSETS, "defaults", "paperbell.yaml");
const REFERENCE = path.join(ASSETS, "templates", "demo-reference.docx");
const present = hasBin("pandoc") && fs.existsSync(PAPERBELL);

/** paperbell.yaml's `metadata:` fonts, as exportTargetForDefaults reads them. */
const PAPERBELL_FONTS = {
  CJKmainfont: "Songti SC",
  CJKsansfont: "Heiti SC",
  CJKmonofont: "STFangsong",
  mainfont: "Times New Roman",
  sansfont: "Arial",
  monofont: "Courier New",
};

let work = "";
beforeAll(() => {
  work = fs.mkdtempSync(path.join(os.tmpdir(), "platform-fonts-golden-"));
  fs.writeFileSync(path.join(work, "note.md"), "# 标题\n\n中文正文。\n");
});
afterAll(() => {
  if (work) fs.rmSync(work, { recursive: true, force: true });
});

describe.skipIf(!present)("OS font adaptation through real pandoc", () => {
  it("replaces paperbell's macOS CJK fonts with Windows ones in the .tex", () => {
    const out = path.join(work, "out.tex");
    const changes = fontOverrides(PAPERBELL_FONTS, "win");
    const args = buildPandocArgs({
      inputFile: path.join(work, "note.md"),
      defaultsFile: PAPERBELL,
      cslFile: null,
      projectAbs: work,
      outputPath: out,
      variableOverrides: changes.map((c) => ({ key: c.key, value: c.to })),
    });
    // paperbell.yaml names its own output file; -t pins LaTeX for -o .tex.
    execFileSync("pandoc", [...args, "-t", "latex"], { cwd: ASSETS });
    const tex = fs.readFileSync(out, "utf8");
    expect(tex).toContain("\\setCJKmainfont[]{SimSun}");
    expect(tex).toContain("SimHei");
    expect(tex).toContain("FangSong");
    expect(tex).not.toContain("Songti SC");
    // The Latin core fonts exist on Windows too and must be left alone.
    expect(tex).toContain("Times New Roman");
  });

  it("lets the note's own CJKmainfont beat the preset's metadata font", () => {
    // Without the -V, pandoc ranks the defaults file's metadata above the
    // document's YAML and the preset's Songti SC would win.
    const note = path.join(work, "own-font.md");
    fs.writeFileSync(note, "---\nCJKmainfont: KaiTi\n---\n\n中文。\n");
    const out = path.join(work, "own-font.tex");
    const plan = planFontAdaptation({
      target: { ext: ".pdf", pdfEngine: "xelatex", needsCrossref: false, fonts: PAPERBELL_FONTS },
      builtin: false,
      enabled: true,
      os: "win",
      frontmatter: { CJKmainfont: "KaiTi" },
    });
    const args = buildPandocArgs({
      inputFile: note,
      defaultsFile: PAPERBELL,
      cslFile: null,
      projectAbs: work,
      outputPath: out,
      variableOverrides: plan.variables,
    });
    execFileSync("pandoc", [...args, "-t", "latex"], { cwd: ASSETS });
    const tex = fs.readFileSync(out, "utf8");
    expect(tex).toContain("\\setCJKmainfont[]{KaiTi}");
    expect(tex).toContain("SimHei"); // the other fonts are still adapted
  });

  it.skipIf(!fs.existsSync(REFERENCE))(
    "carries a patched reference doc's fonts into the .docx",
    () => {
      const patched = patchReferenceDocx(
        new Uint8Array(fs.readFileSync(REFERENCE)),
        "mac"
      );
      if (!patched) throw new Error("expected a patch");
      const ref = path.join(work, "ref-mac.docx");
      fs.writeFileSync(ref, patched.bytes);
      const out = path.join(work, "out.docx");
      execFileSync("pandoc", [
        path.join(work, "note.md"),
        "--reference-doc=" + ref,
        "-o",
        out,
      ]);
      const styles = strFromU8(
        unzipSync(new Uint8Array(fs.readFileSync(out)))["word/styles.xml"]
      );
      expect(styles).toContain('w:eastAsia="Songti SC"');
      expect(styles).not.toContain('w:eastAsia="宋体"');
    }
  );
});
