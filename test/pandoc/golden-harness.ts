import { execFileSync } from "child_process";
import * as path from "path";

/**
 * Shared gating for the golden tests in this folder. Each of them runs the REAL
 * pandoc — asserting the flags we build would only prove we build the string we
 * think we build, not that pandoc accepts it — so each has to decide whether the
 * toolchain it needs is present, and skip rather than fail when it isn't.
 *
 * What they need differs (pandoc alone, plus xelatex, plus a synced preset), so
 * the gate itself stays in each test; only the probing lives here.
 */

/** Whether a binary is on PATH. */
export function hasBin(name: string): boolean {
  try {
    execFileSync("which", [name], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * The synced Pandoc assets at the repo root — presets, filters, templates, CSL.
 * Absent on a machine that never ran the download, which is why every test that
 * needs a preset gates on the specific file it uses.
 */
export const ASSETS = path.resolve(process.cwd(), "pandoc-assets");
