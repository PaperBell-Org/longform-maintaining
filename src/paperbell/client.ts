import type { App } from "obsidian";

import type LongformPlugin from "../main";
import {
  PPB_READY_EVENT,
  PPB_SCHEMA_VERSION,
  type PPBHostApi,
  type PPBClient as PPBClientHandle,
  type PPBCompletionParams,
  type PPBCompletionResult,
  type PaperBellLLMCredentials,
  type PaperBellActivationInfo,
  type PPBProtectedDownloadTicket,
  type PPBProtectedDownloadParams,
  type PPBProject,
  type PPBProjectsQuery,
  type PaperBellAccountInfo,
  type PaperBellRestrictedConfig,
  type PPBScope,
} from "./shared-config";
import { paperbell, DISCONNECTED } from "./store";

/** PaperBell host plugin id (the parent). */
const HOST_PLUGIN_ID = "paperbell";
/**
 * Our own id — MUST match manifest.json `id`. Used for registration, for matching our
 * entry in the host's grant list, and for the settings deep-link. Exported so tests
 * assert against this value rather than a copy of it.
 */
export const THIS_PLUGIN_ID = "longform-paperbell";
export const THIS_PLUGIN_NAME = "PaperOut To-Authors";

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
 *
 * The handshake is re-run on every host `ready` event, not just the first: a handle from
 * a previous host load is inert. See `attach()`.
 */
export class PaperBellClient {
  private plugin: LongformPlugin;
  private client: PPBClientHandle | null = null;
  private unsubscribeConfig: (() => void) | null = null;
  /** Host-advertised scopes, mirrored into the store for the UI to read. */
  private capabilities: PPBScope[] = [];

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
   * Probe for the host now, and stay subscribed to its ready event.
   *
   * The host broadcasts PPB_READY_EVENT on *every* load, so that listener does double
   * duty: it covers the host-loads-after-us ordering, and it is also the only way we
   * recover when the host reloads (an update, or a disable/enable). Dropping it after
   * the first successful handshake would leave us holding a dead handle — every
   * `request*` on it silently returns null — until the user restarted us by hand.
   *
   * Registered via `plugin.registerEvent`, so it is still cleaned up on unload.
   */
  init(): void {
    const host = this.lookupHost();
    if (host) {
      this.attach(host);
    }

    this.plugin.registerEvent(
      this.app.workspace.on(PPB_READY_EVENT as never, ((api: PPBHostApi) => {
        if (api) {
          this.attach(api);
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

  /**
   * (Re-)handshake with a host. Safe to call again at any time: the previous handle —
   * which a host reload has already invalidated — is released first, so we never end up
   * with two registrations or a stale config subscription.
   *
   * Deliberately no "same host, skip it" shortcut: whether a reloaded host hands back a
   * fresh `api` object is its business, and guessing wrong there is unrecoverable — we
   * would sit on a dead handle forever, which is the bug this method exists to fix. A
   * redundant re-register costs one unregister and one register.
   */
  private attach(host: PPBHostApi): void {
    const reconnecting = this.client !== null;
    this.releaseHandle();

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
      // Disconnected, but the last config we were given is still the best answer we
      // have for "what language does the host want?" — same reasoning as the reconnect
      // path below. Only `destroy()` clears it outright.
      paperbell.update((s) => ({
        ...s,
        connected: false,
        capabilities: DISCONNECTED.capabilities,
      }));
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

    this.capabilities = capabilities;
    // Keep whatever config we already had: on a reconnect it is the last value the host
    // gave us, and dropping it would flip the UI back to the fallback language for as
    // long as it takes to fetch a fresh one.
    paperbell.update((s) => ({
      ...s,
      connected: true,
      capabilities,
    }));
    console.log(
      reconnecting
        ? "[PaperOut] Reconnected to PaperBell host after it reloaded."
        : "[PaperOut] Connected to PaperBell host."
    );

    // Keep the config fresh when the host pushes changes. Subscribing does not prompt
    // for consent. This is a directed push bound to `handle`, so it dies with it —
    // hence the re-subscribe on every attach.
    this.unsubscribeConfig = handle.onConfigChange((config) => {
      this.checkSchema(config);
      paperbell.update((s) => ({ ...s, config }));
    });

    // Only after a reconnect, and only if the user already granted `config`: the grant
    // outlived the reload, so this prompts for nothing, and it is how we notice a
    // language the host changed while our handle was dead. On a first connect we stay
    // scope-free by design (see the class docstring).
    if (reconnecting && this.hasGrant(host, "config")) {
      this.fetchSharedConfig().catch((e) => {
        console.warn("[PaperOut] Could not refresh PaperBell config:", e);
      });
    }
  }

  /** Whether the user has already granted us `scope`, per the host's grant list. */
  private hasGrant(host: PPBHostApi, scope: PPBScope): boolean {
    try {
      return (host.listGrants() ?? []).some(
        (grant) =>
          grant.sourceId === THIS_PLUGIN_ID && grant.scopes.includes(scope)
      );
    } catch (e) {
      console.warn("[PaperOut] Could not read PaperBell grants:", e);
      return false;
    }
  }

  /**
   * Request the host's public shared config (scope: `config`). First call prompts the
   * user for consent. Returns null if denied or the host is absent. Updates the store.
   */
  async fetchSharedConfig(): Promise<PaperBellRestrictedConfig | null> {
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

  /**
   * Request the host's full LLM credentials — **including the API key** (scope:
   * `llm-credentials`). First call prompts for consent. Prefer `requestCompletion`
   * (which keeps the key inside the host); use this only when a feature must talk to
   * the provider directly. Never persist or log the returned key.
   */
  async requestLLMCredentials(): Promise<PaperBellLLMCredentials | null> {
    return this.client ? this.client.requestLLMCredentials() : null;
  }

  /** Request the host's activation/license status (scope: `activation`). First call prompts for consent. */
  async requestActivationInfo(): Promise<PaperBellActivationInfo | null> {
    return this.client ? this.client.requestActivationInfo() : null;
  }

  /**
   * Ask the host for a protected download ticket (scope: `download-ticket`). First call
   * prompts for consent; the host requires an active license and may throw if it isn't.
   * Returns null when the host is absent or the scope is denied.
   */
  async requestProtectedDownloadTicket(
    params?: PPBProtectedDownloadParams
  ): Promise<PPBProtectedDownloadTicket | null> {
    return this.client
      ? this.client.requestProtectedDownloadTicket(params)
      : null;
  }

  /**
   * The host's project-list method, or null when it cannot serve one.
   *
   * Both halves matter: `capabilities` comes from `getPluginInfo()` and says what the
   * host *advertises* (and therefore what it will prompt for consent on), while the
   * `typeof` check is what stops us calling a method an older host's handle simply
   * does not have. Neither alone is trustworthy.
   */
  private get projectsRequester(): PPBClientHandle["requestProjects"] | null {
    if (!this.client) return null;
    if (!this.capabilities.includes("projects")) return null;
    const request = this.client.requestProjects;
    return typeof request === "function" ? request.bind(this.client) : null;
  }

  /**
   * Request the host's project list (scope: `projects`). First call prompts for consent.
   *
   * Returns `null` for every "no list available" case — host absent, host too old to
   * implement it, consent denied, host-side error, or a thrown exception. Callers are
   * meant to treat them identically and fall back to manual entry, so a missing project
   * list can never block creating a paper.
   */
  async fetchProjects(query?: PPBProjectsQuery): Promise<PPBProject[] | null> {
    const requestProjects = this.projectsRequester;
    if (!requestProjects) return null;
    try {
      const result = await requestProjects(query);
      if (!result) return null; // consent denied
      if (!result.ok) {
        console.warn(
          "[PaperOut] PaperBell could not list projects:",
          result.error ?? "(no error given)"
        );
        return null;
      }
      return result.projects ?? [];
    } catch (e) {
      // The host is a plugin we do not control; a throw here must not reach the modal.
      console.warn("[PaperOut] Error requesting PaperBell projects:", e);
      return null;
    }
  }

  /** Tear down: unsubscribe, unregister from the host, reset the store. */
  destroy(): void {
    this.releaseHandle();
    paperbell.set({ ...DISCONNECTED });
  }

  /**
   * Drop the current handle and its subscription, leaving the store alone.
   *
   * Both calls go into a host we do not control — and after a host reload they reach a
   * handle whose owner is gone — so neither is allowed to abort the caller: `attach()`
   * has to get to its fresh registration, and `destroy()` runs during plugin unload.
   */
  private releaseHandle(): void {
    if (this.unsubscribeConfig) {
      try {
        this.unsubscribeConfig();
      } catch (e) {
        console.warn(
          "[PaperOut] Error unsubscribing from PaperBell config:",
          e
        );
      }
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
    this.capabilities = [];
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
