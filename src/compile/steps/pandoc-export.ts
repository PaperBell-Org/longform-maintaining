import { FileSystemAdapter } from "obsidian";
import { execFile } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { get } from "svelte/store";

import type { CompileContext, CompileManuscriptInput } from "..";
import {
  CompileStepKind,
  CompileStepOptionType,
  makeBuiltinStep,
} from "./abstract-compile-step";
import {
  binSearchDirs,
  buildExecPath,
  buildPandocArgs,
  DEFAULT_ASSETS_DIR,
  hasCitations,
  parseExportFrontmatter,
  resolveBinary,
  resolveUserPath,
} from "./pandoc-export-utils";
import { pluginSettings } from "src/model/stores";
import { projectResourceCandidatePaths } from "src/model/project-resources";

function line(ok: boolean, label: string, detail: string): string {
  return `[${ok ? "✓" : "✗"}] ${label}` + (detail ? `\n       ${detail}` : "");
}

export const RunPandocExportStep = makeBuiltinStep({
  id: "run-pandoc-export",
  description: {
    name: "Run Pandoc Export",
    description:
      "Exports the compiled manuscript to PDF via Pandoc (PaperBell pipeline). Desktop only. Run after Add Zenodo Frontmatter. Uses the bundled Pandoc assets by default — run the 'Set up Pandoc export' command to check prerequisites.",
    availableKinds: [CompileStepKind.Manuscript],
    options: [
      {
        id: "template",
        name: "Template / preset",
        description:
          "Which downloaded Pandoc preset (defaults/*.yaml) to export with — e.g. a Manuscript vs. an SI layout. Leave blank to use the template from your project metadata (_longform.template).",
        type: CompileStepOptionType.Dropdown,
        dynamicChoices: "pandoc-templates",
        emptyLabel: "(use metadata template)",
        default: "",
      },
      {
        id: "dry-run",
        name: "Dry run",
        description:
          "If checked, log the preflight checklist and the pandoc command instead of running it.",
        type: CompileStepOptionType.Boolean,
        default: false,
      },
      {
        id: "open-after",
        name: "Open PDF after export",
        description: "If checked, open the resulting PDF with the system viewer.",
        type: CompileStepOptionType.Boolean,
        default: true,
      },
    ],
  },
  async compile(
    input: CompileManuscriptInput,
    context: CompileContext
  ): Promise<CompileManuscriptInput> {
    if (context.kind !== CompileStepKind.Manuscript) {
      throw new Error("Cannot run Pandoc export on non-manuscript.");
    }

    const adapter = context.app.vault.adapter;
    if (!(adapter instanceof FileSystemAdapter)) {
      throw new Error(
        "Pandoc export only works on Obsidian desktop (cannot resolve an absolute path)."
      );
    }
    const base = adapter.getBasePath();
    const home = os.homedir();
    const settings = get(pluginSettings);

    // Assets folder: setting, else the default download location. Downloaded
    // from a separate assets repo via "Set up Pandoc export"; not bundled.
    const assetsSetting =
      (settings.pandocAssetsFolder ?? "").trim() || DEFAULT_ASSETS_DIR;
    const assetsAbs = resolveUserPath(assetsSetting, base, home);
    const defaultsDir = path.join(assetsAbs, "defaults");
    const cslDir = path.join(assetsAbs, "csl");
    const cwd = assetsAbs; // so ${.}/.. and relative refs resolve inside assets
    const projectAbs = path.join(base, context.projectPath);

    const fm = parseExportFrontmatter(input.contents);
    const acronym = String(fm.acronym || context.draft.title || "manuscript");
    const date = String(fm.date || new Date().toISOString().slice(0, 10));
    // The step's template dropdown overrides the project metadata template when set.
    const optionTemplate = String(context.optionValues["template"] ?? "").trim();
    const template = optionTemplate || String(fm.template || "undefined");
    const csl = String(fm.csl || "nature");

    const dirs = binSearchDirs(home);
    const pandocBin = resolveBinary(
      (settings.pandocBinary ?? "pandoc").trim() || "pandoc",
      fs.existsSync,
      dirs
    );
    const xelatexBin = resolveBinary("xelatex", fs.existsSync, dirs);
    const crossrefBin = resolveBinary("pandoc-crossref", fs.existsSync, dirs);

    const defaultsFile = path.join(defaultsDir, template + ".yaml");
    const cslFile = path.join(cslDir, csl + ".csl");
    const assetsOk = fs.existsSync(assetsAbs);
    const defaultsOk = fs.existsSync(defaultsFile);
    const cslOk = fs.existsSync(cslFile);

    const bibliography = resolveBibliography(settings, context, base, home);
    const needsBib = hasCitations(input.contents);
    const bibOk = !needsBib || !!bibliography;

    const checklist = [
      line(
        !!pandocBin,
        "pandoc — " + (pandocBin || "not found"),
        pandocBin
          ? ""
          : "Install pandoc, or set the Pandoc binary in Longform settings. Run 'Set up Pandoc export' for help."
      ),
      line(
        assetsOk,
        "Pandoc assets folder — " + assetsAbs,
        assetsOk
          ? ""
          : "Assets not found. Run 'Set up Pandoc export' → Download assets, or set 'Pandoc assets folder' in settings."
      ),
      line(
        defaultsOk,
        "defaults file — " + defaultsFile,
        defaultsOk
          ? ""
          : `template is "${template}" (metadata _longform.template). Add defaults/${template}.yaml or fix the template.`
      ),
      line(
        cslOk,
        "CSL style — " + cslFile,
        cslOk
          ? ""
          : `csl is "${csl}" (metadata _longform.csl). Add csl/${csl}.csl or fix the csl.`
      ),
      line(
        bibOk,
        "bibliography — " + (bibliography || (needsBib ? "not found" : "not needed")),
        bibOk
          ? ""
          : "Your manuscript has [@citations] but no .bib was found. Add references.bib to the project, or set a Bibliography path in settings."
      ),
      line(
        !!xelatexBin,
        "xelatex — " + (xelatexBin || "not found"),
        xelatexBin ? "" : "Needed to build the PDF. Install MacTeX / TeX Live."
      ),
      line(
        !!crossrefBin,
        "pandoc-crossref — " + (crossrefBin || "not found"),
        crossrefBin ? "" : "Needed for @fig / cross-references if your defaults use it."
      ),
    ];

    const hardOk = !!pandocBin && assetsOk && defaultsOk && cslOk && bibOk;
    if (!hardOk) {
      throw new Error(
        "Pandoc export can't run yet — here's what it needs:\n\n" +
          checklist.join("\n") +
          "\n\nTip: run the 'Set up Pandoc export' command from the command palette for guided setup."
      );
    }

    // Output path: a folder (default = project folder), or a full *.pdf path.
    let outputFolder = (settings.pandocOutputFolder ?? "").trim();
    if (outputFolder.indexOf("<") !== -1) outputFolder = "";
    let outputPath: string;
    if (outputFolder && outputFolder.toLowerCase().endsWith(".pdf")) {
      outputPath = resolveUserPath(outputFolder, base, home);
    } else {
      const outDirAbs = outputFolder
        ? resolveUserPath(outputFolder, base, home)
        : projectAbs;
      outputPath = path.join(outDirAbs, `${acronym}_${date}.pdf`);
    }

    const inputFile = path.join(projectAbs, ".longform-pandoc-export.md");
    const args = buildPandocArgs({
      inputFile,
      defaultsFile,
      cslFile,
      projectAbs,
      outputPath,
      bibliography,
    });
    const env = { ...process.env, PATH: buildExecPath(process.env.PATH ?? "", home) };

    const dryRun = context.optionValues["dry-run"] === true;
    if (dryRun) {
      console.log(
        "[Pandoc Export] DRY RUN — checklist:\n" +
          checklist.join("\n") +
          "\n\nWould run (cwd=" +
          cwd +
          "):\n" +
          [pandocBin].concat(args).join(" ")
      );
      return input;
    }

    fs.writeFileSync(inputFile, input.contents, "utf8");
    try {
      await new Promise<void>((resolve, reject) => {
        execFile(
          pandocBin as string,
          args,
          { cwd, env },
          (err, _stdout, stderr) => {
            if (err) {
              reject(
                new Error(
                  "pandoc failed:\n\n" +
                    (stderr || err.message) +
                    "\n\nCommand:\n" +
                    [pandocBin].concat(args).join(" ")
                )
              );
            } else {
              resolve();
            }
          }
        );
      });
    } finally {
      try {
        fs.unlinkSync(inputFile);
      } catch (e) {
        // ignore cleanup errors
      }
    }

    console.log("[Pandoc Export] Wrote", outputPath);
    const openAfter =
      context.optionValues["open-after"] !== false && !context.suppressOpenAfter;
    if (openAfter) {
      try {
        // Electron shell; resolved at runtime, desktop only.
        (window as unknown as { require: (m: string) => { shell: { openPath: (p: string) => void } } })
          .require("electron")
          .shell.openPath(outputPath);
      } catch (e) {
        console.warn("[Pandoc Export] Could not open PDF:", e);
      }
    }

    return input;
  },
});

/**
 * Resolve a bibliography for `--bibliography`: the configured path if set and
 * present, else the nearest `references.bib`/`mybib.bib` searched from the
 * draft folder up to the project root. Returns null when none is found.
 */
function resolveBibliography(
  settings: { pandocBibliography?: string | null },
  context: CompileContext,
  base: string,
  home: string
): string | null {
  const configured = (settings.pandocBibliography ?? "").trim();
  if (configured) {
    const abs = resolveUserPath(configured, base, home);
    return fs.existsSync(abs) ? abs : null;
  }
  const root = context.projectRoot ?? context.projectPath;
  for (const name of ["references.bib", "mybib.bib"]) {
    for (const rel of projectResourceCandidatePaths(
      context.projectPath,
      root,
      name
    )) {
      const abs = path.join(base, rel);
      if (fs.existsSync(abs)) return abs;
    }
  }
  return null;
}
