# Maintaining PaperOut To-Authors

This document records how this plugin is maintained. It exists because the plugin is a
long-diverged fork with a live parent-suite relationship, neither of which is obvious from the
code alone.

## Lineage

- **Upstream:** [`kevboh/longform`](https://github.com/kevboh/longform) by Kevin Barrett.
- **Status:** upstream is **EOL** — no longer maintained. We **do not** rebase or track it.
- We keep Kevin Barrett's attribution voluntarily (the FAFOL v0.2 license does not require it) in
  `manifest.json`, `package.json`, the README credits, and the in-app settings "Credits" section.

If we ever need a specific upstream fix, cherry-pick the individual commit; do not attempt a merge
or rebase of the upstream branch — the trees have diverged too far (academic pipeline, Pandoc
export, PaperBell integration).

## Identity (do not casually change)

- **Display name:** `PaperOut To-Authors`.
- **Machine slug** (repo, future id, npm package): `paperout-to-authors`.
- **Manifest `id`:** `longform-paperbell` — **intentionally unchanged**. Changing it remaps
  `.obsidian/plugins/<id>/data.json`, view-type state, and command/hotkey namespaces, and forces
  every user to reinstall. Only change it as a deliberate major release with a migration.

### Vault data contract — never rename

These literals are written into users' vaults; renaming any of them breaks existing projects:

- Frontmatter keys: `longform`, `longform-ignore`, `longform-order`, `longform-number`.
- `VIEW_TYPE_LONGFORM_EXPLORER`, command-id prefix `longform-*`, CSS class prefix `longform-*`,
  `ICON_NAME`, `DEFAULT_SESSION_FILE = "longform-sessions.json"`.
- Migration constants in `src/model/types.ts`.

The visible **brand** (names, titles, notices, log prefix `[PaperOut]`) is independent of the above
and is safe to change.

## PaperBell relationship

This plugin is a **child** of the PaperBell main plugin (`app.plugins.plugins["paperbell"]`). It is
an **optional** dependency: the plugin works standalone, and lights up host-backed features (shared
config, account, AI via `requestCompletion`) only when PaperBell is present.

- The shared contract lives at `src/paperbell/shared-config.ts`, a **vendored copy** of PaperBell's
  `paperbell-shared-config.ts` (zero-dependency by design).
- It is pinned to `PPB_SCHEMA_VERSION`. When PaperBell bumps its schema, **re-vendor** the file and
  update the compatibility check.

### Contract conformance (verified against PaperBell 0.4.4 / pro v0.5.0-beta.1)

The real host's `install()` does exactly what our client assumes:
`this.plugin.api = api` (so `app.plugins.plugins["paperbell"].api` works), `window.registerPPBplugin = api.registerPPBplugin`, then `workspace.trigger("paperbell:ready", api)`. Its `getPluginInfo()`
returns `schemaVersion: 1` and `capabilities: ["account","config","plugin-info","llm-invoke"]` —
matching our vendored `PPB_SCHEMA_VERSION` and feature gating. We depend ONLY on this handshake
contract, never on PaperBell's main features (which change independently).

### Verifying the handshake live

Our automated tests (`test/paperbell/`) exercise the client against contract fixtures — no Obsidian
needed. To verify against the **real** host in Obsidian:

1. Unzip a PaperBell build into `test-longform-vault/.obsidian/plugins/paperbell/`
   (`manifest.json` + `main.js` + `styles.css`). That folder is **gitignored** — the collaborator's
   pre-release binary must never enter our repo.
2. It ships **disabled by default** (not in `community-plugins.json`) so it doesn't auto-open its
   own config UI and clutter the test vault. Enable it manually in Settings → Community plugins only
   for a handshake session, then disable it again.
3. `npm run dev`, open the vault, enable both plugins.
4. Check: our settings tab shows a "PaperBell" section reading *Connected*; the console logs
   `[PaperOut] Connected to PaperBell host.`; the "Connect/Refresh" button pulls account/config
   (PaperBell prompts for consent the first time); disabling our plugin calls `unregister()`.

An **automated, decoupled** guard also runs in the test suite: `test/paperbell/host-conformance.test.ts`
statically checks that any bundle present at that path still exposes the handshake surface (events,
api/client methods, capabilities). It only reads the text — it never boots PaperBell's main features —
and skips entirely when no bundle is installed.

## Release process

- Beta channel: install via [BRAT](https://github.com/TfTHacker/obsidian42-brat) against this repo;
  BRAT reads `manifest-beta.json`.
- Cut a release: `npm version <x.y.z[-beta.N]>` → `version-bump.mjs` syncs `manifest.json` +
  `versions.json` (and `manifest-beta.json`) → push the tag. `.github/workflows/release.yml` verifies
  the tag equals the manifest version and publishes `main.js`, `manifest.json`, `styles.css`. A `-`
  in the tag marks it a GitHub prerelease.
- Keep `manifest.json`, `manifest-beta.json`, and `package.json` versions in sync — the release
  workflow fails the build if the tag and `manifest.json` disagree.

## Localization (i18n)

Bilingual **zh / en** UI lives in `src/i18n/`:

- `en.ts` is the **source of truth** for message keys; `zh.ts` must cover the same keys
  (enforced by the `Messages` type and a completeness test in `test/i18n/`).
- `translate(key, vars?)` — imperative, for `.ts` (command names, notices).
- `t` — a reactive store for Svelte: `{$t("key")}` re-renders on language change.
- `{name}`-style placeholders are filled from `vars`.

**Language resolution** (`controller.ts`, `resolveLocale`): an explicit setting (`en`/`zh`)
wins; otherwise `auto` follows the connected PaperBell host's language, then falls back to
Obsidian's UI language. The `language` plugin setting (default `auto`) drives it; the settings
tab re-renders live when the resolved locale changes.

**Adding a string:** add the key to `en.ts` and `zh.ts`, then use `t("key")` / `translate("key")`.
The completeness test fails if a locale is missing a key.

**Coverage note:** the command palette, notices, folder menu, explorer shell (tabs / pane title /
migration & sync messages), and the **entire settings tab** are localized. Deeper modals
(new-project / new-draft / metadata / compile step editors) and compile-step descriptions are
still English — migrate them incrementally by wrapping their strings in `t()`. Command-palette
names are read by Obsidian at registration, so a language change relabels them only after reload.

## Pandoc assets — sync from the canonical vault

The Pandoc export toolchain (filters / templates / defaults / csl) is **not** authored in this
repo. Its single source of truth is a working vault's `脚本/Pandoc/` folder. This repo's
`pandoc-assets/` is a **staging copy**: consumed by the test vault (via the `pandocAssetsFolder`
setting) and packaged into the published assets zip (`pandocAssetsUrl`).

**To pull the latest toolchain in:**

```
./scripts/sync-pandoc-assets.sh              # from the default source
PANDOC_SRC=/path/to/Pandoc ./scripts/sync-pandoc-assets.sh
./scripts/sync-pandoc-assets.sh --dry-run    # preview, change nothing
```

The script `rsync`s `filters/ defaults/ templates/ csl/` (with `--delete`) and then:
- normalizes machine-specific paths in `defaults/*.yaml` — `crossrefYaml` → `${USERDATA}/…`,
  and comments out every `bibliography:` line (the export step injects `--bibliography`; see
  `src/compile/steps/pandoc-export-utils.ts`);
- excludes docs (`*.md`), `.DS_Store`, and personal cover-letter identity assets
  (signature / logo), dropping placeholders + a README so the `cover_letter` preset still builds.

It is idempotent — re-run any time the canonical source changes. `pandoc-assets/` itself is
**gitignored**, so a sync updates the local staging only; publish by zipping `pandoc-assets/` to
the release the `pandocAssetsUrl` points at. Never hand-edit `pandoc-assets/` — change the
canonical vault source and re-sync, or the next sync overwrites your edit.

## Dev

- `npm run dev` builds into `test-longform-vault/.obsidian/plugins/longform-paperbell/` (the folder
  name must equal the manifest `id`); the vault has the `hot-reload` plugin installed.
- `npm run build` runs `svelte-check` + eslint, then a production rollup.
- `npm run test:unit` runs vitest.
