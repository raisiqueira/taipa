/**
 * mount() — client-side first render. Renders exactly once
 * through the server renderer, installs the markup atomically via a native
 * template parse, then runs the same hydration path as SSR'd islands. After
 * that first render the view is never invoked again.
 */
import { afterEach, expect, test, vi } from "vite-plus/test";
import { component, html } from "../../src/index";
import { hydrate } from "../../src/client/hydrate";
import { mount } from "../../src/client/mount";
import { unmount } from "../../src/client/instance";

const created: HTMLElement[] = [];

function host(inner = ""): HTMLElement {
  const element = document.createElement("div");
  element.innerHTML = inner;
  document.body.append(element);
  created.push(element);
  return element;
}

function counter() {
  return component<{ start: number }>("counter", {
    contractVersion: "1",
  })
    .state("count", ({ props }) => props.start)
    .bind("label", ({ state, element }) => {
      element.textContent = `count=${state.count()}`;
    })
    .on("increment@click", ({ state }) => {
      state.count(state.count() + 1);
    })
    .render(({ state }) => {
      return html`<button data-taipa-ref="increment">+</button
        ><output data-taipa-ref="label">${state.count()}</output>`;
    });
}

afterEach(() => {
  for (const element of created.splice(0)) {
    element.remove();
  }
});

test("renders once, installs markup, and hydrates the new nodes", async () => {
  const target = host();
  const instance = await mount(target, counter(), { props: { start: 2 } });

  expect(target.querySelector("output")?.textContent).toBe("count=2");
  target.querySelector("button")?.click();
  expect(target.querySelector("output")?.textContent).toBe("count=3");
  expect(instance.host).toBe(target);
  expect(instance.state.count()).toBe(3);
});

test("never re-renders: state writes update bindings without invoking the view again", async () => {
  const view = vi.fn(({ state }: { state: { count: () => number } }) => {
    return html`<output data-taipa-ref="label">${state.count()}</output>`;
  });
  const probe = component<{ start: number }>("probe", {
    contractVersion: "1",
  })
    .state("count", ({ props }) => props.start)
    .bind("label", ({ state, element }) => {
      element.textContent = String(state.count());
    })
    // oxlint-disable-next-line no-unsafe-function-type -- test double for the view signature
    .render(view as never);
  const target = host();
  const instance = await mount(target, probe, { props: { start: 0 } });
  expect(view).toHaveBeenCalledTimes(1);

  instance.state.count(9);
  expect(view).toHaveBeenCalledTimes(1);
  expect(target.querySelector("output")?.textContent).toBe("9");
});

test("explicit state overrides drive the first render and the live instance", async () => {
  const target = host();
  const instance = await mount(target, counter(), {
    props: { start: 2 },
    state: { count: 10 },
  });
  expect(target.querySelector("output")?.textContent).toBe("count=10");
  expect(instance.state.count()).toBe(10);
});

test("a non-empty target without replace fails before touching the DOM", async () => {
  const target = host(`<em>existing</em>`);
  const existing = target.querySelector("em");
  await expect(mount(target, counter(), { props: { start: 0 } })).rejects.toThrowError(
    /not empty|replace/,
  );
  expect(target.querySelector("em")).toBe(existing);
  expect(unmount(target)).toBe(false);
});

test("replace overwrites existing content atomically", async () => {
  const target = host(`<em>old</em><b>older</b>`);
  await mount(target, counter(), { props: { start: 1 }, replace: true });
  expect(target.querySelector("em")).toBeNull();
  expect(target.querySelector("b")).toBeNull();
  expect(target.querySelector("output")?.textContent).toBe("count=1");
  expect(target.querySelectorAll("*")).toHaveLength(2);
});

test("mounting over a live instance fails before rendering or DOM writes", async () => {
  const target = host();
  await mount(target, counter(), { props: { start: 1 } });
  const installed = [...target.childNodes];

  await expect(mount(target, counter(), { props: { start: 5 } })).rejects.toThrowError(
    /live instance/,
  );
  expect([...target.childNodes]).toEqual(installed);
  expect(target.querySelector("output")?.textContent).toBe("count=1");
});

test("no version attribute is required on the mount target", async () => {
  const target = host();
  expect(target.hasAttribute("data-taipa-version")).toBe(false);
  await mount(target, counter(), { props: { start: 4 } });
  expect(target.querySelector("output")?.textContent).toBe("count=4");
});

test("initializer failures reject before any DOM mutation", async () => {
  const broken = component("broken", { contractVersion: "1" })
    .state("count", () => {
      throw new Error("boom");
    })
    .render(() => html`<span>x</span>`);
  const target = host(`<em>keep</em>`);
  await expect(mount(target, broken, { props: {}, replace: true })).rejects.toThrowError(/boom/);
  expect(target.querySelector("em")).not.toBeNull();
});

test("mounted instances tear down like hydrated ones", async () => {
  const cleanup = vi.fn();
  const probe = component("probe", { contractVersion: "1" })
    .connected(() => cleanup)
    .render(() => html`<span>x</span>`);
  const target = host();
  await mount(target, probe);

  expect(unmount(target)).toBe(true);
  expect(cleanup).toHaveBeenCalledTimes(1);
});

test("hydrating a mounted host afterwards fails (instance still owns it)", async () => {
  const target = host();
  await mount(target, counter(), { props: { start: 1 } });
  expect(() => hydrate(target, counter(), { props: { start: 1 } })).toThrowError(/live instance/);
});
