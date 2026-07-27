import { expect, test } from "vite-plus/test";
import { component, type ComponentDefinition } from "../../src/component";
import { html } from "../../src/template/html";

type CounterDefinition = ComponentDefinition<
  { readonly label: string },
  { readonly count: number; readonly step: number },
  { readonly doubled: number }
>;

function defineCounter() {
  return component<{ readonly label: string }>("counter", { contractVersion: "1" })
    .state("count", 0)
    .state("step", ({ props }) => (props.label === "tens" ? 10 : 1))
    .derived("doubled", ({ state }) => state.count() * 2)
    .on("increment@click", ({ state }) => {
      state.count(state.count() + 1);
    })
    .on("@pointerenter", () => {})
    .bind("output", () => {})
    .effect(() => {})
    .connected(() => {})
    .render(({ derived }) => html`<output>${derived.doubled()}</output>`);
}

test("component definitions carry name, contract version, and required refs", () => {
  const definition = defineCounter();
  expect(definition.name).toBe("counter");
  expect(definition.contractVersion).toBe("1");
  expect(definition.requiredRefs).toEqual(["increment", "output"]);
});

test("registrations preserve declaration order", () => {
  const definition = defineCounter() as unknown as CounterDefinition;
  expect(definition.stateRegistrations.map((entry) => entry.name)).toEqual(["count", "step"]);
  expect(definition.derivedRegistrations.map((entry) => entry.name)).toEqual(["doubled"]);
  expect(definition.eventRegistrations).toHaveLength(2);
  expect(definition.bindingRegistrations).toHaveLength(1);
  expect(definition.effectRegistrations).toHaveLength(1);
  expect(definition.connectedRegistrations).toHaveLength(1);
});

test("event registrations parse ref@type and host @type specs", () => {
  const definition = defineCounter() as unknown as CounterDefinition;
  const [refEvent, hostEvent] = definition.eventRegistrations;
  expect({ ref: refEvent?.ref, type: refEvent?.type }).toEqual({ ref: "increment", type: "click" });
  expect({ ref: hostEvent?.ref, type: hostEvent?.type }).toEqual({
    ref: null,
    type: "pointerenter",
  });
});

test("duplicate state or derived names are rejected", () => {
  // The name type rejects duplicates at compile time; cast around it to prove
  // the runtime validation also throws.
  interface LooseBuilder {
    state(name: string, initial: unknown): LooseBuilder;
    derived(name: string, read: () => unknown): LooseBuilder;
  }
  const asLoose = (builder: unknown) => builder as LooseBuilder;

  const builder = asLoose(component("dupes", { contractVersion: "1" }).state("count", 0));
  expect(() => builder.state("count", 1)).toThrow(/duplicate/);
  expect(() => builder.derived("count", () => 2)).toThrow(/duplicate/);
  const withDerived = asLoose(
    component("dupes-2", { contractVersion: "1" }).derived("total", () => 1),
  );
  expect(() => withDerived.state("total", 0)).toThrow(/duplicate/);
  expect(() => withDerived.derived("total", () => 2)).toThrow(/duplicate/);
});

test("builder chains are immutable: extending a builder does not mutate it", () => {
  const base = component("immutable", { contractVersion: "1" });
  const extended = base.state("count", 0).bind("output", () => {});
  const baseDefinition = base.render(() => html`<p>base</p>`) as unknown as CounterDefinition;
  expect(baseDefinition.requiredRefs).toEqual([]);
  expect(baseDefinition.stateRegistrations).toHaveLength(0);
  const extendedDefinition = extended.render(() => html`<p>extended</p>`);
  expect(extendedDefinition.requiredRefs).toEqual(["output"]);
});

test("component definitions and their registration arrays are frozen", () => {
  const definition = defineCounter() as unknown as CounterDefinition;
  expect(Object.isFrozen(definition)).toBe(true);
  expect(Object.isFrozen(definition.requiredRefs)).toBe(true);
  expect(Object.isFrozen(definition.stateRegistrations)).toBe(true);
  expect(Object.isFrozen(definition.eventRegistrations)).toBe(true);
  expect(Object.isFrozen(definition.stateRegistrations[0])).toBe(true);
});

test("repeated bind/on registrations on one ref keep a single required ref", () => {
  const definition = component("multi", { contractVersion: "1" })
    .bind("list", () => {})
    .on("list@scroll", () => {})
    .on("list@click", () => {})
    .render(() => html`<p>x</p>`);
  expect(definition.requiredRefs).toEqual(["list"]);
});

test("invalid event specs are rejected", () => {
  const builder = component("events", { contractVersion: "1" });
  // The template-literal spec type rejects these at compile time; cast around
  // it to prove the runtime validation also throws.
  const onLoose = (spec: string) =>
    (builder as unknown as { on(spec: string, handler: () => void): unknown }).on(spec, () => {});
  expect(() => onLoose("click")).toThrow(/event spec/);
  expect(() => onLoose("a@click@extra")).toThrow(/event spec/);
  expect(() => onLoose("save@")).toThrow(/event spec/);
  expect(() => onLoose("@")).toThrow(/event spec/);
});

test("component name and contract version are required", () => {
  expect(() => component("", { contractVersion: "1" })).toThrow(/name/);
  expect(() => component("x", { contractVersion: "" })).toThrow(/contractVersion/);
});

test("required refs record only singular refs from .bind() and ref-targeted .on()", () => {
  const definition = component("refs", { contractVersion: "1" })
    .on("@click", () => {})
    .bind("first", () => {})
    .on("second@keydown", () => {})
    .render(() => html`<p>x</p>`);
  expect(definition.requiredRefs).toEqual(["first", "second"]);
});

// Importing the root entry in a DOM-free process must not
// touch DOM globals, and first use of the universal surface must stay DOM-free.
test("the root entry neither accesses DOM globals at import nor at first use", async () => {
  const domGlobals = [
    "window",
    "document",
    "customElements",
    "HTMLElement",
    "navigator",
    "localStorage",
  ] as const;
  const originals = new Map<string, PropertyDescriptor | undefined>();
  for (const key of domGlobals) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {
      configurable: true,
      get() {
        throw new Error(`DOM global "${key}" must not be accessed`);
      },
    });
  }

  try {
    const root = await import("../../src/index");
    const counter = root
      .component("isolated", { contractVersion: "1" })
      .state("count", 0)
      .derived("doubled", ({ state }) => state.count() * 2)
      .render(({ state }) => root.html`<output>${state.count()}</output>`);
    expect(counter.requiredRefs).toEqual([]);
    expect(root.html`<p>${"<safe>"}</p>`.value).toBe("<p>&lt;safe&gt;</p>");
    expect(root.safeUrl("/relative").value).toBe("/relative");

    const count = root.signal(1);
    const doubled = root.computed(() => count() * 2);
    let observed = 0;
    const dispose = root.effect(() => {
      observed = doubled();
    });
    root.batch(() => {
      count(21);
    });
    expect(observed).toBe(42);
    dispose();
  } finally {
    for (const key of domGlobals) {
      const original = originals.get(key);
      if (original === undefined) {
        Reflect.deleteProperty(globalThis, key);
      } else {
        Object.defineProperty(globalThis, key, original);
      }
    }
  }
});
