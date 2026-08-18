import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { get } from "svelte/store";

import { PaperBellClient } from "src/paperbell/client";
import { paperbell } from "src/paperbell/store";
import { PPB_READY_EVENT } from "src/paperbell/shared-config";
import type {
  PaperBellRestrictedConfig,
  PPBCompletionResult,
  PPBProject,
} from "src/paperbell/shared-config";
import {
  MockPlugin,
  MockPaperBellHost,
  grantFor,
  makeRestrictedConfig,
  type MockHostOptions,
} from "./fixtures";

/** Let the client's fire-and-forget config refresh settle. */
const flush = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));

function newClient(): { client: PaperBellClient; plugin: MockPlugin } {
  const plugin = new MockPlugin();
  const client = new PaperBellClient(plugin as any);
  return { client, plugin };
}

let logSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  // The store is module-global; reset it before each test.
  paperbell.set({ connected: false, config: null, capabilities: [] });
  // Silence the client's connection log lines.
  logSpy = vi.spyOn(console, "log").mockImplementation((): void => undefined);
});

afterEach(() => {
  logSpy.mockRestore();
});

describe("PaperBellClient — standalone (no host)", () => {
  it("stays disconnected and registers exactly one ready listener", () => {
    const { client, plugin } = newClient();
    client.init();

    expect(client.connected).toBe(false);
    expect(get(paperbell).connected).toBe(false);
    // Waits for the host to announce itself later.
    expect(plugin.app.workspace.handlerCount(PPB_READY_EVENT)).toBe(1);
    expect(plugin.registeredEventRefs).toHaveLength(1);
  });

  it("no-ops all host-backed calls (returns null)", async () => {
    const { client } = newClient();
    client.init();

    expect(await client.fetchSharedConfig()).toBeNull();
    expect(await client.fetchAccountInfo()).toBeNull();
    expect(await client.requestCompletion({ messages: [] })).toBeNull();
    expect(await client.fetchProjects()).toBeNull();
  });
});

describe("PaperBellClient — project list (proposed `projects` scope)", () => {
  const PROJECTS: PPBProject[] = [
    { id: "p1", name: "Collective Memory", acronym: "ColMemo" },
  ];

  /** Connect to a host, opting it into the proposal via capability + options. */
  function connect(opts: MockHostOptions = {}): {
    client: PaperBellClient;
    host: MockPaperBellHost;
  } {
    const { client, plugin } = newClient();
    const host = new MockPaperBellHost({
      capabilities: ["plugin-info", "projects"],
      ...opts,
    });
    plugin.app.installHost(host);
    client.init();
    return { client, host };
  }

  it("returns the host's projects and passes the query through", async () => {
    const { client, host } = connect({
      projects: { ok: true, projects: PROJECTS },
    });

    const query = { status: ["active" as const] };
    expect(await client.fetchProjects(query)).toEqual(PROJECTS);
    expect(host.lastProjectsQuery).toEqual(query);
  });

  it("returns null when the host does not advertise the capability", async () => {
    // Capability list is the pre-proposal one, but the handle can serve projects:
    // we must still not call it, since consent is keyed on an unadvertised scope.
    const { client } = connect({
      capabilities: ["plugin-info", "config"],
      projects: { ok: true, projects: PROJECTS },
    });

    expect(await client.fetchProjects()).toBeNull();
  });

  it("returns null when the host advertises it but has no such method", async () => {
    // The realistic mixed case: a host that lies (or whose capabilities are stale)
    // while its client handle predates the proposal. Must not throw.
    const { client } = connect(); // capability set, `projects` option omitted

    expect(await client.fetchProjects()).toBeNull();
  });

  it("returns null when consent is denied", async () => {
    const { client } = connect({ projects: null });

    expect(await client.fetchProjects()).toBeNull();
  });

  it("returns null and warns when the host reports failure", async () => {
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation((): void => undefined);
    const { client } = connect({
      projects: { ok: false, projects: [], error: "no project index" },
    });

    expect(await client.fetchProjects()).toBeNull();
    expect(String(warnSpy.mock.calls[0]?.[1])).toContain("no project index");
    warnSpy.mockRestore();
  });

  it("returns null and warns when the host throws", async () => {
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation((): void => undefined);
    const { client } = connect({ projectsThrow: true });

    await expect(client.fetchProjects()).resolves.toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe("PaperBellClient — handshake", () => {
  it("connects on init when the host is already present (probe path)", () => {
    const { client, plugin } = newClient();
    const host = new MockPaperBellHost();
    plugin.app.installHost(host);

    client.init();

    expect(client.connected).toBe(true);
    const state = get(paperbell);
    expect(state.connected).toBe(true);
    expect(state.capabilities).toContain("llm-invoke");
    // Registers under our manifest id + display name.
    expect(host.registeredSources).toHaveLength(1);
    expect(host.registeredSources[0].id).toBe("longform-paperbell");
    expect(host.registeredSources[0].name).toBe("PaperOut To-Authors");
  });

  it("connects when PPB_READY_EVENT fires after init (event path)", () => {
    const { client, plugin } = newClient();
    client.init();
    expect(client.connected).toBe(false);

    const host = new MockPaperBellHost();
    plugin.app.workspace.trigger(PPB_READY_EVENT, host);

    expect(client.connected).toBe(true);
    expect(host.registeredSources).toHaveLength(1);
    expect(get(paperbell).connected).toBe(true);
  });

  it("re-handshakes (rather than stacking) when the ready event also fires", () => {
    const { client, plugin } = newClient();
    const host = new MockPaperBellHost();
    plugin.app.installHost(host);

    client.init(); // connects via probe
    plugin.app.workspace.trigger(PPB_READY_EVENT, host);

    // The host only broadcasts on load, so a second event means it reloaded and our
    // handle is dead. We drop it and register again — never hold two at once.
    expect(host.registeredSources).toHaveLength(2);
    expect(host.unregisterCalls).toBe(1);
    expect(host.configSubscriberCount()).toBe(1);
    expect(client.connected).toBe(true);
  });

  it("stays disconnected (and does not throw) if the host rejects registration", () => {
    const errSpy = vi
      .spyOn(console, "error")
      .mockImplementation((): void => undefined);
    const { client, plugin } = newClient();
    plugin.app.installHost(new MockPaperBellHost({ rejectRegistration: true }));

    expect(() => client.init()).not.toThrow();
    expect(client.connected).toBe(false);
    expect(get(paperbell).connected).toBe(false);
    errSpy.mockRestore();
  });
});

describe("PaperBellClient — recovery after the host reloads", () => {
  /**
   * Connect, then put the client in the state a PaperBell update leaves it in: a live
   * session (optionally having already pushed us `seedConfig`, as a real one would),
   * then a reload that turns our handle into a zombie, then a fresh host installed but
   * not yet announced. The test fires the ready event itself.
   */
  function connectThenReloadHost({
    newHost: newHostOpts = {},
    seedConfig,
  }: {
    newHost?: MockHostOptions;
    seedConfig?: PaperBellRestrictedConfig;
  } = {}): {
    client: PaperBellClient;
    plugin: MockPlugin;
    oldHost: MockPaperBellHost;
    newHost: MockPaperBellHost;
  } {
    const { client, plugin } = newClient();
    const oldHost = new MockPaperBellHost();
    plugin.app.installHost(oldHost);
    client.init();
    if (seedConfig) oldHost.emitConfigChange(seedConfig);

    oldHost.reload(); // the handle we hold is now a zombie
    const newHost = new MockPaperBellHost(newHostOpts);
    plugin.app.installHost(newHost);
    return { client, plugin, oldHost, newHost };
  }

  it("registers against the new host and releases the dead handle", () => {
    const { client, plugin, oldHost, newHost } = connectThenReloadHost();

    plugin.app.workspace.trigger(PPB_READY_EVENT, newHost);

    expect(client.connected).toBe(true);
    expect(newHost.registeredSources).toHaveLength(1);
    expect(oldHost.unregisterCalls).toBe(1);
    expect(get(paperbell).connected).toBe(true);
  });

  it("never holds two registrations, however often ready fires", () => {
    // What the old "does not double-register" guard was really protecting. We no
    // longer *skip* a repeat handshake (that is what left us on a dead handle), so
    // the invariant moved: every registration but the current one is unregistered.
    const { client, plugin } = newClient();
    const host = new MockPaperBellHost();
    plugin.app.installHost(host);
    client.init();

    for (let i = 0; i < 3; i++) {
      plugin.app.workspace.trigger(PPB_READY_EVENT, host);
    }

    expect(host.registeredSources).toHaveLength(4);
    expect(host.unregisterCalls).toBe(3);
    expect(host.configSubscriberCount()).toBe(1);
    expect(client.connected).toBe(true);
  });

  it("resubscribes, so config pushes reach the store again", () => {
    const { plugin, newHost } = connectThenReloadHost();

    plugin.app.workspace.trigger(PPB_READY_EVENT, newHost);
    expect(newHost.configSubscriberCount()).toBe(1);

    const cfg = makeRestrictedConfig({ language: "zh" });
    newHost.emitConfigChange(cfg);
    expect(get(paperbell).config).toEqual(cfg);
  });

  it("keeps the last known config so the UI does not flip back mid-reload", () => {
    const cfg = makeRestrictedConfig({ language: "zh" });
    const { plugin, newHost } = connectThenReloadHost({ seedConfig: cfg });
    expect(get(paperbell).config).toEqual(cfg);

    // The fresh host serves no config (nothing was granted), so anything still in the
    // store after this can only be what we deliberately carried over.
    plugin.app.workspace.trigger(PPB_READY_EVENT, newHost);

    expect(get(paperbell).config).toEqual(cfg);
  });

  it("keeps the last known config even if re-registering fails", () => {
    const errSpy = vi
      .spyOn(console, "error")
      .mockImplementation((): void => undefined);
    const cfg = makeRestrictedConfig({ language: "zh" });
    const { client, plugin, newHost } = connectThenReloadHost({
      newHost: { rejectRegistration: true },
      seedConfig: cfg,
    });

    plugin.app.workspace.trigger(PPB_READY_EVENT, newHost);

    // Disconnected, but not amnesiac: dropping the config here would cause exactly
    // the language flip the reconnect path goes out of its way to avoid.
    expect(client.connected).toBe(false);
    expect(get(paperbell)).toEqual({
      connected: false,
      config: cfg,
      capabilities: [],
    });
    errSpy.mockRestore();
  });

  it("refetches the config when that scope is already granted", async () => {
    const fresh = makeRestrictedConfig({ language: "zh" });
    const { plugin, newHost } = connectThenReloadHost({
      newHost: { sharedConfig: fresh, grants: [grantFor("config")] },
    });

    plugin.app.workspace.trigger(PPB_READY_EVENT, newHost);
    await flush();

    // The grant survives the reload, so this costs no consent prompt — and without
    // it we would keep serving whatever the host had before it restarted.
    expect(get(paperbell).config).toEqual(fresh);
  });

  it("does not refetch when we hold no grant (that would prompt for consent)", async () => {
    const { plugin, newHost } = connectThenReloadHost({
      newHost: { sharedConfig: makeRestrictedConfig() },
    });

    plugin.app.workspace.trigger(PPB_READY_EVENT, newHost);
    await flush();

    expect(get(paperbell).config).toBeNull();
  });

  it("requests nothing on a FIRST connect, grant or no grant", async () => {
    // Startup stays scope-free: the refetch is a recovery step, not a launch step.
    const { client, plugin } = newClient();
    plugin.app.installHost(
      new MockPaperBellHost({
        sharedConfig: makeRestrictedConfig(),
        grants: [grantFor("config")],
      })
    );

    client.init();
    await flush();

    expect(client.connected).toBe(true);
    expect(get(paperbell).config).toBeNull();
  });

  it("connects anyway when the host's grant list blows up", () => {
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation((): void => undefined);
    const { client, plugin, newHost } = connectThenReloadHost({
      newHost: { grantsThrow: true, grants: [grantFor("config")] },
    });

    expect(() =>
      plugin.app.workspace.trigger(PPB_READY_EVENT, newHost)
    ).not.toThrow();
    expect(client.connected).toBe(true);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe("PaperBellClient — config following", () => {
  it("updates the store when the host pushes a config change", () => {
    const { client, plugin } = newClient();
    const host = new MockPaperBellHost();
    plugin.app.installHost(host);
    client.init();

    expect(get(paperbell).config).toBeNull();

    const cfg = makeRestrictedConfig({ language: "zh" });
    host.emitConfigChange(cfg);

    expect(get(paperbell).config).toEqual(cfg);
    expect(get(paperbell).config?.language).toBe("zh");
  });

  it("warns when the host schema is newer than the vendored contract", () => {
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation((): void => undefined);
    const { client, plugin } = newClient();
    const host = new MockPaperBellHost();
    plugin.app.installHost(host);
    client.init();

    host.emitConfigChange(makeRestrictedConfig({ schemaVersion: 999 }));

    expect(warnSpy).toHaveBeenCalled();
    expect(String(warnSpy.mock.calls[0][0])).toContain("schemaVersion");
    warnSpy.mockRestore();
  });

  it("reflects host capabilities for feature gating", () => {
    const { client, plugin } = newClient();
    plugin.app.installHost(new MockPaperBellHost({ capabilities: ["config"] }));
    client.init();

    const caps = get(paperbell).capabilities;
    expect(caps).toEqual(["config"]);
    expect(caps.includes("llm-invoke")).toBe(false);
  });
});

describe("PaperBellClient — on-demand consented data", () => {
  it("fetchSharedConfig returns and stores the config", async () => {
    const cfg = makeRestrictedConfig();
    const { client, plugin } = newClient();
    plugin.app.installHost(new MockPaperBellHost({ sharedConfig: cfg }));
    client.init();

    const result = await client.fetchSharedConfig();

    expect(result).toEqual(cfg);
    expect(get(paperbell).config).toEqual(cfg);
  });

  it("fetchSharedConfig leaves the store untouched when denied (null)", async () => {
    const { client, plugin } = newClient();
    plugin.app.installHost(new MockPaperBellHost({ sharedConfig: null }));
    client.init();

    expect(await client.fetchSharedConfig()).toBeNull();
    expect(get(paperbell).config).toBeNull();
  });

  it("requestCompletion proxies to the host and passes params through", async () => {
    const done: PPBCompletionResult = { ok: true, text: "hi", model: "claude" };
    const { client, plugin } = newClient();
    const host = new MockPaperBellHost({ completion: done });
    plugin.app.installHost(host);
    client.init();

    const params = {
      messages: [{ role: "user" as const, content: "yo" }],
      system: "be terse",
    };
    const res = await client.requestCompletion(params);

    expect(res).toEqual(done);
    expect(host.lastCompletionParams).toEqual(params);
  });
});

describe("PaperBellClient — teardown", () => {
  it("destroy unregisters, unsubscribes, and resets the store", () => {
    const { client, plugin } = newClient();
    const host = new MockPaperBellHost();
    plugin.app.installHost(host);
    client.init();
    expect(host.configSubscriberCount()).toBe(1);

    client.destroy();

    expect(host.unregisterCalls).toBe(1);
    expect(host.configSubscriberCount()).toBe(0);
    expect(client.connected).toBe(false);
    expect(get(paperbell)).toEqual({
      connected: false,
      config: null,
      capabilities: [],
    });
  });
});

describe("PaperBellClient — settings deep-link", () => {
  it("the registered source's onOpen opens our settings tab", () => {
    const { client, plugin } = newClient();
    const host = new MockPaperBellHost();
    plugin.app.installHost(host);
    client.init();

    host.registeredSources[0].onOpen?.();

    expect(plugin.app.setting.openCalls).toBe(1);
    expect(plugin.app.setting.openedTabIds).toContain("longform-paperbell");
  });
});
