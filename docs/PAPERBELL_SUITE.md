# PaperOut in the PaperBell suite (CIMPO) — collaboration & roadmap

PaperOut To-Authors is one plugin in the **PaperBell** suite, which organizes an academic
vault around the **CIMPO** framework. This document explains where PaperOut sits, how it
already exchanges data with sibling plugins, the use cases we want to enable next, and the
concrete roadmap (with change sites) for getting there.

> This is a design/roadmap document, not a description of shipped behavior. Sections marked
> **Today** are live; sections marked **Planned** are not yet implemented.

## CIMPO in one paragraph

CIMPO maps an academic vault onto five numbered stages, each owned by a plugin:

| Stage | Folder | Owner plugin | Job |
| --- | --- | --- | --- |
| **C** — Concepts | `10 - Cards` | Cards Wrangler | Interlinked keyword/entity wiki; a bounded "featured" core vocabulary |
| **I** — Inputs | `20 - Inputs` | Inputs Bell | Normalize papers/books/clippings to carry `keywords` |
| **M** — Metadata | `30 - Metadata` | (Project Manager, host) | Scholars, institutions, grants — the "ledger" of people/place/time |
| **P** — Projects | `40 - Projects` | Project Manager | Long-cycle projects, anchored on featured concepts |
| **O** — Outputs | `50 - Outputs` | **PaperOut To-Authors** | Drafts and formal longform → deliverables |

The intended flow is a directed pipeline: Inputs → concept entries → *featured* concepts →
Projects and Outputs, with Metadata retrieved throughout. **PaperOut owns the Output end.**
The host plugin (`paperbell`) sits across all of them, dispatching LLM calls centrally
(keys never touch sub-plugins) and providing the shared UI language.

## How PaperOut collaborates today

**File- and frontmatter-mediated (works with or without the host):**

- A paper project is a folder of four drafts sharing one `metadata.json`
  ([PAPER_PROJECT.md](./PAPER_PROJECT.md)). Any sibling that reads the vault can discover a
  paper's parts from the project index frontmatter and `metadata.json`.
- Outputs are meant to link back to their project (`project: <acronym>`) and to select
  `concepts:` — the hooks by which Project Manager counts deliverables and Cards Wrangler
  reverse-queries "outputs around this concept". PaperOut writes manuscripts; these
  conventions live in the notes.
- Compile writes stable JSON sidecars (`manuscript-lines.json`, `figure-numbers.json`, …)
  and a PDF at a predictable path ([MANUSCRIPT_REFS.md](./MANUSCRIPT_REFS.md)).
- The Pandoc toolchain is pulled on demand from **paperout-assets-market**
  ([PANDOC_EXPORT.md](./PANDOC_EXPORT.md)).

**Host-mediated (when `paperbell` is installed):**

- PaperOut registers with the host and **follows its UI language**; it reads account status
  and host capabilities ([PAPERBELL_INTEGRATION.md](./PAPERBELL_INTEGRATION.md)).

**The gap:** PaperOut currently sits somewhat isolated at the Output end. It does **not** yet
consume the concept network, the scholar/publication ledger, or a shared citation source; and
it does **not** publish its own data/events onto the PaperBell bus for siblings to consume.
Closing that gap is the roadmap below.

## Use cases we want to enable

1. **Concept-driven writing / material retrieval.** While drafting, you select `featured`
   concepts in the manuscript's `concepts:`; PaperOut surfaces the Inputs/papers that carry
   those concepts (via Cards backlinks) as candidate citations and background — realizing the
   framework's intended "writing-material retrieval" and closing the Output→Concepts loop.
2. **Author pre-fill.** New-paper scaffolding pre-fills `metadata.json` `creators` /
   `corresponding` from an explicit **co-author list** instead of hand-typing. (Deliberately
   *not* the "scholars you track" pool — tracking others ≠ manuscript authorship.)
3. **Publication-list automation.** Turn the lab's Zotero → `Author+an` corresponding-author →
   LaTeX `publist` workflow into a PaperOut "publication list" export, so a CV/《发表列表》
   regenerates from the bibliography with corresponding/co-first markers.
4. **Citations via Zotero / Cards.** Resolve `[@citekey]` and produce `references.bib` from
   Zotero (Better BibTeX) or from Cards Wrangler's citekey footnotes, instead of a
   hand-maintained `.bib`.
5. **Deliverables to Project Manager.** PaperOut publishes a read API / events so Project
   Manager can count a paper's drafts and compile status as a project deliverable, and a
   review-tracking sibling can read the harvested sidecars.
6. **Compile-finished hooks.** A "compile finished" event triggers downstream packaging /
   submission, or a `results.json` refresh from an analysis plugin.

## Roadmap

Prioritized around three directions. Each item names the **change sites** so the work is
ready to pick up.

### Direction 1 — Consume concept / scholar / publication data

- **Pre-fill authors into `metadata.json`.** Source an explicit co-author list (host-provided
  or a designated note) at scaffold time.
  Change sites: `src/model/scaffold/paperbell-scaffold.ts` (`mainMetadata`/`supplementaryMetadata`),
  `src/model/metadata-resolver.ts`, `src/view/project-lifecycle/new-paper-modal/`.
- **Material/citation suggestions from concepts.** Read the manuscript's `concepts:` and
  reverse-query Cards (or ask the host) for related Inputs/papers as candidate `[@cite]`s.
  Change sites: a new read path near compile/authoring; optionally a host query.
- **Publication-list export workflow.** A new compile workflow that renders a highlighted
  publication list, reusing the multi-bib merge already in Pandoc export.
  Change sites: `src/compile/index.ts` (`DEFAULT_WORKFLOWS`), `src/compile/steps/pandoc-export.ts`.

### Direction 2 — Expose our data / events to siblings

- **Subscribe to `paperbell:plugins-changed`.** The event constant is vendored but never
  subscribed; wire it like the existing `onConfigChange` so capabilities/settings refresh as
  siblings load/unload. Change sites: `src/paperbell/client.ts` (`onHostReady`).
- **Publish events + a read API.** Emit on the PaperBell bus when a compile finishes, sidecars
  are written, or a project is scaffolded; register a small read API (enumerate
  projects/drafts/compile status) alongside the existing private `LongformAPI`.
  Change sites: `src/main.ts` (onload), `src/api/LongformAPI.ts`,
  `src/compile/steps/harvest-manuscript-lines.ts` (emit point after sidecars are written).
- **Document the sidecars as a contract.** Promote `manuscript-lines.json` /
  `figure-numbers.json` / `table-numbers.json` to a documented cross-plugin read surface (their
  shape is in [MANUSCRIPT_REFS.md](./MANUSCRIPT_REFS.md)).

### Direction 3 — Citation / Zotero interop

- **Bibliography resolver extension.** Let `resolveBibliography` also pull a `.bib` / citekeys
  from Zotero (Better BibTeX export, incl. the `Author+an` corresponding-author convention) or
  from Cards Wrangler citekey footnotes.
  Change sites: `src/compile/steps/pandoc-export.ts` (`resolveBibliography`),
  settings in `src/view/settings/LongformSettings.ts`, and `src/commands/manuscript-refs-utils.ts`
  for a citekey picker.
- **(Adjacent) Protected asset downloads.** For paid/gated toolchain assets, gate
  `requestProtectedDownloadTicket` on `requestActivationInfo` (both already wrapped on the
  client). Change site: `src/model/pandoc-assets.ts` (the download path) and the market UI.

## Cross-cutting recommendations

- **De-duplicate the host contract.** The IPC contract (`shared-config.ts`) is copy-pasted
  across the sibling plugins and has begun to drift. A single published contract package would
  stop the drift; PaperOut already vendors its copy with a documented sync policy
  ([MAINTAINING.md](../MAINTAINING.md)) that could seed it.
- **Disambiguate host builds.** Two different host builds both report `0.4.4`. Encourage the
  host to bump `version` / `schemaVersion` when the API surface changes, so consumers can gate
  reliably.

## See also

- [PAPERBELL_INTEGRATION.md](./PAPERBELL_INTEGRATION.md) — the host handshake and scopes.
- [PAPER_PROJECT.md](./PAPER_PROJECT.md) — the paper project scaffold and layout.
- [MANUSCRIPT_REFS.md](./MANUSCRIPT_REFS.md) — sidecars and response-letter sync.
- [METADATA_AND_PLACEHOLDERS.md](./METADATA_AND_PLACEHOLDERS.md) — `metadata.json` and `{{ }}`.
