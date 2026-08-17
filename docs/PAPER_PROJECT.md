# The PaperBell paper project

PaperOut To-Authors can scaffold an academic paper project in one step: **several drafts
of one paper** sharing a single source of publication metadata, each wired to its own
compile workflow.

Create one via the folder right-click menu **New PaperBell paper project…**, or the command
of the same name (`newPaperProject`). Enter a title; the acronym is auto-derived from the
initials (editable).

## Linking the paper to a project

The modal also asks which **PaperBell project** the paper is a deliverable of. The answer
is written as a top-level `project:` key in every draft index note's frontmatter — the hook
sibling plugins use to count a project's outputs. Leave it empty and the key is omitted.

This is the *project's* acronym (`ColMemo`), not the paper's own acronym above (`SLM`) —
they are separate values with separate jobs. When the PaperBell host is installed and new
enough, the field is a dropdown of your real projects; otherwise it is a text box you fill
in yourself. See [PAPERBELL_INTEGRATION.md](./PAPERBELL_INTEGRATION.md#link-a-new-paper-to-its-project).

## Choosing the parts

The modal asks which parts the paper needs. **Only the Main Manuscript is created by
default** — a short paper often needs no supplement, and nothing needs a response letter
before review.

The Main Manuscript is mandatory, and not just because it is the paper. The project root is
the lowest common ancestor of its drafts' index folders, and that root bounds the
nearest-wins search for `metadata.json`. A project whose only draft were the Supplementary
would have its root *inside* `supplementary/`, putting the shared `metadata.json`,
`references.bib`, and `figs/` out of reach.

**Include example content** controls the example figure, the spreadsheet behind the
`xlsx-table` demo, and the project README. With it off, the starter scenes omit the figure
and table blocks entirely rather than pointing at files that were never written.

### Adding a part later

Run **Add paper components…** from the command palette, or right-click the project folder.
It lists only the parts the project lacks and creates them alongside the existing ones.

- Cross-references adapt to what is there: a response letter added to a project that has a
  Main Manuscript gets the working ```manuscript``` fences; added to one without, it gets a
  skeleton and a note on how to wire them up later.
- Example assets are never re-created. Whether the new part's body text may reference them
  is read from what is already on disk, so `figs/` and `README.md` are left untouched. (The
  README therefore keeps describing the project as first created.)
- Nothing is overwritten: if any file it would create already exists, it reports the clash
  and writes **nothing at all**.
- A project that mixes a single `format: project` index with standalone draft notes is
  refused — run **Convert project to single index…** first.

The per-part builders live in `src/model/scaffold/parts.ts` (pure and unit-tested) and are
shared by both entry points, so "what a Response Letter is" is defined exactly once.

## The parts

Drafts share the same Longform `title` (so the plugin groups them as one project) but have
distinct `draftTitle`s and distinct compile `workflow`s:

| Draft | `format` | Scene folder | Workflow |
| --- | --- | --- | --- |
| **Main Manuscript** | `scenes` | `manuscript/` (introduction · methods · results) | `PaperBell Manuscript` |
| **Supplementary** | `scenes` | `supplementary/` | `PaperBell Supplementary` |
| **Response Letter** | `scenes` | `response/` | `PaperBell Response Letter` |
| **Cover Letter** | `single` | — (single note) | `PaperBell Cover Letter` |

The Cover Letter is a **single-file** draft: the `cover_letter` template reads
`to` / `date` / `manuscript` / `corresponding` straight from the note's own frontmatter, so
its workflow exports the note as-is (no strip/concatenate).

## Project layout

With every part selected and example content on:

```
My Paper/
├── metadata.json               # shared publication metadata (Zenodo schema + _longform)
├── results.json                # externally-computed values for {{ }} compile-time placeholders
├── references.bib              # local bib for [@citekey] (consumed by pandoc)
├── figs/
│   ├── example_figure.png      # placeholder figure — replace with your own
│   └── example_data.xlsx       # Data sheet for the ```xlsx-table``` blocks
├── Main Manuscript (Index).md
├── manuscript/{introduction,methods,results}.md
├── Response Letter (Index).md
├── response/response.md
├── Cover Letter.md
└── supplementary/
    ├── Supplementary (Index).md
    ├── metadata.json           # nearest-wins override adding supplementary: true → S-numbering
    └── supplementary results.md
```

- **`metadata.json`** is the single authority for publication metadata (title, authors,
  target journal, corresponding author, export template/CSL). See
  [METADATA_AND_PLACEHOLDERS.md](./METADATA_AND_PLACEHOLDERS.md).
- **`supplementary/metadata.json`** is resolved *nearest-wins* (the draft's own folder
  beats the project root), and adds `supplementary: true` so its figures/tables get an
  **S** prefix (Figure S1, Table S1…).
- **`results.json`** holds externally-computed numbers referenced with `{{ }}` placeholders.
- **`references.bib`** is the project-local bibliography for `[@citekey]` citations.
- **`figs/`** ships a placeholder PNG and an XLSX so the project **compiles out of the box**.

The generated `README.md` in the project folder restates this layout and a getting-started
checklist.

## Writing conventions demonstrated by the scaffold

The starter scenes deliberately exercise every supported convention so you can learn by
editing:

- **Emphasis**: `*italic*`, `**bold**`, `==highlight==`, Markdown footnotes `[^note]`.
- **Citations**: `[@doe2020]` or `[@doe2020; @roe2021]`, resolved against `references.bib`.
- **Placeholders**: `{{title}}`, `{{_longform.acronym}}` from `metadata.json` (render live in
  reading mode); `{{ summary.n }}`, `{{ samples[0].id }}` from `results.json` (substituted at
  compile time only). See [METADATA_AND_PLACEHOLDERS.md](./METADATA_AND_PLACEHOLDERS.md).
- **Math**: inline `$E = mc^2$` and display `$$…$$`; `\mathbb{R}` etc. from `amssymb`.
- **Figures**: `![caption {#fig:demo width=70%}](figs/example_figure.png)`, referenced with
  `\ref{fig:demo}`.
- **Tables from spreadsheets**: an ```` ```xlsx-table ```` block naming an `.xlsx` file,
  sheet, caption, and label — rendered by the pipeline's `xlsx_table.lua` at compile time.
- **Manuscript spans**: `<!--ms:intro-gap-->…<!--/ms:intro-gap-->` so the response letter can
  quote the manuscript's live text and line number. See
  [MANUSCRIPT_REFS.md](./MANUSCRIPT_REFS.md).

## Compiling the project

Each draft compiles with its own workflow (see the built-in workflow definitions in
`src/compile/index.ts`). **Order matters:** the `PaperBell Manuscript` and
`PaperBell Supplementary` workflows end with a **harvest** step that records line and figure
numbers into project-root sidecars; the `PaperBell Response Letter` workflow reads those
sidecars to resolve `@intro-gap` / `@fig:demo`. So:

> **Compile the Main Manuscript (and Supplementary, if referenced) first, then the Response
> Letter.**

The **Compile All Drafts** board runs every draft serially in a fixed, reorderable order and
does not stop on a failing row. Per-draft you can switch the workflow, edit a step's options,
and toggle batch options (dry-run / open-PDF / harvest). See [COMPILE.md](./COMPILE.md).

### Pandoc toolchain

PDF export needs the Pandoc toolchain (defaults / filters / templates / CSL), which is **not
bundled** — it is downloaded on demand into `PaperBell/pandoc/` from the assets market. Run
**Set up Pandoc export** for the system-tool checklist and **Browse Pandoc asset market** to
install recipes. Each part uses its own recipe, so install the bundles matching the parts
you created (or the full toolchain). See [PANDOC_EXPORT.md](./PANDOC_EXPORT.md) and
[ASSET_MARKETPLACE_SPEC.md](./ASSET_MARKETPLACE_SPEC.md).

## Where this sits in the PaperBell suite

A paper project is PaperOut's contribution to the **Output** stage of the CIMPO workflow.
For how it hands data to and from sibling plugins (concept cards, scholar/publication data,
citations, project cards) — both today and on the roadmap — see
[PAPERBELL_SUITE.md](./PAPERBELL_SUITE.md).
