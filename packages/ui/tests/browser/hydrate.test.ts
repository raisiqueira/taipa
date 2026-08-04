/**
 * hydrate() — direct-DOM hydration.
 *
 * The runtime attaches behavior to the exact server-rendered nodes: it never
 * renders, replaces, or re-parents anything. Preflight (payload,
 * required refs) is atomic — any failure leaves the island inert with zero
 * partial attachment, and exactly one `taipa:error` event describes it.
 */
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { component, html } from "../../src/index";
import type { Component } from "../../src/index";
import { hydrate } from "../../src/client/hydrate";

const created: HTMLElement[] = [];

function island(inner: string, attributes = ""): HTMLElement {
  const template = document.createElement("template");
  template.innerHTML = `<taipa-island ${attributes}>${inner}</taipa-island>`;
  const host = template.content.firstElementChild as HTMLElement;
  document.body.append(host);
  created.push(host);
  return host;
}

function propsScript(json: string): string {
  return `<script type="application/json" data-taipa-props>${json}</script>`;
}

function stateScript(json: string): string {
  return `<script type="application/json" data-taipa-state>${json}</script>`;
}

function counter() {
  return component<{ start: number }>("counter")
    .state("count", ({ props }) => props.start)
    .derived("double", ({ state }) => state.count() * 2)
    .bind("label", ({ state, derived, element }) => {
      element.textContent = `count=${state.count()} double=${derived.double()}`;
    })
    .on("increment@click", ({ state }) => {
      state.count(state.count() + 1);
    })
    .render(({ state }) => html`<span>${state.count()}</span>`);
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

describe("success path", () => {
  test("keeps every existing node and applies bindings as direct writes on them", () => {
    const host = island(
      `<button data-taipa-ref="increment">+</button><output data-taipa-ref="label"></output>`,
    );
    const button = host.querySelector("button");
    const label = host.querySelector("output");
    const childNodes = [...host.childNodes];
    const hydratedEvents: CustomEvent[] = [];
    host.addEventListener("taipa:hydrated", (event) => hydratedEvents.push(event as CustomEvent));

    const instance = hydrate(host, counter(), { props: { start: 2 } });

    expect(host.querySelector("button")).toBe(button);
    expect(host.querySelector("output")).toBe(label);
    expect([...host.childNodes]).toEqual(childNodes);
    expect(label?.textContent).toBe("count=2 double=4");
    expect(instance.host).toBe(host);
    expect(instance.props).toEqual({ start: 2 });
    expect(instance.state.count()).toBe(2);
    expect(instance.derived.double()).toBe(4);
    expect(hydratedEvents).toHaveLength(1);
    expect(hydratedEvents[0]?.detail).toMatchObject({ component: "counter", host });
  });

  test("bindings react to state writes without rendering or node churn", () => {
    const host = island(
      `<button data-taipa-ref="increment">+</button><output data-taipa-ref="label"></output>`,
    );
    const instance = hydrate(host, counter(), { props: { start: 0 } });
    const before = [...host.querySelectorAll("*")];

    instance.state.count(41);

    expect(host.querySelector("output")?.textContent).toBe("count=41 double=82");
    expect([...host.querySelectorAll("*")]).toEqual(before);
  });

  test("events attach to refs and to the host per spec, with event and target", () => {
    const seen: { event: Event; target: Element }[] = [];
    const recorder = component("recorder")
      .on("btn@click", ({ event, target }) => {
        seen.push({ event, target });
      })
      .on("@click", ({ target }) => {
        seen.push({ event: new Event("host"), target });
      })
      .render(() => html`<span>x</span>`);
    const host = island(`<button data-taipa-ref="btn">b</button>`);
    hydrate(host, recorder);

    host.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    // Ref handler once; host handler once via bubbling.
    expect(seen).toHaveLength(2);
    expect(seen[0]?.target).toBe(host.querySelector("button"));
    expect(seen[1]?.target).toBe(host);
  });

  test("hydrating a host with a live instance fails", () => {
    const host = island(
      `<button data-taipa-ref="increment">+</button><output data-taipa-ref="label"></output>`,
    );
    hydrate(host, counter(), { props: { start: 0 } });
    expect(() => hydrate(host, counter(), { props: { start: 0 } })).toThrowError(/live instance/);
  });
});

describe("atomic preflight", () => {
  test("legacy version attributes are ignored", () => {
    const host = island(
      `<button data-taipa-ref="increment">+</button><output data-taipa-ref="label"></output>`,
      `data-taipa-version="2"`,
    );
    const instance = hydrate(host, counter(), { props: { start: 0 } });
    expect(instance.state.count()).toBe(0);
    expect(host.querySelector("output")?.textContent).toBe("count=0 double=0");
  });

  test("missing required ref fails atomically with nothing attached", () => {
    const host = island(`<output data-taipa-ref="label"></output>`);
    const errors = watchErrors(host);
    expect(() => hydrate(host, counter(), { props: { start: 0 } })).toThrowError(/"increment"/);
    expect(errors).toHaveLength(1);
    host.click();
    expect(host.querySelector("output")?.textContent).toBe("");
  });

  test("duplicated required ref fails atomically", () => {
    const host = island(
      `<button data-taipa-ref="increment">1</button><button data-taipa-ref="increment">2</button><output data-taipa-ref="label"></output>`,
    );
    expect(() => hydrate(host, counter(), { props: { start: 0 } })).toThrowError(
      /"increment"[\s\S]*2 matches|2 matches[\s\S]*"increment"/,
    );
  });

  test("a value that is not a component definition is rejected", () => {
    const host = island(`<span></span>`);
    expect(() =>
      hydrate(host, { name: "fake" } as unknown as Component, { props: { start: 0 } }),
    ).toThrowError(TypeError);
  });
});

describe("payload resolution", () => {
  test("payload scripts feed props and state when no explicit options exist", () => {
    const host = island(
      `<button data-taipa-ref="increment">+</button><output data-taipa-ref="label"></output>${propsScript('{"start": 3}')}${stateScript('{"count": 9}')}`,
    );
    const instance = hydrate(host, counter());
    expect(instance.props).toEqual({ start: 3 });
    expect(instance.state.count()).toBe(9);
    expect(host.querySelector("output")?.textContent).toBe("count=9 double=18");
  });

  test("payload state wins over initializers; explicit options win over payload", () => {
    const host = island(
      `<button data-taipa-ref="increment">+</button><output data-taipa-ref="label"></output>${propsScript('{"start": 3}')}${stateScript('{"count": 9}')}`,
    );
    const explicit = hydrate(host, counter(), { state: { count: 20 } });
    expect(explicit.state.count()).toBe(20);

    const payloadOnly = island(
      `<button data-taipa-ref="increment">+</button><output data-taipa-ref="label"></output>${propsScript('{"start": 3}')}${stateScript('{"count": 9}')}`,
    );
    expect(hydrate(payloadOnly, counter()).state.count()).toBe(9);

    const initializerOnly = island(
      `<button data-taipa-ref="increment">+</button><output data-taipa-ref="label"></output>${propsScript('{"start": 3}')}`,
    );
    expect(hydrate(initializerOnly, counter()).state.count()).toBe(3);
  });

  test("explicit props win over the payload script", () => {
    const host = island(
      `<button data-taipa-ref="increment">+</button><output data-taipa-ref="label"></output>${propsScript('{"start": 3}')}`,
    );
    const instance = hydrate(host, counter(), { props: { start: 7 } });
    expect(instance.state.count()).toBe(7);
  });

  test("duplicate payload scripts abort before attach", () => {
    const host = island(
      `<output data-taipa-ref="label"></output>${propsScript("{}")}${propsScript("{}")}`,
    );
    const errors = watchErrors(host);
    expect(() => hydrate(host, counter(), { props: { start: 0 } })).toThrowError(/duplicate/i);
    expect(errors).toHaveLength(1);
  });

  test("malformed payload JSON aborts before attach", () => {
    const host = island(`<output data-taipa-ref="label"></output>${propsScript("{not json")}`);
    expect(() => hydrate(host, counter())).toThrowError(/malformed|JSON/i);
  });

  test("non-object props payloads are rejected", () => {
    for (const bad of ["[1,2]", '"text"', "42", "null"]) {
      const host = island(`<output data-taipa-ref="label"></output>${propsScript(bad)}`);
      expect(() => hydrate(host, counter())).toThrowError(/props/i);
      host.remove();
    }
  });

  test("unknown state keys in the payload abort before attach", () => {
    const host = island(`<output data-taipa-ref="label"></output>${stateScript('{"bogus": 1}')}`);
    expect(() => hydrate(host, counter(), { props: { start: 0 } })).toThrowError(
      /unknown state override "bogus"/,
    );
  });

  test("initializer failures attach nothing", () => {
    const handler = vi.fn();
    const probed = component<{ start: number }>("probed")
      .state("count", () => {
        throw new Error("boom");
      })
      .on("increment@click", handler)
      .render(() => html`<span>x</span>`);
    const host = island(`<button data-taipa-ref="increment">+</button>`);
    const errors = watchErrors(host);
    expect(() => hydrate(host, probed, { props: { start: 0 } })).toThrowError(/boom/);
    expect(errors).toHaveLength(1);
    host.querySelector("button")?.click();
    expect(handler).not.toHaveBeenCalled();
  });
});

describe("hostile payloads", () => {
  test("dangerous keys at any depth abort before state creation", () => {
    const samples = [
      '{"__proto__": {"polluted": true}}',
      '{"nested": {"__proto__": {"polluted": true}}}',
      '{"list": [{"constructor": 1}]}',
      '{"prototype": {"x": 1}}',
    ];
    for (const sample of samples) {
      const host = island(`<output data-taipa-ref="label"></output>${propsScript(sample)}`);
      expect(() => hydrate(host, counter())).toThrowError(
        /dangerous|__proto__|constructor|prototype/i,
      );
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
      host.remove();
    }
  });

  test("payloads larger than 64 KiB abort before parsing", () => {
    const big = `{"start": 1, "pad": "${"x".repeat(70 * 1024)}"}`;
    const host = island(`<output data-taipa-ref="label"></output>${propsScript(big)}`);
    expect(() => hydrate(host, counter())).toThrowError(/64\s*KiB|too large/i);
  });

  test("payload keys flow through as own properties only", () => {
    let observed: Readonly<{ start: number }> | undefined;
    const inspector = component<{ start: number }>("inspector")
      .connected(({ props }) => {
        observed = props;
      })
      .render(() => html`<span>x</span>`);
    const host = island(`<span></span>${propsScript('{"start": 5}')}`);
    hydrate(host, inspector);
    expect(Object.keys(observed ?? {})).toEqual(["start"]);
    expect(Object.hasOwn(observed ?? {}, "start")).toBe(true);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
