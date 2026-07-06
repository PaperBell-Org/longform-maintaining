import { describe, expect, it } from "vitest";
import { unzipSync, zipSync, strToU8, strFromU8 } from "fflate";
import {
  buildExecPath,
  buildExportFilename,
  buildPandocArgs,
  commonTopDir,
  COMMON_BIN_DIRS,
  hasCitations,
  parseExportFrontmatter,
  renderFilenamePattern,
  sanitizeExportFilename,
  resolveBinary,
  resolveUserPath,
} from "src/compile/steps/pandoc-export-utils";

describe("parseExportFrontmatter", () => {
  const fm = parseExportFrontmatter(
    [
      "---",
      'title: "A Study"',
      'date: "2026-07-01"',
      "authors:",
      '  - name: "Doe, Jane"',
      "    affiliation: [1, 2]",
      'acronym: "PBMIN"',
      'csl: "nature"',
      'template: "default"',
      "supplementary: true",
      "numbersections: true",
      "---",
      "",
      "# Body",
    ].join("\n")
  );

  it("reads the flat scalar keys the export needs", () => {
    expect(fm.acronym).toBe("PBMIN");
    expect(fm.date).toBe("2026-07-01");
    expect(fm.csl).toBe("nature");
    expect(fm.template).toBe("default");
    expect(fm.supplementary).toBe(true);
  });

  it("ignores nested / list lines", () => {
    expect(fm.authors).toBeUndefined();
    expect(fm.name).toBeUndefined();
  });

  it("returns empty for no frontmatter", () => {
    expect(parseExportFrontmatter("# Just a heading")).toEqual({});
  });
});

describe("hasCitations", () => {
  it("detects bracketed and bare citations in the body", () => {
    expect(hasCitations("see [@doe2020] here")).toBe(true);
    expect(hasCitations("as @doe2020 showed")).toBe(true);
    expect(hasCitations("multiple [@a2020; @b2021]")).toBe(true);
  });

  it("excludes crossrefs and emails and empty bodies", () => {
    expect(hasCitations("as shown in @fig:demo and @tbl:x")).toBe(false);
    expect(hasCitations("email a@b.com only")).toBe(false);
    expect(hasCitations("no citations here")).toBe(false);
  });

  it("ignores citations that appear only in frontmatter", () => {
    const doc = '---\nfoo: "@notacite"\n---\n\nplain body';
    expect(hasCitations(doc)).toBe(false);
  });
});

describe("resolveBinary", () => {
  const present = new Set(["/opt/homebrew/bin/pandoc", "/usr/bin/xelatex"]);
  const exists = (p: string) => present.has(p);
  const dirs = ["/opt/homebrew/bin", "/usr/bin"];

  it("finds a bare name in the search dirs", () => {
    expect(resolveBinary("pandoc", exists, dirs)).toBe("/opt/homebrew/bin/pandoc");
    expect(resolveBinary("xelatex", exists, dirs)).toBe("/usr/bin/xelatex");
  });

  it("honors an explicit path when it exists", () => {
    expect(resolveBinary("/opt/homebrew/bin/pandoc", exists, dirs)).toBe(
      "/opt/homebrew/bin/pandoc"
    );
    expect(resolveBinary("/nope/pandoc", exists, dirs)).toBeNull();
  });

  it("returns null when not found", () => {
    expect(resolveBinary("pandoc-crossref", exists, dirs)).toBeNull();
  });
});

describe("buildExecPath", () => {
  it("prepends common bin dirs and dedupes existing entries", () => {
    const out = buildExecPath("/usr/bin:/opt/homebrew/bin", "/home/u").split(":");
    for (const d of COMMON_BIN_DIRS) expect(out).toContain(d);
    // no duplicates
    expect(new Set(out).size).toBe(out.length);
    // common dirs come first
    expect(out[0]).toBe("/opt/homebrew/bin");
  });
});

describe("resolveUserPath", () => {
  it("keeps absolute paths, expands ~, and joins vault-relative paths", () => {
    expect(resolveUserPath("/abs/x", "/vault", "/home/u")).toBe("/abs/x");
    expect(resolveUserPath("~/x", "/vault", "/home/u")).toBe("/home/u/x");
    expect(resolveUserPath("assets/pandoc", "/vault", "/home/u")).toBe(
      "/vault/assets/pandoc"
    );
  });
});

describe("renderFilenamePattern", () => {
  const vars = { title: "A Study", acronym: "PBMIN", date: "2026-07-01" };

  it("substitutes known {var} tokens", () => {
    expect(renderFilenamePattern("{acronym}_{date}", vars)).toBe(
      "PBMIN_2026-07-01"
    );
    expect(renderFilenamePattern("{title}", vars)).toBe("A Study");
  });

  it("leaves unknown tokens literal so typos stay visible", () => {
    expect(renderFilenamePattern("{acronym}-{nope}", vars)).toBe(
      "PBMIN-{nope}"
    );
  });
});

describe("sanitizeExportFilename", () => {
  it("drops path separators and illegal chars but keeps spaces", () => {
    expect(sanitizeExportFilename("A Study: v2/final")).toBe("A Study- v2-final");
    expect(sanitizeExportFilename("my<name>|x")).toBe("my-name-x");
  });

  it("strips leading dots and falls back when empty", () => {
    expect(sanitizeExportFilename("...hidden")).toBe("hidden");
    expect(sanitizeExportFilename("   ")).toBe("manuscript");
    expect(sanitizeExportFilename("/")).toBe("manuscript");
  });
});

describe("buildExportFilename", () => {
  const vars = { title: "A Study", acronym: "PBMIN", date: "2026-07-01" };

  it("renders the pattern and appends .pdf", () => {
    expect(buildExportFilename("{acronym}_{date}", vars, "Fallback")).toBe(
      "PBMIN_2026-07-01.pdf"
    );
  });

  it("falls back to the given name when the pattern is blank", () => {
    expect(buildExportFilename("   ", vars, "Main Manuscript")).toBe(
      "Main Manuscript.pdf"
    );
  });

  it("does not double the .pdf extension", () => {
    expect(buildExportFilename("{acronym}.pdf", vars, "x")).toBe("PBMIN.pdf");
    expect(buildExportFilename("{acronym}.PDF", vars, "x")).toBe("PBMIN.PDF");
  });
});

describe("buildPandocArgs", () => {
  const base = {
    inputFile: "/v/p/.tmp.md",
    defaultsFile: "/a/defaults/undefined.yaml",
    cslFile: "/a/csl/nature.csl",
    projectAbs: "/v/p",
    outputPath: "/v/p/OUT.pdf",
  };

  it("mirrors the PaperBell §11 command and appends bibliography when given", () => {
    const args = buildPandocArgs({ ...base, bibliography: "/v/p/references.bib" });
    expect(args).toEqual([
      "/v/p/.tmp.md",
      "--defaults=/a/defaults/undefined.yaml",
      "--csl=/a/csl/nature.csl",
      "--resource-path=/v/p",
      "--resource-path=/v/p/figs",
      "--resource-path=/v/figs",
      "--bibliography=/v/p/references.bib",
      "-o",
      "/v/p/OUT.pdf",
    ]);
  });

  it("omits --bibliography when none is provided", () => {
    const args = buildPandocArgs({ ...base, bibliography: null });
    expect(args.some((a) => a.startsWith("--bibliography="))).toBe(false);
  });
});

describe("commonTopDir (zip extraction)", () => {
  it("detects a single wrapping folder (GitHub zipball)", () => {
    expect(
      commonTopDir([
        "repo-main/defaults/undefined.yaml",
        "repo-main/csl/nature.csl",
      ])
    ).toBe("repo-main/");
  });

  it("returns empty for a flat release-asset zip", () => {
    expect(
      commonTopDir(["defaults/undefined.yaml", "csl/nature.csl"])
    ).toBe("");
  });
});

describe("fflate unzip (download extraction round-trips)", () => {
  it("round-trips a small toolchain-shaped zip", () => {
    const zip = zipSync({
      "defaults/undefined.yaml": strToU8("pdf-engine: xelatex\n"),
      "csl/nature.csl": strToU8("<style/>"),
      "filters/image.lua": strToU8("-- image"),
    });
    const files = unzipSync(zip);
    const paths = Object.keys(files).filter((p) => !p.endsWith("/"));
    expect(commonTopDir(paths)).toBe("");
    expect(strFromU8(files["defaults/undefined.yaml"])).toContain("xelatex");
    expect(paths.sort()).toEqual([
      "csl/nature.csl",
      "defaults/undefined.yaml",
      "filters/image.lua",
    ]);
  });
});

