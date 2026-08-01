import type { MessageKey } from "src/i18n";
import type { ProjectAsset } from "src/model/types";

/**
 * The parts a PaperBell paper project can be made of, each buildable on its own.
 *
 * Split out of `paperbell-scaffold.ts` so that creating a project and adding a
 * part to an existing one run the *same* builders — the two entry points must
 * never drift into two definitions of what "a Response Letter" is.
 */

/** One file to write: text content, or a base64-encoded binary. */
export type ScaffoldFile =
  | { path: string; text: string }
  | { path: string; base64: string };

export type PaperPartId = "main" | "supplementary" | "cover" | "response";

/**
 * How the project records its drafts.
 *
 * - `legacy`: every draft is its own note carrying a `longform:` block, grouped
 *   into one project by a shared `title:`. This is what the scaffold writes.
 * - `project`: one `format: project` index owns an `assets[]` array, and the
 *   drafts' own notes carry no `longform:` at all. Reached via the
 *   "Convert project to single index…" command.
 */
export type ProjectForm = "legacy" | "project";

export interface PartContext {
  title: string;
  acronym: string;
  author: string;
  /**
   * Whether `figs/example_*` are available in the project — either written by
   * this same operation, or already on disk. Body text that references them is
   * omitted when they are not, so a scaffold never ships a dangling image link.
   */
  examples: boolean;
  /**
   * Every part the project will contain *after* this operation. Cross-part
   * references (the response letter quoting the manuscript) are emitted only
   * when their target is actually there.
   */
  present: ReadonlySet<PaperPartId>;
}

export interface PartBuildResult {
  /** Files to write, relative to the project's anchor folder. */
  files: ScaffoldFile[];
  /** The `assets[]` entry to append. Only produced for `form: "project"`. */
  asset?: ProjectAsset;
}

export interface PaperPart {
  id: PaperPartId;
  /** The draft's `draftTitle` — also the asset `name` in project form. */
  draftTitle: string;
  /** Exact key in DEFAULT_WORKFLOWS. A typo here silently unbinds the draft. */
  workflow: string;
  /** i18n keys for the toggle in the new-project / add-part modals. */
  labelKey: MessageKey;
  descKey: MessageKey;
  /** Anchor-relative paths this part owns, for "does it already exist?" checks. */
  ownedPaths: string[];
  /**
   * The file to select and open once this part is created. Derived here rather
   * than sniffed from the produced file list, so renaming a part's index note
   * cannot silently break post-creation selection.
   */
  primaryPath: string;
  build(ctx: PartContext, form: ProjectForm): PartBuildResult;
}

/** JSON.stringify with the 2-space, trailing-newline shape the fixtures use. */
export function json(value: unknown): string {
  return JSON.stringify(value, null, 2) + "\n";
}

// ── Body text ───────────────────────────────────────────────────────────────

const INTRODUCTION_MD = `# Introduction

Open with the background and the gap your paper addresses. You can use *italic*, **bold**, and ==highlight== for emphasis, and Markdown footnotes for asides.[^note]

Cite prior work with bracketed keys that resolve against \`references.bib\`: a single citation [@doe2020] or several [@doe2020; @roe2021]. Values from \`metadata.json\` render live in reading mode and at compile time — this is *{{title}}* (acronym {{_longform.acronym}}, version {{version}}).

Wrap the one sentence you will quote in your response letter in a manuscript span so the response letter can pull its live text and line number: <!--ms:intro-gap-->state here, in one sentence, the specific gap this paper closes.<!--/ms:intro-gap-->

[^note]: Footnotes render in the compiled PDF.
`;

const METHODS_MD = `# Methods

Describe your approach. Inline math like $E = mc^2$ and display math both work:

$$\\bar{x} = \\frac{1}{n}\\sum_{i=1}^{n} x_i.$$

Blackboard symbols such as $\\mathbb{R}$ come from \`amssymb\`, which the template loads.

Values below are injected at compile time from \`results.json\` (they are not in \`metadata.json\`, so they stay as raw placeholders in the live preview and are substituted only by the compile step): we analysed {{ summary.n }} {{ summary.unit }} with a mean of {{ summary.mean }}, the first identified as {{ samples[0].id }}. Computed on {{ computed_date }}.
`;

/**
 * The Results scene. Without the example assets the figure and xlsx-table blocks
 * are dropped entirely rather than left pointing at absent files — a dangling
 * `figs/example_figure.png` fails the LaTeX build, and `xlsx_table.lua` errors
 * on a missing workbook.
 */
function resultsMd(examples: boolean): string {
  if (!examples) {
    return `# Results

State the primary outcome here.

Add a figure with a label so you can cross-reference it:
\`![Your caption. {#fig:key width=70%}](figs/your-figure.png)\`, then cite it as
Figure \\ref{fig:key}. Tables can be generated from a spreadsheet at compile time
with an \`xlsx-table\` block.

Defer extended analyses to the supplementary results.
`;
  }
  return `# Results

State the primary outcome and point to Figure \\ref{fig:demo}.

![Replace with your figure caption. {#fig:demo width=70%}](figs/example_figure.png)

Report tabular results in Table \\ref{tbl:demo}, generated from a spreadsheet at compile time by the pipeline's \`xlsx_table.lua\`:

\`\`\`xlsx-table
file: figs/example_data.xlsx
sheet: Data
caption: Replace with your table caption.
label: tbl:demo
skip_n: 0
\`\`\`

Defer extended analyses to the supplementary results.
`;
}

function supplementaryResultsMd(examples: boolean): string {
  const head = `# Supplementary Results

Because this draft's workflow includes the **Supplementary Information** step, figures and tables here are numbered with an S prefix automatically — Figure \\ref{fig:supp_demo} becomes "Figure S1" and Table \\ref{tbl:supp_demo} becomes "Table S1".
`;
  if (!examples) {
    return `${head}
Add supplementary figures and tables the same way you would in the manuscript;
paths are relative to this folder, so a shared figure lives at \`../figs/…\`.
`;
  }
  return `${head}
![A supplementary figure caption. {#fig:supp_demo width=60%}](../figs/example_figure.png)

\`\`\`xlsx-table
file: ../figs/example_data.xlsx
sheet: Data
caption: A supplementary table caption.
label: tbl:supp_demo
skip_n: 0
\`\`\`
`;
}

/**
 * The Response Letter scene. The ```manuscript fences resolve against spans and
 * figure labels defined in the manuscript, so each is emitted only when its
 * target exists: `@intro-gap` needs the Main Manuscript, `@fig:demo` needs the
 * example figure inside it too.
 */
function responseMd(ctx: PartContext): string {
  const hasMain = ctx.present.has("main");
  const head = `# Response to Reviewer 1

> [!RC] Reviewer 1, Comment 1
> Paraphrase the reviewer's comment here.

Write your reply.`;

  if (!hasMain) {
    return `${head} Once this project has a Main Manuscript, you can quote its *current* text by wrapping a manuscript span (\`<!--ms:some-id-->…<!--/ms:some-id-->\`) in the manuscript and fencing \`@some-id\` in a \`\`\`manuscript\`\`\` block here — the quote and its Page/Line stay in sync automatically.
`;
  }

  const figureSection = ctx.examples
    ? `
To show a manuscript figure with its manuscript number:

\`\`\`manuscript
@fig:demo
\`\`\`

You can also refer to it inline as Figure \\ref{fig:demo}.
`
    : `
Fencing a figure label the same way (\`@fig:your-key\`) renders that figure with its manuscript number.
`;

  return `${head} To quote the manuscript's *current* text (kept in sync automatically), fence a manuscript reference — it renders as a gray box with the live Page/Line:

\`\`\`manuscript
@intro-gap
\`\`\`
${figureSection}`;
}

// ── Index notes (legacy form) ───────────────────────────────────────────────

function mainIndex(title: string): string {
  return `---
longform:
  format: scenes
  title: ${title}
  draftTitle: Main Manuscript
  workflow: PaperBell Manuscript
  sceneFolder: manuscript
  scenes:
    - introduction
    - methods
    - results
  ignoredFiles: []
---

Main manuscript of **${title}**. Shared publication metadata lives in \`metadata.json\` in this folder; compile it with the **PaperBell Manuscript** workflow.
`;
}

function responseIndex(title: string): string {
  return `---
longform:
  format: scenes
  title: ${title}
  draftTitle: Response Letter
  workflow: PaperBell Response Letter
  sceneFolder: response
  scenes:
    - response
  ignoredFiles: []
---

Response-letter draft of **${title}**. Compile the **Main Manuscript** first (it harvests \`manuscript-lines.json\` / \`figure-numbers.json\`), then compile this with **PaperBell Response Letter**: the \`\`\`manuscript\`\`\` fences pull the manuscript's current text into a Page/Line box, and figure labels resolve to the manuscript's figure numbers.
`;
}

function supplementaryIndex(title: string): string {
  return `---
longform:
  format: scenes
  title: ${title}
  draftTitle: Supplementary
  workflow: PaperBell Supplementary
  sceneFolder: /
  scenes:
    - supplementary results
  ignoredFiles: []
---

Supplementary draft of **${title}**. Its own \`metadata.json\` in this folder (found before the shared one at the project root) adds \`supplementary: true\`, so figures and tables are numbered S1, S2, …
`;
}

/**
 * The cover letter's own note. It is a single-file draft: the cover_letter
 * template reads to/date/manuscript/corresponding straight from this
 * frontmatter, so its workflow exports the note as-is.
 *
 * In project form the note is an asset's body and carries no `longform:` block:
 * a stray one would register it as a second, competing draft. That is exactly
 * what the convert command's `stripLongform` removes.
 */
function coverLetter(ctx: PartContext, form: ProjectForm): string {
  const longform = form === "legacy"
    ? `longform:
  format: single
  title: ${ctx.title}
  draftTitle: Cover Letter
  workflow: PaperBell Cover Letter
`
    : "";
  return `---
${longform}title: Cover letter
manuscript: ${ctx.title}
acronym: ${ctx.acronym}
date:
to: Dear Editor,
corresponding: ${ctx.author} (you@example.com)
---

We are pleased to submit our manuscript, *{{manuscript}}*, for consideration for publication in *{{JournalName}}*.

State in one or two sentences what the paper shows and why it matters to this journal's readers.

State the key advance over prior work, and why this venue is the right fit.

We confirm that this manuscript is original, has not been published elsewhere, and is not under consideration by another journal. All authors have approved the submission and declare no competing interests.

Thank you for your consideration; we look forward to your response.
`;
}

function supplementaryMetadata(ctx: PartContext): string {
  return json({
    title: `${ctx.title} — Supplementary Information`,
    publication_date: "",
    upload_type: "publication",
    publication_type: "article",
    description:
      "Supplementary information for the paper. Shares the main manuscript's metadata but adds supplementary: true so figures and tables receive an S prefix.",
    creators: [
      {
        name: ctx.author,
        affiliation: "Your Institution",
        orcid: "0000-0000-0000-0000",
        email: "you@example.com",
      },
    ],
    keywords: ["keyword-one", "keyword-two"],
    journal_title: "Target Journal",
    version: "v1.0",
    _longform: {
      acronym: ctx.acronym,
      csl: "nature",
      template: "paperbell",
      corresponding: [ctx.author],
      extra_yaml: "supplementary: true\nnumbersections: true\n",
    },
  });
}

// ── The parts ───────────────────────────────────────────────────────────────

/**
 * Every part, in the order they should be created and listed.
 *
 * No part may emit anything under `figs/` — the example assets are their own
 * bundle, owned by the scaffold. That keeps "two parts selected" from ever
 * producing the same path twice, structurally rather than by de-duplication.
 */
export const PAPER_PARTS: readonly PaperPart[] = [
  {
    id: "main",
    draftTitle: "Main Manuscript",
    workflow: "PaperBell Manuscript",
    labelKey: "parts.mainLabel",
    descKey: "parts.mainDesc",
    ownedPaths: ["Main Manuscript (Index).md", "manuscript"],
    primaryPath: "Main Manuscript (Index).md",
    build(ctx, form) {
      const files: ScaffoldFile[] = [
        { path: "manuscript/introduction.md", text: INTRODUCTION_MD },
        { path: "manuscript/methods.md", text: METHODS_MD },
        { path: "manuscript/results.md", text: resultsMd(ctx.examples) },
      ];
      if (form === "legacy") {
        files.push({
          path: "Main Manuscript (Index).md",
          text: mainIndex(ctx.title),
        });
        return { files };
      }
      return {
        files,
        asset: {
          name: "Main Manuscript",
          format: "scenes",
          folder: "manuscript",
          workflow: "PaperBell Manuscript",
          scenes: ["introduction", "methods", "results"],
          ignoredFiles: [],
        },
      };
    },
  },
  {
    id: "supplementary",
    draftTitle: "Supplementary",
    workflow: "PaperBell Supplementary",
    labelKey: "parts.supplementaryLabel",
    descKey: "parts.supplementaryDesc",
    ownedPaths: ["supplementary"],
    primaryPath: "supplementary/Supplementary (Index).md",
    build(ctx, form) {
      const files: ScaffoldFile[] = [
        {
          path: "supplementary/supplementary results.md",
          text: supplementaryResultsMd(ctx.examples),
        },
        {
          path: "supplementary/metadata.json",
          text: supplementaryMetadata(ctx),
        },
      ];
      if (form === "legacy") {
        files.push({
          path: "supplementary/Supplementary (Index).md",
          text: supplementaryIndex(ctx.title),
        });
        return { files };
      }
      return {
        files,
        asset: {
          name: "Supplementary",
          format: "scenes",
          folder: "supplementary",
          workflow: "PaperBell Supplementary",
          scenes: ["supplementary results"],
          ignoredFiles: [],
        },
      };
    },
  },
  {
    id: "cover",
    draftTitle: "Cover Letter",
    workflow: "PaperBell Cover Letter",
    labelKey: "parts.coverLabel",
    descKey: "parts.coverDesc",
    ownedPaths: ["Cover Letter.md"],
    primaryPath: "Cover Letter.md",
    build(ctx, form) {
      const files: ScaffoldFile[] = [
        { path: "Cover Letter.md", text: coverLetter(ctx, form) },
      ];
      if (form === "legacy") {
        return { files };
      }
      return {
        files,
        asset: {
          name: "Cover Letter",
          format: "single",
          file: "Cover Letter.md",
          workflow: "PaperBell Cover Letter",
        },
      };
    },
  },
  {
    id: "response",
    draftTitle: "Response Letter",
    workflow: "PaperBell Response Letter",
    labelKey: "parts.responseLabel",
    descKey: "parts.responseDesc",
    ownedPaths: ["Response Letter (Index).md", "response"],
    primaryPath: "Response Letter (Index).md",
    build(ctx, form) {
      const files: ScaffoldFile[] = [
        { path: "response/response.md", text: responseMd(ctx) },
      ];
      if (form === "legacy") {
        files.push({
          path: "Response Letter (Index).md",
          text: responseIndex(ctx.title),
        });
        return { files };
      }
      return {
        files,
        asset: {
          name: "Response Letter",
          format: "scenes",
          folder: "response",
          workflow: "PaperBell Response Letter",
          scenes: ["response"],
          ignoredFiles: [],
        },
      };
    },
  },
];

/** Look a part up by id. */
export function paperPart(id: PaperPartId): PaperPart {
  const part = PAPER_PARTS.find((p) => p.id === id);
  if (!part) throw new Error(`Unknown paper part: ${id}`);
  return part;
}

/**
 * The file to open after creating `ids` — the first selected part's own, in
 * canonical order. Only meaningful for the legacy form, where each part has an
 * index note of its own.
 */
export function primaryPathFor(ids: readonly PaperPartId[]): string | null {
  const selected = new Set(ids);
  const first = PAPER_PARTS.find((p) => selected.has(p.id));
  return first?.primaryPath ?? null;
}

/** Every part id, in canonical order. */
export const ALL_PAPER_PARTS: readonly PaperPartId[] = PAPER_PARTS.map(
  (p) => p.id
);

/**
 * Is this file an index note — the one carrying a draft's `longform:` block?
 *
 * Index notes must be written *last*. `StoreVaultSync.reconcileScenesDraft`
 * drops any scene listed in frontmatter that is not yet on disk and writes the
 * shortened list back, so an index landing before its scenes gets `scenes:`
 * emptied.
 */
export function isIndexNote(file: ScaffoldFile): boolean {
  return "text" in file && /^---\r?\nlongform:/.test(file.text);
}

/** Scaffold files reordered so every index note is written after its scenes. */
export function scenesBeforeIndexes<T extends { file: ScaffoldFile }>(
  entries: T[]
): T[] {
  return [
    ...entries.filter((e) => !isIndexNote(e.file)),
    ...entries.filter((e) => isIndexNote(e.file)),
  ];
}
