/**
 * Post-success unused data-taipa-ref warnings. Required-ref preflight
 * throws stay in hydrate.test.ts; commit faults stay in
 * hydration-rollback.test.ts; only-mode off-DOM failures stay in
 * client-only.test.ts.
 */
import { afterEach, expect, test, vi } from "vite-plus/test";
import { component, html } from "../../src/index";
import { hydrate } from "../../src/client/hydrate";

const created: HTMLElement[] = [];

function island(inner: string): HTMLElement {
  const template = document.createElement("template");
  template.innerHTML = `<taipa-island>${inner}</taipa-island>`;
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
  vi.restoreAllMocks();
  for (const host of created.splice(0)) {
    host.remove();
  }
});

test("unused leftover markup warns once after a successful hydrate", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const widget = component("WarnOnceBrowserAlpha")
    .connected(({ refs }) => {
      refs.optional("form");
    })
    .render(() => html`<form data-taipa-ref="from"></form>`);
  const host = island(`<form data-taipa-ref="from"></form>`);
  const errors = watchErrors(host);
  const instance = hydrate(host, widget);
  expect(instance).toBeDefined();
  expect(errors).toHaveLength(0);
  expect(host.hasAttribute("data-taipa-error")).toBe(false);
  expect(warn.mock.calls).toEqual([
    [
      '[Taipa] component "WarnOnceBrowserAlpha" has unused data-taipa-ref="from"; check the island markup',
    ],
  ]);
});

test("optional or all misses stay silent when no leftover markup exists", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const widget = component("WarnOnceBrowserBeta")
    .connected(({ refs }) => {
      refs.optional("form");
      refs.all("items");
    })
    .render(() => html`<span>ok</span>`);
  hydrate(island(`<span>ok</span>`), widget);
  expect(warn).not.toHaveBeenCalled();
});

test("a looked-up leftover name stays quiet", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const widget = component("WarnOnceBrowserGamma")
    .connected(({ refs }) => {
      refs.optional("form");
    })
    .render(() => html`<form data-taipa-ref="form"></form>`);
  hydrate(island(`<form data-taipa-ref="form"></form>`), widget);
  expect(warn).not.toHaveBeenCalled();
});

test("two islands of the same component warn once for the same leftover name", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const widget = component("WarnOnceBrowserDelta").render(
    () => html`<i data-taipa-ref="dead"></i>`,
  );
  hydrate(island(`<i data-taipa-ref="dead"></i>`), widget);
  hydrate(island(`<i data-taipa-ref="dead"></i>`), widget);
  expect(warn).toHaveBeenCalledTimes(1);
});

test("a second leftover name on the same island warns separately", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const widget = component("WarnOnceBrowserEpsilon").render(
    () => html`<i data-taipa-ref="one"></i><i data-taipa-ref="two"></i>`,
  );
  hydrate(island(`<i data-taipa-ref="one"></i><i data-taipa-ref="two"></i>`), widget);
  expect(warn).toHaveBeenCalledTimes(2);
});

test("nested child leftover names do not warn on the parent", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const widget = component("WarnOnceBrowserZeta")
    .connected(({ refs }) => {
      refs.optional("outer");
    })
    .render(() => html`<span data-taipa-ref="outer"></span>`);
  const parent = island(
    `<span data-taipa-ref="outer"></span><taipa-island><i data-taipa-ref="inner"></i></taipa-island>`,
  );
  hydrate(parent, widget);
  expect(warn).not.toHaveBeenCalled();
});

test("the same leftover name still warns on a different component", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const first = component("WarnOnceBrowserEta").render(
    () => html`<i data-taipa-ref="shared-dead"></i>`,
  );
  const second = component("WarnOnceBrowserTheta").render(
    () => html`<i data-taipa-ref="shared-dead"></i>`,
  );
  hydrate(island(`<i data-taipa-ref="shared-dead"></i>`), first);
  hydrate(island(`<i data-taipa-ref="shared-dead"></i>`), second);
  expect(warn).toHaveBeenCalledTimes(2);
});
