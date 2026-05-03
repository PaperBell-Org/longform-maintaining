import { TFile } from "obsidian";
import type { CompileContext, CompileManuscriptInput } from "..";
import {
  CompileStepKind,
  CompileStepOptionType,
  makeBuiltinStep,
} from "./abstract-compile-step";
import {
  buildPlaceholderRegex,
  getByPath,
} from "./replace-json-placeholders-utils";

export const ReplaceJsonPlaceholdersStep = makeBuiltinStep({
  id: "replace-json-placeholders",
  description: {
    name: "Replace JSON Placeholders",
    description:
      "Replaces {{path.to.value}} placeholders in your manuscript with values from a JSON file in your project folder.",
    availableKinds: [CompileStepKind.Manuscript],
    options: [
      {
        id: "json-file",
        name: "JSON file",
        description:
          "Filename of the JSON data file in your project folder (or its 'source/' subfolder). Trailing '.json' is optional.",
        type: CompileStepOptionType.Text,
        default: "results.json",
      },
      {
        id: "start-delim",
        name: "Start delimiter",
        description: "Left delimiter of placeholders.",
        type: CompileStepOptionType.Text,
        default: "{{",
      },
      {
        id: "end-delim",
        name: "End delimiter",
        description: "Right delimiter of placeholders.",
        type: CompileStepOptionType.Text,
        default: "}}",
      },
      {
        id: "error-on-missing",
        name: "Error on missing",
        description:
          "If checked, throw an error when a placeholder path is not found in the JSON file. Otherwise leave the placeholder unchanged.",
        type: CompileStepOptionType.Boolean,
        default: false,
      },
    ],
  },
  async compile(
    input: CompileManuscriptInput,
    context: CompileContext
  ): Promise<CompileManuscriptInput> {
    if (context.kind !== CompileStepKind.Manuscript) {
      throw new Error("Cannot replace placeholders on non-manuscript.");
    }

    const jsonFileName = String(
      context.optionValues["json-file"] ?? "results.json"
    ).trim();
    const startDelim = String(context.optionValues["start-delim"] ?? "{{");
    const endDelim = String(context.optionValues["end-delim"] ?? "}}");
    const errorOnMissing = Boolean(context.optionValues["error-on-missing"]);

    const baseName = jsonFileName.endsWith(".json")
      ? jsonFileName
      : `${jsonFileName}.json`;

    const candidatePaths = [
      `${context.projectPath}/${baseName}`,
      `${context.projectPath}/source/${baseName}`,
    ];

    let file: TFile | null = null;
    let foundPath = "";
    for (const path of candidatePaths) {
      const f = context.app.vault.getAbstractFileByPath(path);
      if (f instanceof TFile) {
        file = f;
        foundPath = path;
        break;
      }
    }

    if (!file) {
      throw new Error(
        `[Replace JSON Placeholders] JSON file not found at ${candidatePaths.join(
          " or "
        )}`
      );
    }

    const raw = await context.app.vault.cachedRead(file);
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      throw new Error(
        `[Replace JSON Placeholders] Invalid JSON in ${foundPath}: ${
          (e as Error).message
        }`
      );
    }

    const pattern = buildPlaceholderRegex(startDelim, endDelim);
    const replaced = input.contents.replace(pattern, (match, rawPath) => {
      const pathExpr = String(rawPath).trim();
      const value = getByPath(data, pathExpr);
      if (value === undefined) {
        if (errorOnMissing) {
          throw new Error(
            `[Replace JSON Placeholders] Missing value for placeholder path: ${pathExpr}`
          );
        }
        return match;
      }
      if (value === null) return "";
      if (typeof value === "object") {
        try {
          return JSON.stringify(value);
        } catch {
          return String(value);
        }
      }
      return String(value);
    });

    return { contents: replaced };
  },
});

export { buildPlaceholderRegex, getByPath };
