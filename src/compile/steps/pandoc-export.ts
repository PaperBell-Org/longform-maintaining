import { FileSystemAdapter, Notice, parseYaml, requestUrl } from "obsidian";
import { execFile } from "child_process";
import * as fs from "fs";
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
  BUILTIN_FORMATS,
  builtinFrom,
  currentPlatformEnv,
  buildExecPath,
  buildExportFilename,
  buildPandocArgs,
  builtinExportTarget,
  DEFAULT_ASSETS_DIR,
  defaultCjkFont,
  exportTargetForDefaults,
  findDuplicateCiteKeys,
  hasCitations,
  hasCjk,
  isBuiltinFormat,
  isFullOutputPath,
  officialCslUrls,
  parseExportFrontmatter,
  resolveBinary,
  resolveUserPath,
  splitBibList,
  zoteroStylesDir,
  type ExportTarget,
  type PlatformEnv,
} from "./pandoc-export-utils";
import { pandocSetupError } from "../recoverable";
import { pluginSettings } from "src/model/stores";
import { projectResourceCandidatePaths } from "src/model/project-resources";
import { listPandocTemplates } from "src/model/pandoc-templates";

function line(ok: boolean, label: string, detail: string): string {
  return `[${ok ? "✓" : "✗"}] ${label}` + (detail ? `\n       ${detail}` : "");
}

/**
 * Resolve a CSL style into the assets `csl/` folder and return its absolute path,
 * or null if it can't be found anywhere. Resolution order:
 *   1. Already in the assets `csl/<id>.csl` (installed / synced) — used as-is.
 *   2. Zotero's local styles dir (most users have Zotero, which ships hundreds of
 *      styles) — copied into the assets folder so later runs are self-contained.
 *   3. The official CSL styles repo — fetched and cached into the assets folder.
 * Steps 2 and 3 mean the plugin's own marketplace no longer has to carry CSL.
 */
async function ensureCsl(
  csl: string,
  cslDir: string,
  home: string
): Promise<string | null> {
  const target = path.join(cslDir, csl + ".csl");
  if (fs.existsSync(target)) return target;

  // 2. Zotero's local styles directory.
  const zoteroFile = path.join(zoteroStylesDir(home), csl + ".csl");
  try {
    if (fs.existsSync(zoteroFile)) {
      fs.mkdirSync(cslDir, { recursive: true });
      fs.copyFileSync(zoteroFile, target);
      return target;
    }
  } catch (e) {
    console.warn(`[PaperOut] Could not copy CSL from Zotero (${zoteroFile}):`, e);
  }

  // 3. The official CSL styles repository.
  for (const url of officialCslUrls(csl)) {
    try {
      const res = await requestUrl({ url, method: "GET" });
      if (res.status >= 200 && res.status < 300 && res.text.includes("<style")) {
        fs.mkdirSync(cslDir, { recursive: true });
        fs.writeFileSync(target, res.text, "utf8");
        return target;
      }
    } catch (e) {
      // 404 / offline — try the next URL, then fall through to a clear error.
    }
  }
  return null;
}

/**
 * Help text for a preset that isn't installed. Lists what *is* installed, so the
 * user can pick one instead of guessing — and names where the missing preset was
 * requested from, since for a loose note it is usually the note's own
 * `template:` frontmatter key rather than any project metadata.
 */
function missingPresetHelp(
  app: CompileContext["app"],
  template: string,
  templateSource: string
): string {
  const installed = listPandocTemplates(app);
  const where = `The preset "${template}" comes from ${templateSource}.`;
  if (installed.length === 0) {
    return (
      `${where} No presets are installed yet. Run 'Set up Pandoc export' → Download assets, ` +
      `or 'Browse Pandoc asset marketplace' to install one.`
    );
  }
  return (
    `${where} Installed presets: ${installed.join(", ")}. ` +
    `Set \`template:\` in the note's frontmatter to one of them, choose one in this step's ` +
    `Template / preset option, or install more from the Pandoc asset marketplace.`
  );
}

/**
 * Extra `--resource-path` entries so images resolve for a note that isn't laid
 * out like a project: the vault root (Obsidian's default attachment location)
 * and the configured attachment folder. `getConfig` is undocumented, hence the
 * loose typing and the guard.
 */
function attachmentResourcePaths(
  app: CompileContext["app"],
  base: string
): string[] {
  const paths = [base];
  try {
    const getConfig = (
      app.vault as unknown as { getConfig?: (key: string) => unknown }
    ).getConfig;
    const configured =
      typeof getConfig === "function"
        ? getConfig.call(app.vault, "attachmentFolderPath")
        : null;
    // "/" means the vault root; "./" means "next to the note", already covered.
    if (
      typeof configured === "string" &&
      configured &&
      !configured.startsWith(".")
    ) {
      paths.push(path.join(base, configured.replace(/^\/+/, "")));
    }
  } catch (e) {
    console.warn("[Pandoc Export] Could not read the attachment folder:", e);
  }
  return paths;
}

export const RunPandocExportStep = makeBuiltinStep({
  id: "run-pandoc-export",
  description: {
    name: "Run Pandoc Export",
    description:
      "Exports the compiled manuscript via Pandoc. With a preset, the output format follows it — most produce a PDF, a `to: docx` preset produces a Word file — and the downloaded Pandoc assets are required; run after Add Zenodo Frontmatter. With no preset, set Format to export with pandoc alone, needing nothing downloaded. Desktop only. Run the 'Set up Pandoc export' command to check prerequisites.",
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
        id: "format",
        name: "Format (no preset)",
        description:
          "Export without any preset, using pandoc on its own — no downloaded assets needed. Word needs nothing but pandoc; PDF also needs a TeX engine (xelatex, for CJK). Only applies when no preset is named here or in the note's `template:` frontmatter. Leave blank to require a preset, as the PaperBell pipelines do.",
        type: CompileStepOptionType.Dropdown,
        choices: [...BUILTIN_FORMATS],
        emptyLabel: "(require a preset)",
        default: "",
      },
      {
        id: "filename",
        name: "File name",
        description:
          "Name for the exported file. Variables: {title}, {acronym}, {date}, {csl}, {template}, {draft}. E.g. {acronym}_{date} → PBMIN_2026-07-01.pdf. The extension is added automatically and follows the preset (.pdf, .docx, …). Leave blank to use the compiled manuscript's name.",
        type: CompileStepOptionType.Text,
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
        name: "Open after export",
        description:
          "If checked, open the exported file with the system viewer.",
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
    const settings = get(pluginSettings);
    const platform = currentPlatformEnv(settings.pandocExtraBinFolders);
    const home = platform.home;

    // Assets folder: setting, else the default download location. Downloaded
    // from a separate assets repo via "Set up Pandoc export"; not bundled.
    const assetsSetting =
      (settings.pandocAssetsFolder ?? "").trim() || DEFAULT_ASSETS_DIR;
    const assetsAbs = resolveUserPath(assetsSetting, base, platform);
    const defaultsDir = path.join(assetsAbs, "defaults");
    const cslDir = path.join(assetsAbs, "csl");
    const projectAbs = path.join(base, context.projectPath);

    const fm = parseExportFrontmatter(input.contents);
    const acronym = String(fm.acronym || context.draft.title || "manuscript");
    const date = String(fm.date || new Date().toISOString().slice(0, 10));
    // The step's template dropdown overrides the template named in the document
    // being exported. That name comes from the document's own frontmatter, which
    // is either what Add Zenodo Frontmatter wrote from metadata.json or — for a
    // loose note — whatever the note itself declares. `templateSource` keeps
    // that distinction so the preflight message can point at the right place.
    const optionTemplate = String(context.optionValues["template"] ?? "").trim();
    const fmTemplate = String(fm.template ?? "").trim();
    const template = optionTemplate || fmTemplate || "undefined";
    const templateSource = optionTemplate
      ? "this step’s Template / preset option"
      : fmTemplate
      ? "the `template:` key in the exported note’s frontmatter"
      : "the built-in default (no template was specified)";
    const csl = String(fm.csl || "nature");

    // Preset-free mode, for Quick Export: pandoc on its own, no downloaded
    // assets. A named preset always wins — that's the documented escape hatch
    // for a Quick Export that wants the full layout, and it's why the PaperBell
    // pipelines (which leave `format` blank) never land here even when their
    // metadata template is missing.
    const formatOption = String(context.optionValues["format"] ?? "").trim();
    const builtinFormat =
      !optionTemplate && !fmTemplate && isBuiltinFormat(formatOption)
        ? formatOption
        : null;
    // Presets use ${.}/.. and relative paths that resolve inside the assets
    // folder; a built-in export reads nothing from there and it may not exist.
    const cwd = builtinFormat ? projectAbs : assetsAbs;

    const dirs = binSearchDirs(platform);
    const pandocBin = resolveBinary(
      (settings.pandocBinary ?? "pandoc").trim() || "pandoc",
      fs.existsSync,
      dirs,
      platform.isWindows
    );

    const defaultsFile = builtinFormat
      ? null
      : path.join(defaultsDir, template + ".yaml");
    // The assets folder is only a requirement when a preset is read out of it.
    const assetsOk = !!builtinFormat || fs.existsSync(assetsAbs);
    const defaultsOk = !defaultsFile || fs.existsSync(defaultsFile);

    // What the preset actually produces, and what it needs to produce it. A
    // `to: docx` preset must be written to a .docx path — pandoc 3.x exits with
    // "cannot produce pdf output from docx" otherwise. Parsing is best-effort:
    // a preset we can't read must not break an export that would have worked.
    let target: ExportTarget = {
      ext: ".pdf",
      pdfEngine: null,
      needsCrossref: false,
    };
    if (builtinFormat) {
      target = builtinExportTarget(builtinFormat);
    } else if (defaultsFile && defaultsOk) {
      try {
        target = exportTargetForDefaults(
          parseYaml(fs.readFileSync(defaultsFile, "utf8"))
        );
      } catch (e) {
        console.warn(
          `[Pandoc Export] Could not read preset ${defaultsFile}; assuming PDF output.`,
          e
        );
      }
    }

    // Only require the tools this preset actually asks for. A docx preset needs
    // neither a TeX engine nor pandoc-crossref.
    // A preset that produces a PDF without naming an engine leaves pandoc to
    // default to pdflatex — still a hard requirement, so check for it too.
    // Otherwise a missing engine escapes this checklist as a raw pandoc error.
    const engineName =
      target.pdfEngine ?? (target.ext === ".pdf" ? "pdflatex" : null);
    // Built-in PDF asks for xelatex (the only common engine that typesets CJK)
    // but settles for pdflatex, which is enough for a Latin-only note.
    const engineBin = engineName
      ? resolveBinary(engineName, fs.existsSync, dirs, platform.isWindows) ??
        (builtinFormat
          ? resolveBinary("pdflatex", fs.existsSync, dirs, platform.isWindows)
          : null)
      : null;
    const crossrefBin = target.needsCrossref
      ? resolveBinary("pandoc-crossref", fs.existsSync, dirs, platform.isWindows)
      : null;

    const bibliographies = resolveBibliography(settings, context, base, platform);
    const needsBib = hasCitations(input.contents);
    const bibOk = !needsBib || bibliographies.length > 0;

    // Resolve the CSL style: assets folder → Zotero's local styles → the official
    // CSL repo (cached into the assets folder). So exports work even when the CSL
    // isn't in the plugin's marketplace. Skipped entirely when the document has
    // no citations — a plain note should not need a style, let alone a network
    // round-trip, and `--csl` is omitted so pandoc never looks for one.
    const resolvedCsl = needsBib ? await ensureCsl(csl, cslDir, home) : null;
    // Built-in mode never fails over a style: with `--citeproc` and no `--csl`,
    // pandoc formats citations with its own default. Only pass a style we
    // actually resolved, and treat the note's explicit `csl:` as a preference.
    const cslFile = builtinFormat
      ? resolvedCsl
      : resolvedCsl ?? (needsBib ? path.join(cslDir, csl + ".csl") : null);
    const cslOk = !!builtinFormat || !needsBib || !!resolvedCsl;

    // pandoc silently lets the LAST --bibliography win on a duplicate cite key.
    // Detect collisions across the merged bibs and warn — the project bib is
    // listed last, so it is the winner (that is the intended override).
    let bibDupWarning = "";
    if (needsBib && bibliographies.length > 1) {
      const loaded = bibliographies
        .map((p) => {
          try {
            return { path: p, content: fs.readFileSync(p, "utf8") };
          } catch {
            return null;
          }
        })
        .filter((x): x is { path: string; content: string } => x !== null);
      const dups = findDuplicateCiteKeys(loaded);
      if (dups.length > 0) {
        const detail = dups
          .map(
            (d) =>
              `  @${d.key}: in ${d.paths.join(" , ")} → using ${
                d.paths[d.paths.length - 1]
              }`
          )
          .join("\n");
        bibDupWarning =
          `${dups.length} cite key(s) defined in more than one .bib; ` +
          `pandoc uses the last (your project bib overrides the global):\n${detail}`;
        console.warn("[Pandoc Export] " + bibDupWarning);
        new Notice(
          `PaperOut: ${dups.length} duplicate cite key(s) across bibliographies — ` +
            `the project bib wins. See console for the list.`,
          8000
        );
      }
    }

    const checklist = [
      line(
        !!pandocBin,
        "pandoc — " + (pandocBin || "not found"),
        pandocBin
          ? ""
          : "Install pandoc, or set the Pandoc binary in PaperOut To-Authors settings. Run 'Set up Pandoc export' for help."
      ),
      line(
        assetsOk,
        "Pandoc assets folder — " +
          (builtinFormat ? "not needed (no preset)" : assetsAbs),
        assetsOk
          ? ""
          : "Assets not found. Run 'Set up Pandoc export' → Download assets, or set 'Pandoc assets folder' in settings."
      ),
      line(
        defaultsOk,
        "preset — " +
          (defaultsFile ?? `not used (built-in ${builtinFormat} export)`),
        defaultsOk ? "" : missingPresetHelp(context.app, template, templateSource)
      ),
      line(
        cslOk,
        "CSL style — " +
          (cslFile ??
            (needsBib
              ? "not found — using pandoc's default style"
              : "not needed (no citations)")),
        cslOk
          ? ""
          : `csl is "${csl}" (from the exported note's frontmatter, or metadata _longform.csl). Not in the assets folder, in Zotero's styles (~/Zotero/styles/${csl}.csl), or the official CSL repo. Install Zotero's "${csl}" style, add csl/${csl}.csl, or set the csl to a valid style id (see github.com/citation-style-language/styles).`
      ),
      line(
        bibOk,
        "bibliography — " +
          (bibliographies.length
            ? bibliographies.join(", ")
            : needsBib
            ? "not found"
            : "not needed"),
        bibOk
          ? ""
          : "Your manuscript has [@citations] but no .bib was found. Add references.bib to the project, set a Bibliography path, or add a Global bibliography in settings."
      ),
      line(
        !engineName || !!engineBin,
        `PDF engine — ${
          engineName
            ? `${engineName}: ${engineBin || "not found"}`
            : builtinFormat
            ? `not needed (${builtinFormat} output)`
            : "not needed (this preset doesn’t build a PDF)"
        }`,
        !engineName || engineBin
          ? ""
          : builtinFormat
          ? "A PDF needs a TeX engine. Install MacTeX / TeX Live (macOS) or MiKTeX / TeX Live (Windows, Linux) — or set this step's Format to “docx”, which needs nothing but pandoc."
          : `The "${template}" preset declares pdf-engine: ${engineName}, which isn’t installed. Install MacTeX / TeX Live (macOS) or MiKTeX / TeX Live (Windows, Linux).`
      ),
      line(
        !target.needsCrossref || !!crossrefBin,
        "pandoc-crossref — " +
          (target.needsCrossref
            ? crossrefBin || "not found"
            : "not needed (not in this preset’s filters)"),
        !target.needsCrossref || crossrefBin
          ? ""
          : `The "${template}" preset runs pandoc-crossref for @fig / @tbl references, but it isn’t installed. Install it (macOS: brew install pandoc-crossref).`
      ),
    ];

    // xelatex and pandoc-crossref are hard requirements only when the preset
    // asks for them; without this, a missing engine surfaced as a raw pandoc
    // error instead of this checklist.
    const engineOk = !engineName || !!engineBin;
    const crossrefOk = !target.needsCrossref || !!crossrefBin;
    const hardOk =
      !!pandocBin &&
      assetsOk &&
      defaultsOk &&
      cslOk &&
      bibOk &&
      engineOk &&
      crossrefOk;
    if (!hardOk) {
      throw pandocSetupError(
        "Pandoc export can't run yet — here's what it needs:\n\n" +
          checklist.join("\n") +
          "\n\nTip: run the 'Set up Pandoc export' command from the command palette for guided setup."
      );
    }

    // Output path. The directory comes from the "Pandoc output folder" setting
    // (default = the project folder); the file name comes from the step's
    // "File name" pattern ({title}/{acronym}/{date}/…), or the compiled
    // manuscript's name when blank. A setting that names a file (any known
    // export extension, not just .pdf) is honored as a full output path, but
    // only when no File name pattern is given — and its extension is replaced
    // with the one the preset actually produces, since pandoc fails outright on
    // a mismatch.
    let outputFolder = (settings.pandocOutputFolder ?? "").trim();
    if (outputFolder.indexOf("<") !== -1) outputFolder = "";
    const settingIsFullPath = !!outputFolder && isFullOutputPath(outputFolder);
    const filenamePattern = String(context.optionValues["filename"] ?? "");
    const draftName =
      context.draft.draftTitle || context.draft.title || "manuscript";

    let outputPath: string;
    if (settingIsFullPath && !filenamePattern.trim()) {
      const asGiven = resolveUserPath(outputFolder, base, platform);
      outputPath = path.join(
        path.dirname(asGiven),
        path.basename(asGiven, path.extname(asGiven)) + target.ext
      );
    } else {
      const outDirAbs = settingIsFullPath
        ? path.dirname(resolveUserPath(outputFolder, base, platform))
        : outputFolder
        ? resolveUserPath(outputFolder, base, platform)
        : projectAbs;
      const filename = buildExportFilename(
        filenamePattern,
        { title: String(fm.title || draftName), acronym, date, csl, template, draft: draftName },
        draftName,
        target.ext
      );
      outputPath = path.join(outDirAbs, filename);
    }

    const inputFile = path.join(projectAbs, ".longform-pandoc-export.md");
    const args = buildPandocArgs({
      inputFile,
      defaultsFile,
      cslFile,
      projectAbs,
      outputPath,
      bibliographies,
      // Obsidian files pasted attachments outside the note's own folder (vault
      // root by default), so a loose note's images resolve only if we look there.
      extraResourcePaths: attachmentResourcePaths(context.app, base),
      builtin: builtinFormat
        ? {
            format: builtinFormat,
            from: builtinFrom(builtinFormat),
            pdfEngine: engineBin,
            // Naming a font that isn't installed makes xelatex fail outright,
            // so only when the note actually has CJK — and never over the
            // note's own `CJKmainfont:`, which pandoc already picks up as
            // document metadata.
            cjkFont:
              builtinFormat === "pdf" &&
              hasCjk(input.contents) &&
              !fm.CJKmainfont
                ? defaultCjkFont(process.platform)
                : null,
            citeproc: needsBib,
          }
        : null,
    });
    const env = { ...process.env, PATH: buildExecPath(platform) };

    const dryRun = context.optionValues["dry-run"] === true;
    if (dryRun) {
      console.log(
        "[Pandoc Export] DRY RUN — checklist:\n" +
          checklist.join("\n") +
          (bibDupWarning ? "\n\n⚠ " + bibDupWarning : "") +
          "\n\nWould run (cwd=" +
          cwd +
          "):\n" +
          [pandocBin].concat(args).join(" ")
      );
      return input;
    }

    // Ensure the output directory exists. Matters when exporting to a root
    // folder outside the vault (settings' "Pandoc output folder") that may not
    // have been created yet — otherwise pandoc's -o fails with a cryptic error.
    const outputDir = path.dirname(outputPath);
    try {
      fs.mkdirSync(outputDir, { recursive: true });
    } catch (e) {
      throw new Error(
        "Could not create the Pandoc output folder:\n  " +
          outputDir +
          "\n\n" +
          (e as Error).message +
          "\n\nCheck the 'Pandoc output folder' setting in PaperOut To-Authors → Compile → Pandoc export."
      );
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
 * Resolve the bibliographies for `--bibliography`, merged so pandoc can draw
 * citations from several `.bib` files at once. Ordered:
 *
 *   1. every existing vault-wide bib listed in `pandocGlobalBibliography`;
 *   2. the project-specific bib — the configured `pandocBibliography` path if
 *      set and present, else the nearest `references.bib`/`mybib.bib` searched
 *      from the draft folder up to the project root.
 *
 * The project bib comes LAST on purpose: pandoc lets the last `--bibliography`
 * win on duplicate cite keys, so a project's own entries override the global
 * one(s). Returns `[]` when nothing is found.
 */
export function resolveBibliography(
  settings: {
    pandocBibliography?: string | null;
    pandocGlobalBibliography?: string | null;
  },
  context: CompileContext,
  base: string,
  platform: PlatformEnv
): string[] {
  const result: string[] = [];

  // 1) vault-wide global bibliographies, in listed order
  for (const entry of splitBibList(settings.pandocGlobalBibliography)) {
    const abs = resolveUserPath(entry, base, platform);
    if (fs.existsSync(abs) && !result.includes(abs)) {
      result.push(abs);
    }
  }

  // 2) project-specific bibliography, appended last so it wins on dupes
  let projectBib: string | null = null;
  const configured = (settings.pandocBibliography ?? "").trim();
  if (configured) {
    const abs = resolveUserPath(configured, base, platform);
    if (fs.existsSync(abs)) projectBib = abs;
  } else {
    const root = context.projectRoot ?? context.projectPath;
    const names = ["references.bib", "mybib.bib"];
    findProjectBib: for (const name of names) {
      for (const rel of projectResourceCandidatePaths(
        context.projectPath,
        root,
        name
      )) {
        const abs = path.join(base, rel);
        if (fs.existsSync(abs)) {
          projectBib = abs;
          break findProjectBib;
        }
      }
    }
  }
  if (projectBib && !result.includes(projectBib)) {
    result.push(projectBib);
  }

  return result;
}
