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
  PaperBellRestrictedConfig,
  PaperBellActivationInfo,
  PPBClient,
  PPBCompletionParams,
  PPBCompletionResult,
  PPBProtectedDownloadTicket,
  PPBProtectedDownloadParams,
  PPBGrant,
  PPBHostApi,
  PaperBellLLMCredentials,
  PPBProjectsQuery,
  PPBProjectsResult,
  PPBRequestSource,
  PPBScope,
} from "src/paperbell/shared-config";
import { THIS_PLUGIN_ID, THIS_PLUGIN_NAME } from "src/paperbell/client";

/**
 * The full set of scopes the real host advertises today.
 *
 * `projects` is deliberately NOT here: it is a proposal no shipped host implements
 * (see docs/PROPOSAL_PROJECTS_SCOPE.md), so the default mock reproduces the "host
 * too old" case that our degradation path has to survive.
 */
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
  sharedConfig?: PaperBellRestrictedConfig | null;
  /** Value returned by `requestAccountInfo()`. */
  account?: PaperBellAccountInfo | null;
  /** Value returned by `requestCompletion()`. */
  completion?: PPBCompletionResult | null;
  /** Value returned by `requestLLMCredentials()`. */
  llmCredentials?: PaperBellLLMCredentials | null;
  /** Value returned by `requestActivationInfo()`. */
  activation?: PaperBellActivationInfo | null;
  /** Value returned by `requestProtectedDownloadTicket()`. */
  downloadTicket?: PPBProtectedDownloadTicket | null;
  /** If true, `registerPPBplugin` throws (host rejects the handshake). */
  rejectRegistration?: boolean;
  /**
   * Value returned by the proposed `requestProjects()`. Providing it also makes
   * the mock *implement* the method — omit it to mimic a host predating the
   * proposal, whose client handle has no such method at all.
   */
  projects?: PPBProjectsResult | null;
  /** If true, `requestProjects()` rejects (host blew up mid-call). */
  projectsThrow?: boolean;
  /** Grants the user has already approved, as `listGrants()` reports them. */
  grants?: PPBGrant[];
  /** If true, `listGrants()` throws (host blew up). */
  grantsThrow?: boolean;
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
  sharedConfig: PaperBellRestrictedConfig | null;
  account: PaperBellAccountInfo | null;
  completion: PPBCompletionResult | null;
  llmCredentials: PaperBellLLMCredentials | null;
  activation: PaperBellActivationInfo | null;
  downloadTicket: PPBProtectedDownloadTicket | null;
  lastDownloadTicketParams: PPBProtectedDownloadParams | undefined;
  lastProjectsQuery: PPBProjectsQuery | undefined;
  private projects: PPBProjectsResult | null | undefined;
  private projectsThrow: boolean;
  private grants: PPBGrant[];
  private grantsThrow: boolean;
  /** Set by {@link reload}; makes every handle this host already issued inert. */
  private stale = false;
  private rejectRegistration: boolean;
  private configSubscribers: Array<(c: PaperBellRestrictedConfig) => void> = [];

  constructor(opts: MockHostOptions = {}) {
    this.pluginInfo = {
      id: "paperbell",
      name: "PaperBell",
      version: "1.0.0",
      schemaVersion: 2,
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
    this.projects = opts.projects;
    this.projectsThrow = opts.projectsThrow ?? false;
    this.grants = opts.grants ?? [];
    this.grantsThrow = opts.grantsThrow ?? false;
  }

  /** Whether this mock pretends to be new enough to serve a project list. */
  private get implementsProjects(): boolean {
    return this.projects !== undefined || this.projectsThrow;
  }

  registerPPBplugin(source: PPBRequestSource): PPBClient {
    if (this.rejectRegistration) {
      throw new Error("host rejected registration");
    }
    this.registeredSources.push(source);
    // Spread the optional method in only when this mock claims to support it, so
    // an "old host" handle genuinely lacks the property rather than having an
    // undefined one — that is exactly what the client's typeof check looks at.
    const projectsApi = this.implementsProjects
      ? {
          requestProjects: async (params?: PPBProjectsQuery) => {
            this.lastProjectsQuery = params;
            if (this.projectsThrow) throw new Error("host exploded");
            return this.stale ? null : this.projects ?? null;
          },
        }
      : {};
    // Everything a handle can answer goes through here, so {@link reload} makes the
    // WHOLE handle inert in one place — a real 0.4.7 host nulls every `request*`, and a
    // mock that only nulled some of them would let a test pass against a zombie.
    const live = <T>(value: T): T | null => (this.stale ? null : value);
    return {
      ...projectsApi,
      requestAccountInfo: async () => live(this.account),
      requestSharedConfig: async () => live(this.sharedConfig),
      requestPluginInfo: async () => live(this.pluginInfo),
      requestCompletion: async (params: PPBCompletionParams) => {
        this.lastCompletionParams = params;
        return live(this.completion);
      },
      requestLLMCredentials: async () => live(this.llmCredentials),
      requestActivationInfo: async () => live(this.activation),
      requestProtectedDownloadTicket: async (
        params?: PPBProtectedDownloadParams
      ) => {
        this.lastDownloadTicketParams = params;
        return live(this.downloadTicket);
      },
      onConfigChange: (cb: (c: PaperBellRestrictedConfig) => void) => {
        if (!this.stale) this.configSubscribers.push(cb);
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
    if (this.grantsThrow) throw new Error("host exploded");
    return this.grants;
  }

  revokeGrant(_sourceId: string): void {
    // no-op for tests
  }

  // ── test helpers ──────────────────────────────────────────────────────────
  /**
   * Mimic PaperBell 0.4.7 being reloaded: handles it already handed out keep working
   * as objects but go inert — every `request*` resolves to `null` (no throw) and the
   * config push is gone. A test then installs a fresh host and fires the ready event,
   * which is exactly what the real host does on each load.
   */
  reload(): void {
    this.stale = true;
    this.configSubscribers = [];
  }

  /** Simulate the host pushing a restricted-config change to its subscribers. */
  emitConfigChange(config: PaperBellRestrictedConfig): void {
    this.configSubscribers.slice().forEach((cb) => cb(config));
  }

  /** How many live `onConfigChange` subscriptions exist. */
  configSubscriberCount(): number {
    return this.configSubscribers.length;
  }
}

/**
 * A grant of `scopes` to our own plugin id, as the host would report it. Reuses the
 * client's own constants: a copy that drifted would make `hasGrant` quietly return
 * false and the test pass for the wrong reason.
 */
export function grantFor(...scopes: PPBScope[]): PPBGrant {
  return {
    sourceId: THIS_PLUGIN_ID,
    sourceName: THIS_PLUGIN_NAME,
    scopes,
    grantedAt: 0,
  };
}

/** A valid restricted shared config for tests, with an overridable schema version. */
export function makeRestrictedConfig(
  overrides: Partial<PaperBellRestrictedConfig> = {}
): PaperBellRestrictedConfig {
  return {
    schemaVersion: 2,
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
