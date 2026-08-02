import { describe, expect, it, vi } from "vitest";
import { get, writable } from "svelte/store";

import { SubscriptionSet } from "src/utils/subscription-set";

describe("SubscriptionSet", () => {
  it("survives a second teardown on a store with no other subscribers", () => {
    // The exact crash users reported: svelte 3's unsubscriber nulls its `stop`
    // once the subscriber count hits zero, so calling it again throws
    // "TypeError: stop is not a function". Deliberately uses a REAL svelte
    // store, not a stub — this test is worthless if it can't reproduce that.
    const store = writable(0);
    const subs = new SubscriptionSet();
    subs.add(store.subscribe(() => undefined));

    subs.teardown();
    expect(() => subs.teardown()).not.toThrow();
  });

  it("calls each unsubscriber exactly once across repeated teardowns", () => {
    // Pins the implementation invariant, not just the symptom: swallowing the
    // second call in a try/catch would pass the test above but fail this one.
    const a = vi.fn();
    const b = vi.fn();
    const subs = new SubscriptionSet();
    subs.add(a);
    subs.add(b);

    subs.teardown();
    subs.teardown();

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("finishes the cleanup when one unsubscriber throws", () => {
    // One bad subscription must not strand the others — that is how a single
    // failure used to poison the whole settings tab.
    const boom = (): void => {
      throw new Error("boom");
    };
    const after = vi.fn();
    const subs = new SubscriptionSet();
    subs.add(boom);
    subs.add(after);

    const errors = vi
      .spyOn(console, "error")
      .mockImplementation((): void => undefined);
    expect(() => subs.teardown()).not.toThrow();
    errors.mockRestore();

    expect(after).toHaveBeenCalledTimes(1);
    // And a throwing unsubscriber is still dropped, not retried.
    subs.teardown();
    expect(after).toHaveBeenCalledTimes(1);
  });

  it("leaves the store re-subscribable and still notifying", () => {
    // Guards against "fixing" the crash by leaving the store in svelte's
    // not-ready state (stop === null), where set() silently stops notifying.
    const store = writable(0);
    const subs = new SubscriptionSet();
    subs.add(store.subscribe(() => undefined));
    subs.teardown();

    const seen: number[] = [];
    const again = new SubscriptionSet();
    again.add(store.subscribe((v) => seen.push(v)));
    store.set(42);
    again.teardown();

    expect(seen).toEqual([0, 42]);
    expect(get(store)).toBe(42);
  });
});
