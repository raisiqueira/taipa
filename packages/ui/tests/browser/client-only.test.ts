/**
 * `data-taipa-hydrate="only"` keeps server-authored fallback truthful until
 * the component module loads, renders off-DOM, and passes hydration preflight.
 */
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { component, html } from "../../src/index.ts";
import { bootstrap } from "../../src/client/bootstrap.ts";
import { unmount } from "../../src/client/instance.ts";

const elements: Element[] = [];
const handles: { destroy(): void }[] = [];

function host(inner: string): HTMLElement {
  const template = document.createElement("template");
  template.innerHTML = `<taipa-island data-taipa-component="Counter" data-taipa-hydrate="only" data-taipa-version="1">${inner}</taipa-island>`;
  const island = template.content.firstElementChild as HTMLElement;
  document.body.append(island);
  elements.push(island);
  return island;
}

function payload(start: number): string {
  return `<script type="application/json" data-taipa-props>{"start":${start}}</script>`;
}

function fallback(text = "Loading"): string {
  return `<p role="alert" data-taipa-fallback>${text}</p>`;
}

function wait(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function track<T extends { destroy(): void }>(handle: T): T {
  handles.push(handle);
  return handle;
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
    .render(
      () =>
        html`<button data-taipa-ref="button">+</button><output data-taipa-ref="label"></output>`,
    );
}

afterEach(() => {
  for (const handle of handles.splice(0)) {
    handle.destroy();
  }
  for (const element of elements.splice(0)) {
    element.remove();
  }
});

describe("client-only islands", () => {
  test("render off-DOM, replace fallback once, then hydrate the rendered nodes", async () => {
    const island = host(`${fallback()}${payload(4)}`);
    const originalFallback = island.querySelector("[data-taipa-fallback]");

    track(bootstrap({ registry: { Counter: async () => ({ default: counter() }) } }));
    await wait();
    await wait();

    expect(island.querySelector("[data-taipa-fallback]")).toBeNull();
    expect(originalFallback?.isConnected).toBe(false);
    expect(island.querySelector("output")?.textContent).toBe("4");
    island.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(island.querySelector("output")?.textContent).toBe("5");
    expect(unmount(island)).toBe(true);
  });

  test("module failures retain fallback and report exactly one error", async () => {
    const island = host(`${fallback("Still loading")}${payload(1)}`);
    const errors: CustomEvent[] = [];
    const onError = vi.fn();
    island.addEventListener("taipa:error", (event) => errors.push(event as CustomEvent));

    track(
      bootstrap({
        registry: { Counter: async () => Promise.reject(new Error("network")) },
        onError,
      }),
    );
    await wait();
    await wait();

    expect(island.querySelector("[data-taipa-fallback]")?.textContent).toBe("Still loading");
    expect(errors).toHaveLength(1);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(unmount(island)).toBe(false);
  });

  test("render failures keep the alert fallback so applications can update it text-only", async () => {
    const island = host(`${fallback("Loading")}${payload(1)}`);
    const broken = component<{ start: number }>("Counter", { contractVersion: "1" }).render(() => {
      throw new Error("<strong>boom</strong>");
    });
    island.addEventListener("taipa:error", (event) => {
      const fallbackElement = island.querySelector("[data-taipa-fallback]");
      if (fallbackElement !== null) {
        fallbackElement.textContent = String((event as CustomEvent).detail.error);
      }
    });

    track(bootstrap({ registry: { Counter: async () => ({ default: broken }) } }));
    await wait();
    await wait();

    expect(island.querySelector("[data-taipa-fallback]")).not.toBeNull();
    expect(island.querySelector("strong")).toBeNull();
    expect(island.querySelector("[data-taipa-fallback]")?.textContent).toContain("boom");
    expect(unmount(island)).toBe(false);
  });

  test("off-DOM ref preflight failures keep fallback untouched", async () => {
    const island = host(`${fallback("Loading")}${payload(1)}`);
    const missingRef = component<{ start: number }>("Counter", { contractVersion: "1" })
      .bind("label", ({ element }) => {
        element.textContent = "attached";
      })
      .render(() => html`<span>no refs</span>`);

    track(bootstrap({ registry: { Counter: async () => ({ default: missingRef }) } }));
    await wait();
    await wait();

    expect(island.querySelector("[data-taipa-fallback]")?.textContent).toBe("Loading");
    expect(island.querySelector("span")).toBeNull();
    expect(unmount(island)).toBe(false);
  });
});
