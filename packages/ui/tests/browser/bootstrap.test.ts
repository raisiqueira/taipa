/**
 * bootstrap() — scan final HTML, resolve approved component modules, and
 * activate load/idle/visible/only policies without side effects before the
 * explicit call.
 */
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { component, html } from "../../src/index.ts";
import { bootstrap } from "../../src/client/bootstrap.ts";
import { unmount } from "../../src/client/instance.ts";

const elements: Element[] = [];
const handles: { destroy(): void }[] = [];

function island(inner: string, attributes: string): HTMLElement {
  const template = document.createElement("template");
  template.innerHTML = `<taipa-island ${attributes}>${inner}</taipa-island>`;
  const host = template.content.firstElementChild as HTMLElement;
  document.body.append(host);
  elements.push(host);
  return host;
}

function wait(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function counter(name = "Counter") {
  return component<{ start: number }>(name, { contractVersion: "1" })
    .state("count", ({ props }) => props.start)
    .bind("label", ({ state, element }) => {
      element.textContent = String(state.count());
    })
    .on("button@click", ({ state }) => {
      state.count(state.count() + 1);
    })
    .render(({ state }) => html`<output>${state.count()}</output>`);
}

function payload(start: number): string {
  return `<script type="application/json" data-taipa-props>{"start":${start}}</script>`;
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

describe("bootstrap", () => {
  test("defines <taipa-island> idempotently when bootstrap is called", () => {
    const before = customElements.get("taipa-island");
    const first = track(bootstrap({ root: document.createElement("main") }));
    const defined = customElements.get("taipa-island");
    const second = track(bootstrap({ root: document.createElement("main") }));

    expect(defined).toBeDefined();
    expect(customElements.get("taipa-island")).toBe(defined);
    expect(before === undefined || before === defined).toBe(true);
    first.destroy();
    second.destroy();
  });

  test("load policy resolves one module for concurrent hosts and hydrates each host", async () => {
    const first = island(
      `<button data-taipa-ref="button">+</button><output data-taipa-ref="label"></output>${payload(1)}`,
      `data-taipa-component="Counter" data-taipa-hydrate="load" data-taipa-version="1"`,
    );
    const second = island(
      `<button data-taipa-ref="button">+</button><output data-taipa-ref="label"></output>${payload(5)}`,
      `data-taipa-component="Counter" data-taipa-hydrate="load" data-taipa-version="1"`,
    );
    const load = vi.fn(async () => ({ default: counter() }));

    track(bootstrap({ registry: { Counter: load } }));
    await wait();
    await wait();

    expect(load).toHaveBeenCalledTimes(1);
    expect(first.querySelector("output")?.textContent).toBe("1");
    expect(second.querySelector("output")?.textContent).toBe("5");
    first.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(first.querySelector("output")?.textContent).toBe("2");
    expect(second.querySelector("output")?.textContent).toBe("5");
  });

  test("scan(root) scopes discovery to the requested root including the root itself", async () => {
    const container = document.createElement("section");
    document.body.append(container);
    elements.push(container);
    const inside = island(
      `<button data-taipa-ref="button">+</button><output data-taipa-ref="label"></output>${payload(3)}`,
      `data-taipa-component="Counter" data-taipa-hydrate="load" data-taipa-version="1"`,
    );
    container.append(inside);
    const outside = island(
      `<button data-taipa-ref="button">+</button><output data-taipa-ref="label"></output>${payload(9)}`,
      `data-taipa-component="Counter" data-taipa-hydrate="load" data-taipa-version="1"`,
    );
    const load = vi.fn(async () => ({ default: counter() }));

    const handle = track(
      bootstrap({ root: document.createElement("main"), registry: { Counter: load } }),
    );
    handle.scan(container);
    await wait();
    await wait();

    expect(inside.querySelector("output")?.textContent).toBe("3");
    expect(outside.querySelector("output")?.textContent).toBe("");
  });

  test("static islands are skipped and never resolve modules", async () => {
    const host = island(
      `<output data-taipa-ref="label"></output>${payload(1)}`,
      `data-taipa-component="Counter" data-taipa-version="1"`,
    );
    const load = vi.fn(async () => ({ default: counter() }));

    track(bootstrap({ registry: { Counter: load } }));
    await wait();

    expect(load).not.toHaveBeenCalled();
    expect(host.querySelector("output")?.textContent).toBe("");
  });

  test("resolution errors dispatch taipa:error and call onError once", async () => {
    const host = island(
      `<output data-taipa-ref="label"></output>` +
        `<script type="application/json" data-taipa-props>{"start":1}</script>`,
      `data-taipa-component="Missing" data-taipa-hydrate="load" data-taipa-version="1"`,
    );
    const errors: CustomEvent[] = [];
    const onError = vi.fn();
    host.addEventListener("taipa:error", (event) => errors.push(event as CustomEvent));

    track(bootstrap({ registry: {}, onError }));
    await wait();
    await wait();

    expect(errors).toHaveLength(1);
    expect(errors[0]?.detail).toMatchObject({ component: "Missing", phase: "resolve" });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[1]).toBe(host);
    expect(unmount(host)).toBe(false);
  });

  test("component export and contract mismatches surface as one error", async () => {
    const host = island(
      `<output data-taipa-ref="label"></output>${payload(1)}`,
      `data-taipa-component="Counter" data-taipa-hydrate="load" data-taipa-version="2"`,
    );
    const errors: CustomEvent[] = [];
    host.addEventListener("taipa:error", (event) => errors.push(event as CustomEvent));

    track(bootstrap({ registry: { Counter: async () => ({ default: counter() }) } }));
    await wait();
    await wait();

    expect(errors).toHaveLength(1);
    expect(String(errors[0]?.detail.error)).toMatch(/contract version mismatch/i);
    expect(unmount(host)).toBe(false);
  });
});
