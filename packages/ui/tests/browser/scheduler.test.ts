/**
 * Policy scheduler (design 4.2, AE3): every policy is a cancellable schedule
 * that rechecks host connection before firing. idle degrades to after-load or
 * next-macrotask without requestIdleCallback; visible degrades to load
 * without IntersectionObserver; policy/timeout/root-margin values are
 * validated data (KTD9) — invalid values fail before any scheduling.
 */
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { resolvePolicy, schedulePolicy } from "../../src/client/scheduler";

const hosts: HTMLElement[] = [];

function island(attributes: string, attach = true): HTMLElement {
  const template = document.createElement("template");
  template.innerHTML = `<taipa-island ${attributes}></taipa-island>`;
  const host = template.content.firstElementChild as HTMLElement;
  if (attach) {
    document.body.append(host);
  }
  hosts.push(host);
  return host;
}

function tick(ms = 0): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("waitFor timed out");
    }
    await tick(10);
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  for (const host of hosts.splice(0)) {
    host.remove();
  }
});

describe("resolvePolicy", () => {
  test("returns null for static islands (no data-taipa-hydrate)", () => {
    expect(resolvePolicy(island(`data-taipa-component="x"`))).toBeNull();
  });

  test("parses each supported policy", () => {
    expect(resolvePolicy(island(`data-taipa-hydrate="load"`))).toEqual({ policy: "load" });
    expect(resolvePolicy(island(`data-taipa-hydrate="only"`))).toEqual({ policy: "only" });
    expect(
      resolvePolicy(island(`data-taipa-hydrate="idle" data-taipa-idle-timeout="500"`)),
    ).toEqual({ policy: "idle", idleTimeout: 500 });
    expect(
      resolvePolicy(island(`data-taipa-hydrate="visible" data-taipa-visible-root-margin="100px"`)),
    ).toEqual({ policy: "visible", visibleRootMargin: "100px" });
  });

  test("visible without an explicit margin carries no override (default applied later)", () => {
    expect(resolvePolicy(island(`data-taipa-hydrate="visible"`))).toEqual({ policy: "visible" });
  });

  test("rejects unknown policy values", () => {
    expect(() => resolvePolicy(island(`data-taipa-hydrate="eager"`))).toThrowError(
      /invalid hydration policy "eager"/,
    );
  });

  test("rejects malformed and negative idle timeouts", () => {
    for (const bad of ["abc", "-5", "Infinity", ""]) {
      const host = island(`data-taipa-hydrate="idle" data-taipa-idle-timeout="${bad}"`);
      expect(() => resolvePolicy(host)).toThrowError(/idle-timeout/i);
      host.remove();
    }
  });

  test("rejects blank visible root margins", () => {
    expect(() =>
      resolvePolicy(island(`data-taipa-hydrate="visible" data-taipa-visible-root-margin="  "`)),
    ).toThrowError(/root-margin/i);
  });
});

describe("schedulePolicy: load and only", () => {
  test("load fires asynchronously, never synchronously", async () => {
    const fire = vi.fn();
    const task = schedulePolicy(island(`data-taipa-hydrate="load"`), { policy: "load" }, fire);
    expect(fire).not.toHaveBeenCalled();
    await tick();
    expect(fire).toHaveBeenCalledTimes(1);
    task.cancel();
  });

  test("cancelling load before the microtask prevents activation (AE3)", async () => {
    const fire = vi.fn();
    const task = schedulePolicy(island(`data-taipa-hydrate="load"`), { policy: "load" }, fire);
    task.cancel();
    await tick(20);
    expect(fire).not.toHaveBeenCalled();
  });

  test("only imports immediately with load-equivalent timing", async () => {
    const fire = vi.fn();
    schedulePolicy(island(`data-taipa-hydrate="only"`), { policy: "only" }, fire);
    await tick();
    expect(fire).toHaveBeenCalledTimes(1);
  });

  test("a host removed from the document before firing is not activated", async () => {
    const host = island(`data-taipa-hydrate="load"`);
    const fire = vi.fn();
    schedulePolicy(host, { policy: "load" }, fire);
    host.remove();
    await tick(20);
    expect(fire).not.toHaveBeenCalled();
  });
});

describe("schedulePolicy: idle", () => {
  test("idle fires through requestIdleCallback and respects cancel", async () => {
    expect(typeof window.requestIdleCallback).toBe("function");
    const fire = vi.fn();
    const task = schedulePolicy(
      island(`data-taipa-hydrate="idle"`),
      { policy: "idle", idleTimeout: 200 },
      fire,
    );
    await waitFor(() => fire.mock.calls.length > 0);
    expect(fire).toHaveBeenCalledTimes(1);

    const cancelled = vi.fn();
    const second = schedulePolicy(
      island(`data-taipa-hydrate="idle"`),
      { policy: "idle", idleTimeout: 5000 },
      cancelled,
    );
    second.cancel();
    await tick(50);
    expect(cancelled).not.toHaveBeenCalled();
    task.cancel();
  });

  test("idle without requestIdleCallback fires after load state via a macrotask", async () => {
    vi.stubGlobal("requestIdleCallback", undefined);
    const fire = vi.fn();
    schedulePolicy(island(`data-taipa-hydrate="idle"`), { policy: "idle" }, fire);
    await waitFor(() => fire.mock.calls.length > 0);
    expect(fire).toHaveBeenCalledTimes(1);
  });

  test("idle fallback waits for the window load event while the document is loading", async () => {
    vi.stubGlobal("requestIdleCallback", undefined);
    const original = Object.getOwnPropertyDescriptor(Document.prototype, "readyState");
    Object.defineProperty(document, "readyState", { configurable: true, value: "loading" });
    try {
      const fire = vi.fn();
      const task = schedulePolicy(island(`data-taipa-hydrate="idle"`), { policy: "idle" }, fire);
      await tick(50);
      expect(fire).not.toHaveBeenCalled();
      window.dispatchEvent(new Event("load"));
      await waitFor(() => fire.mock.calls.length > 0);
      expect(fire).toHaveBeenCalledTimes(1);
      task.cancel();
    } finally {
      if (original) {
        Object.defineProperty(document, "readyState", original);
      }
    }
  });

  test("cancelling the idle fallback before load prevents activation", async () => {
    vi.stubGlobal("requestIdleCallback", undefined);
    const original = Object.getOwnPropertyDescriptor(Document.prototype, "readyState");
    Object.defineProperty(document, "readyState", { configurable: true, value: "loading" });
    try {
      const fire = vi.fn();
      const task = schedulePolicy(island(`data-taipa-hydrate="idle"`), { policy: "idle" }, fire);
      task.cancel();
      window.dispatchEvent(new Event("load"));
      await tick(50);
      expect(fire).not.toHaveBeenCalled();
    } finally {
      if (original) {
        Object.defineProperty(document, "readyState", original);
      }
    }
  });
});

describe("schedulePolicy: visible", () => {
  test("fires once when the host intersects, then disconnects", async () => {
    const fire = vi.fn();
    schedulePolicy(island(`data-taipa-hydrate="visible"`), { policy: "visible" }, fire);
    await waitFor(() => fire.mock.calls.length > 0);
    expect(fire).toHaveBeenCalledTimes(1);
    await tick(50);
    expect(fire).toHaveBeenCalledTimes(1);
  });

  test("passes rootMargin to IntersectionObserver and ignores non-intersecting entries", () => {
    let callback: IntersectionObserverCallback | undefined;
    const disconnect = vi.fn();
    const observe = vi.fn();
    const observedOptions: IntersectionObserverInit[] = [];
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(cb: IntersectionObserverCallback, options?: IntersectionObserverInit) {
          callback = cb;
          observedOptions.push(options ?? {});
        }

        observe = observe;
        disconnect = disconnect;
      },
    );
    const fire = vi.fn();
    const host = island(`data-taipa-hydrate="visible"`);

    schedulePolicy(host, { policy: "visible", visibleRootMargin: "123px 0px" }, fire);

    expect(observedOptions).toEqual([{ rootMargin: "123px 0px" }]);
    expect(observe).toHaveBeenCalledWith(host);
    callback?.(
      [{ isIntersecting: false } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    );
    expect(fire).not.toHaveBeenCalled();
    callback?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(fire).toHaveBeenCalledTimes(1);
  });

  test("cancelling visible before intersection prevents activation", async () => {
    const fire = vi.fn();
    const task = schedulePolicy(
      island(`data-taipa-hydrate="visible"`),
      { policy: "visible" },
      fire,
    );
    task.cancel();
    await tick(150);
    expect(fire).not.toHaveBeenCalled();
  });

  test("visible without IntersectionObserver degrades to load", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const fire = vi.fn();
    schedulePolicy(island(`data-taipa-hydrate="visible"`), { policy: "visible" }, fire);
    expect(fire).not.toHaveBeenCalled();
    await tick(20);
    expect(fire).toHaveBeenCalledTimes(1);
  });
});
