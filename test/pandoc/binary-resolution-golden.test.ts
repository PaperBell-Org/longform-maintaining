import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

import {
  binSearchDirs,
  currentPlatformEnv,
  buildExecPath,
  resolveBinary,
} from "src/compile/steps/pandoc-export-utils";

/**
 * The Windows fix is entirely covered by injected unit tests — which is exactly
 * why this exists. Every seam takes its platform, its home, its PATH and its
 * `exists` callback as arguments, so the whole suite can be green while the real
 * wiring resolves nothing at all. This runs the same functions against the
 * *actual* machine and demands they still find the toolchain that works today.
 *
 * Gated on the binary being installed, so CI without pandoc stays green.
 */
function whichBin(name: string): string | null {
  // `which` is POSIX; Windows has `where`, and it lists one path per line.
  const [cmd, args] =
    process.platform === "win32" ? ["where", [name]] : ["which", [name]];
  try {
    const out = execFileSync(cmd, args, { encoding: "utf8" });
    return out.split(/\r?\n/)[0].trim() || null;
  } catch {
    return null;
  }
}

// The real thing, built the same way the plugin builds it.
const realEnv = currentPlatformEnv();

const whichPandoc = whichBin("pandoc");

describe.skipIf(!whichPandoc)("binary resolution on this machine", () => {
  it("finds the pandoc that `which` finds", () => {
    const found = resolveBinary(
      "pandoc",
      fs.existsSync,
      binSearchDirs(realEnv),
      realEnv.isWindows
    );
    expect(found).not.toBeNull();
    // Not necessarily the same path — a search dir may hold a symlink to the
    // same binary — but it must be a real executable file.
    expect(fs.statSync(found as string).isFile()).toBe(true);
    expect(path.basename(found as string).startsWith("pandoc")).toBe(true);
  });

  it("honors an explicit absolute path to the real binary", () => {
    // The "Pandoc binary" setting, as a user would fill it in.
    const found = resolveBinary(
      whichPandoc as string,
      fs.existsSync,
      [],
      realEnv.isWindows
    );
    expect(found).toBe(whichPandoc);
  });

  it("builds a PATH the OS can actually parse, keeping every entry", () => {
    const built = buildExecPath(realEnv);
    const sep = realEnv.isWindows ? ";" : ":";
    const parts = built.split(sep);
    // Nothing from the inherited PATH may be lost or mangled on the way through.
    for (const entry of (process.env.PATH ?? "").split(path.delimiter)) {
      if (entry.trim()) expect(parts).toContain(entry.trim());
    }
    expect(new Set(parts).size).toBe(parts.length);
  });

  it("lets a spawned pandoc run with the PATH we hand it", () => {
    // The end of the chain: resolution plus PATH construction, exercised the
    // same way the export step does it.
    const bin = resolveBinary(
      "pandoc",
      fs.existsSync,
      binSearchDirs(realEnv),
      realEnv.isWindows
    ) as string;
    const out = execFileSync(bin, ["--version"], {
      encoding: "utf8",
      env: { ...process.env, PATH: buildExecPath(realEnv) },
    });
    expect(out).toMatch(/^pandoc/);
  });
});
