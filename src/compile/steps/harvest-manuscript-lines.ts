import { FileSystemAdapter, Notice } from "obsidian";
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
  DEFAULT_ASSETS_DIR,
  parseExportFrontmatter,
  resolveBinary,
  resolveUserPath,
} from "./pandoc-export-utils";
import { resolveBibliography } from "./pandoc-export";
import {
  buildCaptureArgs,
  buildTexInputs,
  captionSpanFigs,
  isSupplementaryFrontmatter,
  lineSidecarName,
  mergeSidecar,
  parseAuxLabels,
  type NumberSidecar,
  type LinesSidecar,
} from "./harvest-manuscript-lines-utils";
import { pluginSettings } from "src/model/stores";

/** Read a JSON sidecar, tolerating a missing/invalid file (→ {}). */
function readJsonSafe(p: string): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Write a sidecar with sorted keys + trailing newline (stable diffs). */
function writeJsonSorted(p: string, obj: Record<string, unknown>): void {
  const sorted: Record<string, unknown> = {};
  for (const k of Object.keys(obj).sort()) sorted[k] = obj[k];
  fs.writeFileSync(p, JSON.stringify(sorted, null, 2) + "\n", "utf8");
}

function run(
  bin: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv
): Promise<{ ok: boolean; stderr: string }> {
  return new Promise((resolve) => {
    execFile(bin, args, { cwd, env }, (err, _stdout, stderr) => {
      resolve({ ok: !err, stderr: stderr || (err ? err.message : "") });
    });
  });
}

export const HarvestManuscriptLinesStep = makeBuiltinStep({
  id: "harvest-manuscript-lines",
  description: {
    name: "Harvest Manuscript Line Numbers",
    description:
      "After the manuscript PDF is built, runs a second Pandoc→XeLaTeX pass with mslabels to capture line/figure/table numbers for <!--ms:id--> spans into sidecar JSON, so a response letter can cite the manuscript with correct Page/Line. Desktop only; leaves the manuscript unchanged. Requires the manuscript's remove-comments step to keep HTML comments (so ms: markers survive).",
    availableKinds: [CompileStepKind.Manuscript],
    options: [
      {
        id: "enabled",
        name: "Enabled",
        description:
          "Uncheck to skip line-number harvesting (e.g. while drafting, to save the extra XeLaTeX pass).",
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
      throw new Error("Cannot harvest line numbers on non-manuscript.");
    }
    if (context.optionValues["enabled"] === false) return input;

    const adapter = context.app.vault.adapter;
    if (!(adapter instanceof FileSystemAdapter)) {
      // Desktop-only; silently pass through on mobile (harvesting is optional).
      return input;
    }

    // Harvesting is auxiliary to the PDF export: never fail the whole compile —
    // surface problems as a Notice and pass the manuscript through unchanged.
    try {
      await harvest(input, context, adapter.getBasePath());
    } catch (e) {
      new Notice(
        "Harvest line numbers failed (response-letter refs may be stale): " +
          (e as Error).message,
        10000
      );
      console.error("[Harvest Lines]", e);
    }
    return input;
  },
});

async function harvest(
  input: CompileManuscriptInput,
  context: CompileContext,
  base: string
): Promise<void> {
  const home = os.homedir();
  const settings = get(pluginSettings);

  const assetsSetting =
    (settings.pandocAssetsFolder ?? "").trim() || DEFAULT_ASSETS_DIR;
  const assetsAbs = resolveUserPath(assetsSetting, base, home);
  const defaultsDir = path.join(assetsAbs, "defaults");
  const cslDir = path.join(assetsAbs, "csl");
  const projectAbs = path.join(base, context.projectPath);

  const fm = parseExportFrontmatter(input.contents);
  const template = String(fm.template || "undefined");
  const csl = String(fm.csl || "nature");
  const isSI = isSupplementaryFrontmatter(fm);

  const dirs = binSearchDirs(home);
  const pandocBin = resolveBinary(
    (settings.pandocBinary ?? "pandoc").trim() || "pandoc",
    fs.existsSync,
    dirs
  );
  const xelatexBin = resolveBinary("xelatex", fs.existsSync, dirs);
  if (!pandocBin || !xelatexBin) {
    throw new Error("pandoc or xelatex not found on PATH.");
  }

  const defaultsFile = path.join(defaultsDir, template + ".yaml");
  const cslFile = path.join(cslDir, csl + ".csl");
  if (!fs.existsSync(defaultsFile) || !fs.existsSync(cslFile)) {
    throw new Error(`missing preset/csl (${template}.yaml / ${csl}.csl).`);
  }
  const bibliography = resolveBibliography(settings, context, base, home);

  const env = {
    ...process.env,
    PATH: buildExecPath(process.env.PATH ?? "", home),
  };
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "longform-mslines-"));
  const inputFile = path.join(projectAbs, ".longform-mslines-harvest.md");
  const texOutput = path.join(tmpDir, "mslines.tex");

  try {
    fs.writeFileSync(inputFile, input.contents, "utf8");

    // Pass 1: pandoc → standalone .tex with mslabels turned on.
    const pandocArgs = buildCaptureArgs({
      inputFile,
      defaultsFile,
      cslFile,
      projectAbs,
      texOutput,
      bibliography,
    });
    const p = await run(pandocBin, pandocArgs, assetsAbs, env);
    if (!p.ok || !fs.existsSync(texOutput)) {
      throw new Error("pandoc capture pass failed: " + p.stderr.slice(0, 300));
    }

    // Pass 2+3: xelatex twice for a stable .aux (labels resolve on the 2nd run).
    const xelatexEnv = {
      ...env,
      TEXINPUTS: buildTexInputs(projectAbs, assetsAbs),
    };
    const xArgs = [
      "-interaction=nonstopmode",
      "-halt-on-error=false",
      "-file-line-error",
      "mslines.tex",
    ];
    await run(xelatexBin, xArgs, tmpDir, xelatexEnv);
    await run(xelatexBin, xArgs, tmpDir, xelatexEnv);

    const auxPath = path.join(tmpDir, "mslines.aux");
    if (!fs.existsSync(auxPath)) {
      throw new Error("XeLaTeX produced no .aux (see the manuscript for errors).");
    }
    const aux = fs.readFileSync(auxPath, "utf8");
    const { lines, figures, tables } = parseAuxLabels(aux, (msg) =>
      console.warn(`[PaperOut] harvest-manuscript-lines: ${msg}`)
    );
    // Caption-embedded spans get their figure number (no lineno label in captions).
    const captionFigs = captionSpanFigs(input.contents, figures);
    const allLines: LinesSidecar = { ...lines, ...captionFigs };

    // Merge into the project's sidecars (main & SI accumulate disjoint labels).
    const linesFile = path.join(projectAbs, lineSidecarName(isSI));
    writeJsonSorted(
      linesFile,
      mergeSidecar(readJsonSafe(linesFile) as LinesSidecar, allLines)
    );
    const figFile = path.join(projectAbs, "figure-numbers.json");
    writeJsonSorted(
      figFile,
      mergeSidecar(readJsonSafe(figFile) as NumberSidecar, figures)
    );
    const tblFile = path.join(projectAbs, "table-numbers.json");
    writeJsonSorted(
      tblFile,
      mergeSidecar(readJsonSafe(tblFile) as NumberSidecar, tables)
    );

    new Notice(
      `Harvested ${Object.keys(allLines).length} span(s), ${
        Object.keys(figures).length
      } figure(s)${isSI ? " (SI)" : ""}.`
    );
  } finally {
    try {
      fs.unlinkSync(inputFile);
    } catch {
      /* ignore */
    }
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}
