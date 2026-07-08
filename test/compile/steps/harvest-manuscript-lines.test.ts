import { describe, it, expect } from "vitest";
import {
  parseAuxLabels,
  captionSpanFigs,
  mergeSidecar,
  lineSidecarName,
  isSupplementaryFrontmatter,
  buildCaptureArgs,
  buildTexInputs,
} from "src/compile/steps/harvest-manuscript-lines-utils";

const AUX = [
  "\\newlabel{msl-intro-def}{{12}{3}{}{}{}}",
  "\\newlabel{msl-intro-def-end}{{15}{3}{}{}{}}",
  "\\newlabel{msl-blk-disc-limits}{{40}{7}}",
  "\\newlabel{msl-blk-disc-limits-end}{{44}{7}}",
  "\\newlabel{fig:overview}{{1}{4}{}{}{}}",
  "\\newlabel{fig:validate}{{S1}{9}{}{}{}}",
  "\\newlabel{tbl:demo}{{1}{5}{}{}{}}",
].join("\n");

describe("parseAuxLabels", () => {
  const { lines, figures, tables } = parseAuxLabels(AUX);

  it("pairs start/end line labels into a range + page", () => {
    expect(lines["intro-def"]).toEqual({ sline: 12, eline: 15, page: 3 });
    expect(lines["blk-disc-limits"]).toEqual({ sline: 40, eline: 44, page: 7 });
  });

  it("reads figure numbers (main integer, SI with S)", () => {
    expect(figures["fig:overview"]).toBe("1");
    expect(figures["fig:validate"]).toBe("S1");
  });

  it("reads table numbers", () => {
    expect(tables["tbl:demo"]).toBe("1");
  });

  it("fills a missing side from the other (lone start)", () => {
    const { lines: l } = parseAuxLabels("\\newlabel{msl-solo}{{7}{2}}");
    expect(l["solo"]).toEqual({ sline: 7, eline: 7, page: 2 });
  });

  it("warns on a one-sided label but stays silent for a complete span", () => {
    const warn: string[] = [];
    parseAuxLabels("\\newlabel{msl-solo-end}{{9}{2}}", (m) => warn.push(m));
    expect(warn).toHaveLength(1);
    expect(warn[0]).toContain("solo");
    expect(warn[0]).toContain("end");

    warn.length = 0;
    parseAuxLabels(
      "\\newlabel{msl-ok}{{3}{1}}\\newlabel{msl-ok-end}{{6}{1}}",
      (m) => warn.push(m)
    );
    expect(warn).toHaveLength(0);
  });
});

describe("captionSpanFigs", () => {
  it("maps a caption-embedded ms span to its figure number", () => {
    const md =
      "![A caption <!--ms:cap-note--> with cite](figs/x.png){#fig:overview}\n";
    expect(captionSpanFigs(md, { "fig:overview": "1" })).toEqual({
      "cap-note": { fig: "1" },
    });
  });
  it("ignores captions whose figure has no number", () => {
    const md = "![c <!--ms:x-->](a.png){#fig:missing}\n";
    expect(captionSpanFigs(md, {})).toEqual({});
  });
});

describe("mergeSidecar", () => {
  it("incoming wins, disjoint existing kept (main + SI accumulate)", () => {
    expect(mergeSidecar({ a: 1, b: 2 }, { b: 9, c: 3 })).toEqual({
      a: 1,
      b: 9,
      c: 3,
    });
  });
});

describe("SI routing", () => {
  it("picks the sidecar file by supplementary flag", () => {
    expect(lineSidecarName(false)).toBe("manuscript-lines.json");
    expect(lineSidecarName(true)).toBe("si-lines.json");
  });
  it("SI detected only from supplementary:true frontmatter", () => {
    expect(isSupplementaryFrontmatter({ supplementary: true })).toBe(true);
    expect(isSupplementaryFrontmatter({ supplementary: false })).toBe(false);
    expect(isSupplementaryFrontmatter({})).toBe(false);
  });
});

describe("buildCaptureArgs", () => {
  const args = buildCaptureArgs({
    inputFile: "/p/.harvest.md",
    defaultsFile: "/a/defaults/paperbell.yaml",
    cslFile: "/a/csl/nature.csl",
    projectAbs: "/p",
    texOutput: "/tmp/x/mslines.tex",
  });
  it("turns on mslabels and emits standalone latex (no PDF)", () => {
    expect(args).toContain("-M");
    expect(args).toContain("mslabels=true");
    expect(args).toContain("-t");
    expect(args).toContain("latex");
    expect(args).toContain("-s");
    expect(args.slice(-2)).toEqual(["-o", "/tmp/x/mslines.tex"]);
  });
  it("passes the same defaults/csl as the real export", () => {
    expect(args).toContain("--defaults=/a/defaults/paperbell.yaml");
    expect(args).toContain("--csl=/a/csl/nature.csl");
  });
  it("appends bibliography when given", () => {
    const withBib = buildCaptureArgs({
      inputFile: "/p/x.md",
      defaultsFile: "/a/d.yaml",
      cslFile: "/a/c.csl",
      projectAbs: "/p",
      texOutput: "/t/o.tex",
      bibliography: "/p/refs.bib",
    });
    expect(withBib).toContain("--bibliography=/p/refs.bib");
  });
});

describe("buildTexInputs", () => {
  it("includes the project + figs + assets templates dirs", () => {
    const t = buildTexInputs("/p", "/a");
    expect(t).toContain("/p");
    expect(t).toContain("/a/templates");
  });
});
