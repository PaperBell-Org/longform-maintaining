import { TFile } from "obsidian";
import type { CompileContext, CompileManuscriptInput } from "..";
import {
  CompileStepKind,
  CompileStepOptionType,
  makeBuiltinStep,
} from "./abstract-compile-step";
import {
  buildPandocYaml,
  type ZenodoMetadata,
} from "./add-zenodo-frontmatter-utils";

export const AddZenodoFrontmatterStep = makeBuiltinStep({
  id: "add-zenodo-frontmatter",
  description: {
    name: "Add Zenodo Frontmatter",
    description:
      "Reads a Zenodo-style metadata JSON from your project folder and prepends a Pandoc-compatible YAML frontmatter to the manuscript.",
    availableKinds: [CompileStepKind.Manuscript],
    options: [
      {
        id: "metadata-file",
        name: "Metadata file",
        description:
          "Filename of the Zenodo deposition metadata JSON in your project folder (or its 'source/' subfolder). Trailing '.json' is optional.",
        type: CompileStepOptionType.Text,
        default: "metadata.json",
      },
      {
        id: "error-on-missing-file",
        name: "Error on missing file",
        description:
          "If checked, throw an error when the metadata file is not found. Otherwise pass the manuscript through unchanged.",
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
      throw new Error("Cannot add frontmatter to non-manuscript.");
    }

    const metaFileName = String(
      context.optionValues["metadata-file"] ?? "metadata.json"
    ).trim();
    const errorOnMissingFile = Boolean(
      context.optionValues["error-on-missing-file"] ?? true
    );

    const baseName = metaFileName.endsWith(".json")
      ? metaFileName
      : `${metaFileName}.json`;

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
      if (errorOnMissingFile) {
        throw new Error(
          `[Add Zenodo Frontmatter] Metadata file not found at ${candidatePaths.join(
            " or "
          )}`
        );
      }
      return input;
    }

    const raw = await context.app.vault.cachedRead(file);
    let metadata: ZenodoMetadata;
    try {
      metadata = JSON.parse(raw) as ZenodoMetadata;
    } catch (e) {
      throw new Error(
        `[Add Zenodo Frontmatter] Invalid JSON in ${foundPath}: ${
          (e as Error).message
        }`
      );
    }

    const yaml = buildPandocYaml(metadata);
    return {
      contents: `---\n${yaml}---\n\n${input.contents}`,
    };
  },
});

export {
  buildPandocYaml,
  type ZenodoMetadata,
  type ZenodoCreator,
  type ZenodoContributor,
  type LongformExtras,
} from "./add-zenodo-frontmatter-utils";
