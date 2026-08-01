# PaperBell host integration

PaperOut To-Authors is part of the **PaperBell** suite, but it is **standalone-first**:
every host-backed feature degrades to a no-op when the PaperBell main plugin is not
installed. When the host *is* present, this plugin registers with it and lights up a few
extras — today, following the host's UI language and showing your account status.

This document describes what that integration does, what it consumes, and how it fails
safe. The contract itself is a **vendored copy** of PaperBell's IPC surface; see
[MAINTAINING.md → "PaperBell relationship"](../MAINTAINING.md) for the sync policy.

## The handshake

The host plugin (`app.plugins.plugins["paperbell"]`) exposes an `api` object and, on load,
fires a one-shot `paperbell:ready` workspace event carrying that API. Load order between
the two plugins is unspecified, so our client (`src/paperbell/client.ts`) covers both cases:

1. **Probe** for `app.plugins.plugins["paperbell"].api` immediately, and
2. **Listen once** for `paperbell:ready` in case the host loads after us.

Whichever fires first wins; a guard prevents double-registration. Registration calls
`host.registerPPBplugin({ id, name, description, icon, onOpen })`. Our `onOpen` deep-links
back to this plugin's own settings tab, so PaperBell's settings can show a "PaperOut" entry
card that opens our settings. On plugin unload we call `unregister()` and reset our store.

If no host is found, the client simply stays disconnected and every method below returns
`null` — the rest of the plugin never notices.

## Scopes

The host exposes seven independently consent-gated **scopes**. Each `request*` call prompts
the user the first time it touches a scope; approval is remembered, denial returns `null`.

| Scope | What it grants | Consumed today? |
| --- | --- | --- |
| `plugin-info` | host id/version/capabilities (consent-free) | **Yes** — read at connect to populate capabilities |
| `config` | public, key-free shared config (language, LLM provider metadata, account) | **Yes** — language following + settings button |
| `account` | account display name / plan / activation | **Yes** — shown in settings |
| `llm-invoke` | host runs one completion; the API key never leaves the host | Wired, not yet used by a feature |
| `llm-credentials` | full LLM credentials **including the API key** (for streaming) | Wired, not yet used by a feature |
| `activation` | license / activation status | Wired, not yet used by a feature |
| `download-ticket` | a ticket for a protected download | Wired, not yet used by a feature |

We deliberately request **no** scopes at startup — that would trigger a consent prompt on
every launch. Only `plugin-info` (which needs no consent) is read eagerly to learn the
host's `capabilities`; everything else is requested lazily on an explicit user action.

## What the integration does today

### Follow the host's language

The active UI locale is resolved in `src/i18n/controller.ts` (`resolveLocale`) with a strict
priority:

1. an explicit user preference (`en` / `zh`) in this plugin's settings **always wins**;
2. otherwise (`auto`) follow the connected host's `config.language`;
3. otherwise fall back to Obsidian's own UI language.

`startLocaleSync()` derives this from both the plugin settings store and the `paperbell`
store, so switching the host's language live re-renders our UI when your preference is
`auto`. Subscribing to the host's `paperbell:config-changed` event (via `onConfigChange`)
keeps the public config — and therefore the language — fresh without any consent prompt.

### Show account status & gate future AI features

At connect we read `getPluginInfo().capabilities` into the `paperbell` store
(`src/paperbell/store.ts`: `{ connected, config, capabilities }`). The settings tab
(**PaperBell host integration** section) shows the connection status, the account
display name/plan, a **Connect / Refresh** button that calls `requestSharedConfig()`, and
an "AI available" hint gated on `capabilities.includes("llm-invoke")`.

> The `requestCompletion` / `requestLLMCredentials` / `requestActivationInfo` /
> `requestProtectedDownloadTicket` wrappers exist on the client but are not yet called by
> any feature — they are the seams for the roadmap in
> [PAPERBELL_SUITE.md](./PAPERBELL_SUITE.md).

## Failing safe (standalone mode)

- No host → client stays disconnected; `connected` is `false`, `config` is `null`,
  `capabilities` is `[]`.
- Every `fetch*` / `request*` helper on `PaperBellClient` returns `null` when disconnected,
  so callers can treat "host absent" and "scope denied" identically.
- Language falls back to Obsidian's UI language; account UI shows "not connected".
- Nothing about compiling, scaffolding, or Pandoc export depends on the host.

## Contract & versioning

The IPC types live in `src/paperbell/shared-config.ts`, a zero-dependency vendored copy of
PaperBell's contract, pinned to `PPB_SCHEMA_VERSION`. If the host advertises a **newer**
schema version than we vendored, the client logs a warning (it does not break). When the
host bumps its schema, re-vendor this file and reconcile the check — the procedure and a
decoupled conformance test are described in [MAINTAINING.md](../MAINTAINING.md).
