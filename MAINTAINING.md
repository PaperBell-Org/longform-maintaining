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
  `paperbell-shared-config.ts` (zero-dependency by design). The host's plugin repo publishes
  binaries and docs, not sources, so the thing you actually vendor from is **"附录 A —— 完整契约声明"
  in its [README-ZH](https://github.com/PaperBell-Org/Obsidian-PaperBell-Plugin/blob/main/README-ZH.md)**.
  Our type names match that appendix verbatim so each re-vendor is a readable diff.
- It is pinned to `PPB_SCHEMA_VERSION`. When PaperBell bumps its schema, **re-vendor** the file and
  update the compatibility check.
- ⚠️ **Re-vendoring overwrites our proposal block.** A straight copy from upstream — for *any*
  reason, not just a projects-related one — deletes the `projects` additions below and breaks
  `src/paperbell/client.ts` and the new-paper modal. After every re-vendor, either re-apply that
  block or, if upstream has adopted it, reconcile the two and drop the proposal marker. `npm run
  lint` catches the breakage, but only if you run it.
- One block of that file is **not** vendored from upstream: the proposed `projects` scope, flagged
  as such in the file header and written up in
  [docs/PROPOSAL_PROJECTS_SCOPE.md](./docs/PROPOSAL_PROJECTS_SCOPE.md). Its client methods are
  declared **optional** and every caller checks `capabilities` *and* `typeof method === "function"`,
  so it stays inert against every host that exists today. `PPB_SCHEMA_VERSION` tracks the **host's**
  number and nothing else — never bump it for a proposal, or the newer-schema warning goes quiet for
  a real upstream bump. When the host ships it, re-vendor as usual and delete the proposal marker.

### Contract conformance (verified against PaperBell 0.4.7)

The real host's `install()` does exactly what our client assumes:
`this.plugin.api = api` (so `app.plugins.plugins["paperbell"].api` works), `window.registerPPBplugin = api.registerPPBplugin`, then `workspace.trigger("paperbell:ready", api)`. Its `getPluginInfo()`
returns `schemaVersion: 2` and
`capabilities: ["account","config","plugin-info","llm-invoke","llm-credentials","activation","download-ticket"]`
— matching our vendored `PPB_SCHEMA_VERSION` and feature gating. We depend ONLY on this handshake
contract, never on PaperBell's main features (which change independently).

What 0.4.7 changed, and how we answer it (upstream's own
[MIGRATION-0.4.7.md](https://github.com/PaperBell-Org/Obsidian-PaperBell-Plugin/blob/main/MIGRATION-0.4.7.md)):

| Host change | Us |
| --- | --- |
| `app.plugins.plugins["paperbell"]` now exposes only `api` + `settings`; every internal object is private | Nothing to do — we only ever read `.api`, and never `plugin.settings` |
| `settings.pluginGrants` is no longer a writable array (it was a real privilege-escalation hole) | Nothing to do — we never forged grants; consent has always been the normal flow |
| A handle from a **previous** host load goes inert: every `request*` returns `null`, no throw | **Fixed here.** `client.ts` re-handshakes on every `paperbell:ready` instead of guarding against a second connect |
| `llm.baseUrl` / `llm.model` are now *effective* values (no trailing slash, defaults filled in) | Nothing to do — no feature builds a URL from them yet. When one does, still strip trailing slashes defensively |
| Only plugins **holding at least one scope** get a card in PaperBell's settings | Accepted deliberately — see "Deferred consent" in [docs/PAPERBELL_INTEGRATION.md](./docs/PAPERBELL_INTEGRATION.md) |

Schema `1` → `2` narrowed the *broadcast* payload (`paperbell:config-changed`) to a public
language/profile layer; the per-client `onConfigChange` push we actually consume still carries the
restricted config, so the vendored types and the thin `PaperBellClient` wrappers stay as they were,
plus the optional `profile` / `cimpoFolders` / completion-quota fields 0.4.7 added.

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
5. **Reload recovery** (the 0.4.7 case): with both plugins running, disable and re-enable *PaperBell*
   only. The console must log `[PaperOut] Reconnected to PaperBell host after it reloaded.`, our
   settings section must still read *Connected*, and switching PaperBell's language must still
   re-render our UI — all without touching our plugin.

An **automated, decoupled** guard also runs in the test suite: `test/paperbell/host-conformance.test.ts`
statically checks that any bundle present at that path still exposes the handshake surface (events,
api/client methods, capabilities). It only reads the text — it never boots PaperBell's main features —
and skips entirely when no bundle is installed.

## Release process

- Beta channel: install via [BRAT](https://github.com/TfTHacker/obsidian42-brat) against this repo;
  BRAT reads `manifest-beta.json`.
- **Normal path — merge the release PR.** Every push to `main`,
  `.github/workflows/release-please.yml` recomputes the next version from the conventional commits
  since the last tag and keeps a `chore(main): release <version>` PR open, containing the bumped
  `package.json` / `manifest.json` / `manifest-beta.json` and a generated `CHANGELOG.md`. Merging
  that PR *is* the release: it tags, publishes the GitHub release, attaches `main.js`,
  `manifest.json`, `styles.css`, and appends the `versions.json` entry. Merging any other PR never
  cuts a version.
- **Write commit subjects release-please can read.** `fix:` → patch, `feat:` → minor, `!` or a
  `BREAKING CHANGE:` footer → major — all within the prerelease line configured in
  `release-please-config.json` (currently `2.4.0-beta.N`). To pin a version by hand, put
  `Release-As: 2.5.0` in a commit body. To graduate the beta line to a stable `2.4.0`, drop
  `"prerelease": true` (and `"versioning": "prerelease"`) from that config in the same PR.
- **Manual path — push a tag.** `npm version <x.y.z[-beta.N]>` → `version-bump.mjs` syncs
  `manifest.json` + `versions.json` (and `manifest-beta.json`) → push the tag.
  `.github/workflows/release.yml` verifies the tag equals the manifest version and publishes the
  same three files. A `-` in the tag marks it a GitHub prerelease. Use this only when you need a
  release the commit history would not produce; afterwards set `.release-please-manifest.json` to
  the version you published, or release-please will keep proposing it.
- Keep `manifest.json`, `manifest-beta.json`, and `package.json` versions in sync — both release
  workflows fail the build if the tag and `manifest.json` disagree.

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

### Testing modules that import `obsidian`

The `obsidian` package ships types only (`"main": ""`), so any module with a
*value* import from it — even just `normalizePath` — cannot be loaded under
vitest. That is why pure logic here is conventionally split into `*-utils.ts`
siblings, which is still the preferred shape: it keeps the seam visible.

`vitest.config.ts` aliases `obsidian` to `test/mocks/obsidian.ts` so the compile
core itself can be tested directly. Keep that stub thin — add an export when a
test needs one, and reach for the `*-utils.ts` split before growing fake Obsidian
behavior in it.
