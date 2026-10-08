import { describe, expect, it } from "vitest";
import {
  mergeExtraYaml,
  mergeMetadataLayers,
  metadataLayerPaths,
  originForPath,
} from "src/model/metadata-layers";
import {
  buildPandocYaml,
  type ZenodoMetadata,
} from "src/compile/steps/add-zenodo-frontmatter-utils";
import { metadataStartDir } from "src/model/scene-navigation";
import type { Draft, MultipleSceneDraft } from "src/model/types";
import type { Vault } from "obsidian";

const ROOT = {
  path: "Paper/metadata.json",
  data: {
    title: "My Paper",
    journal_title: "Nature",
    creators: [{ name: "Doe, Jane" }],
    _longform: {
      acronym: "MP",
      corresponding: ["Doe, Jane"],
      extra_yaml: "corresponding_email: jane@x.org\nnumbersections: true\n",
    },
  },
};
const SI = {
  path: "Paper/supplementary/metadata.json",
  data: {
    title: "My Paper — Supplementary Information",
    _longform: { extra_yaml: "supplementary: true\n" },
  },
};

describe("metadataLayerPaths", () => {
  const files = new Set([
    "Paper/metadata.json",
    "Paper/supplementary/source/metadata.json",
  ]);
  const exists = (p: string) => files.has(p);

  it("lists one file per folder, far → near, falling back to source/", () => {
    expect(
      metadataLayerPaths(
        "Paper/supplementary",
        "Paper",
        "metadata.json",
        exists
      )
    ).toEqual([
      "Paper/metadata.json",
      "Paper/supplementary/source/metadata.json",
    ]);
  });

  it("prefers <dir>/x over <dir>/source/x", () => {
    const both = new Set(["Paper/metadata.json", "Paper/source/metadata.json"]);
    expect(
      metadataLayerPaths("Paper", "Paper", "metadata.json", (p) => both.has(p))
    ).toEqual(["Paper/metadata.json"]);
  });

  it("is empty when nothing exists", () => {
    expect(
      metadataLayerPaths("Paper", "Paper", "metadata.json", () => false)
    ).toEqual([]);
  });
});

describe("mergeExtraYaml", () => {
  it("appends new keys and lets the nearer layer win on a shared key", () => {
    expect(
      mergeExtraYaml([
        "a: 1\nnumbersections: true\n",
        "numbersections: false\nsupplementary: true\n",
      ])
    ).toBe("a: 1\nnumbersections: false\nsupplementary: true\n");
  });

  it("keeps a key's indented continuation lines together", () => {
    expect(
      mergeExtraYaml(["header-includes:\n  - \\usepackage{x}\nb: 2\n"])
    ).toBe("header-includes:\n  - \\usepackage{x}\nb: 2\n");
  });
});

describe("mergeMetadataLayers", () => {
  it("overrides only the keys a nearer layer sets", () => {
    const { merged } = mergeMetadataLayers([ROOT, SI]);
    expect(merged.title).toBe("My Paper — Supplementary Information");
    expect(merged.journal_title).toBe("Nature");
    expect(merged.creators).toEqual([{ name: "Doe, Jane" }]);
    expect(merged._longform).toEqual({
      acronym: "MP",
      corresponding: ["Doe, Jane"],
      extra_yaml:
        "corresponding_email: jane@x.org\nnumbersections: true\nsupplementary: true\n",
    });
  });

  it("records where each key came from", () => {
    const { origin } = mergeMetadataLayers([ROOT, SI]);
    expect(origin.title).toBe(SI.path);
    expect(origin.journal_title).toBe(ROOT.path);
    expect(origin["_longform.acronym"]).toBe(ROOT.path);
    expect(origin["_longform.extra_yaml"]).toBe(SI.path);
  });

  it("returns an empty object for no layers", () => {
    expect(mergeMetadataLayers([])).toEqual({ merged: {}, origin: {} });
  });
});

describe("originForPath", () => {
  const { origin } = mergeMetadataLayers([ROOT, SI]);
  it("resolves top-level, indexed and _longform paths", () => {
    expect(originForPath(origin, "title", "x")).toBe(SI.path);
    expect(originForPath(origin, "creators[0].name", "x")).toBe(ROOT.path);
    expect(originForPath(origin, "_longform.acronym", "x")).toBe(ROOT.path);
    expect(originForPath(origin, "missing", "x")).toBe("x");
  });
});

// #47: the journal edited in the panel (root metadata.json) must reach the
// Supplementary export, whose draft sits below a small override file.
describe("Supplementary export follows the root journal_title (#47)", () => {
  const siDraft = (over: Partial<MultipleSceneDraft>): MultipleSceneDraft => ({
    format: "scenes",
    title: "My Paper",
    titleInFrontmatter: false,
    draftTitle: "Supplementary",
    vaultPath: "Paper/Paper.md",
    workflow: null,
    sceneFolder: "/",
    scenes: [],
    ignoredFiles: null,
    unknownFiles: [],
    sceneTemplate: null,
    ...over,
  });
  // Just enough of a Vault for sceneFolderPath(): the index note's parent.
  const vault = {
    getAbstractFileByPath: (p: string) => ({
      parent: { path: p.split("/").slice(0, -1).join("/") },
    }),
  } as unknown as Vault;

  const exportYaml = (draft: Draft, rootJournal: string) => {
    const data: Record<string, Record<string, unknown>> = {
      "Paper/metadata.json": { ...ROOT.data, journal_title: rootJournal },
      "Paper/supplementary/metadata.json": SI.data,
    };
    const layers = metadataLayerPaths(
      metadataStartDir(draft, vault),
      "Paper",
      "metadata.json",
      (p) => p in data
    ).map((path) => ({ path, data: data[path] }));
    return buildPandocYaml(
      mergeMetadataLayers(layers).merged as ZenodoMetadata
    );
  };

  it("legacy layout: SI index note in supplementary/", () => {
    const draft = siDraft({
      vaultPath: "Paper/supplementary/Supplementary (Index).md",
    });
    const yaml = exportYaml(draft, "Science");
    expect(yaml).toContain('target: "Science"');
    expect(yaml).toContain("supplementary: true");
    expect(yaml.match(/numbersections: true/g)).toHaveLength(1);
  });

  it("project layout: SI asset of the shared root index", () => {
    const draft = siDraft({
      indexPath: "Paper/Paper.md",
      sceneFolder: "supplementary",
    });
    const yaml = exportYaml(draft, "Cell");
    expect(yaml).toContain('target: "Cell"');
    expect(yaml).toContain("supplementary: true");
  });
});
