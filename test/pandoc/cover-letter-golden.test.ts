import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { ASSETS, hasBin } from "./golden-harness";

/**
 * Owed verification from the change that added a top-level `project:` key to
 * every scaffolded index note (#25, #28).
 *
 * The other three PaperBell workflows open with Strip Frontmatter, so their half
 * is settled by a unit test (`test/compile/steps/strip-frontmatter.test.ts`).
 * **Cover Letter is the exception**: its workflow is a single Run Pandoc Export,
 * so the note's own frontmatter is handed to pandoc as metadata — deliberately,
 * since the `cover_letter` template reads `to:` / `date:` / `manuscript:` from
 * it. That makes it the one place a stray `project:` could surface, so it gets a
 * real pandoc run rather than an argument that it shouldn't.
 *
 * Gated like the response-letter golden: skips without pandoc and the synced
 * assets. LaTeX output only — no xelatex needed.
 */
const COVER_YAML = path.join(ASSETS, "defaults", "cover_letter.yaml");
const present = hasBin("pandoc") && fs.existsSync(COVER_YAML);

/** The scaffolded cover letter note, verbatim in shape, with a project picked. */
const NOTE = [
  "---",
  "longform:",
  "  format: single",
  "  title: Sea Level Memory",
  "  draftTitle: Cover Letter",
  "  workflow: PaperBell Cover Letter",
  "title: Cover letter",
  "manuscript: Sea Level Memory",
  "acronym: SLM",
  "project: ColMemo",
  "date:",
  "to: Dear Editor,",
  "corresponding: Lastname, Firstname (you@example.com)",
  "---",
  "",
  "We are pleased to submit our manuscript for consideration.",
  "",
].join("\n");

describe.skipIf(!present)("cover letter golden (real pandoc)", () => {
  let out = "";
  let tmp = "";

  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "longform-cl-golden-"));
    fs.writeFileSync(path.join(tmp, "Cover Letter.md"), NOTE);

    out = execFileSync(
      "pandoc",
      [path.join(tmp, "Cover Letter.md"), "--defaults=" + COVER_YAML, "-t", "latex"],
      { cwd: tmp, encoding: "utf8" }
    );
  });

  afterAll(() => {
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("reads the note's own frontmatter — the reason this workflow keeps it", () => {
    // Proves the metadata path is live, so the assertion below is not vacuous.
    expect(out).toContain("\\recipient{Dear Editor,}");
    expect(out).toContain("We are pleased to submit our manuscript");
  });

  it("emits nothing for the top-level `project:` key", () => {
    expect(out).not.toContain("ColMemo");
    // Nor the raw key, which would mean the yaml block leaked wholesale.
    expect(out).not.toContain("project:");
  });
});
