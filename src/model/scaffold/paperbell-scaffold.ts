import {
  EXAMPLE_FIGURE_PNG_BASE64,
  EXAMPLE_DATA_XLSX_BASE64,
} from "./assets";

/**
 * Pure logic for the "New PaperBell paper" scaffold — the one-click project
 * skeleton mirroring test-longform-vault/paperbell-minimal, but neutral starter
 * content instead of the regression-fixture prose. Side-effect free and unit
 * tested; the modal writes the returned files to the vault.
 *
 * A scaffold is three drafts of ONE project (same `title`, distinct `draftTitle`):
 * a multi-scene Main Manuscript, a Supplementary Information draft (nearest-wins
 * metadata.json adds `supplementary: true` → S-numbering), and a Response Letter
 * that pulls the manuscript's `@intro-gap` span and `@fig:demo` via the
 * reference-sync. Every path is relative to the project folder.
 */

export interface ScaffoldOptions {
  /** Project title — also the enclosing folder name and Longform project id. */
  title: string;
  /** Short acronym for the PDF name / labels. Defaults to initials of `title`. */
  acronym?: string;
  /** Lead author as "Last, First". Defaults to a fill-in placeholder. */
  author?: string;
}

/** One file to write: text content, or a base64-encoded binary. */
export type ScaffoldFile =
  | { path: string; text: string }
  | { path: string; base64: string };

/** Initials of a title, upper-cased, digits kept — "Sea Level Memory" → "SLM". */
export function acronymFromTitle(title: string): string {
  const initials = (title || "")
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => w.replace(/[^A-Za-z0-9]/g, "")[0])
    .filter(Boolean)
    .join("")
    .toUpperCase()
    .slice(0, 6);
  return initials || "PAPER";
}

/** JSON.stringify with the 2-space, trailing-newline shape the fixtures use. */
function json(value: unknown): string {
  return JSON.stringify(value, null, 2) + "\n";
}

function mainMetadata(title: string, acronym: string, author: string): string {
  return json({
    title,
    publication_date: "",
    upload_type: "publication",
    publication_type: "article",
    description:
      "One-paragraph summary of the paper. Fill this in — it is emitted into the compiled manuscript's frontmatter and (for Zenodo) the deposit description.",
    creators: [
      {
        name: author,
        affiliation: "Your Institution",
        orcid: "0000-0000-0000-0000",
        email: "you@example.com",
      },
    ],
    keywords: ["keyword-one", "keyword-two"],
    journal_title: "Target Journal",
    version: "v1.0",
    _longform: {
      acronym,
      csl: "nature",
      template: "paperbell",
      lineno: true,
      figures_at_end: false,
      corresponding: [author],
      extra_yaml:
        "corresponding_email: you@example.com\nnumbersections: true\n",
    },
  });
}

function supplementaryMetadata(
  title: string,
  acronym: string,
  author: string
): string {
  return json({
    title: `${title} — Supplementary Information`,
    publication_date: "",
    upload_type: "publication",
    publication_type: "article",
    description:
      "Supplementary information for the paper. Shares the main manuscript's metadata but adds supplementary: true so figures and tables receive an S prefix.",
    creators: [
      {
        name: author,
        affiliation: "Your Institution",
        orcid: "0000-0000-0000-0000",
        email: "you@example.com",
      },
    ],
    keywords: ["keyword-one", "keyword-two"],
    journal_title: "Target Journal",
    version: "v1.0",
    _longform: {
      acronym,
      csl: "nature",
      template: "paperbell",
      corresponding: [author],
      extra_yaml: "supplementary: true\nnumbersections: true\n",
    },
  });
}

const RESULTS_JSON = json({
  summary: { n: 0, mean: 0, unit: "samples" },
  samples: [{ id: "S-01" }, { id: "S-02" }],
  computed_date: "",
});

const REFERENCES_BIB = `@article{doe2020,
  author  = {Doe, Jane},
  title   = {A Prior Study},
  journal = {Journal Name},
  year    = {2020},
  volume  = {1},
  pages   = {1--10}
}

@article{roe2021,
  author  = {Roe, Rick},
  title   = {A Related Study},
  journal = {Journal Name},
  year    = {2021},
  volume  = {2},
  pages   = {11--20}
}
`;

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

Response-letter draft of **${title}**. Compile the **Main Manuscript** first (it harvests \`manuscript-lines.json\` / \`figure-numbers.json\`), then compile this with **PaperBell Response Letter**: the \`\`\`manuscript\`\`\` fences pull the manuscript's current text for \`@intro-gap\` into a Page/Line box, and \`@fig:demo\` / \`\\ref{fig:demo}\` resolve to the manuscript's figure number.
`;
}

// The cover letter is a single-file draft (not multi-scene): the cover_letter
// template reads to/date/manuscript/corresponding straight from the note's own
// frontmatter, so its workflow exports the note as-is without strip/concatenate.
function coverLetter(title: string, acronym: string, author: string): string {
  return `---
longform:
  format: single
  title: ${title}
  draftTitle: Cover Letter
  workflow: PaperBell Cover Letter
title: Cover letter
manuscript: ${title}
acronym: ${acronym}
date:
to: Dear Editor,
corresponding: ${author} (you@example.com)
---

We are pleased to submit our manuscript, *{{manuscript}}*, for consideration for publication in *{{JournalName}}*.

State in one or two sentences what the paper shows and why it matters to this journal's readers.

State the key advance over prior work, and why this venue is the right fit.

We confirm that this manuscript is original, has not been published elsewhere, and is not under consideration by another journal. All authors have approved the submission and declare no competing interests.

Thank you for your consideration; we look forward to your response.
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

const RESULTS_MD = `# Results

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

const SUPPLEMENTARY_RESULTS_MD = `# Supplementary Results

Because this draft's workflow includes the **Supplementary Information** step, the figure and table below are numbered with an S prefix automatically: Figure \\ref{fig:supp_demo} becomes "Figure S1" and Table \\ref{tbl:supp_demo} becomes "Table S1".

![A supplementary figure caption. {#fig:supp_demo width=60%}](../figs/example_figure.png)

\`\`\`xlsx-table
file: ../figs/example_data.xlsx
sheet: Data
caption: A supplementary table caption.
label: tbl:supp_demo
skip_n: 0
\`\`\`
`;

const RESPONSE_MD = `# Response to Reviewer 1

> [!RC] Reviewer 1, Comment 1
> Paraphrase the reviewer's comment here.

Write your reply. To quote the manuscript's *current* text (kept in sync automatically), fence a manuscript reference — it renders as a gray box with the live Page/Line:

\`\`\`manuscript
@intro-gap
\`\`\`

To show a manuscript figure with its manuscript number:

\`\`\`manuscript
@fig:demo
\`\`\`

You can also refer to it inline as Figure \\ref{fig:demo}.
`;

function readme(title: string, acronym: string): string {
  return `# ${title}

A PaperBell paper project scaffolded by PaperOut To-Authors. Four drafts of one
project (same \`title\`, distinct \`draftTitle\`): a multi-scene **Main Manuscript**,
a **Supplementary Information** draft, a **Response Letter**, and a **Cover Letter**.

## Layout

\`\`\`
${title}/
├── metadata.json               # shared publication metadata (Zenodo schema + _longform)
├── results.json                # externally-computed values for {{ }} compile-time placeholders
├── references.bib              # local bib for [@citekey] (consumed by pandoc)
├── figs/
│   ├── example_figure.png      # placeholder figure — replace with your own
│   └── example_data.xlsx       # Data sheet for the \`\`\`xlsx-table\`\`\` blocks
├── Main Manuscript (Index).md  # draft 1 (sceneFolder: manuscript)
├── manuscript/
│   ├── introduction.md
│   ├── methods.md
│   └── results.md
├── Response Letter (Index).md  # draft 2 (sceneFolder: response)
├── response/
│   └── response.md
├── Cover Letter.md             # draft 3 (single-file; own to/date/manuscript frontmatter)
└── supplementary/
    ├── Supplementary (Index).md   # draft 4 (same title → same project)
    ├── metadata.json              # nearest-wins override adding supplementary: true → S-numbering
    └── supplementary results.md
\`\`\`

## Getting started

1. Fill in \`metadata.json\` (title, authors, \`email\` for the corresponding author,
   \`publication_date\`) and \`results.json\`. The acronym is set to \`${acronym}\`.
2. Replace \`figs/example_figure.png\` and \`figs/example_data.xlsx\` with your own.
3. Write your scenes under \`manuscript/\`. Keep each scene's own \`#\` heading.
4. Compile with the **Compile** tab or the **Compile All Drafts** board. Compile the
   Main Manuscript first so the Response Letter can resolve \`@intro-gap\` / \`@fig:demo\`.

The Pandoc toolchain (defaults/filters/templates/CSL) is downloaded on demand — run
the **Set up Pandoc export** command for a prerequisites checklist.
`;
}

/**
 * Build every file of a new PaperBell paper project. Paths are relative to the
 * project folder (named after `title`); the writer prefixes the parent path.
 */
export function buildPaperbellScaffold(opts: ScaffoldOptions): ScaffoldFile[] {
  const title = opts.title.trim();
  const acronym = (opts.acronym || acronymFromTitle(title)).trim();
  const author = (opts.author || "Lastname, Firstname").trim();

  return [
    { path: "metadata.json", text: mainMetadata(title, acronym, author) },
    { path: "results.json", text: RESULTS_JSON },
    { path: "references.bib", text: REFERENCES_BIB },
    { path: "README.md", text: readme(title, acronym) },
    { path: "figs/example_figure.png", base64: EXAMPLE_FIGURE_PNG_BASE64 },
    { path: "figs/example_data.xlsx", base64: EXAMPLE_DATA_XLSX_BASE64 },

    { path: "Main Manuscript (Index).md", text: mainIndex(title) },
    { path: "manuscript/introduction.md", text: INTRODUCTION_MD },
    { path: "manuscript/methods.md", text: METHODS_MD },
    { path: "manuscript/results.md", text: RESULTS_MD },

    { path: "Response Letter (Index).md", text: responseIndex(title) },
    { path: "response/response.md", text: RESPONSE_MD },

    { path: "Cover Letter.md", text: coverLetter(title, acronym, author) },

    {
      path: "supplementary/Supplementary (Index).md",
      text: supplementaryIndex(title),
    },
    {
      path: "supplementary/metadata.json",
      text: supplementaryMetadata(title, acronym, author),
    },
    {
      path: "supplementary/supplementary results.md",
      text: SUPPLEMENTARY_RESULTS_MD,
    },
  ];
}

/** The project's primary draft path (relative), for selecting it after creation. */
export const SCAFFOLD_PRIMARY_DRAFT = "Main Manuscript (Index).md";
