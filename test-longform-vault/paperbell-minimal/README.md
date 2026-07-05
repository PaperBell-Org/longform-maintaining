# PaperBell Minimal — academic example fixture

A minimal Longform project that exercises **every PaperBell writing convention** in one
small package, so plugin features can be developed and regression-tested against a stable
fixture. It mirrors the conventions in `PaperBell 写作与导出规范.md`.

## Layout

```
paperbell-minimal/
├── metadata.json               # shared publication metadata (Zenodo schema + _longform)
├── results.json                # externally-computed values for {{ }} compile-time placeholders
├── references.bib              # local bib for [@citekey] (consumed by pandoc, not the plugin)
├── figs/
│   ├── example_figure.png      # placeholder figure for ![…](figs/…)
│   └── example_data.xlsx       # Data sheet for the ```xlsx-table``` blocks
├── Main Manuscript (Index).md  # draft 1 (sceneFolder: manuscript)
├── manuscript/
│   ├── introduction.md         # §4 emphasis/==highlight==/footnote, §8 [@key], {{ }} from metadata.json
│   ├── methods.md              # §5 inline/display math, {{ }} from results.json
│   └── results.md              # §6 figure + Figure \ref{}, §7 xlsx-table + Table \ref{}
└── supplementary/
    ├── Supplementary (Index).md   # draft 2 (same title → same project)
    ├── metadata.json              # nearest-wins override adding supplementary: true → S-numbering
    └── supplementary results.md   # §10 supplementary figure/table (Figure S1 / Table S1)
```

## Conventions covered (spec § → file)

| § | Convention | File |
|---|---|---|
| §4 | headings, `*italic*`/`**bold**`, `==highlight==`, footnote | `manuscript/introduction.md` |
| §5 | inline `$…$` / display `$$…$$`, `\mathbb{}` symbols | `manuscript/methods.md` |
| §6 | figure `![…{#fig:demo width=70%}](figs/…)` + `Figure \ref{fig:demo}` | `manuscript/results.md` |
| §7 | `xlsx-table` block + `Table \ref{tbl:demo}` | `manuscript/results.md` |
| §8 | citations `[@key]`, `[@a; @b]` | `manuscript/introduction.md` |
| §10 | `supplementary: true` → Figure S1 / Table S1 | `supplementary/` |
| fork | `{{Variable}}` placeholders | `manuscript/introduction.md`, `manuscript/methods.md` |

## `{{Variable}}` placeholders — two sources, one step

A single *Replace JSON Placeholders* step reads **both** data files (its `JSON file(s)` option is
`metadata.json, results.json`) and merges them into one namespace, so placeholders from either
file resolve at compile time:

- **`metadata.json` paths** (`{{title}}`, `{{version}}`, `{{_longform.acronym}}`): also rendered
  **live in reading mode** by the variable post-processor.
- **`results.json` paths** (`{{summary.n}}`, `{{samples[0].id}}`): the live preview leaves these
  as raw text (the post-processor only reads `metadata.json`); they are substituted at compile time.

## Compiling

Both drafts use the vault-wide **PaperBell Manuscript** workflow
(`.obsidian/plugins/longform-paperbell/data.json`):

`strip-frontmatter → concatenate-text (\n\n) → replace-json-placeholders (metadata.json, results.json) →
add-zenodo-frontmatter (metadata.json) → write-to-note ($1_$2.md) → Run Pandoc Export`

The **Run Pandoc Export** step has a *Template / preset* dropdown: leave it blank to use the
project's `_longform.template` (`paperbell`), or pick a different downloaded preset (e.g. an SI
layout) per workflow.

`write-to-note` produces a Pandoc-ready Markdown manuscript (`PaperBell Minimal_Main Manuscript.md` /
`PaperBell Minimal_Supplementary.md`) with academic frontmatter, resolved placeholders, and the
figure/table/citation/math syntax left intact.

> The workflow intentionally omits `prepend-title`: each scene already carries its own `#`
> heading (spec §4), so prepending would duplicate headings.

## Pandoc export (Run Pandoc Export step)

The final step is the built-in **Run Pandoc Export** step. It shells out to Pandoc to produce
`<acronym>_<date>.pdf` (e.g. `PBMIN_2026-07-01.pdf`), reading `acronym`/`date`/`csl`/`template` from
the manuscript frontmatter that *Add Zenodo Frontmatter* already injected.

**Downloaded assets.** The Pandoc toolchain (defaults/filters/templates/CSL) is **not bundled**; it's
downloaded on demand from a separate assets repository into `PaperBell/pandoc/` in your vault. See
[docs/PANDOC_EXPORT.md](../../../docs/PANDOC_EXPORT.md).

**Set up / prerequisites.** Run the **Set up Pandoc export** command for a checklist of the system
tools (`pandoc`, `xelatex`, `pandoc-crossref`) with platform-specific install hints, plus an **Assets
URL** field and a **Download assets** button. The plugin adds Homebrew/MacTeX dirs to `PATH`
automatically (so no `spawn pandoc ENOENT`).

**Citations.** The Supplementary/main drafts cite `[@doe2020]` etc.; the step auto-detects this
project's `references.bib`. Without a bib, cited manuscripts can't be typeset — the step's copyable
error dialog says so.

Paths (assets/output/bibliography/binary) live in **Longform settings → Compile → Pandoc export**.
The step itself has just **Dry run** (log the command instead of running) and **Open PDF after
export**. The Supplementary draft's frontmatter carries `supplementary: true`, so its figures/tables
get S-numbering.
