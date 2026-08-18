# PaperBell host integration

PaperOut To-Authors is part of the **PaperBell** suite, but it is **standalone-first**:
every host-backed feature degrades to a no-op when the PaperBell main plugin is not
installed. When the host *is* present, this plugin registers with it and lights up a few
extras — today, following the host's UI language and showing your account status.

This document describes what that integration does, what it consumes, and how it fails
safe. The contract itself is a **vendored copy** of PaperBell's IPC surface; see
[MAINTAINING.md → "PaperBell relationship"](../MAINTAINING.md) for the sync policy.

## The handshake

The host plugin (`app.plugins.plugins["paperbell"]`) exposes an `api` object and, on **every**
load, fires a `paperbell:ready` workspace event carrying that API. Load order between the two
plugins is unspecified, so our client (`src/paperbell/client.ts`) covers both cases:

1. **Probe** for `app.plugins.plugins["paperbell"].api` immediately, and
2. **Stay subscribed** to `paperbell:ready` for as long as we are loaded.

Registration calls `host.registerPPBplugin({ id, name, description, icon, onOpen })`. Our
`onOpen` deep-links back to this plugin's own settings tab, so PaperBell's settings can show a
"PaperOut" entry card that opens our settings. On plugin unload we call `unregister()` and
reset our store.

### Why the listener is permanent

The handle `registerPPBplugin()` returns is bound to *that* load of the host. When PaperBell
updates — or is disabled and re-enabled — the handle survives as an object but goes inert:
since host 0.4.7 every `request*` on it resolves to `null` (deliberately, instead of throwing
something cryptic) and its `onConfigChange` push is gone.

So `attach()` runs on each ready event, not just the first: it releases the old handle
(`unsubscribe` + `unregister`, both wrapped — they reach into a host that may already be gone),
registers again, re-reads capabilities, and re-subscribes. Two details make the recovery
invisible to the user:

- the last known config is **kept** — across the reconnect, and even if re-registering fails —
  so the UI doesn't flip back to the fallback language for the split second before a fresh one
  arrives. Only unloading our plugin clears it; and
- **on a reconnect only**, if `listGrants()` says the user already granted `config`, we refetch
  it. The grant outlived the reload, so that costs no consent prompt, and it is how we notice a
  language the host changed while our handle was dead. A first connect stays scope-free — see
  *Deferred consent* under **Scopes** below.

Note there is no "same host object, skip the handshake" shortcut. Whether a reloaded host hands
back a fresh `api` is its business, and guessing wrong would leave us on a dead handle forever —
the exact bug this replaced. A redundant re-register costs one `unregister()` and one
`registerPPBplugin()`; we never hold two at once.

Guarding against a "double connect" here instead — the shape this code had before host 0.4.7 —
is what makes a plugin silently stop following the host after the first PaperBell update.

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
| `projects` | the host's project list, for linking an output to its project | **Proposed** — consumed by the new-paper modal, but no shipped host implements it |

### Deferred consent (and what it costs)

We deliberately request **no** scopes at startup — that would trigger a consent prompt on
every launch. Only `plugin-info` (which needs no consent) is read eagerly to learn the
host's `capabilities`; everything else is requested lazily on an explicit user action.

Since host 0.4.7 a plugin's card only appears in PaperBell's own settings page once it
**holds at least one scope** — registering is no longer enough. Combined with the above,
that means a user who has never pressed **Connect / Refresh** (and never used a host-backed
feature) won't see PaperOut listed there. We accept that: a consent dialog on every launch is
a worse trade than a card that appears the moment the integration is actually used. Once any
scope is granted the card shows up and stays, reload after reload.

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

### Link a new paper to its project

The **New PaperBell paper project…** modal asks which PaperBell project the paper is a
deliverable of, and writes the answer as a top-level `project:` key in the frontmatter of
**every** draft index note it creates:

```yaml
---
longform:
  format: scenes
  title: Sea Level Memory
  draftTitle: Main Manuscript
  ...
project: ColMemo
---
```

That key is the hook Project Manager uses to count a project's outputs. `metadata.json` is
deliberately left alone — it stays pure publication metadata. Note that `project` (the
*project's* acronym) and `_longform.acronym` (this *paper's*, used for PDF filenames) are
different values; the modal labels them distinctly for the same reason.

Where the dropdown's contents come from, in order:

1. **Host list** — `fetchProjects()` calls the proposed `requestProjects` (scope:
   `projects`) and the field becomes a dropdown of real projects. Gated on
   `capabilities.includes("projects")` **and** `typeof client.requestProjects === "function"`:
   capabilities can be stale, and an older host's handle simply has no such method.
2. **Free text** — every other case. Host absent, host too old, consent denied, host-side
   error, or an empty list all return `null` from `fetchProjects`, and the field stays the
   plain text box it was built as. The fetch is fire-and-forget, so creating a paper never
   waits on — or fails because of — PaperBell.

Leaving the field empty omits the key entirely rather than writing an empty `project:`,
which a sibling querying frontmatter would read as a null association.

The contract for `projects` is a **proposal**, not something any host ships today; it is
vendored (and marked as such) in `src/paperbell/shared-config.ts` and written up for the
host team in [PROPOSAL_PROJECTS_SCOPE.md](./PROPOSAL_PROJECTS_SCOPE.md).

## Failing safe (standalone mode)

- No host → client stays disconnected; `connected` is `false`, `config` is `null`,
  `capabilities` is `[]`.
- Every `fetch*` / `request*` helper on `PaperBellClient` returns `null` when disconnected,
  so callers can treat "host absent" and "scope denied" identically — and, for the window
  between a host reload and the ready event that heals it, "host restarting" too.
- Language falls back to Obsidian's UI language; account UI shows "not connected".
- Nothing about compiling, scaffolding, or Pandoc export depends on the host.

## Contract & versioning

The IPC types live in `src/paperbell/shared-config.ts`, a zero-dependency vendored copy of
PaperBell's contract, pinned to `PPB_SCHEMA_VERSION`. If the host advertises a **newer**
schema version than we vendored, the client logs a warning (it does not break). When the
host bumps its schema, re-vendor this file and reconcile the check — the procedure and a
decoupled conformance test are described in [MAINTAINING.md](../MAINTAINING.md).

It currently tracks host **0.4.7** (`PPB_SCHEMA_VERSION = 2`). The v1 → v2 bump narrowed the
*broadcast* `paperbell:config-changed` payload to a public language/profile layer; the directed
`onConfigChange` push we consume still carries the restricted config, so nothing we read moved.

One block of that file is **ours, not upstream's**: the proposed `projects` scope, flagged
in the file header. `PPB_SCHEMA_VERSION` tracks the host's number and nothing else — raising
it for a proposal would silence the "host schema is newer than vendored" warning for a real
upstream bump. Feature detection never reads the schema version anyway; it reads capabilities
and checks the method exists.
