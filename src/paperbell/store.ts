import { writable } from "svelte/store";

import type { PaperBellSharedConfigPublic, PPBScope } from "./shared-config";

/**
 * Reactive state of our connection to the PaperBell host plugin. Populated by
 * `PaperBellClient` (see `client.ts`) and read by the settings UI and future
 * host-backed features. When PaperBell is absent this stays at {@link DISCONNECTED}.
 */
export interface PaperBellState {
  /** True once we have handshaked with (registered against) the PaperBell host. */
  connected: boolean;
  /**
   * Latest public (key-free) shared config. `null` until the user grants the
   * `config` scope (first `requestSharedConfig`) or the host pushes a change.
   */
  config: PaperBellSharedConfigPublic | null;
  /** Host-advertised capabilities, from plugin-info. Used to gate features (e.g. `llm-invoke`). */
  capabilities: PPBScope[];
}

export const DISCONNECTED: PaperBellState = {
  connected: false,
  config: null,
  capabilities: [],
};

export const paperbell = writable<PaperBellState>({ ...DISCONNECTED });
