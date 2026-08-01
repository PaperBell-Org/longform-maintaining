# Pandoc export

Longform (PaperBell) can export a compiled manuscript straight to a typeset
document using [Pandoc](https://pandoc.org) — usually a PDF, or a Word file when
the chosen preset says so. The **Pandoc toolchain** — Lua filters, LaTeX
templates, CSL styles, and defaults files — is **not bundled** with the plugin.
It lives in a separate assets repository and is **downloaded on demand** into your
vault, so it can evolve independently and you can customize or contribute templates.

## Exporting a single note

The fastest path, once the toolchain is installed: open any markdown note and run
**Run workflow: Quick Export** from the command palette (bind a hotkey to it and
this becomes one keystroke). The note does not have to be part of a project.

`Quick Export` is a built-in workflow with exactly one step — *Run Pandoc Export*.
By default it exports to the folder the note lives in, named after the note,
**overwriting** the previous export; a **Pandoc output folder** setting redirects
it like any other export. To choose a preset, add `template: <preset>` to the
note's own frontmatter (and `csl:` for the citation style); without one you get
the general-purpose default.

If something is missing, the error dialog lists what's needed, which presets are
installed, and offers buttons to jump straight to **Set up Pandoc export** or the
asset marketplace.

## Quick start

1. Run **Set up Pandoc export** from the command palette.
2. Install any missing system tools it lists (see below).
3. Paste the **Assets URL** (a `.zip` of the toolchain, e.g. a release asset of
   the assets repo) and click **Download assets**. Files land in
   `PaperBell/pandoc/` in your vault.
4. Add the **Run Pandoc Export** step to a compile workflow, after **Add Zenodo
   Frontmatter** and **Save as Note**, and compile. The PDF is written next to
   your manuscript, named after the compiled note (customize with the step's
   **File name** option — see [Naming the exported file](#naming-the-exported-file)).

You don't have to compile from the pane: every workflow also has a **“Run
workflow: `<name>`”** command that exports the note you currently have open —
including a plain markdown file that is not part of a project. See
[Commands](./COMMANDS.md#run-workflow-name).

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

## Output format: PDF or Word

**The preset decides the format, and the file extension follows it.** A preset
with `to: docx` produces a `.docx` you can open in Word; presets that build
through LaTeX (`to: latex`, `to: beamer`, or no `to:` at all) produce a `.pdf`.
Nothing needs to be configured for this — set `template:` to a docx preset and
you get Word.

This matters because pandoc refuses to write mismatched output: asking a `to: docx`
preset for a `.pdf` file exits with `cannot produce pdf output from docx`.

The prerequisite check follows the preset too: a docx preset needs neither a TeX
engine nor `pandoc-crossref`, and neither is demanded of it.

## Naming the exported file

The **Run Pandoc Export** step's **File name** option controls the name.
Leave it blank to use the **compiled manuscript's name** (the note produced by
*Save as Note*). To customize, type a pattern with any of these variables:

| Variable | From | Example |
| --- | --- | --- |
| `{title}` | frontmatter `title` | `A Minimal PaperBell Manuscript` |
| `{acronym}` | `_longform.acronym` | `PBMIN` |
| `{date}` | frontmatter `date` | `2026-07-01` |
| `{csl}` | `_longform.csl` | `nature` |
| `{template}` | resolved template | `paperbell` |
| `{draft}` | the draft's name | `Main Manuscript` |

For example `{acronym}_{date}` produces `PBMIN_2026-07-01.pdf`. The extension is
added automatically and follows the preset (`.pdf`, `.docx`, …), unknown
`{tokens}` are left as-is (so a typo is visible), and characters illegal in file
names are replaced with `-`.

## Supplementary Information

To export a **Supplementary Information (SI)** document, add the **Supplementary
Information** step to that draft's workflow, after **Add Zenodo Frontmatter** and
before **Save as Note** / **Run Pandoc Export**. Use a *separate* SI-only workflow
(the main manuscript's workflow should not include this step). It:

1. **S-numbers figures and tables** — prepends a raw-LaTeX block that redefines
   `\thefigure`/`\thetable` to `S1`, `S2`, … (each SI is its own PDF, so the
   counters start fresh). This is the only thing that produces S-numbering; the
   template and Lua filters don't do it on their own.
2. **Retitles** the document to `Supplementary Information for "<original title>"`.
3. **Drops keywords** (an SI doesn't need them).
4. **Replaces the abstract.** By default it auto-generates a one-line summary
   listing the SI's top-level section headings — no AI and no `metadata.json`,
   e.g. *"This document provides supplementary information for the main
   manuscript, comprising: Supplementary Methods; Supplementary Results."* Fill in
   the step's **Abstract** box to override it, or uncheck **Auto-summarize
   sections** to leave it empty.

Because the S-prefix comes from this step, you no longer need a `supplementary:
true` flag in `metadata.json` for numbering.

## Exporting outside your vault

By default the exported file lands next to the compiled manuscript, inside the
vault. To keep exports out of the vault entirely, set **Pandoc output folder** to
an absolute path — e.g. `~/Papers` or `/Users/me/Documents/Papers`. Every project
then exports into that one folder, named by the step's **File name** option
(default: the compiled note's name). The folder is created automatically if it
doesn't exist yet, so you can point it anywhere writable.

You may also point the setting at a *file* (`~/Papers/latest.pdf`) to send every
export to one fixed path; its extension is replaced with whatever the preset
actually produces.

## Notes

- **Desktop only.** Export shells out to Pandoc via Node; on mobile the step
  reports a clear error. Writing/compiling still work on mobile.
- **Fonts.** Templates that assume macOS fonts (Songti/Heiti/Times) may need
  adjustment on Windows/Linux — edit the downloaded `defaults/*.yaml`.
