# Commands in Longform

Longform provides a number of commands you may use to quickly navigate and edit your projects. Those marked as “requires editing” below require you to be actively editing a scene in your project.

| Name                                          | Requires Editing | Description                                                                                                                             |
| --------------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Open Current Note’s Project                   | true             | Selects your current project (or draft of project) in the Longform pane.                                                                |
| Previous Scene                                | true             | Opens the previous scene to the one you’re currently editing, if available.                                                             |
| Previous Scene at Indent                      | true             | Opens the previous scene to the one you’re currently editing at the same indentation level, if available.                               |
| Next Scene                                    | true             | Opens the next scene to the one you’re currently editing, if available.                                                                 |
| Next Scene at Indent                          | true             | Opens the next scene to the one you’re currently editing at the same indentation level, if available.                                   |
| Indent Scene                                  | true             | Increases the current scene indentation level by one.                                                                                   |
| Unindent Scene                                | true             | Decreases the current scene indentation level by one.                                                                                   |
| Jump to Project                               | false            | Fuzzy-matches against known project titles, then shows it in the Longform pane and switches to that pane.                               |
| Jump to Scene in Current Project              | false            | Shows all scenes in the current project (in order and indented), and allows fuzzy-matching against them to quickly switch to a new one. |
| Open Longform Pane                            | false            | Switches to the Longform pane.                                                                                                          |
| Compile current project with current workflow | false            | Compiles whatever project is currently selected with its currently-selected workflow.                                                   |
| Compile project…                              | false            | Select a project, draft, and workflow, then compile using those selections.                                                             |
| Run workflow: `<name>`                        | false            | One command per workflow. Runs that workflow against the **note you currently have open** — see below.                                  |
| Add paper components…                         | false            | Adds Supplementary / Cover Letter / Response Letter parts to an existing paper project. See [The PaperBell paper project](./PAPER_PROJECT.md#adding-a-part-later). |

## Run workflow: `<name>`

Every compile workflow also gets its own command, named after it — “Run workflow:
PaperBell Manuscript”, “Run workflow: PaperBell Cover Letter”, and so on. The
list updates as you create, rename, and delete workflows in the compile pane.

These commands differ from **Compile current project** in what they act on: they
compile the note you have open, not the draft selected in the pane. So you can
bind a hotkey to a workflow and export the note you are writing without touching
the sidebar.

The built-in **Quick Export** workflow exists for exactly this: one step, no
project needed, and **no downloaded assets** — straight from the open note to a
PDF, a Word file, or HTML, chosen by the step's *Format* option. Word needs
nothing but pandoc itself; PDF also needs a TeX engine. See
[Pandoc export](./PANDOC_EXPORT.md#exporting-a-single-note).

- If the open note **belongs to a project**, its draft is compiled, exactly as
  the pane would. (When the note is a project index shared by several assets,
  the workflow's own asset is picked, or you are asked which one.)
- If the note **belongs to no project**, it is compiled as a one-off single file.
  No `longform:` frontmatter, no project setup.
- The note is saved first, so a hotkey pressed mid-sentence exports what you see.

Because a single file has nothing to concatenate, **Concatenate Text** steps are
skipped when the target is a single note. This is what lets the multi-scene
PaperBell workflows run against one file.

### What a loose note still needs

Compiled output lands next to the note: the compiled `.md`, the exported PDF, and
(if the workflow harvests line numbers) its `*.json` sidecars.

Steps that read shared project files search the note's own folder — and, when the
note sits inside a project, up to that project's root. A note that is nowhere
near a `metadata.json` will therefore fail on the **Add Zenodo Frontmatter** and
**Replace JSON Placeholders** steps, and the error lists every path it looked in.
That makes *PaperBell Manuscript* and *PaperBell Supplementary* project-bound in
practice, while *Quick Export*, *PaperBell Cover Letter*, and *PaperBell Response
Letter* run anywhere. This is deliberate: silently exporting a PDF stamped with
an unrelated paper's authors and DOI would be worse than a clear failure.

Images resolve from the note's folder, the vault root, and your configured
attachment folder — so pasted screenshots work in a loose note.

Note that a workflow's command id is derived from its name, so **renaming a
workflow loses any hotkey bound to it**.
