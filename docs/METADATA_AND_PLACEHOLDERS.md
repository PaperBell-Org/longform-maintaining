# Metadata & placeholders

A PaperBell paper draws its publication metadata from one authoritative file, `metadata.json`,
and lets you weave values from it (and from a companion `results.json`) into your prose with
`{{ }}` placeholders. This keeps titles, author lists, and computed numbers in exactly one
place instead of scattered across your scenes.

## `metadata.json` — the single source of truth

`metadata.json` uses a **Zenodo-style schema** plus a `_longform` block for export options.
It is resolved **nearest-wins**: the compile steps and the live preview walk up from the
draft's own folder to the project root, so a `supplementary/metadata.json` overrides the
project root for the SI draft (`src/model/metadata-resolver.ts`,
`resolveProjectMetadataFile`).

A representative file (from the scaffold, `src/model/scaffold/paperbell-scaffold.ts`):

```json
{
  "title": "My Paper",
  "publication_date": "",
  "upload_type": "publication",
  "publication_type": "article",
  "description": "One-paragraph summary…",
  "creators": [
    { "name": "Lastname, Firstname", "affiliation": "Your Institution",
      "orcid": "0000-0000-0000-0000", "email": "you@example.com" }
  ],
  "keywords": ["keyword-one", "keyword-two"],
  "journal_title": "Target Journal",
  "version": "v1.0",
  "_longform": {
    "acronym": "MP",
    "csl": "nature",
    "template": "paperbell",
    "lineno": true,
    "figures_at_end": false,
    "corresponding": ["Lastname, Firstname"],
    "extra_yaml": "corresponding_email: you@example.com\nnumbersections: true\n"
  }
}
```

Key fields:

- **`creators`** — the manuscript's author list. The compile pipeline emits these into an
  `authors:` YAML block; you never hand-write the author block in your scenes. (Note: this is
  your paper's byline, distinct from any "scholars you track" metadata elsewhere in the vault.)
- **`corresponding`** (under `_longform`) — which author(s) are corresponding.
- **`_longform.csl`** / **`_longform.template`** — the CSL citation style and Pandoc template
  the recipe uses.
- **`_longform.acronym`** — used for the PDF filename (e.g. `{acronym}_{date}`) and labels.
- **`_longform.extra_yaml`** — arbitrary extra Pandoc YAML (e.g. `numbersections`); for the
  Supplementary draft this is where `supplementary: true` lives, which switches figures/tables
  to S-numbering.

### How it reaches the PDF: Add Zenodo Frontmatter

The **Add Zenodo Frontmatter** step (`add-zenodo-frontmatter`) reads this JSON and **prepends
a Pandoc-compatible YAML frontmatter** to the compiled manuscript (turning `creators` into an
`authors:` block, wiring in `csl`/`template`/`extra_yaml`, etc.). It is part of the
`PaperBell Manuscript` / `Supplementary` / `Response Letter` workflows.

## `results.json` — externally-computed values

`results.json` holds numbers produced *outside* Obsidian (an analysis script, a notebook) so
your manuscript can cite them without copy-paste drift:

```json
{ "summary": { "n": 0, "mean": 0, "unit": "samples" },
  "samples": [{ "id": "S-01" }, { "id": "S-02" }],
  "computed_date": "" }
```

Regenerate this file from your analysis and recompile — the manuscript picks up the new
numbers. (This file is also a natural hand-off point: a data/analysis plugin could write it;
see [PAPERBELL_SUITE.md](./PAPERBELL_SUITE.md).)

## `{{ }}` placeholders

Reference any value from the merged metadata namespace with a `{{ path }}` placeholder, using
dot/bracket paths (`src/compile/steps/replace-json-placeholders-utils.ts`, `getByPath`):

```markdown
This is *{{title}}* (acronym {{_longform.acronym}}, version {{version}}).
We analysed {{ summary.n }} {{ summary.unit }}, first identified as {{ samples[0].id }}.
```

- **Dot paths** descend into objects (`summary.mean`); **bracket indices** into arrays
  (`samples[0].id`); the two combine freely.
- Whitespace inside the braces is ignored (`{{ summary.n }}` == `{{summary.n}}`).

### The Replace JSON Placeholders step

At compile time the **Replace JSON Placeholders** step (`replace-json-placeholders`)
substitutes them. Its `json-file` option is `metadata.json, results.json` by default:
several files separated by commas are **merged into one namespace, later files winning** on
key conflicts. Each filename is searched nearest-wins from the draft folder up to the project
root; the trailing `.json` is optional. With `error-on-missing: false` (the workflow default)
an unresolved placeholder is left as-is rather than failing the compile.

### Live preview in reading mode

You don't have to compile to see the values. `registerVariablePostProcessor`
(`src/view/variable-postprocessor.ts`) renders `{{ }}` placeholders **in reading mode** as
their resolved value from the project's `metadata.json`, and lets you **double-click a value
to edit it** (writing back to `metadata.json`). Placeholders that resolve only from
`results.json` stay as raw `{{ }}` in the live preview and are substituted only at compile
time — which is why the scaffold's Methods scene notes that its `{{ summary.n }}` values
"stay as raw placeholders in the live preview".

## See also

- [PAPER_PROJECT.md](./PAPER_PROJECT.md) — the project layout these files live in.
- [PANDOC_EXPORT.md](./PANDOC_EXPORT.md) — how the compiled manuscript becomes a PDF.
- [MANUSCRIPT_REFS.md](./MANUSCRIPT_REFS.md) — the separate `<!--ms:-->` / ```` ```manuscript ```` reference system.
