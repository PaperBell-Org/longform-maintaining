# Proposal to the PaperBell host: a `projects` scope

**Status:** proposal. Nothing here is implemented by any shipped host. PaperOut has
vendored the types (`src/paperbell/shared-config.ts`, marked as a proposal) and gates
every call on capability detection, so this document can be reviewed, changed, or
rejected without breaking anything on our side.

**Why:** PaperOut writes an academic paper into `50 - Outputs`, but nothing in the note
said which project the paper belongs to, so Project Manager could not recognize it as a
project deliverable. As of this change, the **New PaperBell paper project…** modal asks
for the project and writes it into every draft's frontmatter. What it offers in that
dropdown is what this proposal is about.

---

## 1. The frontmatter convention matters more than the API

This is the request we most want an answer to, and it does not depend on any code you
ship.

Today PaperOut writes, at the top level of each draft index note:

```yaml
---
longform:
  format: scenes
  title: Sea Level Memory
  draftTitle: Main Manuscript
  workflow: PaperBell Manuscript
  sceneFolder: manuscript
  scenes:
    - introduction
    - methods
    - results
  ignoredFiles: []
project: ColMemo
---
```

`project: <acronym>`, a plain string — following the convention already written down in
[PAPERBELL_SUITE.md](./PAPERBELL_SUITE.md). **If Project Manager actually queries
something else, tell us before this reaches users.**

The main alternative is a wikilink (`project: "[[40 - Projects/ColMemo]]"`), which buys
native backlinks and survives renaming the project note — genuinely better properties.
Changing our writer is one line; migrating notes already on users' disks is not. So the
cost of getting this wrong grows with every release.

**A way to not have to decide centrally:** return a `frontmatterValue` field on each
project and PaperOut will write it verbatim. Then the authority over the interop format
lives in Project Manager, where it belongs, and we never have to re-agree on it.

## 2. One paper is up to four notes — dedupe by `longform.title`

A PaperBell paper project can contain a Main Manuscript, a Supplementary, a Response
Letter, and a Cover Letter. Each is its own note with its own frontmatter, and **each
carries the same `project:` value**. We chose that deliberately: a supplementary or a
response letter is genuinely part of the project's output, and opening any one of them
should show what it belongs to.

The consequence for you: counting notes counts one paper up to four times. Two ready-made
dedupe keys:

- `longform.title` — identical across all drafts of one paper (that is precisely what
  groups them into a project in our model);
- `_longform.acronym` in the paper folder's `metadata.json` — the paper's own acronym.

Note that `_longform.acronym` (e.g. `SLM`, this *paper's* code, used for PDF filenames)
and `project` (e.g. `ColMemo`, the *project's* code) are different things. We keep them
visibly separate in our UI; worth doing the same in yours.

## 3. The `projects` scope

Vendored verbatim in `src/paperbell/shared-config.ts`.

```ts
export const PPB_PROJECTS_CHANGED_EVENT = "paperbell:projects-changed";

export interface PPBProject {
  id: string;          // 稳定 id,重命名 / 移动后不变
  name: string;        // 展示名
  acronym?: string;    // 写入 `project:` 的值;同 vault 内须唯一
  notePath?: string;   // 项目笔记路径(可选)
  status?: "active" | "planned" | "paused" | "done" | "archived";
  folder?: string;     // 项目根文件夹(可选)
  concepts?: string[]; // 关联的 featured concepts(可选)
}

export interface PPBProjectsQuery {
  status?: NonNullable<PPBProject["status"]>[];  // 缺省 ["active", "planned"]
  query?: string;
}

export interface PPBProjectsResult {
  ok: boolean;
  projects: PPBProject[];
  error?: string;
}

// on PPBClient:
requestProjects?(params?: PPBProjectsQuery): Promise<PPBProjectsResult | null>;
onProjectsChange?(cb: () => void): () => void;
```

Three requests about the data:

1. **`id` must be stable across renames and moves.** A vault path does not satisfy this.
   We display `name`, write `acronym`, and would use `id` for the reverse reporting in
   §6. If the only stable handle you have is the path, say so and we will not build
   anything on `id`.
2. **`acronym` must be unique within a vault.** Two projects sharing one acronym write
   the same `project:` value, and deliverable attribution silently becomes wrong. If you
   cannot guarantee uniqueness, drop `acronym` from the contract and give us
   `frontmatterValue` (§1) instead — one authoritative string per project.
3. **Please make consent cheap for this scope.** Nothing here is sensitive: project names
   and acronyms are visible to the user in their own vault. As a consent-gated scope, the
   user gets a permission dialog the first time they create a paper — friction with no
   security benefit. Either mark it low-friction, or fold it into the existing `config`
   scope.

**One concrete consequence of the consent gate.** We call `requestProjects()` when the
new-paper modal opens, and the contract gives us no way to cancel a pending request. If the
user closes the modal while your permission dialog is up, that dialog **outlives the modal**
— it appears orphaned, asking about a field that is no longer on screen. Two ways out, either
is fine:

- a consent-free probe (e.g. `hasProjects(): boolean`, or simply advertising a count in
  `getPluginInfo()`) so we only trigger the real prompt when there is something to show; or
- an `AbortSignal` parameter on `requestProjects`, so a closing modal can withdraw the ask.

Making the scope low-friction (above) also dissolves this, since there would be no dialog to
strand.

## 4. `paperbell:projects-changed`

Same semantics as the existing `paperbell:config-changed`. Without it we re-fetch every
time the modal opens; with it we can hold a list and refresh on change. Lower priority
than §3 — the feature works without it.

## 5. Version discipline

`MAINTAINING.md` already records that two different host builds both reported `0.4.4`.
When you add this API surface, please also bump `PaperBellPluginInfo.version` **and** add
`"projects"` to `capabilities`.

Our detection deliberately ignores the version string and checks two things:

```ts
capabilities.includes("projects") && typeof client.requestProjects === "function"
```

So **`capabilities` has to be honest** — advertising a scope you do not implement is the
one failure mode that reaches a user (we handle it without throwing, but the dropdown
silently stays a text field). Bumping `schemaVersion` is optional for this change since
it is backward-compatible; if you do bump it, we will re-vendor and realign
`PPB_SCHEMA_VERSION` on our side.

## 6. The reverse direction (next round — not blocking this one)

The contract is currently one-way: sub-plugins consume, and there is no publish path.
`PPBRequestSource` has no field through which a sub-plugin can expose its own API, so
today there is no way for Project Manager to ask us "what deliverables does this project
have, and how far along is each one?" other than reaching into
`app.plugins.plugins["longform-paperbell"].api` directly.

Two ways to close it — **we are happy with either, please pick one**:

- **Registry**: let `registerPPBplugin` accept an `api` field, and let the host hand a
  sibling's API to another sub-plugin on request. Generic, and solves this for every
  pair of plugins at once.
- **Bus**: give the host an `emit(event, payload)` and let us broadcast
  `paperout:deliverable-changed` when a project is scaffolded and when a compile
  finishes. Simpler, push-based, no query surface to design.

Until one exists, Project Manager can only scan frontmatter — which is exactly why §1
and §2 are the parts of this document that need an answer first.

## See also

- [PAPERBELL_INTEGRATION.md](./PAPERBELL_INTEGRATION.md) — the handshake and scopes as
  they exist today.
- [PAPERBELL_SUITE.md](./PAPERBELL_SUITE.md) — where PaperOut sits in CIMPO and the
  wider collaboration roadmap.
- [PAPER_PROJECT.md](./PAPER_PROJECT.md) — what a paper project is made of.
