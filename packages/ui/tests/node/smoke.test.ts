import { expect, test } from "vite-plus/test";
import { createForm } from "../../src/forms/index";
import { component, html, signal } from "../../src/index";
import { renderIsland, renderToString } from "../../src/server/index";

test("runs in the node environment", () => {
  expect(typeof process.versions.node).toBe("string");
  expect(typeof document).toBe("undefined");
});

test("the root universal surface works in node", () => {
  const counter = component("smoke", { contractVersion: "1" })
    .state("count", 0)
    .render(({ state }) => html`<output>${state.count()}</output>`);
  expect(counter.name).toBe("smoke");
  expect(html`<p>${"<escaped>"}</p>`.value).toBe("<p>&lt;escaped&gt;</p>");
  const count = signal(1);
  count(2);
  expect(count()).toBe(2);
});

test("server-safe subpaths are importable in node", async () => {
  const badge = component("badge", { contractVersion: "1" }).render(() => html`<b>ok</b>`);
  expect(await renderToString(badge, {})).toBe("<b>ok</b>");
  expect(await renderIsland(badge, {})).toBe(
    '<taipa-island data-taipa-component="badge"><b>ok</b></taipa-island>',
  );
  expect(typeof createForm).toBe("function");
});
