import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

import {
  PPB_READY_EVENT,
  PPB_CONFIG_CHANGED_EVENT,
  PPB_PLUGINS_CHANGED_EVENT,
} from "src/paperbell/shared-config";

/**
 * Decoupled conformance guard for the REAL PaperBell host bundle.
 *
 * If a collaborator's build is installed at the test-vault path (gitignored), this asserts
 * it still exposes the handshake surface our client depends on. It only reads the bundle
 * TEXT — it never imports/boots PaperBell, so it stays independent of its main features
 * (which change on their own cadence). When no bundle is present, the whole block skips.
 *
 * This is the automated counterpart to the manual in-Obsidian check in MAINTAINING.md.
 */
const BUNDLE = resolve(
  process.cwd(),
  "test-longform-vault/.obsidian/plugins/paperbell/main.js"
);
const present = existsSync(BUNDLE);
const src = present ? readFileSync(BUNDLE, "utf8") : "";

describe.skipIf(!present)(
  "PaperBell host bundle — handshake contract conformance",
  () => {
    it("registers plugins and fires the vendored ready/config events", () => {
      expect(src).toContain("registerPPBplugin");
      expect(src).toContain(PPB_READY_EVENT); // "paperbell:ready"
      expect(src).toContain(PPB_CONFIG_CHANGED_EVENT); // "paperbell:config-changed"
      expect(src).toContain(PPB_PLUGINS_CHANGED_EVENT); // "paperbell:plugins-changed"
    });

    it("exposes the host API methods our client calls", () => {
      for (const method of ["getPluginInfo", "listGrants", "revokeGrant"]) {
        expect(src, `host api should expose ${method}`).toContain(method);
      }
    });

    it("exposes the per-client request methods", () => {
      for (const method of [
        "requestSharedConfig",
        "requestAccountInfo",
        "requestCompletion",
        "requestLLMCredentials",
        "requestActivationInfo",
        "requestProtectedDownloadTicket",
        "onConfigChange",
      ]) {
        expect(src, `client should expose ${method}`).toContain(method);
      }
    });

    it("advertises exactly the capability scopes we gate on", () => {
      for (const scope of [
        "account",
        "config",
        "plugin-info",
        "llm-invoke",
        "llm-credentials",
        "activation",
        "download-ticket",
      ]) {
        expect(src, `capabilities should include ${scope}`).toContain(scope);
      }
    });
  }
);
