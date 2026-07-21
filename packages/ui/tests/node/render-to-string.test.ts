import { expect, test } from "vite-plus/test";
import { component } from "../../src/component.ts";
import { effect } from "../../src/reactivity.ts";
import { renderToString } from "../../src/server/render.ts";
import { html } from "../../src/template/html.ts";
import type { SafeHtml } from "../../src/types.ts";

const Counter = component<{ initial: number }>("Counter", { contractVersion: "1" })
  .state("count", ({ props }) => props.initial)
  .derived("doubled", ({ state }) => state.count() * 2)
  .render(({ state, derived }) => {
    // Short literals stay on one line: oxfmt reformats long html`` statics.
    const count = html`<output data-taipa-ref="count">${state.count()}</output>`;
    const doubled = html`<span data-taipa-ref="doubled">${derived.doubled()}</span>`;
    return html`${count}${doubled}`;
  });

test("renders only the inner HTML, never an island host", async () => {
  const output = await renderToString(Counter, { initial: 3 });
  expect(output).toBe(
    '<output data-taipa-ref="count">3</output><span data-taipa-ref="doubled">6</span>',
  );
  expect(output).not.toContain("taipa-island");
  expect(output).not.toContain("<script");
});

test("view output stays escaped for hostile props", async () => {
  const Echo = component<{ value: string }>("Echo", { contractVersion: "1" }).render(
    ({ props }) => html`<p>${props.value}</p>`,
  );
  expect(await renderToString(Echo, { value: `<script>alert("x")</script>` })).toBe(
    "<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;</p>",
  );
});

test("state accepts plain value initializers and function initializers with props", async () => {
  const Both = component<{ base: number }>("Both", { contractVersion: "1" })
    .state("constant", 10)
    .state("fromProps", ({ props }) => props.base * 2)
    .render(({ state }) => html`<i>${state.constant()}</i><b>${state.fromProps()}</b>`);
  expect(await renderToString(Both, { base: 4 })).toBe("<i>10</i><b>8</b>");
});

test("async views are awaited", async () => {
  const Async = component("Async", { contractVersion: "1" }).render(async () => {
    await Promise.resolve();
    return html`<p>ready</p>`;
  });
  expect(await renderToString(Async, {})).toBe("<p>ready</p>");
});

test("props arrive frozen and non-JSON-safe props fail with a path", async () => {
  const Probe = component<{ at?: string }>("Probe", { contractVersion: "1" }).render(
    ({ props }) => {
      expect(Object.isFrozen(props)).toBe(true);
      return html`<p>ok</p>`;
    },
  );
  await expect(renderToString(Probe, {})).resolves.toBe("<p>ok</p>");
  const hostile = (() => {}) as unknown as string;
  await expect(renderToString(Probe, { at: hostile })).rejects.toThrow(/props\.at: /);
});

test("views returning non-SafeHtml values are rejected", async () => {
  const Loose = component("Loose", { contractVersion: "1" }).render(
    () => "not-safe" as unknown as SafeHtml,
  );
  await expect(renderToString(Loose, {})).rejects.toThrow(/SafeHtml|html`/);
});

test("plain objects are not component definitions", async () => {
  const impostor = { name: "Fake", contractVersion: "1", requiredRefs: [] };
  await expect(renderToString(impostor as never, {})).rejects.toThrowError(TypeError);
});

// ---------------------------------------------------------------------------
// Plan U3 scenario 6: concurrent renders stay isolated
// ---------------------------------------------------------------------------

test("concurrent renders of one component never cross-contaminate", async () => {
  const Greeter = component<{ name: string }>("Greeter", { contractVersion: "1" })
    .state("greeting", ({ props }) => `hello ${props.name}`)
    .render(async ({ state }) => {
      await new Promise((resolve) => setTimeout(resolve, Math.random() * 5));
      return html`<p>${state.greeting()}</p>`;
    });
  const [a, b, c] = await Promise.all([
    renderToString(Greeter, { name: "ada" }),
    renderToString(Greeter, { name: "grace" }),
    renderToString(Greeter, { name: "edsger" }),
  ]);
  expect(a).toBe("<p>hello ada</p>");
  expect(b).toBe("<p>hello grace</p>");
  expect(c).toBe("<p>hello edsger</p>");
});

// ---------------------------------------------------------------------------
// Render-local resources are disposed after the single initial render
// ---------------------------------------------------------------------------

test("effects created during render run once and are disposed afterwards", async () => {
  let runs = 0;
  let cleanups = 0;
  const WithEffect = component("WithEffect", { contractVersion: "1" }).render(() => {
    effect(() => {
      runs += 1;
      return () => {
        cleanups += 1;
      };
    });
    return html`<p>fx</p>`;
  });
  expect(await renderToString(WithEffect, {})).toBe("<p>fx</p>");
  expect(runs).toBe(1);
  expect(cleanups).toBe(1);
});

test("a throwing initializer rejects without corrupting later renders", async () => {
  let shouldThrow = true;
  const Flaky = component("Flaky", { contractVersion: "1" })
    .state("value", () => {
      if (shouldThrow) {
        throw new Error("boom");
      }
      return 42;
    })
    .render(({ state }) => html`<p>${state.value()}</p>`);
  await expect(renderToString(Flaky, {})).rejects.toThrow(/Flaky.*value|value.*Flaky/);
  await expect(renderToString(Flaky, {})).rejects.toThrow(/boom/);
  shouldThrow = false;
  expect(await renderToString(Flaky, {})).toBe("<p>42</p>");
});

// ---------------------------------------------------------------------------
// Plan U3 scenario 8: the server lane never touches DOM globals
// ---------------------------------------------------------------------------

test("importing and rendering on the server needs no DOM", () => {
  expect("window" in globalThis).toBe(false);
  expect("document" in globalThis).toBe(false);
});
