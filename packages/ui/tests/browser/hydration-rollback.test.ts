/**
 * Commit-phase rollback (KTD14, plan scenario 9). Preflight failures preserve
 * the island byte-for-byte and stay unmarked; a fault while attaching
 * listeners, bindings, effects, or connected hooks disposes every runtime
 * resource in reverse order, marks the host errored, and emits exactly one
 * taipa:error. User DOM writes are never claimed to be reversible.
 */
import { afterEach, expect, test, vi } from "vite-plus/test";
import { component, html } from "../../src/index";
import { hydrate } from "../../src/client/hydrate";
import { unmount } from "../../src/client/instance";

const created: HTMLElement[] = [];

function island(inner: string, attributes = `data-taipa-version="1"`): HTMLElement {
  const template = document.createElement("template");
  template.innerHTML = `<taipa-island ${attributes}>${inner}</taipa-island>`;
  const host = template.content.firstElementChild as HTMLElement;
  document.body.append(host);
  created.push(host);
  return host;
}

function watchErrors(host: HTMLElement): CustomEvent[] {
  const errors: CustomEvent[] = [];
  host.addEventListener("taipa:error", (event) => errors.push(event as CustomEvent));
  return errors;
}

afterEach(() => {
  for (const host of created.splice(0)) {
    host.remove();
  }
});

test("preflight failure preserves the island and does not mark it errored", () => {
  const markup = `<button data-taipa-ref="increment">+</button><script type="application/json" data-taipa-state="">{"bogus": 1}</script>`;
  const host = island(markup);
  const errors = watchErrors(host);
  const probe = component("probe", { contractVersion: "1" })
    .state("count", 0)
    .render(() => html`<span>x</span>`);

  expect(() => hydrate(host, probe)).toThrowError(/unknown state override "bogus"/);
  expect(host.innerHTML).toBe(markup);
  expect(host.hasAttribute("data-taipa-error")).toBe(false);
  expect(errors).toHaveLength(1);
  expect(errors[0]?.detail).toMatchObject({ component: "probe", phase: "preflight" });
  expect(unmount(host)).toBe(false);
});

test("a binding fault disposes everything, marks the host, and emits one error", () => {
  const order: string[] = [];
  const probe = component("probe", { contractVersion: "1" })
    .state("count", 0)
    .bind("out", ({ element, state }) => {
      if (state.count() === 0) {
        throw new Error("bind boom");
      }
      element.textContent = "set";
      return () => {
        order.push("binding-cleanup");
      };
    })
    .render(() => html`<output data-taipa-ref="out"></output>`);
  const host = island(`<output data-taipa-ref="out"></output>`);
  const errors = watchErrors(host);
  const markupBefore = host.innerHTML;

  let thrown: unknown;
  try {
    hydrate(host, probe);
  } catch (error) {
    thrown = error;
  }

  expect((thrown as Error).message).toBe("bind boom");
  expect(errors).toHaveLength(1);
  expect(errors[0]?.detail).toMatchObject({ component: "probe", phase: "commit" });
  expect(errors[0]?.detail.error).toBe(thrown);
  expect(host.getAttribute("data-taipa-error")).toBe("probe");
  // The binding threw on its first run before returning a cleanup, and
  // connected hooks never ran — nothing observable remains to tear down.
  expect(order).toEqual([]);
  expect(host.innerHTML).toBe(markupBefore);
  expect(unmount(host)).toBe(false);
});

test("an effect fault stops the bindings that were already attached", () => {
  const order: string[] = [];
  const probe = component("probe", { contractVersion: "1" })
    .state("count", 0)
    .bind("out", ({ element, state }) => {
      element.textContent = String(state.count());
      return () => {
        order.push("binding-cleanup");
      };
    })
    .effect(() => {
      throw new Error("effect boom");
    })
    .render(() => html`<output data-taipa-ref="out"></output>`);
  const host = island(`<output data-taipa-ref="out"></output>`);
  const errors = watchErrors(host);

  expect(() => hydrate(host, probe)).toThrowError("effect boom");
  expect(errors).toHaveLength(1);
  expect(errors[0]?.detail).toMatchObject({ phase: "commit" });
  expect(order).toEqual(["binding-cleanup"]);
  // KTD14: the binding's DOM write is a user write and is not reversed.
  expect(host.querySelector("output")?.textContent).toBe("0");
});

test("a listener fault detaches the listeners that were already attached", () => {
  const first = vi.fn();
  const second = vi.fn();
  const order: string[] = [];
  const probe = component("probe", { contractVersion: "1" })
    .bind("out", ({ element }) => {
      element.textContent = "bound";
      return () => {
        order.push("binding-cleanup");
      };
    })
    .on("first@click", first)
    .on("second@click", second, {
      get once(): boolean {
        throw new Error("opts boom");
      },
    })
    .render(
      () =>
        html`<button data-taipa-ref="first">1</button><button data-taipa-ref="second">2</button
          ><output data-taipa-ref="out"></output>`,
    );
  const host = island(
    `<button data-taipa-ref="first">1</button><button data-taipa-ref="second">2</button><output data-taipa-ref="out"></output>`,
  );
  const errors = watchErrors(host);

  expect(() => hydrate(host, probe)).toThrowError("opts boom");
  expect(errors).toHaveLength(1);
  expect(order).toEqual(["binding-cleanup"]);

  // Abort detached the first listener during rollback; neither handler fires.
  host.querySelector('[data-taipa-ref="first"]')?.dispatchEvent(new MouseEvent("click"));
  host.querySelector('[data-taipa-ref="second"]')?.dispatchEvent(new MouseEvent("click"));
  expect(first).not.toHaveBeenCalled();
  expect(second).not.toHaveBeenCalled();
});

test("a connected fault runs the cleanups of the hooks that already ran", () => {
  const order: string[] = [];
  const probe = component("probe", { contractVersion: "1" })
    .bind("out", ({ element }) => {
      element.textContent = "bound";
      return () => {
        order.push("binding-cleanup");
      };
    })
    .connected(() => {
      order.push("connected1");
      return () => {
        order.push("connected1-cleanup");
      };
    })
    .connected(() => {
      throw new Error("connected boom");
    })
    .render(() => html`<output data-taipa-ref="out"></output>`);
  const host = island(`<output data-taipa-ref="out"></output>`);
  const errors = watchErrors(host);

  expect(() => hydrate(host, probe)).toThrowError("connected boom");
  expect(errors).toHaveLength(1);
  expect(errors[0]?.detail).toMatchObject({ component: "probe", phase: "commit" });
  expect(order).toEqual(["connected1", "connected1-cleanup", "binding-cleanup"]);
  // KTD14: the binding's DOM write is a user write and is not reversed.
  expect(host.querySelector("output")?.textContent).toBe("bound");
  expect(host.getAttribute("data-taipa-error")).toBe("probe");
});

test("a host recovers: re-attaching after a commit fault succeeds and clears the mark", () => {
  const broken = component("broken", { contractVersion: "1" })
    .connected(() => {
      throw new Error("boom");
    })
    .render(() => html`<span>x</span>`);
  const good = component("good", { contractVersion: "1" })
    .bind("out", ({ element }) => {
      element.textContent = "alive";
    })
    .render(() => html`<output data-taipa-ref="out"></output>`);
  const host = island(`<output data-taipa-ref="out"></output>`);
  const hydrated: CustomEvent[] = [];
  host.addEventListener("taipa:hydrated", (event) => hydrated.push(event as CustomEvent));

  expect(() => hydrate(host, broken)).toThrowError("boom");
  expect(host.getAttribute("data-taipa-error")).toBe("broken");

  const instance = hydrate(host, good);
  expect(host.querySelector("output")?.textContent).toBe("alive");
  expect(host.hasAttribute("data-taipa-error")).toBe(false);
  expect(hydrated).toHaveLength(1);
  expect(instance.host).toBe(host);
});
