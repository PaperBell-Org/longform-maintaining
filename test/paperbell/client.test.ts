import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { get } from "svelte/store";

import { PaperBellClient } from "src/paperbell/client";
import { paperbell } from "src/paperbell/store";
import { PPB_READY_EVENT } from "src/paperbell/shared-config";
import type { PPBCompletionResult } from "src/paperbell/shared-config";
import { MockPlugin, MockPaperBellHost, makePublicConfig } from "./fixtures";

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

  it("does not double-register if the ready event also fires", () => {
    const { client, plugin } = newClient();
    const host = new MockPaperBellHost();
    plugin.app.installHost(host);

    client.init(); // connects via probe
    plugin.app.workspace.trigger(PPB_READY_EVENT, host); // must be ignored

    expect(host.registeredSources).toHaveLength(1);
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

describe("PaperBellClient — config following", () => {
  it("updates the store when the host pushes a config change", () => {
    const { client, plugin } = newClient();
    const host = new MockPaperBellHost();
    plugin.app.installHost(host);
    client.init();

    expect(get(paperbell).config).toBeNull();

    const cfg = makePublicConfig({ language: "zh" });
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

    host.emitConfigChange(makePublicConfig({ schemaVersion: 999 }));

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
    const cfg = makePublicConfig();
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
