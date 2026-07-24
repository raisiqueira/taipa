/**
 * Entrypoint isolation: importing any package entry
 * in a DOM-less Node environment must succeed and must not mutate the
 * environment — no custom elements defined, no global runtime registry, no
 * DOM access at module evaluation time.
 */
import { expect, test } from "vite-plus/test";

const RUNTIME_KEY = Symbol.for("taipa.ui/runtime");

function runtimeRegistry(): unknown {
  return (globalThis as Record<PropertyKey, unknown>)[RUNTIME_KEY];
}

test("importing /client in Node is side-effect free", async () => {
  const client = await import("../../src/client/index");
  expect(typeof client.bootstrap).toBe("function");
  expect(typeof client.hydrate).toBe("function");
  expect(typeof client.mount).toBe("function");
  expect(typeof client.unmount).toBe("function");
  expect("customElements" in globalThis).toBe(false);
  expect(runtimeRegistry()).toBeUndefined();
});

test("importing the universal entry in Node is side-effect free", async () => {
  const universal = await import("../../src/index");
  expect(typeof universal.component).toBe("function");
  expect(typeof universal.html).toBe("function");
  expect("customElements" in globalThis).toBe(false);
  expect(runtimeRegistry()).toBeUndefined();
});

test("importing /server in Node is side-effect free", async () => {
  const server = await import("../../src/server/index");
  expect(typeof server.renderToString).toBe("function");
  expect(typeof server.renderIsland).toBe("function");
  expect("customElements" in globalThis).toBe(false);
  expect(runtimeRegistry()).toBeUndefined();
});

test("importing /forms in Node is side-effect free", async () => {
  const forms = await import("../../src/forms/index");
  expect(typeof forms.createForm).toBe("function");
  expect(typeof forms.standardSchema).toBe("function");
  expect(typeof forms.issuesToFormErrors).toBe("function");
  expect("customElements" in globalThis).toBe(false);
  expect(runtimeRegistry()).toBeUndefined();
});
