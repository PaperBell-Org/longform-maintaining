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
import { projectResourceCandidatePaths } from "src/model/project-resources";
import {
  mergeMetadataLayers,
  readMetadataLayers,
} from "src/model/metadata-layers";
import { metadataStartDir } from "src/model/scene-navigation";

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
          "Filename of the Zenodo deposition metadata JSON. Read from the draft's folder (or its 'source/' subfolder) and every parent folder up to the project root; nearer files override farther ones key by key, so a draft's file only needs the keys it changes. Trailing '.json' is optional.",
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

    const startDir = metadataStartDir(context.draft, context.app.vault);
    const rootDir = context.projectRoot ?? context.projectPath;

    let layers;
    try {
      layers = await readMetadataLayers(
        context.app.vault,
        startDir,
        rootDir,
        baseName
      );
    } catch (e) {
      throw new Error(`[Add Zenodo Frontmatter] ${(e as Error).message}`);
    }

    if (layers.length === 0) {
      if (errorOnMissingFile) {
        throw new Error(
          `[Add Zenodo Frontmatter] Metadata file not found at ${projectResourceCandidatePaths(
            startDir,
            rootDir,
            baseName
          ).join(" or ")}`
        );
      }
      return input;
    }

    // Nearer files override farther ones key by key (#47).
    const metadata = mergeMetadataLayers(layers).merged as ZenodoMetadata;

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
