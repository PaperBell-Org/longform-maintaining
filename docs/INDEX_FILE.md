# The Index File

The Index File is a note with a `longform` frontmatter entry. You can think of it as the “root” of a project: it tells Longform what kind of project it is, where the scenes are, and other metadata needed to make everything work.

## The `longform` Entry

The `longform` frontmatter entry is how Longform discovers, tracks, and reasons about projects. It contains the following properties:

| Name        | Type                   | Required? | Description                                                                                                                                                                                          |
| ----------- | ---------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| format      | `"single" or "scenes"` | true      | Whether this is a [single-](./SINGLE_SCENE_PROJECTS.md) or [multi-](./MULTIPLE_SCENE_PROJECTS.md) scene project.                                                                                     |
| title       | `string`               | false     | The title of the project. If multiple projects have the same title, they are treated as separate drafts of the same project. If not specified, uses the name of the index file as the project title. |
| draftNumber | `number`               | false     | If this project is one draft among many (see `title`), used to order and distinguish drafts.                                                                                                         |
| workflow    | `string`               | true      | Used by Longform to track compile state. Do not edit.                                                                                                                                                |

In addition to the above, multi-scene projects have some additional frontmatter in the `longform` entry:

| Name          | Type                          | Required? | Description                                                                                                                                            |
| ------------- | ----------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| sceneFolder   | `string`                      | true      | The path—relative to the index file—where your scenes live.                                                                                            |
| scenes        | `string[]` (array of strings) | true      | Nested arrays of scene file names (without .md extensions).                                                                                            |
| sceneTemplate | `string`                      | false     | Path to file to use as a template for newly-created scenes in this project.                                                                            |
| ignoredFiles  | `string[]` (array of strings) | false     | If present, a list of scene names (without .md extensions, wildcards are allowed) to ignore when prompting to add newly-created files to your project. |

## Single-file project indexes (`format: project`)

A paper project usually has several _assets_ — a main manuscript, supplementary
information, a response letter, a cover letter, and so on. Instead of giving each
asset its own index file, you can manage them all from **one** index file with
`format: project`. Its `longform` entry holds an ordered, user-definable
`assets` list; each asset expands into its own draft internally, so scenes,
compile, word counts, and the sidebar all work exactly as before.

```yaml
longform:
  format: project
  title: My Paper
  assets:
    - name: Main text # asset display name (also its draft title)
      format: scenes
      folder: manuscript # scene folder, relative to this index file
      workflow: PaperBell Manuscript
      scenes:
        - introduction
        - methods
        - results
    - name: Supplementary
      format: scenes
      folder: supplementary
      workflow: PaperBell Supplementary
      scenes:
        - supp-results
    - name: Cover letter
      format: single
      file: cover-letter.md # the note this asset exports, relative to the index
      workflow: PaperBell Cover Letter
```

Each asset entry accepts:

| Name          | Type       | Applies to | Description                                                          |
| ------------- | ---------- | ---------- | ------------------------------------------------------------------- |
| name          | `string`   | both       | Display name / draft title of the asset.                            |
| id            | `string`   | both       | Optional stable id; defaults to `name`.                             |
| format        | `"scenes" \| "single"` | both | Whether the asset is a multi-scene set or a single note.   |
| workflow      | `string`   | both       | The compile workflow for this asset.                                |
| folder        | `string`   | scenes     | Scene folder, relative to the index file.                           |
| scenes        | `string[]` | scenes     | Nested scene names (same nesting rules as a multi-scene project).   |
| sceneTemplate | `string`   | scenes     | Optional per-asset new-scene template.                              |
| ignoredFiles  | `string[]` | scenes     | Optional scene-folder files to ignore.                              |
| file          | `string`   | single     | The note this single asset exports, relative to the index file.     |

The older layout — one index file per asset, grouped by a shared `title` — is
still fully supported. To collapse an existing multi-file paper project into a
single index, run the **Convert project to single index…** command; it writes
the new index and detaches the old ones by removing only their `longform`
frontmatter (your notes are never deleted).

## Other Frontmatter

You’re free to put any other frontmatter you’d like in the index file as long as that frontmatter is outside the `longform` entry. Longform will leave it alone. You might want to do this to integrate with other Obsidian plugins.
