/**
 * Instance lifecycle (design 2.4): deterministic, exactly-once teardown
 * in a fixed order; transient moves survive, real removal destroys after one
 * microtask; one compatible runtime owns the document.
 */
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { component, html } from "../../src/index";
import { hydrate } from "../../src/client/hydrate";
import { unmount } from "../../src/client/instance";
import { RUNTIME_PROTOCOL } from "../../src/client/runtime-owner";

const created: HTMLElement[] = [];

function island(inner: string, attributes = `data-taipa-version="1"`): HTMLElement {
  const template = document.createElement("template");
  template.innerHTML = `<taipa-island ${attributes}>${inner}</taipa-island>`;
  const host = template.content.firstElementChild as HTMLElement;
  document.body.append(host);
  created.push(host);
  return host;
}

/** Drain microtasks (incl. MutationObserver callbacks) plus one macrotask. */
function tick(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

afterEach(() => {
  for (const host of created.splice(0)) {
    host.remove();
  }
});

describe("teardown", () => {
  test("destroy() runs connected, effect, and binding cleanups then abort, exactly once", () => {
    const order: string[] = [];
    const teardown = component("teardown", { contractVersion: "1" })
      .state("count", 0)
      .bind("out", ({ element, state }) => {
        element.textContent = String(state.count());
        return () => {
          order.push("binding-cleanup");
        };
      })
      .effect(({ state }) => {
        state.count();
        return () => {
          order.push("effect-cleanup");
        };
      })
      .connected(({ signal }) => {
        signal.addEventListener("abort", () => {
          order.push("abort");
        });
        return () => {
          order.push("connected1");
        };
      })
      .connected(() => () => {
        order.push("connected2");
      })
      .render(() => html`<output data-taipa-ref="out"></output>`);
    const host = island(`<output data-taipa-ref="out"></output>`);
    const instance = hydrate(host, teardown);

    instance.destroy();
    expect(order).toEqual([
      "connected2",
      "connected1",
      "effect-cleanup",
      "binding-cleanup",
      "abort",
    ]);

    order.length = 0;
    instance.destroy();
    expect(order).toEqual([]);
  });

  test("destroy() detaches listeners and stops reactivity without node churn", () => {
    const handler = vi.fn();
    const probe = component("probe", { contractVersion: "1" })
      .state("count", 0)
      .bind("out", ({ element, state }) => {
        element.textContent = String(state.count());
      })
      .on("btn@click", handler)
      .render(() => html`<span>x</span>`);
    const host = island(
      `<button data-taipa-ref="btn">b</button><output data-taipa-ref="out"></output>`,
    );
    const instance = hydrate(host, probe);
    const before = [...host.querySelectorAll("*")];

    host.querySelector("button")?.click();
    expect(handler).toHaveBeenCalledTimes(1);

    instance.destroy();
    host.querySelector("button")?.click();
    instance.state.count(99);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(host.querySelector("output")?.textContent).toBe("0");
    expect([...host.querySelectorAll("*")]).toEqual(before);
    expect(host.hasAttribute("data-taipa-error")).toBe(false);
  });

  test("the context signal is aborted by destroy", () => {
    let observed: AbortSignal | undefined;
    const probe = component("probe", { contractVersion: "1" })
      .connected(({ signal }) => {
        observed = signal;
      })
      .render(() => html`<span>x</span>`);
    const host = island(`<span></span>`);
    const instance = hydrate(host, probe);
    expect(observed?.aborted).toBe(false);
    instance.destroy();
    expect(observed?.aborted).toBe(true);
  });

  test("unmount() destroys a live instance once and reports false afterwards", () => {
    const cleanup = vi.fn();
    const probe = component("probe", { contractVersion: "1" })
      .connected(() => cleanup)
      .render(() => html`<span>x</span>`);
    const host = island(`<span></span>`);
    hydrate(host, probe);

    expect(unmount(host)).toBe(true);
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(unmount(host)).toBe(false);
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  test("async handler rejections surface as taipa:error with phase event", async () => {
    const failure = new Error("handler failed");
    const probe = component("probe", { contractVersion: "1" })
      .on("btn@click", () => Promise.reject(failure))
      .render(() => html`<span>x</span>`);
    const host = island(`<button data-taipa-ref="btn">b</button>`);
    const errors: CustomEvent[] = [];
    host.addEventListener("taipa:error", (event) => errors.push(event as CustomEvent));
    hydrate(host, probe);

    host.querySelector("button")?.click();
    await tick();

    expect(errors).toHaveLength(1);
    expect(errors[0]?.detail).toMatchObject({ component: "probe", phase: "event" });
    expect(errors[0]?.detail.error).toBe(failure);
  });
});

describe("disconnection semantics", () => {
  test("moving the host within the document keeps the instance alive with its state", async () => {
    const probe = component("probe", { contractVersion: "1" })
      .state("count", 5)
      .bind("out", ({ element, state }) => {
        element.textContent = String(state.count());
      })
      .render(() => html`<output data-taipa-ref="out"></output>`);
    const host = island(`<output data-taipa-ref="out"></output>`);
    const instance = hydrate(host, probe);

    const container = document.createElement("section");
    document.body.append(container);
    created.push(container);
    container.append(host);
    await tick();

    expect(instance.state.count()).toBe(5);
    expect(host.querySelector("output")?.textContent).toBe("5");
    instance.state.count(6);
    expect(host.querySelector("output")?.textContent).toBe("6");
  });

  test("removing the host destroys the instance after the deferred check", async () => {
    const cleanup = vi.fn();
    const probe = component("probe", { contractVersion: "1" })
      .connected(() => cleanup)
      .render(() => html`<span>x</span>`);
    const host = island(`<span></span>`);
    hydrate(host, probe);

    host.remove();
    expect(cleanup).not.toHaveBeenCalled();
    await tick();

    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  test("reinserting after a completed removal does not resurrect the instance", async () => {
    const cleanup = vi.fn();
    const probe = component("probe", { contractVersion: "1" })
      .connected(() => cleanup)
      .render(() => html`<span>x</span>`);
    const host = island(`<span></span>`);
    hydrate(host, probe);

    host.remove();
    await tick();
    document.body.append(host);
    await tick();

    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(unmount(host)).toBe(false);
  });
});

describe("runtime ownership", () => {
  const registryKey = Symbol.for("taipa.ui/runtime");

  function swapRegistry(value: unknown): () => void {
    const global = globalThis as Record<PropertyKey, unknown>;
    const original = global[registryKey];
    global[registryKey] = value;
    return () => {
      global[registryKey] = original;
    };
  }

  test("an incompatible owner is rejected without a takeover", () => {
    const restore = swapRegistry({ protocol: 999 });
    try {
      const host = island(`<span></span>`);
      const probe = component("probe", { contractVersion: "1" }).render(() => html`<span>x</span>`);
      expect(() => hydrate(host, probe)).toThrowError(/incompatible taipa runtime/);
      expect((globalThis as Record<PropertyKey, unknown>)[registryKey]).toEqual({
        protocol: 999,
      });
    } finally {
      restore();
    }
  });

  test("a compatible owner is shared, not replaced", () => {
    const shared = {
      protocol: RUNTIME_PROTOCOL,
      instances: new WeakMap<Element, unknown>(),
      live: new Set<Element>(),
      watched: new Map<Document, unknown>(),
    };
    const restore = swapRegistry(shared);
    try {
      const host = island(`<span></span>`);
      const probe = component("probe", { contractVersion: "1" }).render(() => html`<span>x</span>`);
      const instance = hydrate(host, probe);
      expect(shared.instances.get(host)).toBe(instance);
      instance.destroy();
      expect(shared.instances.get(host)).toBeUndefined();
      expect(shared.live.has(host)).toBe(false);
    } finally {
      restore();
    }
  });
});
