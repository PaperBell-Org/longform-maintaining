/**
 * Test doubles for the PaperBell host integration.
 *
 * `PaperBellClient` only imports `obsidian`/`main` as *types* (erased at runtime), so it
 * can be exercised with these plain mocks — no Obsidian environment required. These
 * fixtures mimic just the surface the client touches:
 *   - a workspace event bus (`on`/`trigger`) for the `PPB_READY_EVENT` handshake,
 *   - a host that implements `PPBHostApi` and records registrations / unregisters,
 *   - an app exposing `plugins.plugins["paperbell"].api` and a `setting` deep-link target,
 *   - a plugin exposing `app` + `registerEvent`.
 */
import type {
  PaperBellAccountInfo,
  PaperBellPluginInfo,
  PaperBellSharedConfigPublic,
  PPBActivationInfo,
  PPBClient,
  PPBCompletionParams,
  PPBCompletionResult,
  PPBDownloadTicket,
  PPBDownloadTicketParams,
  PPBGrant,
  PPBHostApi,
  PPBLLMCredentials,
  PPBRequestSource,
  PPBScope,
} from "src/paperbell/shared-config";

/** The full set of scopes the real host advertises. */
const ALL_SCOPES: PPBScope[] = [
  "account",
  "config",
  "plugin-info",
  "llm-invoke",
  "llm-credentials",
  "activation",
  "download-ticket",
];

/** Minimal stand-in for Obsidian's `workspace` event surface. */
export class MockWorkspace {
  private handlers: Record<string, Array<(...args: any[]) => any>> = {};

  on(name: string, cb: (...args: any[]) => any): { name: string; cb: any } {
    (this.handlers[name] ||= []).push(cb);
    return { name, cb }; // Obsidian returns an EventRef; a token is enough here.
  }

  trigger(name: string, ...args: any[]): void {
    (this.handlers[name] || []).slice().forEach((h) => h(...args));
  }

  handlerCount(name: string): number {
    return (this.handlers[name] || []).length;
  }
}

/** A deep-link target mimicking `app.setting`. Records what the client opened. */
export class MockSetting {
  openCalls = 0;
  openedTabIds: string[] = [];
  open(): void {
    this.openCalls++;
  }
  openTabById(id: string): void {
    this.openedTabIds.push(id);
  }
}

/** Stand-in for the Obsidian `App` — only the bits the client reads. */
export class MockApp {
  workspace = new MockWorkspace();
  plugins: { plugins: Record<string, { api?: PPBHostApi }> } = { plugins: {} };
  setting = new MockSetting();

  /** Install a host under `plugins.plugins[id].api` (default id "paperbell"). */
  installHost(host: PPBHostApi, id = "paperbell"): void {
    this.plugins.plugins[id] = { api: host };
  }
}

/** Stand-in for the `LongformPlugin` — only `app` + `registerEvent`. */
export class MockPlugin {
  app = new MockApp();
  registeredEventRefs: unknown[] = [];
  registerEvent(ref: unknown): unknown {
    this.registeredEventRefs.push(ref);
    return ref;
  }
}

export interface MockHostOptions {
  /** Capabilities advertised via `getPluginInfo()`. Defaults to all scopes. */
  capabilities?: PPBScope[];
  /** Value returned by `requestSharedConfig()`. Default null (as if consent denied). */
  sharedConfig?: PaperBellSharedConfigPublic | null;
  /** Value returned by `requestAccountInfo()`. */
  account?: PaperBellAccountInfo | null;
  /** Value returned by `requestCompletion()`. */
  completion?: PPBCompletionResult | null;
  /** Value returned by `requestLLMCredentials()`. */
  llmCredentials?: PPBLLMCredentials | null;
  /** Value returned by `requestActivationInfo()`. */
  activation?: PPBActivationInfo | null;
  /** Value returned by `requestProtectedDownloadTicket()`. */
  downloadTicket?: PPBDownloadTicket | null;
  /** If true, `registerPPBplugin` throws (host rejects the handshake). */
  rejectRegistration?: boolean;
}

/**
 * A configurable `PPBHostApi` implementation that records interactions so tests can
 * assert on them, and can push config-change events to subscribers.
 */
export class MockPaperBellHost implements PPBHostApi {
  registeredSources: PPBRequestSource[] = [];
  unregisterCalls = 0;
  lastCompletionParams: PPBCompletionParams | null = null;

  pluginInfo: PaperBellPluginInfo;
  sharedConfig: PaperBellSharedConfigPublic | null;
  account: PaperBellAccountInfo | null;
  completion: PPBCompletionResult | null;
  llmCredentials: PPBLLMCredentials | null;
  activation: PPBActivationInfo | null;
  downloadTicket: PPBDownloadTicket | null;
  lastDownloadTicketParams: PPBDownloadTicketParams | undefined;
  private rejectRegistration: boolean;
  private configSubscribers: Array<(c: PaperBellSharedConfigPublic) => void> = [];

  constructor(opts: MockHostOptions = {}) {
    this.pluginInfo = {
      id: "paperbell",
      name: "PaperBell",
      version: "1.0.0",
      schemaVersion: 1,
      isActivated: true,
      capabilities: opts.capabilities ?? [...ALL_SCOPES],
    };
    this.sharedConfig = opts.sharedConfig ?? null;
    this.account = opts.account ?? null;
    this.completion = opts.completion ?? null;
    this.llmCredentials = opts.llmCredentials ?? null;
    this.activation = opts.activation ?? null;
    this.downloadTicket = opts.downloadTicket ?? null;
    this.rejectRegistration = opts.rejectRegistration ?? false;
  }

  registerPPBplugin(source: PPBRequestSource): PPBClient {
    if (this.rejectRegistration) {
      throw new Error("host rejected registration");
    }
    this.registeredSources.push(source);
    return {
      requestAccountInfo: async () => this.account,
      requestSharedConfig: async () => this.sharedConfig,
      requestPluginInfo: async () => this.pluginInfo,
      requestCompletion: async (params: PPBCompletionParams) => {
        this.lastCompletionParams = params;
        return this.completion;
      },
      requestLLMCredentials: async () => this.llmCredentials,
      requestActivationInfo: async () => this.activation,
      requestProtectedDownloadTicket: async (
        params?: PPBDownloadTicketParams
      ) => {
        this.lastDownloadTicketParams = params;
        return this.downloadTicket;
      },
      onConfigChange: (cb: (c: PaperBellSharedConfigPublic) => void) => {
        this.configSubscribers.push(cb);
        return () => {
          this.configSubscribers = this.configSubscribers.filter(
            (c) => c !== cb
          );
        };
      },
      unregister: () => {
        this.unregisterCalls++;
      },
    };
  }

  getPluginInfo(): PaperBellPluginInfo {
    return this.pluginInfo;
  }

  listGrants(): PPBGrant[] {
    return [];
  }

  revokeGrant(_sourceId: string): void {
    // no-op for tests
  }

  // ── test helpers ──────────────────────────────────────────────────────────
  /** Simulate the host broadcasting a public-config change to subscribers. */
  emitConfigChange(config: PaperBellSharedConfigPublic): void {
    this.configSubscribers.slice().forEach((cb) => cb(config));
  }

  /** How many live `onConfigChange` subscriptions exist. */
  configSubscriberCount(): number {
    return this.configSubscribers.length;
  }
}

/** A valid public shared config for tests, with an overridable schema version. */
export function makePublicConfig(
  overrides: Partial<PaperBellSharedConfigPublic> = {}
): PaperBellSharedConfigPublic {
  return {
    schemaVersion: 1,
    language: "en",
    llm: {
      providerId: "anthropic",
      providerName: "Anthropic",
      api: "anthropic",
      baseUrl: "https://gw.example",
      model: "claude",
      hasApiKey: true,
    },
    account: { displayName: "Jane Doe", plan: "pro", isActive: true },
    ...overrides,
  };
}
