# Compile

Longform's Compile tab helps you turn a project into a final document. In the tab, you build **workflows** comprising **steps**. You can also write your own **user scripts** in JavaScript to build out fully custom compilation processes; hopefully, though, the built-in steps are sufficient for most use cases. If not, and you'd like to suggest a new step that you think should be included by default, please [suggest it as a GitHub issue](https://github.com/kevboh/longform/issues).

## Steps

Steps are the basic building block of compilation. In Longform, a step takes an input (either all your scenes or a combined manuscript) and returns an output (either transformed scenes or an altered manuscript).

There are three kinds of steps:

1. **Scene** steps, which act on every scene individually. A scene step will take a list of scenes as input and return that list as output. For example, the **Prepend Title** step, given a list of scenes, will insert a header with that scene's title at the top of each scene. It will then pass all the scenes to the next step.
2. **Join** steps, which take a list of scenes and return a single manuscript. Join steps are essential to creating a single document.
3. **Manuscript** steps, which act on a single manuscript document and return that document.

Steps must always be in the above order during compilation. Any number of scene steps, then one join step, then any number of manuscript steps.

Many steps can be of multiple kinds. For example, the **Remove Links** step, which removes both external and internal links, can run as both a scene and manuscript step. Longform figures out how it should be run automatically based on its position relative to other steps.

Steps may sometimes have _options_, which are text or checkbox fields that the step uses to customize its function. A number of the steps built into Longform have options.

### Built-in Steps

Longform comes with a lot of steps for you to add to compilation.

#### Prepend Title

_Scene_

Prepends each scene's title (its note name) before its content. Options:

| Name         | Type | Default | Description                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------ | ---- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Title Format | Text | $1      | A format string that lets you customize how the title is inserted. A `$1` in the string will be replaced with the scene title. A `$2`, if present, will be replaced with the scene’s number (first scene is “1,“ it’s child is “1.1,” etc.). Wrapping text in $3{} will repeat that text a number of times equal to the scene’s indentation level plus one—e.g., $3{#} for unindented scenes becomes “#”. |
| Separator    | Text | \n\n    | Some text to insert between the formatted title and the rest of the scene.                                                                                                                                                                                                                                                                                                                                |

#### Remove Comments

_Scene, Manuscript_

Removes markdown and/or HTML comments. Options:

| Name                     | Type    | Default | Description                                         |
| ------------------------ | ------- | ------- | --------------------------------------------------- |
| Remove Markdown Comments | Boolean | true    | If checked, will remove markdown comments (`%%`).   |
| Remove HTML Comments     | Boolean | true    | If checked, will remove HTML comments (`<!-- -->`). |

#### Remove Links

_Scene, Manuscript_

Removes internal and/or external links. Options:

| Name                  | Type    | Default | Description                                       |
| --------------------- | ------- | ------- | ------------------------------------------------- |
| Remove Wikilinks      | Boolean | true    | If checked, will remove internal links (`[[ ]]`). |
| Remove External Links | Boolean | true    | If checked, will remove external links (`[ ]()`). |

#### Remove Strikethroughs

_Scene, Manuscript_

Removes any ~~struck through~~ text (`~~ ~~`).

#### Strip Frontmatter

_Scene, Manuscript._

Removes any [YAML frontmatter](https://help.obsidian.md/Advanced+topics/YAML+front+matter) from the beginning of a scene or manuscript.

#### Concatenate Text

_Join_

Joins scenes into a manuscript by concatenating them together with some optional text between. Options:

| Name      | Type | Default | Description                            |
| --------- | ---- | ------- | -------------------------------------- |
| Separator | Text | \n\n    | Text to put between the joined scenes. |

#### Write to Note

_Manuscript_

Saves the manuscript as Markdown note in your vault. Options:

| Name                     | Type    | Default       | Description                                                                                                                          |
| ------------------------ | ------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Output Path              | Text    | manuscript.md | Path relative to your project at which to save your compiled manuscript. $1, if present, will be replaced with your project’s title. |
| Open Compiled Manuscript | Boolean | true          | If checked, open the compiled manuscript in a new pane.                                                                              |

#### Add Zenodo Frontmatter

_Manuscript_

Reads a [Zenodo deposition](https://developers.zenodo.org/#representation)–style metadata JSON from your project folder (or its `source/` subfolder) and prepends a Pandoc-compatible YAML frontmatter to the manuscript. Keeping the metadata in Zenodo's schema means the same file can be uploaded to Zenodo when archiving your work. Options:

| Name                  | Type    | Default       | Description                                                                                                  |
| --------------------- | ------- | ------------- | ------------------------------------------------------------------------------------------------------------ |
| Metadata file         | Text    | metadata.json | Filename of the Zenodo metadata JSON in your project folder. Trailing `.json` is optional.                   |
| Error on missing file | Boolean | true          | If checked, throw when the metadata file is not found. Otherwise pass the manuscript through unchanged.       |

The metadata file follows Zenodo's deposition schema for fields like `title`, `publication_date`, `description`, `creators[]`, `contributors[]`, `keywords[]`, `journal_title`, and `version`. Plugin-specific keys (Pandoc template, citation style, line numbering, multiple affiliations per author, corresponding-author flags, free-form extra YAML) live under a `_longform` namespace that Zenodo will ignore on upload. Example:

```json
{
  "title": "A Study",
  "publication_date": "2026-05-03",
  "description": "An abstract.",
  "creators": [
    { "name": "Doe, Jane", "affiliation": "Org A", "orcid": "0000-0000-0000-0000" },
    { "name": "Roe, Rick", "affiliation": "Org B" }
  ],
  "keywords": ["alpha", "beta"],
  "journal_title": "Nature",
  "version": "v1.0",
  "_longform": {
    "acronym": "STUDY",
    "csl": "nature",
    "template": "default",
    "lineno": false,
    "figures_at_end": false,
    "author_affiliations": { "Doe, Jane": ["Org A", "Org C"] },
    "corresponding": ["Roe, Rick"],
    "extra_yaml": "numbersections: true\n"
  }
}
```

The step derives Pandoc's indexed `affiliations:` table from `creators[].affiliation` (or `_longform.author_affiliations[name]` when an author belongs to more than one institution), in order of first appearance. `title` and `creators` are required; the step throws if either is missing.

#### Replace JSON Placeholders

_Manuscript_

Replaces `{{ path.to.value }}` placeholders in your manuscript with values resolved from a JSON file in your project folder (or its `source/` subfolder). Useful for injecting computed numerical results, dates, or any other values produced outside Obsidian. Options:

| Name             | Type    | Default      | Description                                                                                                                          |
| ---------------- | ------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| JSON file        | Text    | results.json | Filename of the JSON data file. Trailing `.json` is optional.                                                                        |
| Start delimiter  | Text    | `{{`         | Left delimiter of placeholders.                                                                                                      |
| End delimiter    | Text    | `}}`         | Right delimiter of placeholders.                                                                                                     |
| Error on missing | Boolean | false        | If checked, throw when a placeholder path is not found in the JSON file. Otherwise the placeholder is left unchanged in the output.  |

Path expressions support dot and bracket notation in any combination (`a.b.c`, `a.b[0].c`). Object values are stringified as JSON, `null` becomes the empty string. Example `results.json`:

```json
{
  "summary": { "n": 42, "mean": 3.14 },
  "samples": [{ "id": "S-01" }, { "id": "S-02" }]
}
```

The manuscript text `We collected {{ summary.n }} samples (first: {{ samples[0].id }}).` becomes `We collected 42 samples (first: S-01).`.

### User Script Steps

In addition to the built-in steps above, Longform also supports user script steps, which are arbitrary JavaScript scripts that can be loaded and used like any other step.

To add a user script to Longform, first create a folder somewhere in your vault where you'd like to store your user script steps. Longform will attempt to load all `.js` files in this folder as steps.

Next, add your first step as a `.js` file. Every step must export an object in the following shape:

```js

compile = (input, context) => {
  /**
    Function that is executed during compilation. It may be `async`.
    Errors encountered during execution should be thrown and will
    be handled by Longform.
    @param input If the step is of kind Scene or Join (see context),
    this will be *an array* containing elements of type:
      {
        path: string; // path to scene
        name: string; // file name of scene
        contents: string; // text contents of scene
        metadata: CachedMetadata; // Obsidian metadata of scene
        indentationLevel?: number; // The indent level (starting at zero) of the scene
      }
    where each element corresponds to a scene (and thus the step has access to all scenes at once in `input`).
    If the step is of kind Manuscript (see context), this will be of type:
      {
        // text contents of manuscript
        contents: string;
      }
    @param context The execution context of the step, including the step
    kind and option values:
      {
        kind: string; // "Scene" | "Join" | "Manuscript"
        optionValues: { [id: string]: unknown } // Map of option IDs to values
        projectPath: string; // path in vault to compiling project
        draft: Draft; // The Draft type describing your project
        app: App; // Obsidian app
      }
    @note For an example of using `context` to determine the shape of `input`, see
    https://github.com/kevboh/longform/blob/main/src/compile/steps/strip-frontmatter.ts
    @returns If of kind "Scene" or "Manuscript", the same shape as `input`
    with the appropriate changes made to `contents`. If of kind "Join",
    the same shape as a "Manuscript" step input.
  */
  return;
}

module.exports = {
  // object that describes the step and its configuration
  description: {
    // the name of your step
    name: "My Step",

    // short description of what it does
    description: "Does something cool",

    // array. valid options are "Scene", "Manuscript", "Join". "Join" must be the only member if present.
    availableKinds: ["Scene", "Manuscript"],

    // array of step options, or an empty array if step has no options
    options: [
      {
        // string ID you can use to get the option's value during compile
        id: "my-text-option",

        // name of this option for display
        name: "Customizes something in my step",

        // description of what the option does
        description: "Longer description of what exactly this option does",

        // enum, either "Text" or "Boolean"
        type: "Text",

        // the option's default value. string if "Text", boolean if "Boolean"
        default: "Hello world!",
      },

      // a boolean option follows as another example
      {
        id: "my-boolean-option",
        name: "Do Thing?",
        description: "If checked, do some extra thing.",
        type: "Boolean",
        default: true,
      },
    ],
  },
  compile: compile,
};
```

Finally, to use your user script you must configure the _scripts folder_ setting in Longform plugin settings. Your user script should immediately appear below the setting.

Once loaded, the user script will be available in the Add Step menu of Compile. Changes made to your user script will be automatically loaded after a short delay. If you use that script as a step, Longform will attempt to preserve your existing configuration (place in workflow, option values) whenever it reloads a user script. If it fails, or if your user script moves, your script folder changes, or the script is deleted, Longform will mark that step as invalid and you will have to remove or replace it before compiling is enabled.

## Workflows

In Compile, steps are organized into workflows. Longform ships with a default workflow that demonstrates Compile and produces a simple formatted manuscript. Feel free to customize or delete the default workflow.

You can create new workflows to suit each of your projects. Each workflow has a description box you may use to remind yourself what exactly the workflow does. A Longform project remembers its last-used workflow and will select it first when you next open the Compile tab.

Workflows are vault-wide; if you change a workflow within a project, it will change for all projects that use that workflow.

You can drag steps within a workflow to rearrange them.

## The Future

Compile remains a feature that will change over time. [Open issues](https://github.com/kevboh/longform/issues?q=is%3Aissue+is%3Aopen+label%3Acompile) are a good way to track what's on the roadmap. I plan on adding more steps and a few more features that allow you to fully customize what happens inside a given workflow. As always, if you think a step should be added or changed, or that compile should behave differently, please open an issue in GitHub.
