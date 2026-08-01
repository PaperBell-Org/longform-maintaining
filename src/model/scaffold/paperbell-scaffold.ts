import {
  EXAMPLE_FIGURE_PNG_BASE64,
  EXAMPLE_DATA_XLSX_BASE64,
} from "./assets";
import {
  json,
  PAPER_PARTS,
  type PaperPartId,
  type PartContext,
  type ScaffoldFile,
} from "./parts";

export type { ScaffoldFile } from "./parts";

/**
 * Pure logic for the "New PaperBell paper" scaffold — the project skeleton
 * mirroring test-longform-vault/paperbell-minimal, but neutral starter content
 * instead of the regression-fixture prose. Side-effect free and unit tested; the
 * modal writes the returned files to the vault.
 *
 * The parts themselves (Main Manuscript, Supplementary, Cover Letter, Response
 * Letter) live in `./parts`, so that adding one to an existing project runs the
 * same builder. This module owns what is *not* a part: the shared metadata every
 * project needs, and the optional example bundle. Every path is relative to the
 * project folder.
 */

export interface ScaffoldOptions {
  /** Project title — also the enclosing folder name and Longform project id. */
  title: string;
  /** Short acronym for the PDF name / labels. Defaults to initials of `title`. */
  acronym?: string;
  /**
   * Which parts to create. Required, with no default: the whole point of the
   * option is that the file set follows the selection, and a default would leave
   * a path that silently reproduces the old always-everything behavior.
   * Must contain "main" — {@link buildPaperbellScaffold} rejects anything else.
   */
  parts: readonly PaperPartId[];
  /**
   * Include the example figure/table assets and the project README. Required for
   * the same reason as `parts`; body text adapts to it.
   */
  examples: boolean;
}

/**
 * Stand-in for the lead author. Left as a placeholder for the user to replace in
 * metadata.json, which is the single authority for publication metadata.
 */
const PLACEHOLDER_AUTHOR = "Lastname, Firstname";

/** Initials of a title, upper-cased, digits kept — "Sea Level Memory" → "SLM". */
export function acronymFromTitle(title: string): string {
  const initials = (title || "")
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => w.replace(/[^A-Za-z0-9]/g, "")[0])
    .filter(Boolean)
    .join("")
    .toUpperCase()
    .slice(0, 6);
  return initials || "PAPER";
}

function mainMetadata(title: string, acronym: string, author: string): string {
  return json({
    title,
    publication_date: "",
    upload_type: "publication",
    publication_type: "article",
    description:
      "One-paragraph summary of the paper. Fill this in — it is emitted into the compiled manuscript's frontmatter and (for Zenodo) the deposit description.",
    creators: [
      {
        name: author,
        affiliation: "Your Institution",
        orcid: "0000-0000-0000-0000",
        email: "you@example.com",
      },
    ],
    keywords: ["keyword-one", "keyword-two"],
    journal_title: "Target Journal",
    version: "v1.0",
    _longform: {
      acronym,
      csl: "nature",
      template: "paperbell",
      lineno: true,
      figures_at_end: false,
      corresponding: [author],
      extra_yaml:
        "corresponding_email: you@example.com\nnumbersections: true\n",
    },
  });
}

const RESULTS_JSON = json({
  summary: { n: 0, mean: 0, unit: "samples" },
  samples: [{ id: "S-01" }, { id: "S-02" }],
  computed_date: "",
});

const REFERENCES_BIB = `@article{doe2020,
  author  = {Doe, Jane},
  title   = {A Prior Study},
  journal = {Journal Name},
  year    = {2020},
  volume  = {1},
  pages   = {1--10}
}

@article{roe2021,
  author  = {Roe, Rick},
  title   = {A Related Study},
  journal = {Journal Name},
  year    = {2021},
  volume  = {2},
  pages   = {11--20}
}
`;

/** One-line notes for the README tree, keyed by the path they annotate. */
const TREE_ANNOTATIONS: Record<string, string> = {
  "metadata.json": "shared publication metadata (Zenodo schema + _longform)",
  "results.json": "externally-computed values for {{ }} placeholders",
  "references.bib": "local bib for [@citekey] (consumed by pandoc)",
  "figs/example_figure.png": "placeholder figure — replace with your own",
  // No backticks in these notes: the tree is itself inside a fenced block, and
  // a nested fence would close it early. (The old hand-written tree did that.)
  "figs/example_data.xlsx": "Data sheet for the xlsx-table blocks",
  "Main Manuscript (Index).md": "draft index (sceneFolder: manuscript)",
  "Response Letter (Index).md": "draft index (sceneFolder: response)",
  "Cover Letter.md": "single-file draft; own to/date/manuscript frontmatter",
  "supplementary/Supplementary (Index).md": "draft index (same title → same project)",
  "supplementary/metadata.json": "nearest-wins override adding supplementary: true",
};

type TreeNode = { name: string; children: TreeNode[]; path: string };

/**
 * Render an ASCII directory tree from the paths actually emitted.
 *
 * Derived rather than hand-written so the README can never drift from what the
 * scaffold produced — which it would, now that the file set depends on a
 * selection. Exported for unit testing.
 */
export function renderTree(root: string, paths: string[]): string {
  const tree: TreeNode = { name: root, children: [], path: "" };
  for (const p of paths) {
    let node = tree;
    const segments = p.split("/");
    segments.forEach((segment, i) => {
      const path = segments.slice(0, i + 1).join("/");
      let child = node.children.find((c) => c.name === segment);
      if (!child) {
        child = { name: segment, children: [], path };
        node.children.push(child);
      }
      node = child;
    });
  }

  const lines: string[] = [`${root}/`];
  const walk = (node: TreeNode, prefix: string): void => {
    node.children.forEach((child, i) => {
      const last = i === node.children.length - 1;
      const isDir = child.children.length > 0;
      const note = TREE_ANNOTATIONS[child.path];
      const label = `${child.name}${isDir ? "/" : ""}`;
      lines.push(
        `${prefix}${last ? "└── " : "├── "}${label}${note ? `  # ${note}` : ""}`
      );
      if (isDir) walk(child, prefix + (last ? "    " : "│   "));
    });
  };
  walk(tree, "");
  return lines.join("\n");
}

/** Only written alongside the example content, so it can assume it is there. */
function readme(title: string, acronym: string, emitted: string[]): string {
  return `# ${title}

A PaperBell paper project scaffolded by PaperOut To-Authors. Each part is a draft
of one project — same \`title\`, distinct \`draftTitle\`.

## Layout

\`\`\`
${renderTree(title, emitted)}
\`\`\`

## Getting started

1. Fill in \`metadata.json\` (title, authors, \`email\` for the corresponding author,
   \`publication_date\`) and \`results.json\`. The acronym is set to \`${acronym}\`.
2. Replace \`figs/example_figure.png\` and \`figs/example_data.xlsx\` with your own.
3. Write your scenes under \`manuscript/\`. Keep each scene's own \`#\` heading.
4. Compile with the **Compile** tab or the **Compile All Drafts** board. Compile the
   Main Manuscript first so a Response Letter can resolve its manuscript references.

Need a part you did not create — a Supplementary Information, a Cover Letter, a
Response Letter? Run **Add paper components…** from the command palette, or
right-click this folder. (This file is not regenerated when you do, so the tree
above reflects the project as first created.)

The Pandoc toolchain (defaults/filters/templates/CSL) is downloaded on demand — run
the **Set up Pandoc export** command for a prerequisites checklist.
`;
}

/** The shared files every paper project needs, whichever parts it has. */
export function commonScaffoldFiles(ctx: PartContext): ScaffoldFile[] {
  return [
    {
      path: "metadata.json",
      text: mainMetadata(ctx.title, ctx.acronym, ctx.author),
    },
    { path: "results.json", text: RESULTS_JSON },
    { path: "references.bib", text: REFERENCES_BIB },
  ];
}

/** The example figure and workbook the starter body text references. */
export function exampleAssetFiles(): ScaffoldFile[] {
  return [
    { path: "figs/example_figure.png", base64: EXAMPLE_FIGURE_PNG_BASE64 },
    { path: "figs/example_data.xlsx", base64: EXAMPLE_DATA_XLSX_BASE64 },
  ];
}

/** Normalize the caller's options into the context every part builder takes. */
export function scaffoldContext(opts: ScaffoldOptions): PartContext {
  return {
    title: opts.title.trim(),
    acronym: (opts.acronym || acronymFromTitle(opts.title.trim())).trim(),
    author: PLACEHOLDER_AUTHOR,
    examples: opts.examples,
    present: new Set(opts.parts),
  };
}

/**
 * Build every file of a new PaperBell paper project. Paths are relative to the
 * project folder (named after `title`); the writer prefixes the parent path.
 *
 * Always writes the legacy form — one `longform:`-carrying note per draft — which
 * is what the plugin's project model reads natively. A project only becomes a
 * single `format: project` index via the convert command.
 */
export function buildPaperbellScaffold(opts: ScaffoldOptions): ScaffoldFile[] {
  // The Main Manuscript is not optional. It anchors the project root that every
  // nearest-wins metadata.json lookup is bounded by; a project whose only draft
  // sat in supplementary/ would search from there and miss the shared files.
  if (!opts.parts.includes("main")) {
    throw new Error("A paper project must include the Main Manuscript.");
  }
  const ctx = scaffoldContext(opts);

  const files: ScaffoldFile[] = [...commonScaffoldFiles(ctx)];
  if (ctx.examples) {
    files.push(...exampleAssetFiles());
  }
  for (const part of paperPartsOf(opts.parts)) {
    files.push(...part.build(ctx, "legacy").files);
  }

  if (ctx.examples) {
    files.push({
      path: "README.md",
      // The README documents the tree, so it has to see the final path list.
      text: readme(
        ctx.title,
        ctx.acronym,
        files.map((f) => f.path).concat("README.md")
      ),
    });
  }
  return files;
}

/**
 * The selected parts, in the order `PAPER_PARTS` declares — never the caller's
 * argument order, so the layout (and the README tree derived from it) is stable
 * however the modal collected the selection.
 */
function paperPartsOf(ids: readonly PaperPartId[]) {
  const selected = new Set(ids);
  return PAPER_PARTS.filter((p) => selected.has(p.id));
}

/** The project's primary draft path (relative), for selecting it after creation. */
export const SCAFFOLD_PRIMARY_DRAFT = "Main Manuscript (Index).md";
