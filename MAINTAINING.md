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

## Dev

- `npm run dev` builds into `test-longform-vault/.obsidian/plugins/longform-paperbell/` (the folder
  name must equal the manifest `id`); the vault has the `hot-reload` plugin installed.
- `npm run build` runs `svelte-check` + eslint, then a production rollup.
- `npm run test:unit` runs vitest.
