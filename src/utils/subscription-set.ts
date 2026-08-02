import type { Unsubscriber } from "svelte/store";

/**
 * A collection of store subscriptions that can be torn down exactly once.
 *
 * Svelte 3's writable unsubscriber is **not** idempotent: calling it a second
 * time, once the store has no other subscribers, dereferences an already-nulled
 * `stop` and throws `TypeError: stop is not a function`. The settings tab used
 * to keep three `Unsubscriber` fields and call them from both `hide()` and
 * `display()` without clearing them, so every hide→display cycle double-called
 * the same functions. The throw escaped `display()`, and since Obsidian's
 * `openTab` empties the tab container *before* calling `hide()`/`renderTab()`
 * and wraps neither in a try/catch, the settings pane went permanently blank —
 * only a plugin reload recovered it.
 *
 * Hence the two invariants below: clear before calling (so a throw can never
 * leave a stale reference behind), and isolate each call (so one bad
 * subscription cannot block the rest of the cleanup).
 */
export class SubscriptionSet {
  private subs: Unsubscriber[] = [];

  add(unsubscribe: Unsubscriber): void {
    this.subs.push(unsubscribe);
  }

  /**
   * Unsubscribe everything. Safe to call any number of times, in any order,
   * and safe even if an individual unsubscriber throws.
   */
  teardown(): void {
    // Detach first: if a call below throws, the set is already empty, so the
    // next teardown() cannot call the same unsubscriber twice.
    const subs = this.subs;
    this.subs = [];
    for (const unsubscribe of subs) {
      try {
        unsubscribe();
      } catch (e) {
        console.error("[PaperOut] Failed to unsubscribe a store:", e);
      }
    }
  }
}
