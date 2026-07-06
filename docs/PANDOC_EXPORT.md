# Pandoc export (PDF)

Longform (PaperBell) can export a compiled manuscript straight to a typeset PDF
using [Pandoc](https://pandoc.org). The **Pandoc toolchain** — Lua filters, LaTeX
templates, CSL styles, and defaults files — is **not bundled** with the plugin.
It lives in a separate assets repository and is **downloaded on demand** into your
vault, so it can evolve independently and you can customize or contribute templates.

## Quick start

1. Run **Set up Pandoc export** from the command palette.
2. Install any missing system tools it lists (see below).
3. Paste the **Assets URL** (a `.zip` of the toolchain, e.g. a release asset of
   the assets repo) and click **Download assets**. Files land in
   `PaperBell/pandoc/` in your vault.
4. Add the **Run Pandoc Export** step to a compile workflow, after **Add Zenodo
   Frontmatter** and **Save as Note**, and compile. The PDF is written next to
   your manuscript as `<acronym>_<date>.pdf`.

## Prerequisites (system tools)

These are separate programs Pandoc drives; they can't be downloaded by the plugin.

| Tool | Why | Install (macOS) |
| --- | --- | --- |
| `pandoc` | the converter | `brew install pandoc` |
| `xelatex` | PDF engine (CJK/Unicode) | [MacTeX](https://www.tug.org/mactex/) or `brew install --cask mactex-no-gui` |
| `pandoc-crossref` | figure/table cross-references | `brew install pandoc-crossref` |

Windows/Linux: see <https://pandoc.org/installing.html>, plus MiKTeX/TeX Live for
`xelatex`. The **Set up Pandoc export** command shows platform-specific hints and
verifies each tool with a ✓/✗ checklist.

> The plugin adds the usual Homebrew/MacTeX locations to `PATH` automatically, so
> these tools are found even though Obsidian's GUI process doesn't inherit your
> shell `PATH`.

## The assets repository

The toolchain is maintained separately and published as a `.zip`. The zip should
contain the toolchain at its top level:

```
defaults/   <template>.yaml files (e.g. undefined.yaml, paperbell.yaml)
csl/        <csl>.csl citation styles
filters/    Lua filters
templates/  LaTeX templates
```

Point **Assets URL** at that zip. A single wrapping top-level folder (as GitHub
adds to source *zipballs*) is stripped automatically, but a clean **release
asset** zip is preferred.

For the toolchain to be portable (usable from any vault), its `defaults/*.yaml`
should:

- Not hardcode a personal `bibliography:` — the export step injects
  `--bibliography` from the project (see below).
- Reference filters/templates via `${USERDATA}` / `${.}` (relative to the
  defaults file), and set `data-dir: ${.}/..`, so it self-locates wherever
  downloaded.

## Customizing & contributing

The downloaded copy in `PaperBell/pandoc/` is yours to edit — add a template,
tweak a filter — and your edits survive plugin updates (the plugin never
overwrites it unless you click **Download assets** again). To share a template,
open a PR against the assets repository.

## Settings (Longform → Compile → Pandoc export)

| Setting | Default | Meaning |
| --- | --- | --- |
| Pandoc assets URL | *(empty)* | The toolchain `.zip` to download. |
| Pandoc assets folder | `PaperBell/pandoc` | Where the toolchain lives. Absolute or vault-relative. |
| Pandoc output folder | *(next to manuscript)* | Where to write the PDF. Vault-relative, or an absolute path (`~/Papers`, `/Users/me/Papers`) to export **outside the vault**. `~` expands to your home folder; the folder is created if missing. |
| Bibliography | *(auto-detect)* | `.bib` for citations. Auto-detects `references.bib`/`mybib.bib` in the project. |
| Pandoc binary | `pandoc` | Path to pandoc, if not on `PATH`. |

## Citations & bibliography

If your manuscript uses `[@citekey]` citations, it needs a `.bib`. The step uses
the **Bibliography** setting if set, otherwise the nearest `references.bib` or
`mybib.bib` found from the draft folder up to the project root. Without a bib,
citations can't be typeset and the PDF build fails — the step's checklist tells
you when this is the problem. (Cross-references use LaTeX `\ref{}` for both
figures and tables, so they never look like citations; any leftover `@fig:`/
`@tbl:`-style tokens are also excluded from citation detection.)

## Which template / CSL is used

By default both come from the manuscript's frontmatter, which **Add Zenodo
Frontmatter** generates from `metadata.json` (`_longform.template`,
`_longform.csl`):

- `template` → `<assets>/defaults/<template>.yaml` (empty ⇒ `undefined.yaml`)
- `csl` → `<assets>/csl/<csl>.csl`

**Overriding the template per workflow.** The **Run Pandoc Export** step has a
*Template / preset* dropdown listing every downloaded `defaults/*.yaml`. Leave it
blank to use the project's `_longform.template`, or pick another preset — e.g.
one workflow named "Manuscript" (`paperbell`) and another "SI" (a supplementary
layout). The dropdown populates after you download assets via **Set up Pandoc
export**.

## Exporting outside your vault

By default the PDF lands next to the compiled manuscript, inside the vault. To
keep PDFs out of the vault entirely, set **Pandoc output folder** to an absolute
path — e.g. `~/Papers` or `/Users/me/Documents/Papers`. Every project then exports
into that one folder as `<acronym>_<date>.pdf` (the `<acronym>` keeps files from
different projects distinct). The folder is created automatically if it doesn't
exist yet, so you can point it anywhere writable.

## Notes

- **Desktop only.** Export shells out to Pandoc via Node; on mobile the step
  reports a clear error. Writing/compiling still work on mobile.
- **Fonts.** Templates that assume macOS fonts (Songti/Heiti/Times) may need
  adjustment on Windows/Linux — edit the downloaded `defaults/*.yaml`.
