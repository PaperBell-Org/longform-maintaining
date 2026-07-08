import { describe, it, expect } from "vitest";

import {
  validateIndex,
  normalizeIndex,
  resolveInstallSet,
  compareVersions,
  installStateFor,
  type MarketIndex,
  type InstalledManifest,
} from "src/model/pandoc-market";
import { mergeMissingWorkflows } from "src/compile/workflow-backfill";
import type { SerializedWorkflow } from "src/model/types";

const INDEX: MarketIndex = {
  schemaVersion: 1,
  bundles: [
    {
      id: "bundle.suite",
      name: "Suite",
      version: "1.0.0",
      download: "https://x/suite.zip",
      assets: ["recipe.a"],
    },
  ],
  assets: [
    {
      id: "recipe.a",
      type: "recipe",
      name: "A",
      version: "1.2.0",
      files: [{ path: "defaults/a.yaml", download: "https://x/a.yaml" }],
      requires: ["filter.x", "template.t", "csl.n"],
    },
    {
      id: "filter.x",
      type: "filter",
      name: "X",
      version: "1.0.0",
      files: [{ path: "filters/x.lua", download: "https://x/x.lua" }],
    },
    {
      id: "template.t",
      type: "template",
      name: "T",
      version: "1.0.0",
      files: [{ path: "templates/t.latex", download: "https://x/t.latex" }],
      requires: ["filter.x"], // shared dep with recipe.a
    },
    {
      id: "csl.n",
      type: "csl",
      name: "N",
      version: "1.0.0",
      files: [{ path: "csl/n.csl", download: "https://x/n.csl" }],
    },
  ],
};

describe("validateIndex", () => {
  it("accepts a well-formed index", () => {
    expect(validateIndex(INDEX)).toBe(INDEX);
  });
  it("rejects an unsupported schemaVersion", () => {
    expect(() => validateIndex({ ...INDEX, schemaVersion: 2 })).toThrow(
      /schemaVersion/
    );
  });
  it("rejects a missing assets/bundles array", () => {
    expect(() => validateIndex({ schemaVersion: 1, assets: [] })).toThrow(
      /arrays/
    );
  });
});

describe("resolveInstallSet", () => {
  it("returns deps before dependents, deduped, self last", () => {
    const ids = resolveInstallSet(INDEX, "recipe.a").map((a) => a.id);
    expect(ids).toEqual(["filter.x", "template.t", "csl.n", "recipe.a"]);
    expect(ids.filter((i) => i === "filter.x")).toHaveLength(1); // shared dep once
  });
  it("returns a single asset with no deps", () => {
    expect(resolveInstallSet(INDEX, "csl.n").map((a) => a.id)).toEqual(["csl.n"]);
  });
  it("throws on an unknown dependency id", () => {
    const bad: MarketIndex = {
      schemaVersion: 1,
      bundles: [],
      assets: [
        { id: "r", type: "recipe", name: "R", version: "1.0.0", files: [], requires: ["nope"] },
      ],
    };
    expect(() => resolveInstallSet(bad, "r")).toThrow(/Unknown asset id/);
  });
  it("tolerates a dependency cycle (each id once)", () => {
    const cyclic: MarketIndex = {
      schemaVersion: 1,
      bundles: [],
      assets: [
        { id: "a", type: "filter", name: "A", version: "1.0.0", files: [], requires: ["b"] },
        { id: "b", type: "filter", name: "B", version: "1.0.0", files: [], requires: ["a"] },
      ],
    };
    const ids = resolveInstallSet(cyclic, "a").map((x) => x.id).sort();
    expect(ids).toEqual(["a", "b"]);
  });
});

describe("normalizeIndex (assets-repo published shape)", () => {
  // Mirrors the real `build-index.mjs` output: title / url+sourcePath / bundle url.
  const RAW = {
    schemaVersion: 1,
    tag: "1.0.0",
    assets: [
      {
        id: "beamer",
        type: "recipe",
        version: "1.0.0",
        title: "Beamer slides (PDF)",
        description: "Slides.",
        sourcePath: "defaults/beamer.yaml",
        url: "https://raw.githubusercontent.com/O/R/1.0.0/defaults/beamer.yaml",
        sha256: "aaa",
        requires: ["filters/beamer.lua", "filters/callout.lua"],
        systemDeps: ["citeproc"],
        extraFiles: [],
        tier: "core",
        reviewed: true,
      },
      {
        id: "filters/beamer.lua",
        type: "filter",
        version: "1.0.0",
        sourcePath: "filters/beamer.lua",
        url: "https://raw.githubusercontent.com/O/R/1.0.0/filters/beamer.lua",
        sha256: "bbb",
        reviewed: true,
      },
      {
        id: "filters/callout.lua",
        type: "filter",
        version: "1.0.0",
        sourcePath: "filters/callout.lua",
        url: "https://raw.githubusercontent.com/O/R/1.0.0/filters/callout.lua",
        reviewed: false,
      },
      {
        id: "templately",
        type: "template",
        version: "1.0.0",
        title: "Tmpl",
        sourcePath: "templates/t.latex",
        url: "https://raw.githubusercontent.com/O/R/1.0.0/templates/t.latex",
        extraFiles: ["templates/t.sty"],
      },
    ],
    bundles: [
      {
        id: "beamer",
        type: "bundle",
        version: "1.0.0",
        title: "Beamer — bundle",
        filename: "beamer-1.0.0.zip",
        url: "https://github.com/O/R/releases/download/1.0.0/beamer-1.0.0.zip",
        sha256: "zzz",
        assets: ["defaults/beamer.yaml", "filters/beamer.lua"],
      },
    ],
  } as unknown as MarketIndex;

  const norm = normalizeIndex(validateIndex(RAW));
  const byId = (id: string) => norm.assets.find((a) => a.id === id);

  it("maps title→name and url+sourcePath→files[]", () => {
    const beamer = byId("beamer");
    expect(beamer.name).toBe("Beamer slides (PDF)");
    expect(beamer.files).toEqual([
      {
        path: "defaults/beamer.yaml",
        download: "https://raw.githubusercontent.com/O/R/1.0.0/defaults/beamer.yaml",
        sha256: "aaa",
      },
    ]);
    expect(beamer.reviewed).toBe(true);
  });

  it("falls back to id for name and carries reviewed=false", () => {
    const callout = byId("filters/callout.lua");
    expect(callout.name).toBe("filters/callout.lua");
    expect(callout.reviewed).toBe(false);
  });

  it("derives extraFiles' download URL from the main file's base", () => {
    const tmpl = byId("templately");
    expect(tmpl.files).toEqual([
      { path: "templates/t.latex", download: "https://raw.githubusercontent.com/O/R/1.0.0/templates/t.latex", sha256: undefined },
      { path: "templates/t.sty", download: "https://raw.githubusercontent.com/O/R/1.0.0/templates/t.sty" },
    ]);
  });

  it("maps bundle title→name and url→download", () => {
    const b = norm.bundles[0];
    expect(b.name).toBe("Beamer — bundle");
    expect(b.download).toBe(
      "https://github.com/O/R/releases/download/1.0.0/beamer-1.0.0.zip"
    );
  });

  it("resolves a recipe's dependency closure after normalization", () => {
    const ids = resolveInstallSet(norm, "beamer").map((a) => a.id);
    expect(ids).toEqual(["filters/beamer.lua", "filters/callout.lua", "beamer"]);
  });
});

describe("compareVersions", () => {
  it("orders numeric semver", () => {
    expect(compareVersions("1.2.0", "1.3.0")).toBe(-1);
    expect(compareVersions("2.0.0", "1.9.9")).toBe(1);
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
    expect(compareVersions("1.1", "1.1.0")).toBe(0);
  });
  it("ignores pre-release tags", () => {
    expect(compareVersions("1.0.0-beta.1", "1.0.0")).toBe(0);
  });
});

describe("installStateFor", () => {
  const manifest: InstalledManifest = {
    "recipe.a": { id: "recipe.a", version: "1.1.0", kind: "asset", files: [], installedAt: "" },
    "csl.n": { id: "csl.n", version: "1.0.0", kind: "asset", files: [], installedAt: "" },
  };
  it("flags not-installed / installed / update-available", () => {
    expect(installStateFor(manifest, "filter.x", "1.0.0")).toBe("not-installed");
    expect(installStateFor(manifest, "csl.n", "1.0.0")).toBe("installed");
    expect(installStateFor(manifest, "recipe.a", "1.2.0")).toBe("update-available");
  });
  it("treats an installed version newer than market as installed", () => {
    expect(installStateFor(manifest, "csl.n", "0.9.0")).toBe("installed");
  });
});

describe("mergeMissingWorkflows", () => {
  const wf = (name: string): SerializedWorkflow => ({
    name,
    description: "",
    steps: [],
  });
  it("adds only missing keys and reports them", () => {
    const existing = { A: wf("A") };
    const incoming = { A: wf("A2"), B: wf("B") };
    const { workflows, added } = mergeMissingWorkflows(existing, incoming);
    expect(added).toEqual(["B"]);
    expect(workflows.A.name).toBe("A"); // existing not overwritten
    expect(workflows.B.name).toBe("B");
  });
  it("is a no-op (same ref) when nothing is missing", () => {
    const existing = { A: wf("A") };
    const res = mergeMissingWorkflows(existing, { A: wf("A2") });
    expect(res.added).toEqual([]);
    expect(res.workflows).toBe(existing);
  });
});
