import { TFile } from "obsidian";
import type { CompileContext, CompileManuscriptInput } from "..";
import {
  CompileStepKind,
  CompileStepOptionType,
  makeBuiltinStep,
} from "./abstract-compile-step";
import {
  buildPlaceholderRegex,
  deepMerge,
  formatPlaceholderValue,
  getByPath,
  parseJsonFileList,
} from "./replace-json-placeholders-utils";
import { projectResourceCandidatePaths } from "src/model/project-resources";

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
        name: "JSON file(s)",
        description:
          "Filename(s) of the JSON data file(s). Separate several with commas — they are merged into one namespace, with later files winning on key conflicts (e.g. 'metadata.json, results.json'). Each is searched for in the draft's folder (or its 'source/' subfolder) and any parent folder up to the project root. Trailing '.json' is optional.",
        type: CompileStepOptionType.Text,
        default: "metadata.json, results.json",
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

    const fileList = parseJsonFileList(
      String(context.optionValues["json-file"] ?? "metadata.json, results.json")
    );
    const startDelim = String(context.optionValues["start-delim"] ?? "{{");
    const endDelim = String(context.optionValues["end-delim"] ?? "}}");
    const errorOnMissing = Boolean(context.optionValues["error-on-missing"]);

    if (fileList.length === 0) {
      throw new Error("[Replace JSON Placeholders] No JSON file configured.");
    }

    // Resolve, read, and merge each file into one namespace. Files listed later
    // win on key conflicts. A listed file that isn't found is skipped (unless
    // none of them are found, which is an error).
    let data: unknown = {};
    const foundNames: string[] = [];
    const searchedFor: string[] = [];
    for (const baseName of fileList) {
      const candidatePaths = projectResourceCandidatePaths(
        context.projectPath,
        context.projectRoot ?? context.projectPath,
        baseName
      );
      searchedFor.push(`${baseName} (${candidatePaths.join(" or ")})`);

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
      if (!file) continue;

      const raw = await context.app.vault.cachedRead(file);
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch (e) {
        throw new Error(
          `[Replace JSON Placeholders] Invalid JSON in ${foundPath}: ${
            (e as Error).message
          }`
        );
      }
      data = deepMerge(data, parsed);
      foundNames.push(foundPath);
    }

    if (foundNames.length === 0) {
      throw new Error(
        `[Replace JSON Placeholders] None of the configured JSON files were found. Searched for: ${searchedFor.join(
          "; "
        )}`
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
      return formatPlaceholderValue(value);
    });

    return { contents: replaced };
  },
});

export {
  buildPlaceholderRegex,
  deepMerge,
  formatPlaceholderValue,
  getByPath,
  parseJsonFileList,
  setByPath,
  tokenizePath,
} from "./replace-json-placeholders-utils";
