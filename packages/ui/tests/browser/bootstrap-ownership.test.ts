/**
 * Bootstrap ownership (KTD15): the document coordinator owns hosts and loader
 * promises, while each bootstrap handle owns only its claims/schedules.
 */
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { component, html } from "../../src/index";
import { bootstrap } from "../../src/client/bootstrap";
import { unmount } from "../../src/client/instance";
import { RUNTIME_PROTOCOL } from "../../src/client/runtime-owner";

const elements: Element[] = [];
const handles: { destroy(): void }[] = [];
const RUNTIME_KEY = Symbol.for("taipa.ui/runtime");

function wait(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function payload(start: number): string {
  return `<script type="application/json" data-taipa-props>{"start":${start}}</script>`;
}

function host(start = 1): HTMLElement {
  const template = document.createElement("template");
  template.innerHTML = `<taipa-island data-taipa-component="Counter" data-taipa-hydrate="load" data-taipa-version="1"><button data-taipa-ref="button">+</button><output data-taipa-ref="label"></output>${payload(start)}</taipa-island>`;
  const island = template.content.firstElementChild as HTMLElement;
  document.body.append(island);
  elements.push(island);
  return island;
}

function counter() {
  return component<{ start: number }>("Counter", { contractVersion: "1" })
    .state("count", ({ props }) => props.start)
    .bind("label", ({ state, element }) => {
      element.textContent = String(state.count());
    })
    .on("button@click", ({ state }) => {
      state.count(state.count() + 1);
    })
    .render(({ state }) => html`<output>${state.count()}</output>`);
}

function track<T extends { destroy(): void }>(handle: T): T {
  handles.push(handle);
  return handle;
}

afterEach(() => {
  for (const handle of handles.splice(0)) {
    handle.destroy();
  }
  for (const element of elements.splice(0)) {
    element.remove();
  }
});

describe("bootstrap ownership", () => {
  test("overlapping handles share one active instance; only the last destroy unmounts it", async () => {
    const island = host(1);
    const load = vi.fn(async () => ({ default: counter() }));

    const first = track(bootstrap({ registry: { Counter: load } }));
    await wait();
    await wait();
    const second = track(bootstrap({ registry: { Counter: load } }));
    await wait();

    expect(load).toHaveBeenCalledTimes(1);
    expect(island.querySelector("output")?.textContent).toBe("1");

    first.destroy();
    island.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(island.querySelector("output")?.textContent).toBe("2");

    second.destroy();
    island.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(island.querySelector("output")?.textContent).toBe("2");
    expect(unmount(island)).toBe(false);
  });

  test("destroying a peer handle does not cancel another handle's pending load", async () => {
    const island = host(3);
    let resolveModule: (module: Record<string, unknown>) => void = () => {};
    const load = vi.fn(
      () =>
        new Promise<Record<string, unknown>>((resolve) => {
          resolveModule = resolve;
        }),
    );

    const first = track(bootstrap({ registry: { Counter: load } }));
    const second = track(bootstrap({ registry: { Counter: load } }));
    await wait();
    expect(load).toHaveBeenCalledTimes(1);

    second.destroy();
    resolveModule({ default: counter() });
    await wait();

    expect(island.querySelector("output")?.textContent).toBe("3");
    first.destroy();
    island.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(island.querySelector("output")?.textContent).toBe("3");
  });

  test("destroy is idempotent", async () => {
    const island = host(4);
    const handle = track(
      bootstrap({ registry: { Counter: async () => ({ default: counter() }) } }),
    );
    await wait();
    await wait();

    handle.destroy();
    handle.destroy();
    island.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(island.querySelector("output")?.textContent).toBe("4");
    expect(unmount(island)).toBe(false);
  });

  test("an incompatible runtime owner is rejected without takeover", () => {
    const globalRecord = globalThis as Record<PropertyKey, unknown>;
    const previous = globalRecord[RUNTIME_KEY];
    const incompatible = { protocol: RUNTIME_PROTOCOL + 1 };
    globalRecord[RUNTIME_KEY] = incompatible;
    try {
      expect(() => bootstrap({ root: document.createElement("main") })).toThrowError(
        /incompatible taipa runtime/i,
      );
      expect(globalRecord[RUNTIME_KEY]).toBe(incompatible);
    } finally {
      if (previous === undefined) {
        delete globalRecord[RUNTIME_KEY];
      } else {
        globalRecord[RUNTIME_KEY] = previous;
      }
    }
  });
});
