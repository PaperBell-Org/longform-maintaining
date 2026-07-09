# Pandoc asset marketplace — repository spec

PaperOut To-Authors (Longform/PaperBell) can browse and install Pandoc assets —
**recipes** (defaults `.yaml`), **filters** (`.lua`), **templates** (`.latex`/`.tex`/`.sty`),
and **CSL** styles — from an external **assets repository**. This document is the
spec that repository must follow so the plugin can list, download, combine, and
run its contents. The plugin-side implementation lives in `src/model/pandoc-market.ts`
(pure logic), `src/model/pandoc-assets.ts` (fetch/install), and
`src/view/pandoc-market/` (browse UI). Consumption of the installed toolchain is
described in [PANDOC_EXPORT.md](./PANDOC_EXPORT.md).

> **Reference implementation:** [`PaperBell-Org/paperout-assets-market`](https://github.com/PaperBell-Org/paperout-assets-market)
> is the live assets repo the plugin's `DEFAULT_MARKET_INDEX_URL` points at. It
> defines assets in `catalog/` and **builds** `index.json` + bundle zips via
> `scripts/build-index.mjs` / `pack-bundle.mjs`, published as **release assets**.
> Its published field names differ slightly from the idealized shape below (it uses
> `title` and a single `url`+`sourcePath`+`extraFiles` per asset, and bundle `url`);
> the plugin's `normalizeIndex` maps those onto the internal `name` / `files[]` /
> `download` shape, so **both spellings work** — see "Plugin normalization" below.

## How it works, end to end

1. The repository builds a machine-readable **`index.json`** from its `catalog/`
   sources and publishes it (plus one zip per bundle) as **release assets**.
2. The plugin fetches it — by default `…/releases/latest/download/index.json`
   (configurable via the `pandocMarketIndexUrl` setting / `DEFAULT_MARKET_INDEX_URL`)
   — and shows **bundles** and **recipes** (filters/templates/csl install as a
   recipe's dependencies rather than being listed individually).
3. Installing writes files into the vault's assets root (default `PaperBell/pandoc/`),
   under the fixed layout `defaults/ filters/ templates/ csl/`, and records what was
   installed in `installed.json` there. Assets are fetched per-file from
   `raw.githubusercontent.com/…/<tag>/…`; bundles from the release zip.
4. Recipes immediately appear in the Run Pandoc Export **template dropdown**
   (derived from `defaults/*.yaml`); a bundle may also inject recommended workflows.

The plugin still supports the legacy "paste a single toolchain **.zip** URL"
download as a fallback, so a marketplace is not required to use Pandoc export.

## Repository layout

Mirror the **consumption layout** so raw paths map 1:1 to install paths and
bundles are trivial to pack:

```
paperbell-pandoc-assets/                 # the assets repository (separate repo)
├── index.json                           # the marketplace catalog (see below)
├── README.md                            # human-facing landing page + contributing
├── defaults/    <recipe>.yaml           # recipes; raw path is defaults/<name>.yaml
├── filters/     <filter>.lua
├── templates/   <template>.latex / .tex / .sty   (+ subdirs, e.g. cover_letter/)
├── csl/         <style>.csl
├── bundles/     <bundle-id>-<version>.zip         # pre-packed suites (see below)
└── scripts/     build-index.mjs, pack-bundle.mjs, validate.mjs   # tooling
```

- A single asset's file is fetched from its raw URL and written to the same
  relative path under the assets root (`defaults/paperbell.yaml` → `<root>/defaults/paperbell.yaml`).
- A **bundle** is a `.zip` whose contents are already laid out as
  `defaults/ filters/ templates/ csl/` (i.e. it unzips directly onto the assets
  root). The plugin reuses its existing zip installer (`downloadPandocAssets`),
  which strips a single wrapping top-level directory (as GitHub source zipballs add),
  so a clean release-asset zip is preferred.

## `index.json` schema (`schemaVersion: 1`)

```jsonc
{
  "schemaVersion": 1,                     // must equal MARKET_SCHEMA_VERSION in the plugin
  "name": "PaperBell Pandoc Assets",
  "updatedAt": "2026-07-08",

  "assets": [
    {
      "id": "recipe.paperbell",           // globally unique, stable; the install-manifest key
      "type": "recipe",                   // "recipe" | "filter" | "template" | "csl"
      "name": "PaperBell Manuscript",
      "description": "Main manuscript preset (xeCJK + lineno + crossref).",
      "version": "1.3.0",                 // semver; drives update detection
      "author": "…", "tags": ["manuscript", "cjk"],
      "files": [                          // every file this asset installs
        { "path": "defaults/paperbell.yaml",
          "download": "https://raw.githubusercontent.com/OWNER/REPO/main/defaults/paperbell.yaml",
          "sha256": "…" }                 // optional integrity check
      ],
      "requires": [                       // FLAT list of other asset ids (deps)
        "filter.lineno_default", "filter.block_ids", "filter.manuscript_include",
        "template.paperbell", "csl.nature"
      ],
      "systemDeps": ["pandoc-crossref"]   // external tools; surfaced, never downloaded
    },

    { "id": "template.paperbell", "type": "template", "name": "PaperBell template",
      "version": "1.1.0",
      "files": [
        { "path": "templates/paperbell.latex", "download": "https://…/templates/paperbell.latex" },
        { "path": "templates/preamble.sty",    "download": "https://…/templates/preamble.sty" }
      ] },

    { "id": "filter.lineno_default", "type": "filter", "name": "lineno default",
      "version": "1.0.0",
      "files": [ { "path": "filters/lineno_default.lua", "download": "https://…/filters/lineno_default.lua" } ] },

    { "id": "csl.nature", "type": "csl", "name": "Nature", "version": "1.0.0",
      "files": [ { "path": "csl/nature.csl", "download": "https://…/csl/nature.csl" } ] }
  ],

  "bundles": [
    {
      "id": "bundle.paperbell-suite",
      "name": "PaperBell suite",
      "description": "Manuscript + SI + response + cover letter — all recipes/filters/templates/csl.",
      "version": "1.2.0",
      "author": "…", "tags": ["suite"],
      "download": "https://github.com/OWNER/REPO/releases/download/v1.2.0/paperbell-suite-1.2.0.zip",
      "sha256": "…",
      "assets": ["recipe.paperbell", "recipe.paperbell-si", "recipe.response-letter", "recipe.cover_letter"],
      "workflows": [ /* optional; see "Bundle workflows" */ ]
    }
  ]
}
```

### Field reference

**Asset**: `id` (unique, stable — renaming breaks the install manifest), `type`,
`name`, `version` (semver), `files[]` (each `{path, download, sha256?}`; `path` is
relative to the assets root and its first segment MUST be the type's directory —
`defaults/`, `filters/`, `templates/`, or `csl/`), optional `description`, `author`,
`tags`, `requires` (flat asset-id list), `systemDeps`.

**Bundle**: `id`, `name`, `version`, `download` (raw zip URL), optional `sha256`,
`assets` (ids it contains, for display and "already have it"), `description`,
`author`, `tags`, `workflows`.

> Note: `requires` is a **flat array of asset ids**. The asset's own `type` already
> tells the plugin which directory each file lands in, so dependencies don't need to
> be grouped by kind.

### Plugin normalization (published shape → internal shape)

The reference repo's `build-index.mjs` emits slightly different field names, which
the plugin's `normalizeIndex` accepts transparently — so an index may use **either**
spelling:

| Published (assets repo) | Internal (plugin) |
| --- | --- |
| `title` | `name` |
| `sourcePath` + `url` (+ `sha256`) | `files[0] = {path, download, sha256}` |
| `extraFiles: ["templates/x.sty"]` | extra `files[]`, each URL derived from the main file's `…/<tag>/` base |
| bundle `url` | bundle `download` |
| `tier`, `reviewed`, `readmePath`, `previewPath` | passed through (UI shows an "unverified" note when `reviewed === false`) |

`requires` is a flat list of asset ids; a filter's id is its repo path
(e.g. `filters/callout.lua`), so the dependency closure resolves the same way
regardless of spelling.

## Dependency model

- Only **recipes** normally declare `requires` (their filters, template, CSL).
- Installing a single asset installs its `requires` **closure** first (dependencies
  before dependents, de-duplicated), then the asset itself. Unknown dependency ids
  are a hard error; cycles are tolerated (each id installs once).
- **Bundles are self-contained**: the zip already carries every file, so no
  dependency resolution runs on bundle install. List the contained ids in `assets`
  for display only.

## Normalization invariants (required for the toolchain to actually run)

These come from how the export pipeline resolves resources; assets that break them
will fail at compile time.

1. **Portable resource references.** In `defaults/*.yaml`, reference filters and
   templates via `${USERDATA}/filters/…`, `${USERDATA}/templates/…`, and set
   `data-dir: ${.}/..`. Never hardcode a machine path. (`${USERDATA}` resolves to
   the assets root because `data-dir` points there; the plugin runs pandoc with the
   assets root as its working directory.)
2. **Injected `csl:` / `bibliography:`.** The plugin passes `--csl` and
   `--bibliography` on the command line, so any `csl:` / `bibliography:` keys in a
   recipe MUST be commented out (otherwise they double up or point at a personal path).
3. **Template side files** (`.sty`, `.tex`, subdir assets) are found via `TEXINPUTS`
   pointing at `templates/`, not declared in the yaml. Register them in the template
   asset's `files[]` so they are packed/installed together.
4. **No personal/identity files** (logos, signatures, private `.bib`). Ship a
   placeholder + a README explaining how to replace it (as the existing
   `templates/cover_letter/` assets do).
5. **Bundle zip layout.** A bundle must unzip to the assets root as
   `defaults/ filters/ templates/ csl/`.

## Versioning & updates

- Every asset and bundle carries a semver `version`. The plugin records the
  installed version in `installed.json` and flags an entry **update-available** when
  the index has a newer version (numeric compare; pre-release tags ignored).
- Bump `version` on any content change so users are offered the update.

## Bundle workflows (optional)

A bundle may declare recommended `workflows` (an array of the plugin's
`SerializedWorkflow` — `{name, description, steps:[{id, optionValues}]}`). On
install the plugin adds only workflows the user doesn't already have, and **skips
any workflow whose steps reference a non-built-in step id** (a marketplace workflow
must use built-in steps + preset names only — never a user-script `.js` step).
Keep `optionValues` portable (preset names, not absolute paths).

## Repository tooling (recommended)

- `scripts/build-index.mjs` — scan the four directories and emit `index.json`:
  compute `sha256`, verify the `${USERDATA}` normalization and commented
  `csl:`/`bibliography:`, and check every `requires` id exists.
- `scripts/pack-bundle.mjs` — pack a bundle's assets into
  `bundles/<id>-<version>.zip` with the required layout.
- `scripts/validate.mjs` in CI on every PR — fail if the index and files disagree,
  an invariant is violated, or a `requires`/`assets` id is dangling.

## What the plugin does on its side (for reference)

- Fetch + validate `index.json` (`schemaVersion` gate).
- Install a bundle via the zip installer, or an asset + its `requires` closure via
  per-file download (optional `sha256` check), tracking everything in
  `installed.json` at the assets root (used for update detection and uninstall,
  and to avoid clobbering files you've edited locally).
- Refresh the template dropdown so recipes are immediately selectable; inject a
  bundle's recommended workflows (missing-only, built-in steps only).
- Desktop installs + browsing also work on mobile for download, but the template
  list and PDF export are desktop-only.
