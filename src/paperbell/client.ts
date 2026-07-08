import type { App } from "obsidian";

import type LongformPlugin from "../main";
import {
  PPB_READY_EVENT,
  PPB_SCHEMA_VERSION,
  type PPBHostApi,
  type PPBClient as PPBClientHandle,
  type PPBCompletionParams,
  type PPBCompletionResult,
  type PaperBellAccountInfo,
  type PaperBellSharedConfigPublic,
} from "./shared-config";
import { paperbell, DISCONNECTED } from "./store";

/** PaperBell host plugin id (the parent). */
const HOST_PLUGIN_ID = "paperbell";
/** Our own id — MUST match manifest.json `id`. Used for registration and settings deep-link. */
const THIS_PLUGIN_ID = "longform-paperbell";
const THIS_PLUGIN_NAME = "PaperOut To-Authors";

/**
 * Optional bridge to the PaperBell host plugin.
 *
 * The plugin works fully standalone; when PaperBell is installed we handshake per its
 * `PPB*` contract to follow the host's language/account and (later) proxy LLM calls —
 * so no API key ever lives in this plugin. Everything degrades gracefully when the host
 * is absent (all methods no-op / return null).
 *
 * We deliberately do NOT request the `config`/`account`/`llm-invoke` scopes at startup:
 * those trigger a host consent prompt, so they are requested lazily on user action
 * (settings button, AI command). Capabilities come from `getPluginInfo()`, which needs
 * no consent.
 */
export class PaperBellClient {
  private plugin: LongformPlugin;
  private client: PPBClientHandle | null = null;
  private unsubscribeConfig: (() => void) | null = null;

  constructor(plugin: LongformPlugin) {
    this.plugin = plugin;
  }

  private get app(): App {
    return this.plugin.app;
  }

  /** True once we have registered with the host. */
  get connected(): boolean {
    return this.client !== null;
  }

  /**
   * Probe for the host now; if it isn't loaded yet, wait (once) for its ready event.
   * The listener is registered via `plugin.registerEvent`, so it is cleaned up on unload.
   */
  init(): void {
    const host = this.lookupHost();
    if (host) {
      this.onHostReady(host);
    }

    // The host fires PPB_READY_EVENT once when it loads; this covers the
    // host-loads-after-us ordering. Guard against a double connect.
    this.plugin.registerEvent(
      this.app.workspace.on(PPB_READY_EVENT as never, ((api: PPBHostApi) => {
        if (!this.client && api) {
          this.onHostReady(api);
        }
      }) as never)
    );
  }

  private lookupHost(): PPBHostApi | null {
    const api = (this.app as unknown as {
      plugins?: { plugins?: Record<string, { api?: PPBHostApi }> };
    }).plugins?.plugins?.[HOST_PLUGIN_ID]?.api;
    return api ?? null;
  }

  private onHostReady(host: PPBHostApi): void {
    let handle: PPBClientHandle;
    try {
      handle = host.registerPPBplugin({
        id: THIS_PLUGIN_ID,
        name: THIS_PLUGIN_NAME,
        description:
          "Academic manuscript writing & Pandoc export. Follows PaperBell's language and can use its AI.",
        icon: "feather",
        onOpen: () => this.openOwnSettings(),
      });
    } catch (e) {
      console.error("[PaperOut] Failed to register with PaperBell host:", e);
      return;
    }
    this.client = handle;

    // plugin-info is consent-free; use it to gate features (e.g. llm-invoke).
    let capabilities = DISCONNECTED.capabilities;
    try {
      capabilities = host.getPluginInfo()?.capabilities ?? [];
    } catch (e) {
      console.warn("[PaperOut] Could not read PaperBell plugin info:", e);
    }

    paperbell.set({ connected: true, config: null, capabilities });
    console.log("[PaperOut] Connected to PaperBell host.");

    // Keep the public config fresh when the host pushes changes. Subscribing does
    // not prompt for consent (it's a plain workspace event under the hood).
    this.unsubscribeConfig = handle.onConfigChange((config) => {
      this.checkSchema(config);
      paperbell.update((s) => ({ ...s, config }));
    });
  }

  /**
   * Request the host's public shared config (scope: `config`). First call prompts the
   * user for consent. Returns null if denied or the host is absent. Updates the store.
   */
  async fetchSharedConfig(): Promise<PaperBellSharedConfigPublic | null> {
    if (!this.client) return null;
    const config = await this.client.requestSharedConfig();
    if (config) {
      this.checkSchema(config);
      paperbell.update((s) => ({ ...s, config }));
    }
    return config;
  }

  /** Request the host's account info (scope: `account`). First call prompts for consent. */
  async fetchAccountInfo(): Promise<PaperBellAccountInfo | null> {
    return this.client ? this.client.requestAccountInfo() : null;
  }

  /**
   * Ask the host to run one non-streaming completion with its AI config (scope:
   * `llm-invoke`). The key never leaves the host. Returns:
   * - `null` — host absent or the user denied the scope;
   * - `{ ok: false, error }` — host unconfigured / upstream failed;
   * - `{ ok: true, text, model }` — success.
   */
  async requestCompletion(
    params: PPBCompletionParams
  ): Promise<PPBCompletionResult | null> {
    return this.client ? this.client.requestCompletion(params) : null;
  }

  /** Tear down: unsubscribe, unregister from the host, reset the store. */
  destroy(): void {
    if (this.unsubscribeConfig) {
      this.unsubscribeConfig();
      this.unsubscribeConfig = null;
    }
    if (this.client) {
      try {
        this.client.unregister();
      } catch (e) {
        console.warn("[PaperOut] Error unregistering from PaperBell host:", e);
      }
      this.client = null;
    }
    paperbell.set({ ...DISCONNECTED });
  }

  private checkSchema(config: { schemaVersion: number }): void {
    if (config.schemaVersion > PPB_SCHEMA_VERSION) {
      console.warn(
        `[PaperOut] PaperBell shared-config schemaVersion ${config.schemaVersion} is newer ` +
          `than the vendored contract (${PPB_SCHEMA_VERSION}). Consider re-vendoring ` +
          `src/paperbell/shared-config.ts (see MAINTAINING.md).`
      );
    }
  }

  private openOwnSettings(): void {
    const setting = (this.app as unknown as {
      setting?: { open(): void; openTabById(id: string): void };
    }).setting;
    if (setting) {
      setting.open();
      setting.openTabById(THIS_PLUGIN_ID);
    }
  }
}
