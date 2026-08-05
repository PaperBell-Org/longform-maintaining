import { describe, expect, it } from "vitest";
import { unzipSync, zipSync, strToU8, strFromU8 } from "fflate";
import {
  binSearchDirs,
  buildExecPath,
  buildExportFilename,
  buildPandocArgs,
  builtinExportTarget,
  builtinFrom,
  commonTopDir,
  COMMON_BIN_DIRS,
  defaultCjkFont,
  hasCjk,
  isBuiltinFormat,
  exportTargetForDefaults,
  extractCiteKeys,
  findDuplicateCiteKeys,
  hasCitations,
  isFullOutputPath,
  normalizeCslId,
  officialCslUrls,
  parseExportFrontmatter,
  renderFilenamePattern,
  sanitizeExportFilename,
  resolveBinary,
  resolveBuiltinFormat,
  resolveUserPath,
  splitBibList,
  zoteroStylesDir,
  type PandocArgPaths,
  type PlatformEnv,
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
    expect(resolveBinary("pandoc", exists, dirs, false)).toBe("/opt/homebrew/bin/pandoc");
    expect(resolveBinary("xelatex", exists, dirs, false)).toBe("/usr/bin/xelatex");
  });

  it("honors an explicit path when it exists", () => {
    expect(resolveBinary("/opt/homebrew/bin/pandoc", exists, dirs, false)).toBe(
      "/opt/homebrew/bin/pandoc"
    );
    expect(resolveBinary("/nope/pandoc", exists, dirs, false)).toBeNull();
  });

  it("returns null when not found", () => {
    expect(resolveBinary("pandoc-crossref", exists, dirs, false)).toBeNull();
  });

  describe("on Windows", () => {
    const win = new Set([
      "C:\\Users\\Admin\\AppData\\Local\\Pandoc\\pandoc.exe",
      "C:\\Program Files\\MiKTeX\\miktex\\bin\\x64\\xelatex.exe",
    ]);
    const winExists = (p: string) => win.has(p);
    const winDirs = [
      "C:\\Users\\Admin\\AppData\\Local\\Pandoc",
      "C:\\Program Files\\MiKTeX\\miktex\\bin\\x64",
    ];

    it("appends .exe, which is what is actually on disk", () => {
      expect(resolveBinary("pandoc", winExists, winDirs, true)).toBe(
        "C:\\Users\\Admin\\AppData\\Local\\Pandoc\\pandoc.exe"
      );
      expect(resolveBinary("xelatex", winExists, winDirs, true)).toBe(
        "C:\\Program Files\\MiKTeX\\miktex\\bin\\x64\\xelatex.exe"
      );
    });

    it("does not double an extension the caller already gave", () => {
      expect(resolveBinary("pandoc.exe", winExists, winDirs, true)).toBe(
        "C:\\Users\\Admin\\AppData\\Local\\Pandoc\\pandoc.exe"
      );
    });

    it("treats a backslash absolute path as a path, not a name to search for", () => {
      // This is what a user types into the "Pandoc binary" setting. It has no
      // "/", so the old check sent it to the directory scan and it never matched.
      expect(
        resolveBinary(
          "C:\\Users\\Admin\\AppData\\Local\\Pandoc\\pandoc.exe",
          winExists,
          winDirs,
          true
        )
      ).toBe("C:\\Users\\Admin\\AppData\\Local\\Pandoc\\pandoc.exe");
      expect(resolveBinary("D:\\nope\\pandoc.exe", winExists, winDirs, true)).toBeNull();
    });

    it("still accepts a forward-slash absolute path", () => {
      // The only workaround available to Windows users today. Breaking it would
      // strand anyone who already worked around the bug this way.
      const fwd = new Set(["C:/Tools/pandoc.exe"]);
      expect(
        resolveBinary("C:/Tools/pandoc.exe", (p) => fwd.has(p), winDirs, true)
      ).toBe("C:/Tools/pandoc.exe");
    });

    it("does not append .exe on other platforms", () => {
      const posix = new Set(["/usr/bin/pandoc.exe"]);
      expect(
        resolveBinary("pandoc", (p) => posix.has(p), ["/usr/bin"], false)
      ).toBeNull();
    });
  });
});

describe("binSearchDirs", () => {
  it("searches PATH — the reason Windows found nothing", () => {
    // The hardcoded list exists because macOS GUI processes don't inherit the
    // login shell's PATH. Windows processes do, and every Windows installer
    // (MSI, MiKTeX, choco, scoop, winget) puts its bin dir on PATH — so not
    // searching PATH is what actually broke Windows, not the missing dirs.
    const dirs = binSearchDirs({
      isWindows: true,
      home: "C:\\Users\\Admin",
      envPath: "C:\\Users\\Admin\\AppData\\Local\\Pandoc;C:\\Windows",
      extraDirs: [],
    });
    expect(dirs).toContain("C:\\Users\\Admin\\AppData\\Local\\Pandoc");
    expect(dirs).toContain("C:\\Windows");
  });

  it("searches PATH on macOS too, after the hardcoded dirs", () => {
    const dirs = binSearchDirs({
      isWindows: false,
      home: "/home/u",
      envPath: "/opt/mytools/bin",
      extraDirs: [],
    });
    expect(dirs).toContain("/opt/mytools/bin");
    expect(dirs.indexOf("/opt/mytools/bin")).toBeGreaterThan(
      dirs.indexOf("/opt/homebrew/bin")
    );
  });

  it("puts the user's extra folders first, ahead of everything", () => {
    // The escape hatch for an install PATH doesn't know about: it must win, or
    // it can't rescue a machine where a wrong binary is found first.
    const dirs = binSearchDirs({
      isWindows: false,
      home: "/home/u",
      envPath: "/usr/bin",
      extraDirs: ["/opt/custom/bin"],
    });
    expect(dirs[0]).toBe("/opt/custom/bin");
  });

  it("offers Windows install locations as a fallback for a PATH-less install", () => {
    const dirs = binSearchDirs({
      isWindows: true,
      home: "C:\\Users\\Admin",
      envPath: "",
      extraDirs: [],
    });
    expect(dirs.some((d) => d.endsWith("\\AppData\\Local\\Pandoc"))).toBe(true);
    expect(dirs.some((d) => d.includes("chocolatey"))).toBe(true);
    // The Unix-only list is noise on Windows; it can never match.
    expect(dirs).not.toContain("/opt/homebrew/bin");
  });

  it("keeps the macOS dirs on macOS", () => {
    const dirs = binSearchDirs({
      isWindows: false,
      home: "/home/u",
      envPath: "",
      extraDirs: [],
    });
    for (const d of COMMON_BIN_DIRS) expect(dirs).toContain(d);
  });
});

describe("buildExecPath", () => {
  it("prepends common bin dirs and dedupes existing entries", () => {
    const out = buildExecPath({
      isWindows: false,
      home: "/home/u",
      envPath: "/usr/bin:/opt/homebrew/bin",
      extraDirs: [],
    }).split(":");
    for (const d of COMMON_BIN_DIRS) expect(out).toContain(d);
    // no duplicates
    expect(new Set(out).size).toBe(out.length);
    // common dirs come first
    expect(out[0]).toBe("/opt/homebrew/bin");
  });

  it("uses ';' on Windows and leaves drive letters intact", () => {
    // Splitting a Windows PATH on ":" tears "C:\\Program Files\\Pandoc" into
    // "C" and "\\Program Files\\Pandoc". Pandoc then can't find xelatex or
    // pandoc-crossref even when it was itself resolved — so this breaks the
    // export a second time, after the binary lookup already failed.
    const out = buildExecPath({
      isWindows: true,
      home: "C:\\Users\\Admin",
      envPath: "C:\\Program Files\\Pandoc;C:\\Windows\\system32",
      extraDirs: [],
    });
    const parts = out.split(";");
    expect(parts).toContain("C:\\Program Files\\Pandoc");
    expect(parts).toContain("C:\\Windows\\system32");
    expect(parts).not.toContain("C");
    expect(out).not.toContain(":\\Program Files\\Pandoc:");
    expect(new Set(parts).size).toBe(parts.length);
  });
});

describe("resolveUserPath", () => {
  const mac: PlatformEnv = {
    isWindows: false,
    home: "/home/u",
    envPath: "",
    extraDirs: [],
  };

  it("keeps absolute paths, expands ~, and joins vault-relative paths", () => {
    expect(resolveUserPath("/abs/x", "/vault", mac)).toBe("/abs/x");
    expect(resolveUserPath("~/x", "/vault", mac)).toBe("/home/u/x");
    expect(resolveUserPath("assets/pandoc", "/vault", mac)).toBe(
      "/vault/assets/pandoc"
    );
  });

  it("recognizes a drive-letter path on Windows as absolute", () => {
    // startsWith("/") says C:\Papers is relative, so the output folder setting
    // used to resolve to <vault>\C:\Papers and the export landed nowhere near
    // where the user asked for it.
    const win: PlatformEnv = {
      isWindows: true,
      home: "C:\\Users\\Admin",
      envPath: "",
      extraDirs: [],
    };
    expect(resolveUserPath("C:\\Papers", "D:\\Vault", win)).toBe("C:\\Papers");
    expect(resolveUserPath("C:/Papers", "D:\\Vault", win)).toBe("C:\\Papers");
    expect(resolveUserPath("exports\\pdf", "D:\\Vault", win)).toBe(
      "D:\\Vault\\exports\\pdf"
    );
    expect(resolveUserPath("~/Papers", "D:\\Vault", win)).toBe(
      "C:\\Users\\Admin\\Papers"
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

  it("uses the extension the preset produces", () => {
    expect(buildExportFilename("{acronym}", vars, "x", ".docx")).toBe(
      "PBMIN.docx"
    );
    expect(buildExportFilename("   ", vars, "My Note", ".docx")).toBe(
      "My Note.docx"
    );
    expect(buildExportFilename("{acronym}.docx", vars, "x", ".docx")).toBe(
      "PBMIN.docx"
    );
  });

  it("appends the preset extension even when the name ends in a different one", () => {
    // Otherwise a leftover ".pdf" in the user's pattern would send a docx
    // preset to a .pdf path, which pandoc rejects outright.
    expect(buildExportFilename("{acronym}.pdf", vars, "x", ".docx")).toBe(
      "PBMIN.pdf.docx"
    );
  });
});

describe("isFullOutputPath", () => {
  it("recognizes any known export extension, not just .pdf", () => {
    for (const p of [
      "~/Papers/out.pdf",
      "~/Papers/out.docx",
      "~/Papers/out.HTML",
      "Exports/paper.tex",
    ]) {
      expect(isFullOutputPath(p)).toBe(true);
    }
  });

  it("treats a folder as a folder", () => {
    // The regression this guards: "~/Papers/out.docx" used to fall through to
    // the folder branch, and mkdirSync created a *directory* named out.docx.
    for (const p of ["~/Papers", "Exports", "", "  ", "/Users/me/Documents"]) {
      expect(isFullOutputPath(p)).toBe(false);
    }
  });
});

describe("exportTargetForDefaults", () => {
  // The cases below mirror the field combinations actually present in the
  // PaperBell asset repo's defaults/*.yaml. YAML parsing itself is Obsidian's
  // parseYaml; this function only maps the parsed result.

  it("gives a self-contained writer its own extension (demo-obsidian, manuscript-obsidian, response-letter-docx)", () => {
    expect(exportTargetForDefaults({ to: "docx" }).ext).toBe(".docx");
  });

  it("ignores a stale output-file for such a writer", () => {
    // Asking pandoc for .pdf from docx is a hard error, so `to:` has to win.
    expect(
      exportTargetForDefaults({ to: "docx", "output-file": "output.pdf" }).ext
    ).toBe(".docx");
  });

  it("keeps PDF-capable writers on .pdf (cover_letter: to latex, beamer: to beamer)", () => {
    expect(
      exportTargetForDefaults({ to: "latex", "pdf-engine": "xelatex" }).ext
    ).toBe(".pdf");
    expect(
      exportTargetForDefaults({ to: "beamer", "output-file": "pandoc_beamer.pdf" })
        .ext
    ).toBe(".pdf");
  });

  it("honors an explicit output-file for a PDF-capable writer", () => {
    expect(
      exportTargetForDefaults({ to: "latex", "output-file": "paper.tex" }).ext
    ).toBe(".tex");
  });

  it("falls back to output-file, then .pdf, when there is no `to:` (paperbell, pdf, undefined, response-letter)", () => {
    expect(exportTargetForDefaults({ "output-file": "output.pdf" }).ext).toBe(
      ".pdf"
    );
    expect(exportTargetForDefaults({ "pdf-engine": "xelatex" }).ext).toBe(".pdf");
    expect(exportTargetForDefaults({}).ext).toBe(".pdf");
  });

  it("strips pandoc's +ext/-ext syntax and quoting", () => {
    expect(exportTargetForDefaults({ to: "markdown+smart" }).ext).toBe(".md");
    expect(exportTargetForDefaults({ to: "gfm-raw_html" }).ext).toBe(".md");
    expect(exportTargetForDefaults({ to: '"docx"' }).ext).toBe(".docx");
    expect(exportTargetForDefaults({ to: "  DOCX  " }).ext).toBe(".docx");
  });

  it("survives trailing `#!` comments, which the shipped presets all carry", () => {
    // paperbell.yaml:8 is literally `pdf-engine: xelatex   #! use xelatex ...`.
    // If a comment leaked through, resolveBinary would fail to find the engine
    // and preflight would reject an export that previously worked.
    const parsed = {
      to: "docx  #! word output",
      "pdf-engine": "xelatex                    #! use xelatex for CJK",
      "output-file": "output.pdf   #! overridden by -o",
      filters: ["pandoc-crossref  #! numbering"],
    };
    const target = exportTargetForDefaults(parsed);
    expect(target.ext).toBe(".docx");
    expect(target.pdfEngine).toBe("xelatex");
    expect(target.needsCrossref).toBe(true);
  });

  it("tolerates CRLF leftovers and quoting", () => {
    expect(exportTargetForDefaults({ "output-file": "output.pdf\r" }).ext).toBe(
      ".pdf"
    );
    expect(exportTargetForDefaults({ "pdf-engine": '"xelatex"' }).pdfEngine).toBe(
      "xelatex"
    );
  });

  it("keeps a path that legitimately contains spaces", () => {
    // Only whitespace-then-# opens a YAML comment, so an engine path survives.
    expect(
      exportTargetForDefaults({ "pdf-engine": "/opt/my tex/xelatex" }).pdfEngine
    ).toBe("/opt/my tex/xelatex");
  });

  it("uses the format name itself for writers it has no entry for", () => {
    expect(exportTargetForDefaults({ to: "rst" }).ext).toBe(".rst");
    expect(exportTargetForDefaults({ to: "org" }).ext).toBe(".org");
  });

  it("reports the pdf-engine so preflight can require the right binary", () => {
    expect(exportTargetForDefaults({ "pdf-engine": "xelatex" }).pdfEngine).toBe(
      "xelatex"
    );
    expect(exportTargetForDefaults({ to: "docx" }).pdfEngine).toBeNull();
    expect(exportTargetForDefaults({ "pdf-engine": "  " }).pdfEngine).toBeNull();
  });

  it("detects pandoc-crossref in the filter list, bare or path-qualified", () => {
    expect(
      exportTargetForDefaults({ filters: ["citeproc", "pandoc-crossref"] })
        .needsCrossref
    ).toBe(true);
    expect(
      exportTargetForDefaults({ filters: ["${.}/../filters/image.lua", "citeproc"] })
        .needsCrossref
    ).toBe(false);
    expect(exportTargetForDefaults({}).needsCrossref).toBe(false);
  });

  it("survives a preset that isn't an object", () => {
    // parseYaml can return null/string for a malformed or empty preset; a bad
    // preset must not break an export that would otherwise have worked.
    const bads: unknown[] = [null, undefined, "nope", 42, []];
    for (const bad of bads) {
      expect(exportTargetForDefaults(bad)).toEqual({
        ext: ".pdf",
        pdfEngine: null,
        needsCrossref: false,
      });
    }
  });
});


describe("builtinExportTarget", () => {
  it("only asks for an engine when it is building a PDF", () => {
    expect(builtinExportTarget("pdf")).toEqual({
      ext: ".pdf",
      pdfEngine: "xelatex",
      needsCrossref: false,
    });
    expect(builtinExportTarget("docx")).toEqual({
      ext: ".docx",
      pdfEngine: null,
      needsCrossref: false,
    });
    expect(builtinExportTarget("html").pdfEngine).toBeNull();
  });

  it("never asks for pandoc-crossref", () => {
    // @fig:/@tbl: cross-references are a preset feature; requiring the binary
    // would defeat the point of an export that needs nothing downloaded.
    for (const f of ["pdf", "docx", "html"] as const) {
      expect(builtinExportTarget(f).needsCrossref).toBe(false);
    }
  });
});

describe("builtinFrom", () => {
  it("reads Obsidian's markdown extensions", () => {
    for (const f of ["pdf", "docx", "html"] as const) {
      expect(builtinFrom(f)).toContain("wikilinks_title_after_pipe");
      expect(builtinFrom(f)).toContain("tex_math_single_backslash");
    }
  });

  it("drops +mark for PDF only", () => {
    // ==highlight== goes through LaTeX's soul package, whose \hl cannot break
    // CJK: the run aborts with "Package soul Error: Reconstruction failed" and
    // writes nothing. docx and html mark up highlights natively.
    expect(builtinFrom("pdf")).not.toContain("+mark");
    expect(builtinFrom("docx")).toContain("+mark");
    expect(builtinFrom("html")).toContain("+mark");
  });
});

describe("isBuiltinFormat", () => {
  it("accepts only the three supported formats", () => {
    expect(isBuiltinFormat("pdf")).toBe(true);
    expect(isBuiltinFormat("docx")).toBe(true);
    expect(isBuiltinFormat("html")).toBe(true);
    // "" is how the PaperBell pipelines say "a preset is required".
    expect(isBuiltinFormat("")).toBe(false);
    expect(isBuiltinFormat("epub")).toBe(false);
    expect(isBuiltinFormat("PDF")).toBe(false);
  });
});

describe("resolveBuiltinFormat", () => {
  // The note's `template:` frontmatter is deliberately not an argument here: a
  // scaffolded PaperBell project writes `template: paperbell` into every
  // compiled manuscript, which used to suppress an explicitly chosen Format and
  // silently export a PDF. Only the step's own two options decide.
  it("uses the Format option when no preset is named in the step", () => {
    expect(resolveBuiltinFormat("", "docx")).toBe("docx");
    expect(resolveBuiltinFormat("  ", " pdf ")).toBe("pdf");
  });

  it("lets the step's own preset win over the Format option", () => {
    expect(resolveBuiltinFormat("paperbell", "docx")).toBeNull();
  });

  it("requires a preset when the Format is blank or unknown", () => {
    expect(resolveBuiltinFormat("", "")).toBeNull();
    expect(resolveBuiltinFormat("", "epub")).toBeNull();
  });
});

describe("hasCjk", () => {
  it("detects the scripts pdflatex cannot typeset", () => {
    expect(hasCjk("一个测试文档")).toBe(true);
    expect(hasCjk("かな")).toBe(true);
    expect(hasCjk("한글")).toBe(true);
  });

  it("does not fire on Latin text or on typographic punctuation", () => {
    // A false positive costs a working export: it would add a CJK font that
    // may not be installed, and xelatex then fails outright.
    expect(hasCjk("A plain English abstract.")).toBe(false);
    expect(hasCjk("“smart quotes” — em dash… ±½")).toBe(false);
    expect(hasCjk("café naïve Ω")).toBe(false);
  });
});

describe("defaultCjkFont", () => {
  it("names a font that ships with each platform", () => {
    expect(defaultCjkFont("darwin")).toBe("Songti SC");
    expect(defaultCjkFont("win32")).toBe("SimSun");
    expect(defaultCjkFont("linux")).toBe("Noto Sans CJK SC");
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
    const args = buildPandocArgs({
      ...base,
      bibliographies: ["/v/p/references.bib"],
    });
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

  it("appends one --bibliography per bib, in order (project first, then global)", () => {
    const args = buildPandocArgs({
      ...base,
      bibliographies: ["/v/p/references.bib", "/v/Library/global.bib"],
    });
    expect(args.filter((a) => a.startsWith("--bibliography="))).toEqual([
      "--bibliography=/v/p/references.bib",
      "--bibliography=/v/Library/global.bib",
    ]);
  });

  it("omits --bibliography when none is provided", () => {
    const empties: (string[] | null | undefined)[] = [null, undefined, []];
    for (const bibliographies of empties) {
      const args = buildPandocArgs({ ...base, bibliographies });
      expect(args.some((a) => a.startsWith("--bibliography="))).toBe(false);
    }
  });

  describe("the built-in, preset-free export", () => {
    const builtin: PandocArgPaths = {
      inputFile: "/v/p/.tmp.md",
      defaultsFile: null,
      cslFile: null,
      projectAbs: "/v/p",
      outputPath: "/v/p/OUT.pdf",
    };

    it("spells out what a preset would have declared, and reads no assets", () => {
      const args = buildPandocArgs({
        ...builtin,
        builtin: {
          format: "pdf",
          from: builtinFrom("pdf"),
          pdfEngine: "/usr/local/bin/xelatex",
          cjkFont: "Songti SC",
          citeproc: true,
        },
        bibliographies: ["/v/p/references.bib"],
      });
      expect(args).toEqual([
        "/v/p/.tmp.md",
        "--from=" + builtinFrom("pdf"),
        "--standalone",
        "--pdf-engine=/usr/local/bin/xelatex",
        "-V",
        "CJKmainfont=Songti SC",
        "--citeproc",
        "--resource-path=/v/p",
        "--resource-path=/v/p/figs",
        "--resource-path=/v/figs",
        "--bibliography=/v/p/references.bib",
        "-o",
        "/v/p/OUT.pdf",
      ]);
      // The whole point: nothing here points into the downloaded assets folder.
      expect(args.some((a) => a.startsWith("--defaults="))).toBe(false);
      expect(args.some((a) => a.startsWith("--csl="))).toBe(false);
    });

    it("asks for no engine and no CJK font when the target is Word", () => {
      // docx is the one format that needs nothing but pandoc itself; passing a
      // --pdf-engine or a font variable there would be noise at best.
      const args = buildPandocArgs({
        ...builtin,
        outputPath: "/v/p/OUT.docx",
        builtin: {
          format: "docx",
          from: builtinFrom("pdf"),
          pdfEngine: null,
          cjkFont: null,
          citeproc: false,
        },
      });
      expect(args.some((a) => a.startsWith("--pdf-engine="))).toBe(false);
      expect(args).not.toContain("-V");
      expect(args).not.toContain("--citeproc");
      expect(args).not.toContain("--embed-resources");
    });

    it("embeds resources only for HTML", () => {
      // pandoc rejects --embed-resources for non-HTML writers.
      const html = buildPandocArgs({
        ...builtin,
        outputPath: "/v/p/OUT.html",
        builtin: {
          format: "html",
          from: builtinFrom("pdf"),
          pdfEngine: null,
          cjkFont: null,
          citeproc: false,
        },
      });
      expect(html).toContain("--embed-resources");
    });

    it("still passes a CSL when one was resolved", () => {
      const args = buildPandocArgs({
        ...builtin,
        cslFile: "/home/u/Zotero/styles/nature.csl",
        builtin: {
          format: "pdf",
          from: builtinFrom("pdf"),
          pdfEngine: "/bin/xelatex",
          cjkFont: null,
          citeproc: true,
        },
      });
      expect(args).toContain("--csl=/home/u/Zotero/styles/nature.csl");
    });
  });

  it("omits --csl entirely when there is no style to pass", () => {
    // A note with no citations needs no CSL; passing one would make a missing
    // style a hard failure for a document that never cites anything.
    const args = buildPandocArgs({ ...base, cslFile: null });
    expect(args.some((a) => a.startsWith("--csl="))).toBe(false);
  });

  it("appends extra resource paths after the project ones, deduplicated", () => {
    const args = buildPandocArgs({
      ...base,
      extraResourcePaths: ["/v", "/v/Attachments", "/v/p"],
    });
    expect(args.filter((a) => a.startsWith("--resource-path="))).toEqual([
      "--resource-path=/v/p",
      "--resource-path=/v/p/figs",
      "--resource-path=/v/figs",
      "--resource-path=/v",
      "--resource-path=/v/Attachments",
    ]);
  });
});

describe("splitBibList", () => {
  it("splits on commas and newlines and drops blanks", () => {
    expect(splitBibList("a.bib, b.bib\n c.bib \n\n")).toEqual([
      "a.bib",
      "b.bib",
      "c.bib",
    ]);
  });
  it("returns [] for empty / nullish input", () => {
    expect(splitBibList("")).toEqual([]);
    expect(splitBibList(null)).toEqual([]);
    expect(splitBibList(undefined)).toEqual([]);
  });
});

describe("extractCiteKeys", () => {
  it("pulls entry keys and skips @string/@comment/@preamble", () => {
    const bib = `
      @string{acme = "ACME"}
      @comment{ignore me}
      @article{smith2020, title={A}}
      @book{ jones2019 , title={B}}
    `;
    expect(extractCiteKeys(bib)).toEqual(["smith2020", "jones2019"]);
  });
});

describe("findDuplicateCiteKeys", () => {
  it("reports keys defined in more than one file, winner last", () => {
    const dups = findDuplicateCiteKeys([
      { path: "global.bib", content: "@article{dup, t={G}}\n@article{g, t={x}}" },
      { path: "project.bib", content: "@article{dup, t={P}}\n@article{p, t={y}}" },
    ]);
    expect(dups).toEqual([{ key: "dup", paths: ["global.bib", "project.bib"] }]);
    // winner is the last path — the project bib in our merge order
    expect(dups[0].paths[dups[0].paths.length - 1]).toBe("project.bib");
  });
  it("returns [] when there are no cross-file collisions", () => {
    expect(
      findDuplicateCiteKeys([
        { path: "a.bib", content: "@article{a1, t={x}}" },
        { path: "b.bib", content: "@article{b1, t={y}}" },
      ])
    ).toEqual([]);
  });
});

describe("CSL resolution helpers", () => {
  it("normalizeCslId strips a .csl suffix and path separators", () => {
    expect(normalizeCslId("nature")).toBe("nature");
    expect(normalizeCslId(" nature.csl ")).toBe("nature");
    expect(normalizeCslId("NATURE.CSL")).toBe("NATURE");
    expect(normalizeCslId("../../etc/passwd")).toBe("....etcpasswd");
  });

  it("zoteroStylesDir points at ~/Zotero/styles", () => {
    expect(zoteroStylesDir("/Users/me")).toBe("/Users/me/Zotero/styles");
  });

  it("officialCslUrls tries the repo root then dependent/", () => {
    expect(officialCslUrls("nature.csl")).toEqual([
      "https://raw.githubusercontent.com/citation-style-language/styles/master/nature.csl",
      "https://raw.githubusercontent.com/citation-style-language/styles/master/dependent/nature.csl",
    ]);
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
