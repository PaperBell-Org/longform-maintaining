import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import {
  buildPandocArgs,
  builtinExportTarget,
  builtinFrom,
  defaultCjkFont,
  hasCjk,
} from "src/compile/steps/pandoc-export-utils";

/**
 * End-to-end proof of the claim the built-in export is built on: that Quick
 * Export needs **no downloaded assets**. Runs real pandoc with the exact
 * argument vector `buildPandocArgs` produces, from a temp dir with no
 * `pandoc-assets` anywhere in sight — a unit test asserting the flags would
 * only prove we build the string we think we build, not that pandoc accepts it.
 *
 * Gated on the binaries, not on the assets (that is the point). Word needs
 * pandoc alone; the PDF case additionally needs xelatex, so it gates separately.
 */
function hasBin(name: string): boolean {
  try {
    execFileSync("which", [name], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const havePandoc = hasBin("pandoc");
const haveXelatex = hasBin("xelatex");

const NOTE = [
  "---",
  "title: 一个测试文档 A Test",
  "---",
  "",
  "# 引言 Introduction",
  "",
  "中英混排，带 *强调*、`代码`、==高亮== 和行内公式 \\(E=mc^2\\)。",
  "",
  "如前人所述 [@smith2020]，这一点很重要。",
  "",
  "| A | B |",
  "|---|---|",
  "| 1 | 2 |",
  "",
  "# References",
  "",
].join("\n");

const BIB = [
  "@article{smith2020,",
  "  title={A study of things},",
  "  author={Smith, Jane},",
  "  journal={Nature},",
  "  year={2020}",
  "}",
].join("\n");

describe.skipIf(!havePandoc)("built-in export (real pandoc, no assets)", () => {
  let tmp = "";
  let inputFile = "";
  let bib = "";

  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "longform-builtin-"));
    inputFile = path.join(tmp, ".longform-pandoc-export.md");
    bib = path.join(tmp, "references.bib");
    fs.writeFileSync(inputFile, NOTE);
    fs.writeFileSync(bib, BIB);
  });

  afterAll(() => {
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  });

  function run(format: "docx" | "html" | "pdf", pdfEngine: string | null) {
    const target = builtinExportTarget(format);
    const outputPath = path.join(tmp, "OUT" + target.ext);
    const args = buildPandocArgs({
      inputFile,
      defaultsFile: null,
      // No CSL: pandoc's own default style has to carry the citation.
      cslFile: null,
      projectAbs: tmp,
      outputPath,
      bibliographies: [bib],
      builtin: {
        format,
        from: builtinFrom(format),
        pdfEngine,
        cjkFont:
          format === "pdf" && hasCjk(NOTE) ? defaultCjkFont(process.platform) : null,
        citeproc: true,
      },
    });
    execFileSync("pandoc", args, { cwd: tmp, stdio: "pipe" });
    return outputPath;
  }

  it("writes a Word file with pandoc alone", () => {
    const out = run("docx", null);
    expect(fs.statSync(out).size).toBeGreaterThan(0);
    // Round-trip rather than eyeball the binary: the citation must have been
    // resolved by --citeproc, and the CJK must have survived.
    const text = execFileSync("pandoc", [out, "-t", "plain"], {
      encoding: "utf8",
    });
    expect(text).toContain("引言");
    expect(text).toContain("Smith");
    expect(text).not.toContain("[@smith2020]");
  });

  it("writes a self-contained HTML file", () => {
    const out = run("html", null);
    const html = fs.readFileSync(out, "utf8");
    expect(html).toContain("<html");
    expect(html).toContain("引言");
  });

  it.skipIf(!haveXelatex)("writes a PDF with CJK via xelatex", () => {
    // pdflatex cannot typeset CJK at all — it aborts and writes nothing — so
    // this is the case that justifies preferring xelatex and passing a font.
    const out = run("pdf", "xelatex");
    const bytes = fs.readFileSync(out);
    expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(1000);
  });
});
