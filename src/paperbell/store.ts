import { writable } from "svelte/store";

import type { PaperBellRestrictedConfig, PPBScope } from "./shared-config";

/**
 * Reactive state of our connection to the PaperBell host plugin. Populated by
 * `PaperBellClient` (see `client.ts`) and read by the settings UI and future
 * host-backed features. When PaperBell is absent this stays at {@link DISCONNECTED}.
 */
export interface PaperBellState {
  /** True once we have handshaked with (registered against) the PaperBell host. */
  connected: boolean;
  /**
   * Latest restricted (key-free) shared config. `null` until the user grants the
   * `config` scope (first `requestSharedConfig`) or the host pushes a change.
   * Survives a host reload — see `client.ts`, `attach()`.
   */
  config: PaperBellRestrictedConfig | null;
  /** Host-advertised capabilities, from plugin-info. Used to gate features (e.g. `llm-invoke`). */
  capabilities: PPBScope[];
}

export const DISCONNECTED: PaperBellState = {
  connected: false,
  config: null,
  capabilities: [],
};

export const paperbell = writable<PaperBellState>({ ...DISCONNECTED });
