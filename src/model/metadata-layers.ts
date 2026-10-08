import { TFile, type Vault } from "obsidian";
import { deepMerge, isPlainObject } from "./json-merge";
import {
  folderResourcePaths,
  projectResourceFolders,
} from "./project-resources";

/**
 * Layered `metadata.json` resolution, shared by the compile steps, the live
 * `{{Variable}}` preview and the metadata panel.
 *
 * Every folder from the project root down to the start folder may hold a
 * `metadata.json` (or `source/metadata.json`). They are read far → near and
 * merged key by key: a nearer file overrides only the keys it sets, so e.g.
 * `supplementary/metadata.json` can be a small override of the root file
 * rather than a full copy that silently shadows it.
 */

/** One parsed metadata file. */
export type MetadataLayer = {
  path: string;
  data: Record<string, unknown>;
};

/**
 * The merged view of several layers, plus which file each key came from.
 * `origin` is keyed by top-level key, and by `_longform.<key>` for the
 * entries of the `_longform` block.
 */
export type MergedMetadata = {
  merged: Record<string, unknown>;
  origin: Record<string, string>;
};

/**
 * The metadata files to read, far → near: per folder between `rootDir` and
 * `startDir`, the first of `<dir>/<baseName>` / `<dir>/source/<baseName>` that
 * exists.
 */
export function metadataLayerPaths(
  startDir: string,
  rootDir: string,
  baseName: string,
  exists: (path: string) => boolean
): string[] {
  return projectResourceFolders(startDir, rootDir)
    .map((dir) => folderResourcePaths(dir, baseName).find(exists))
    .filter((p): p is string => p !== undefined)
    .reverse();
}

/** A top-level `key:` line in a YAML snippet. */
const TOP_LEVEL_KEY = /^([A-Za-z_][\w-]*)\s*:/;

/**
 * Combine `_longform.extra_yaml` snippets (far → near). Each layer's top-level
 * entries are kept; when two layers set the same key, the nearer one wins, so
 * the root's `numbersections: true` and an override's don't become a
 * duplicate YAML key.
 */
export function mergeExtraYaml(chunks: string[]): string {
  const order: string[] = [];
  const entries = new Map<string, string[]>();
  let anon = 0;
  for (const chunk of chunks) {
    let current: string[] | null = null;
    for (const line of chunk.split("\n")) {
      const m = TOP_LEVEL_KEY.exec(line);
      if (m) {
        const key = m[1];
        if (!entries.has(key)) order.push(key);
        current = [line];
        entries.set(key, current);
      } else if (current) {
        // Indented continuation, or a blank line inside a block scalar.
        current.push(line);
      } else if (line.trim().length > 0) {
        // Leading comment or stray text: keep it, in place.
        const key = `\u0000${anon++}`;
        order.push(key);
        entries.set(key, [line]);
      }
    }
  }
  const trimEnd = (lines: string[]) => {
    const out = [...lines];
    while (out.length > 0 && out[out.length - 1].trim() === "") out.pop();
    return out;
  };
  const out = order
    .map((k) => trimEnd(entries.get(k) ?? []).join("\n"))
    .join("\n");
  return out.length > 0 ? `${out}\n` : "";
}

/** Merge layers given far → near. */
export function mergeMetadataLayers(layers: MetadataLayer[]): MergedMetadata {
  let merged: Record<string, unknown> = {};
  const origin: Record<string, string> = {};
  const extraYaml: string[] = [];

  for (const { path, data } of layers) {
    for (const key of Object.keys(data)) origin[key] = path;
    const longform = data["_longform"];
    if (isPlainObject(longform)) {
      for (const key of Object.keys(longform)) {
        origin[`_longform.${key}`] = path;
      }
      if (typeof longform["extra_yaml"] === "string") {
        extraYaml.push(longform["extra_yaml"]);
      }
    }
    merged = deepMerge(merged, data) as Record<string, unknown>;
  }

  if (extraYaml.length > 0 && isPlainObject(merged["_longform"])) {
    merged["_longform"] = {
      ...merged["_longform"],
      extra_yaml: mergeExtraYaml(extraYaml),
    };
  }
  return { merged, origin };
}

/**
 * The file that defines the value at a placeholder path such as
 * `journal_title`, `creators[0].name` or `_longform.acronym`, or `fallback`
 * when no layer sets it.
 */
export function originForPath(
  origin: Record<string, string>,
  varPath: string,
  fallback: string
): string {
  const [head, next] = varPath.split(/[.[\]]/).filter((s) => s.length > 0);
  if (head === "_longform" && next && origin[`_longform.${next}`]) {
    return origin[`_longform.${next}`];
  }
  return origin[head] ?? fallback;
}

/** A metadata file that exists but is not valid JSON. */
export class MetadataParseError extends Error {
  constructor(
    readonly path: string,
    cause: Error
  ) {
    super(`Invalid JSON in ${path}: ${cause.message}`);
  }
}

/**
 * Read and parse the layers between `rootDir` and `startDir` (far → near).
 * Throws {@link MetadataParseError} on a file that is not a JSON object.
 */
export async function readMetadataLayers(
  vault: Vault,
  startDir: string,
  rootDir: string,
  baseName = "metadata.json"
): Promise<MetadataLayer[]> {
  const paths = metadataLayerPaths(
    startDir,
    rootDir,
    baseName,
    (p) => vault.getAbstractFileByPath(p) instanceof TFile
  );
  const layers: MetadataLayer[] = [];
  for (const path of paths) {
    const file = vault.getAbstractFileByPath(path) as TFile;
    let data: unknown;
    try {
      data = JSON.parse(await vault.cachedRead(file));
    } catch (e) {
      throw new MetadataParseError(path, e as Error);
    }
    if (!isPlainObject(data)) {
      throw new MetadataParseError(path, new Error("not a JSON object"));
    }
    layers.push({ path, data });
  }
  return layers;
}
