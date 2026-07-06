import type { CompileContext, CompileManuscriptInput } from "..";
import {
  CompileStepKind,
  CompileStepOptionType,
  makeBuiltinStep,
} from "./abstract-compile-step";
import { transformToSupplementary } from "./supplementary-info-utils";

export const SupplementaryInfoStep = makeBuiltinStep({
  id: "supplementary-info",
  description: {
    name: "Supplementary Information",
    description:
      'Turns the compiled manuscript into a Supplementary Information (SI) document: prefixes figures/tables with "S" (S1, S2, …), retitles it \'Supplementary Information for "<title>"\', drops keywords, and replaces the abstract. Add it after Add Zenodo Frontmatter (and before Save as Note / Run Pandoc Export) in an SI-only workflow.',
    availableKinds: [CompileStepKind.Manuscript],
    options: [
      {
        id: "abstract",
        name: "Abstract",
        description:
          "Custom abstract for the SI. Leave blank to auto-generate a one-line summary listing the document's top-level section headings (no AI, no metadata.json).",
        type: CompileStepOptionType.MultilineText,
        default: "",
      },
      {
        id: "summarize-sections",
        name: "Auto-summarize sections",
        description:
          "When the Abstract above is blank, build the abstract from the top-level section headings. Uncheck to leave the abstract empty instead (e.g. to fill it in later).",
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
      throw new Error(
        "Cannot run Supplementary Information on a non-manuscript."
      );
    }
    return {
      contents: transformToSupplementary(input.contents, {
        abstract: String(context.optionValues["abstract"] ?? ""),
        summarizeSections: context.optionValues["summarize-sections"] !== false,
      }),
    };
  },
});
