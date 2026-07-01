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
│   └── results.md              # §6 figure + @fig:, §7 xlsx-table + Table \ref{}
└── supplementary/
    ├── Supplementary (Index).md   # draft 2 (same title → same project)
    ├── metadata.json              # nearest-wins override adding supplementary: true → S-numbering
    └── supplementary results.md   # §10 supplementary figure/table (Figure S1 / Table S1)
```

## Conventions covered (spec § → file)

| § | Convention | File |
|---|---|---|
| §4 | headings, `*italic*`/`**bold**`, `==highlight==`, footnote | `manuscript/introduction.md` |
| §5 | inline `$…$` / display `$$…$$`, `\mathbb{1}` fix | `manuscript/methods.md` |
| §6 | figure `![…{#fig:demo width=70%}](figs/…)` + `@fig:demo` | `manuscript/results.md` |
| §7 | `xlsx-table` block + `Table \ref{tbl:demo}` | `manuscript/results.md` |
| §8 | citations `[@key]`, `[@a; @b]` | `manuscript/introduction.md` |
| §10 | `supplementary: true` → Figure S1 / Table S1 | `supplementary/` |
| fork | `{{Variable}}` placeholders | `manuscript/introduction.md`, `manuscript/methods.md` |

## `{{Variable}}` placeholders — two sources

- **`metadata.json` paths** (`{{title}}`, `{{version}}`, `{{_longform.acronym}}`): rendered
  **live in reading mode** by the variable post-processor **and** substituted at compile time
  by the first *Replace JSON Placeholders* step (pointed at `metadata.json`).
- **`results.json` paths** (`{{summary.n}}`, `{{samples[0].id}}`): the live preview leaves these
  as raw text (the post-processor only reads `metadata.json`); they are substituted only at
  compile time by the second *Replace JSON Placeholders* step (pointed at `results.json`).

## Compiling

Both drafts use the vault-wide **PaperBell Manuscript** workflow
(`.obsidian/plugins/longform-paperbell/data.json`):

`strip-frontmatter → concatenate-text (\n\n) → replace-json-placeholders (metadata.json) →
replace-json-placeholders (results.json) → add-zenodo-frontmatter (metadata.json) →
write-to-note ($1_$2.md)`

The output is a Pandoc-ready Markdown manuscript (`PaperBell Minimal_Main Manuscript.md` /
`PaperBell Minimal_Supplementary.md`) with academic frontmatter, resolved placeholders, and the
figure/table/citation/math syntax left intact for the external Pandoc pipeline.

> The workflow intentionally omits `prepend-title`: each scene already carries its own `#`
> heading (spec §4), so prepending would duplicate headings.
