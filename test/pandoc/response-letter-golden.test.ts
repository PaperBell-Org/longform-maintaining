import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

/**
 * End-to-end golden test of the response-letter Lua engine (manuscript_include +
 * responseletter). Given a manuscript with a <!--ms:id--> span + a figure, a
 * letter that cites them, and pre-baked sidecars, it runs the REAL pandoc
 * response-letter pipeline to LaTeX and asserts the gray box carries the synced
 * text + Page/Line, and the pulled figure shows the manuscript number.
 *
 * Gated: skips unless pandoc is on PATH AND the synced assets are present (so CI
 * without the Pandoc toolchain stays green; runs locally). No xelatex needed —
 * we assert the generated LaTeX, not a PDF.
 */
function hasBin(name: string): boolean {
  try {
    execFileSync("which", [name], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const ASSETS = path.resolve(process.cwd(), "pandoc-assets");
const RESP_YAML = path.join(ASSETS, "defaults", "response-letter.yaml");
const CSL = path.join(ASSETS, "csl", "nature.csl");
const present = hasBin("pandoc") && fs.existsSync(RESP_YAML) && fs.existsSync(CSL);

describe.skipIf(!present)("response-letter golden (real pandoc)", () => {
  let out = "";
  let tmp = "";

  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "longform-rl-golden-"));
    fs.mkdirSync(path.join(tmp, "source"));
    fs.writeFileSync(
      path.join(tmp, "source", "Manuscript.md"),
      "# Introduction\n\n" +
        "Baz. <!--ms:intro-def-->Shifting Baseline Syndrome is a perceptual bias.<!--/ms:intro-def--> More.\n\n" +
        "![Overview of the system.](figs/overview.png){#fig:overview}\n"
    );
    fs.writeFileSync(
      path.join(tmp, "letter.md"),
      "Reviewer asked for the definition.\n\n" +
        "```manuscript\n@intro-def\n```\n\n" +
        "And the figure:\n\n" +
        "```manuscript\n@fig:overview\n```\n"
    );
    fs.writeFileSync(
      path.join(tmp, "manuscript-lines.json"),
      '{"intro-def":{"sline":12,"eline":14,"page":2}}'
    );
    fs.writeFileSync(
      path.join(tmp, "figure-numbers.json"),
      '{"fig:overview":"1"}'
    );

    out = execFileSync(
      "pandoc",
      [
        path.join(tmp, "letter.md"),
        "--defaults=" + RESP_YAML,
        "--csl=" + CSL,
        "-t",
        "latex",
      ],
      { cwd: ASSETS, encoding: "utf8" }
    );
  });

  afterAll(() => {
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("wraps the cited span in a manuscript box with injected Page/Line", () => {
    expect(out).toMatch(/\\begin\{manuscript\}\[[^\]]*page=2[^\]]*sline=12[^\]]*eline=14/);
  });

  it("pulls the manuscript's CURRENT text into the box", () => {
    expect(out).toContain("Shifting Baseline Syndrome is a perceptual bias.");
  });

  it("renders the pulled figure with the manuscript's figure number", () => {
    expect(out).toContain("\\renewcommand{\\thefigure}{1}");
    expect(out).toContain("Overview of the system.");
  });
});
