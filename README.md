## PaperOut To-Authors

**PaperOut To-Authors** is a plugin for [Obsidian](https://obsidian.md) for writing and exporting academic manuscripts. It is part of the **PaperBell** suite and a fork of [Longform](https://github.com/kevboh/longform) (originally by Kevin Barrett): it keeps Longform's project/scene organization and compile workflow, and adds an academic writing/export pipeline on top. It organizes a series of notes, or _scenes_, into an ordered manuscript, and also supports single-note projects for shorter works.

Major features include:

- A dedicated sidebar that collects your projects from across your vault;
- A [reorderable, nestable list](./docs/MULTIPLE_SCENE_PROJECTS.md) of scenes;
- Scene/draft/project [word counts](./docs/WORD_COUNTS.md#word-counts-for-projects-drafts-and-scenes);
- Daily [writing session goals](./docs/WORD_COUNTS.md#writing-sessions-and-word-count-goals) with lots of options to help fit your writing style;
- A [workflow-based compilation tool](./docs/COMPILE.md) that can create manuscripts from your projects;
- Support for [single-scene projects](/docs/SINGLE_SCENE_PROJECTS.md) so that your shorter works can use the same workflows and tooling as your longer ones;
- Plus lots of commands, modals, and menu items to help you manage your work.

A Getting Started guide follows; there is also reasonably-complete [documentation](./docs/).

> **Academic pipeline:** on top of Longform, PaperOut To-Authors adds a one-command [**PaperBell paper project**](./docs/PAPER_PROJECT.md) (the parts you pick — manuscript, supplement, cover and response letters — sharing one [`metadata.json`](./docs/METADATA_AND_PLACEHOLDERS.md)), [`{{Variable}}` placeholders](./docs/METADATA_AND_PLACEHOLDERS.md), [manuscript ↔ response-letter reference sync](./docs/MANUSCRIPT_REFS.md), and a **Run Pandoc Export** compile step that produces a typeset PDF. The Pandoc toolchain (filters/templates/CSL) is downloaded on demand from a separate assets repository, not bundled. Run the **Set up Pandoc export** command to get started; see [docs/PANDOC_EXPORT.md](./docs/PANDOC_EXPORT.md).

### Part of the PaperBell suite (CIMPO)

PaperOut To-Authors is the **Output**-stage plugin of the **PaperBell** suite, which organizes an academic vault around the CIMPO framework (Concepts → Inputs → Metadata → Projects → Outputs). It works fully standalone; when the PaperBell host plugin is installed it also follows the host's UI language and shows your account status. See:

- [docs/PAPERBELL_INTEGRATION.md](./docs/PAPERBELL_INTEGRATION.md) — the host handshake, scopes, and language following;
- [docs/PAPERBELL_SUITE.md](./docs/PAPERBELL_SUITE.md) — where PaperOut fits in CIMPO, cross-plugin collaboration, and the roadmap for deeper interop.

### Academic documentation

- [docs/PAPER_PROJECT.md](./docs/PAPER_PROJECT.md) — the paper project: choosing its parts, adding more later, shared metadata, compile order.
- [docs/METADATA_AND_PLACEHOLDERS.md](./docs/METADATA_AND_PLACEHOLDERS.md) — `metadata.json`, `results.json`, and `{{ }}` placeholders.
- [docs/MANUSCRIPT_REFS.md](./docs/MANUSCRIPT_REFS.md) — `<!--ms:-->` spans, `manuscript` reference fences, and harvested sidecars.
- [docs/PANDOC_EXPORT.md](./docs/PANDOC_EXPORT.md) — PDF export and the Pandoc toolchain.

## Installing

PaperOut To-Authors is distributed as a beta plugin (install it with [BRAT](https://github.com/TfTHacker/obsidian42-brat), pointing at this repository). You may also install it manually by copying the `main.js`, `manifest.json`, and `styles.css` files from a release into a `longform-paperbell/` folder in the `.obsidian/plugins` folder of your vault.

## Getting Started

PaperOut To-Authors works by searching your vault for any note that contains a frontmatter entry named `longform` (don’t worry if you don’t know what that means; the plugin includes tools to help you generate these files). You can think of these notes as the “spines” or tables of contents of your projects. Let‘s walk through creating a paper project.

### Creating a paper project

1. Find or create a folder in your vault to hold the paper. Right-click it and
   select `New PaperBell paper project…` — or run the command of the same name
   from the command palette.

   <!-- TODO: screenshot of the folder context menu -->

2. Give the project a title. It names both the folder and the Longform project.
   An acronym is derived from it (used in exported file names); edit it if you
   want something else.

3. Choose which parts the paper needs. Only the **Main Manuscript** is created by
   default — a short paper often needs no supplement, and nothing needs a
   response letter before review. Tick whichever of **Supplementary
   Information**, **Cover Letter**, and **Response Letter** apply.

   Leave **Include example content** on for a worked example — a figure, a
   spreadsheet-driven table, and a README describing the layout — or turn it off
   for a clean project. The starter scenes adapt either way, so you never end up
   with a link to an image that isn't there.

   <!-- TODO: screenshot of the new-project modal with the part toggles -->

4. Click `Create`. The project folder now holds a `metadata.json` (shared
   publication metadata), a `results.json` for compile-time `{{ }}` values, a
   `references.bib`, and one index note per part. The Main Manuscript is selected
   in the [PaperOut pane](./docs/THE_LONGFORM_PANE.md) and opened for you.

5. Write your scenes under `manuscript/`. Add more from the Scenes tab; drag them
   left or right to nest them. See
   [multiple-scene projects](./docs/MULTIPLE_SCENE_PROJECTS.md).

6. Export with the [Compile](./docs/COMPILE.md) tab, or bind a hotkey to
   `Run workflow: PaperBell Manuscript`. See
   [Pandoc export](./docs/PANDOC_EXPORT.md) for the toolchain setup.

### Adding a part later

Changed your mind, or got reviews back? Run **Add paper components…** from the
command palette, or right-click the project folder. It lists only the parts the
project does not have yet, and creates them alongside the existing ones — a
response letter added this way already knows how to quote your manuscript.

Nothing is overwritten: if a file it would create already exists, it reports the
clash and writes nothing at all.

> **Note**
>
> Paper projects are not special — a Longform project is just one or more notes
> organized around some YAML frontmatter. To turn any note into a project, use
> the `Insert Multi-Scene Frontmatter` or `Insert Single-Scene Frontmatter`
> commands and PaperOut will pick it up automatically.

> **Warning**
>
> Avoid editing the `longform` frontmatter in an index file directly unless you
> know what you're doing. PaperOut supports it and does its best to sync, but it
> is easy to break. You can always revert: PaperOut never deletes files based on
> changes to an index file.

## Drafts & Projects

Longform supports the creation of multiple _drafts_ for a given project. Under the hood, drafts are just different Longform projects with the same title—they are then grouped together by Longform and presented as different versions of the same project.

To create a new draft of a project use the new draft (+) button in the Project tab, or create an entirely new project somewhere and set the title in the Project tab to be the same as your existing project.

You can rename drafts by right-clicking them in the Project tab and selecting Rename, or by setting the `draftTitle` attribute in their `longform` frontmatter.

## Compiling

The Compile tab allows you to create custom workflows that turn your project into a manuscript. See [COMPILE.md](https://github.com/kevboh/longform/blob/main/docs/COMPILE.md) for more.

> [!TIP]
> You can find more compile steps for various use cases in the [community collection of compile steps](https://github.com/obsidian-community/longform-compile-steps).

## Scene-only Styling

Longform will automatically attach a `.longform-leaf` class to the container panes of any notes that are part of a Longform project. This means you can add custom CSS snippets to Obsidian that style your writing environment and _only_ your writing environment. For example, I prefer a dark theme for Obsidian but a light theme for writing, so my writing snippet looks something like this:

```css
/* Set some variables for the entire leaf. */
.longform-leaf {
  --background-primary: white;
  --background-primary-alt: white;
  --background-secondary: white;
  --background-secondary-alt: white;
}

/* Style the editor. */
.longform-leaf .markdown-source-view {
  --background-primary: white;
  --background-primary-alt: white;
  --background-secondary: white;
  --background-secondary-alt: white;
  --text-selection: #aaa;
  --text-normal: black;
  color: black;
  background-color: white;
}

/* Style text selection. */
.longform-leaf .suggestion-item.is-selected {
  background-color: var(--text-accent);
}

/* Style the header of the leaf. */
.longform-leaf .view-header {
  background-color: white;
}

/* Style the text content of the leaf header. */
.longform-leaf .view-header-title {
  --text-normal: black;
}
```

Longform’s own UI will always use existing Obsidian CSS theme variables when possible, so it should always look at home in your theme.

## Troubleshooting

First, the most important bit: **Longform is built specifically to never alter the contents on your notes.** The only note it rewrites is a project’s index file. As such, Longform can’t delete or lose your notes.

Longform does a lot of complex tracking to bridge a project’s metadata with the state of files on disk. Although it tries to cover lots of edge cases, it is possible to cause desync between what Longform thinks is happening with projects and what’s actually going on. Most often this occurs when a project’s frontmatter is malformed or invalid in some way. Because projects are inferred from frontmatter, if your frontmatter is correct you can always restart Obsidian (or choose the "reload without saving" command) to force Longform to recalculate projects.

## Sponsorship

Any [sponsorship](https://github.com/sponsors/kevboh) is deeply appreciated, although by no means necessary.

## Credits

This is the **PaperBell** fork of [Longform](https://github.com/kevboh/longform), originally written by [Kevin Barrett](https://kevinbarrett.org). It is maintained by [PaperBell-Org](https://github.com/PaperBell-Org), which adds an academic writing/export pipeline on top of Longform. Our thanks to Kevin and the original contributors.

## License

Licensed under the Fuck Around and Find Out License (FAFOL) v0.2 — see [LICENSE.md](./LICENSE.md); license history [here](https://git.sr.ht/~boringcactus/fafol/tree/master/LICENSE.md). The license is unchanged from upstream Longform. Note the FAFOL "Ethics" clause: this software must be used for Good, not Evil — so it is not an OSI-approved / FSF-free license. Copyright is held by the respective contributors (Kevin Barrett and the PaperBell-Org maintainers).
