import { expect, test } from "vite-plus/test";
import { component } from "../../src/component";
import { renderToString } from "../../src/server/render";
import { html } from "../../src/template/html";

// ---------------------------------------------------------------------------
// Explicit overrides win, omitted keys use initializers,
// unknown keys and initializer exceptions fail without leaking state
// ---------------------------------------------------------------------------

const Inventory = component<{ base: number }>("Inventory", { contractVersion: "1" })
  .state("quantity", ({ props }) => props.base)
  .state("warehouse", "main")
  .derived("label", ({ state }) => `${state.quantity()} @ ${state.warehouse()}`)
  .render(({ derived }) => html`<p>${derived.label()}</p>`);

test("explicit overrides win over value and function initializers", async () => {
  const output = await renderToString(
    Inventory,
    { base: 3 },
    {
      state: { quantity: 10, warehouse: "backup" },
    },
  );
  expect(output).toBe("<p>10 @ backup</p>");
});

test("omitted keys fall back to initializers and derived reflect the override", async () => {
  const output = await renderToString(Inventory, { base: 3 }, { state: { quantity: 7 } });
  expect(output).toBe("<p>7 @ main</p>");
});

test("overrides apply before derived values compute", async () => {
  const Doubler = component("Doubler", { contractVersion: "1" })
    .state("n", 1)
    .derived("double", ({ state }) => state.n() * 2)
    .render(({ derived }) => html`<p>${derived.double()}</p>`);
  expect(await renderToString(Doubler, {}, { state: { n: 21 } })).toBe("<p>42</p>");
});

test("unknown override keys are rejected with the component and key names", async () => {
  await expect(
    renderToString(Inventory, { base: 1 }, { state: { qty: 1 } as never }),
  ).rejects.toThrow(/unknown state override "qty".*"Inventory"/);
});

test("overrides must be plain JSON-safe objects", async () => {
  await expect(renderToString(Inventory, { base: 1 }, { state: [] as never })).rejects.toThrow(
    /plain object/,
  );
  await expect(
    renderToString(Inventory, { base: 1 }, { state: { quantity: Number.NaN } }),
  ).rejects.toThrow(/state\.quantity: .*non-finite/);
  await expect(
    renderToString(Inventory, { base: 1 }, { state: { quantity: undefined } }),
  ).rejects.toThrow(/state\.quantity: .*undefined/);
});

test("function initializers run per render and never share references", async () => {
  const seen: string[] = [];
  const Cart = component("Cart", { contractVersion: "1" })
    .state("items", () => ({ list: [] as string[] }))
    .render(({ state }) => {
      const items = state.items();
      items.list.push(`render-${items.list.length}`);
      seen.push(items.list.join(","));
      return html`<p>${items.list.length}</p>`;
    });
  expect(await renderToString(Cart, {})).toBe("<p>1</p>");
  expect(await renderToString(Cart, {})).toBe("<p>1</p>");
  expect(seen).toEqual(["render-0", "render-0"]);
});

test("an override replacing an object state does not leak into later renders", async () => {
  const Cart = component("Cart", { contractVersion: "1" })
    .state("items", () => ({ list: [] as string[] }))
    .render(({ state }) => html`<p>${state.items().list.join("|")}</p>`);
  expect(await renderToString(Cart, {}, { state: { items: { list: ["a", "b"] } } })).toBe(
    "<p>a|b</p>",
  );
  expect(await renderToString(Cart, {})).toBe("<p></p>");
});

test("an initializer exception leaves no render-local effects behind", async () => {
  let attempts = 0;
  const Flaky = component("Flaky", { contractVersion: "1" })
    .state("value", () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error("first attempt fails");
      }
      return attempts;
    })
    .render(({ state }) => html`<p>${state.value()}</p>`);
  await expect(renderToString(Flaky, {})).rejects.toThrow(
    /state initializer for "value" in component "Flaky" threw: first attempt fails/,
  );
  // The failure happened before any view or effect existed; the next render
  // starts from a clean slate.
  expect(await renderToString(Flaky, {})).toBe("<p>2</p>");
});

test("declared initial values must be JSON-safe too", async () => {
  const Bad = component("Bad", { contractVersion: "1" })
    .state("at", () => new Date(0))
    .render(() => html`<p>x</p>`);
  await expect(renderToString(Bad, {})).rejects.toThrow(/state\.at: .*Date/);
});
