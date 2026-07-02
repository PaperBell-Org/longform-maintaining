import { requestUrl } from "obsidian";
import { unzipSync } from "fflate";
import type { App } from "obsidian";
import { commonTopDir } from "src/compile/steps/pandoc-export-utils";

async function ensureFolder(
  adapter: {
    exists: (p: string) => Promise<boolean>;
    mkdir: (p: string) => Promise<void>;
  },
  folder: string
): Promise<void> {
  const parts = folder.split("/").filter((p) => p.length > 0);
  let cur = "";
  for (const p of parts) {
    cur = cur ? `${cur}/${p}` : p;
    if (!(await adapter.exists(cur))) {
      try {
        await adapter.mkdir(cur);
      } catch (e) {
        // already exists / concurrent create — ignore
      }
    }
  }
}

export type DownloadResult = { count: number; dest: string };

/**
 * Download the Pandoc toolchain zip from `url` and extract it into the
 * vault-relative `destFolder`. Files (filters, templates, CSL, defaults) are
 * managed in a separate assets repository and published as a release zip, so
 * they are not bundled with the plugin. A single wrapping top-level directory
 * (as in GitHub source zipballs) is stripped.
 */
export async function downloadPandocAssets(
  app: App,
  url: string,
  destFolder: string
): Promise<DownloadResult> {
  if (!url || !/^https?:\/\//.test(url)) {
    throw new Error(
      "No valid assets URL configured. Set the 'Pandoc assets URL' in Longform settings to a link to the toolchain zip."
    );
  }
  const res = await requestUrl({ url, method: "GET" });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Download failed (HTTP ${res.status}) from ${url}`);
  }
  const bytes = new Uint8Array(res.arrayBuffer);
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch (e) {
    throw new Error(
      `Could not unzip the downloaded file — is the URL a .zip? (${(e as Error).message})`
    );
  }

  const filePaths = Object.keys(files).filter((p) => !p.endsWith("/"));
  const top = commonTopDir(filePaths);
  const adapter = app.vault.adapter;

  let count = 0;
  for (const p of filePaths) {
    const rel = top ? p.slice(top.length) : p;
    if (!rel) continue;
    const full = `${destFolder}/${rel}`;
    const parent = full.split("/").slice(0, -1).join("/");
    if (parent) await ensureFolder(adapter, parent);
    const data = files[p];
    const ab = data.buffer.slice(
      data.byteOffset,
      data.byteOffset + data.byteLength
    );
    await adapter.writeBinary(full, ab);
    count += 1;
  }
  if (count === 0) {
    throw new Error("The downloaded archive contained no files.");
  }
  return { count, dest: destFolder };
}
