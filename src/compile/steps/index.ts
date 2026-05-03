import { ConcatenateTextStep } from "./concatenate-text";
import { PrependTitleStep } from "./prepend-title";
import { RemoveCommentsStep } from "./remove-comments";
import { RemoveLinksStep } from "./remove-links";
import { RemoveStrikethroughsStep } from "./remove-strikethroughs";
import { StripFrontmatterStep } from "./strip-frontmatter";
import { WriteToNoteStep } from "./write-to-note";
import { AddFrontmatterStep } from "./add-frontmatter";
import { AddZenodoFrontmatterStep } from "./add-zenodo-frontmatter";
import { ReplaceJsonPlaceholdersStep } from "./replace-json-placeholders";

export const BUILTIN_STEPS = [
  AddFrontmatterStep,
  AddZenodoFrontmatterStep,
  ConcatenateTextStep,
  PrependTitleStep,
  RemoveCommentsStep,
  RemoveLinksStep,
  RemoveStrikethroughsStep,
  ReplaceJsonPlaceholdersStep,
  StripFrontmatterStep,
  WriteToNoteStep,
];
