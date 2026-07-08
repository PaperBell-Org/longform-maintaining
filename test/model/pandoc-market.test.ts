import { describe, it, expect } from "vitest";

import {
  validateIndex,
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
