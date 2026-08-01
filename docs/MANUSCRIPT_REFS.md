# Manuscript references & response-letter sync

A revision cycle means writing a **response letter** that quotes your manuscript — "on
page 4, line 12 we now state…", "see Figure 2". Those page/line/figure numbers change every
time you edit the manuscript. PaperOut keeps them in sync automatically: you **mark** spans
in the manuscript, **reference** them in the response letter, and a compile-time **harvest**
resolves each reference to the manuscript's current numbers.

This is the mechanism behind the scaffold's Response Letter draft (see
[PAPER_PROJECT.md](./PAPER_PROJECT.md)).

## The three pieces

1. **Spans in the manuscript** — an HTML-comment marker wrapping the text you may cite:

   ```markdown
   <!--ms:intro-gap-->We show that X closes the gap Y.<!--/ms:intro-gap-->
   ```

   Authored with the **Mark Manuscript Span** command (`markManuscriptSpan`), which wraps the
   current selection as `<!--ms:<id>-->…<!--/ms:<id>-->` (`src/commands/manuscript-refs-utils.ts`).
   Because it's an HTML comment, it is invisible in reading mode and dropped from the PDF.

2. **References in the response letter** — a fenced block naming a span or a figure label:

   ````markdown
   ```manuscript
   @intro-gap
   ```
   ````

   Authored with **Insert Manuscript Reference** (`insertManuscriptRef`), which inserts
   ```` ```manuscript\n@<id>\n``` ````. Use the span id (`@intro-gap`) to pull the quoted text
   and its Page/Line, or a figure/table label (`@fig:demo`) to pull its number. You can also
   reference a figure inline with `\ref{fig:demo}`.

3. **Harvested sidecars** — after the manuscript PDF is built, the **Harvest Manuscript Line
   Numbers** step (`harvest-manuscript-lines`) runs a *second* Pandoc→XeLaTeX pass with line
   labels turned on and captures the numbers into JSON files at the project root.

## The sidecar files

The harvest step (`src/compile/steps/harvest-manuscript-lines.ts`,
`…-utils.ts`) writes sorted-key JSON (stable diffs) into the project folder:

| File | Shape | Source |
| --- | --- | --- |
| `manuscript-lines.json` | span id → `{ sline, eline, page }` (start/end line + page) | main manuscript |
| `si-lines.json` | span id → `{ sline, eline, page }` | supplementary (when compiling SI) |
| `figure-numbers.json` | label → number (`"1"` / `"S1"`) | `\ref{fig:…}` labels |
| `table-numbers.json` | label → number (`"1"` / `"S1"`) | `\ref{tbl:…}` labels |

The line entries store **numbers only** — the quoted text itself is pulled from the current
manuscript source at compile time, so it never goes stale. `manuscript-lines.json` vs
`si-lines.json` is chosen by whether the draft is supplementary, so a response letter can
cite both the main text and the SI with correct numbering.

## Compile order (why it matters)

The numbers only exist **after** the manuscript is compiled, so:

> **Compile the Main Manuscript (and Supplementary, if you cite it) first, then the Response
> Letter.**

The `PaperBell Manuscript` / `PaperBell Supplementary` workflows end with the harvest step;
the `PaperBell Response Letter` recipe reads the sidecars and substitutes each
```` ```manuscript ```` reference with the manuscript's current quoted text + Page/Line box
(for a span) or figure/table number (for a label). The **Compile All Drafts** board lets you
drag rows into this order and runs them serially.

Two requirements the workflows already satisfy:

- The manuscript's `remove-comments` step keeps HTML comments
  (`remove-html-comments: false`) so the `<!--ms:-->` markers survive to the harvest pass.
- Harvest is **desktop-only** (it shells out to Pandoc/XeLaTeX) and leaves the manuscript
  note unchanged — it only writes the sidecars.

## Where the substitution happens

This plugin owns the **authoring** (span/reference commands) and the **harvest** (writing the
sidecars). The actual `@id` → Page/Line box / figure-number substitution in the PDF is done
by the **response-letter recipe** (a Lua filter + template) from the Pandoc asset market,
which reads these sidecar files at compile time — so install the **Response Letter** bundle
before compiling one. See [PANDOC_EXPORT.md](./PANDOC_EXPORT.md).

## As a cross-plugin contract

The sidecars are plain, stable JSON at a predictable location. That makes them a natural
read surface for other tools — e.g. a review-tracking sibling that wants to show which
manuscript spans a response letter cites, or figure numbering across the project. Publishing
these as a documented contract (and emitting an event when they're written) is on the
roadmap in [PAPERBELL_SUITE.md](./PAPERBELL_SUITE.md).
