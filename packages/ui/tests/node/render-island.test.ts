import { readdirSync, readFileSync } from "node:fs";
import { expect, test } from "vite-plus/test";
import { component } from "../../src/component";
import { renderIsland, type IslandRenderOptions } from "../../src/server/island";
import { html, raw } from "../../src/template/html";
import type { Component, JsonObject } from "../../src/types";

const Counter = component<{ initial: number }>("Counter", { contractVersion: "1" })
  .state("count", ({ props }) => props.initial)
  .state("step", 1)
  .render(({ state }) => html`<output data-taipa-ref="count">${state.count()}</output>`);

const PriceChart = component<{ symbol: string }>("PriceChart", { contractVersion: "2" }).render(
  ({ props }) => html`<p data-taipa-ref="status">${props.symbol}</p>`,
);

const Badge = component<{ label: string }>("Badge", { contractVersion: "1" }).render(
  ({ props }) => html`<span>${props.label}</span>`,
);

// ---------------------------------------------------------------------------
// Attributes and scripts for every hydration policy.
// ---------------------------------------------------------------------------

test("static island omits all hydration metadata and scripts", async () => {
  expect(await renderIsland(Badge, { label: "Beta" })).toBe(
    '<taipa-island data-taipa-component="Badge"><span>Beta</span></taipa-island>',
  );
});

test("load island carries policy, version, and inert JSON scripts", async () => {
  const output = await renderIsland(
    Counter,
    { initial: 3 },
    {
      hydrate: "load",
      state: { count: 5 },
    },
  );
  expect(output).toBe(
    '<taipa-island data-taipa-component="Counter" data-taipa-hydrate="load" data-taipa-version="1"><output data-taipa-ref="count">5</output><script type="application/json" data-taipa-props>{"initial":3}</script><script type="application/json" data-taipa-state>{"count":5}</script></taipa-island>',
  );
});

test("state script contains only the provided overrides, not the full state", async () => {
  const output = await renderIsland(
    Counter,
    { initial: 3 },
    {
      hydrate: "load",
      state: { count: 9 },
    },
  );
  expect(output).toContain('<script type="application/json" data-taipa-state>{"count":9}</script>');
  expect(output).not.toContain("step");
});

test("empty props and empty overrides omit their scripts", async () => {
  const Empty = component("Empty", { contractVersion: "1" }).render(() => html`<p>hi</p>`);
  const output = await renderIsland(Empty, {}, { hydrate: "load", state: {} });
  expect(output).toBe(
    '<taipa-island data-taipa-component="Empty" data-taipa-hydrate="load" data-taipa-version="1"><p>hi</p></taipa-island>',
  );
});

test("idle island serializes the timeout; visible island serializes the root margin", async () => {
  expect(
    await renderIsland(PriceChart, { symbol: "T" }, { hydrate: "idle", idleTimeout: 500 }),
  ).toBe(
    '<taipa-island data-taipa-component="PriceChart" data-taipa-hydrate="idle" data-taipa-idle-timeout="500" data-taipa-version="2"><p data-taipa-ref="status">T</p><script type="application/json" data-taipa-props>{"symbol":"T"}</script></taipa-island>',
  );
  expect(
    await renderIsland(
      PriceChart,
      { symbol: "T" },
      { hydrate: "visible", visibleRootMargin: "300px 0px" },
    ),
  ).toContain('data-taipa-visible-root-margin="300px 0px"');
});

test("module resolution attributes, id, and attribute escaping", async () => {
  const output = await renderIsland(
    Counter,
    { initial: 1 },
    {
      id: "cart",
      hydrate: "load",
      module: "/static/components/counter.js?v=1&x=2",
      exportName: "Counter",
    },
  );
  expect(output).toContain('id="cart"');
  expect(output).toContain('data-taipa-src="/static/components/counter.js?v=1&amp;x=2"');
  expect(output).toContain('data-taipa-export="Counter"');
});

// ---------------------------------------------------------------------------
// Hostile payloads stay inert in both lanes (inner HTML
// via html``; JSON scripts via inert escaping)
// ---------------------------------------------------------------------------

test("hostile props are escaped in markup and inert in the props script", async () => {
  const hostile = `</script><script>alert("x")</script> & <b>`;
  const output = await renderIsland(Badge, { label: hostile }, { hydrate: "load" });
  expect(output).toContain(
    "<span>&lt;/script&gt;&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &lt;b&gt;</span>",
  );
  const propsScript = output.match(
    /<script type="application\/json" data-taipa-props>(.*?)<\/script>/s,
  );
  expect(propsScript).not.toBeNull();
  const payload = propsScript?.[1] ?? "";
  expect(payload).not.toContain("<");
  expect(payload).not.toContain(">");
  expect(payload).not.toContain("&");
  expect(JSON.parse(payload)).toEqual({ label: hostile });
});

test("line separators and non-ASCII survive the props script round-trip", async () => {
  const value = { label: "a\u2028b\u2029c — José 漢字" };
  const output = await renderIsland(Badge, value, { hydrate: "load" });
  const payload =
    output.match(/<script type="application\/json" data-taipa-props>(.*?)<\/script>/s)?.[1] ?? "";
  expect(payload).not.toContain("\u2028");
  expect(payload).not.toContain("\u2029");
  expect(JSON.parse(payload)).toEqual(value);
});

// ---------------------------------------------------------------------------
// client:only fallback rules.
// ---------------------------------------------------------------------------

test("only renders no view, emits the fallback as inert content plus scripts", async () => {
  let viewCalls = 0;
  const ClientOnly = component<{ token: string }>("ClientOnly", { contractVersion: "3" })
    .state("ready", false)
    .render(() => {
      viewCalls += 1;
      return html`<p>should never render on the server</p>`;
    });
  const fallback = raw(`<div data-taipa-fallback class="skeleton">Loading…</div>`);
  const output = await renderIsland(
    ClientOnly,
    { token: "abc" },
    { hydrate: "only", fallback, state: { ready: false } },
  );
  expect(viewCalls).toBe(0);
  expect(output).toBe(
    '<taipa-island data-taipa-component="ClientOnly" data-taipa-hydrate="only" data-taipa-version="3"><div data-taipa-fallback class="skeleton">Loading…</div><script type="application/json" data-taipa-props>{"token":"abc"}</script><script type="application/json" data-taipa-state>{"ready":false}</script></taipa-island>',
  );
});

test("only without a fallback emits empty content but still serializes props", async () => {
  const ClientOnly = component<{ token: string }>("ClientOnly", { contractVersion: "3" }).render(
    () => html`<p>never</p>`,
  );
  const output = await renderIsland(ClientOnly, { token: "abc" }, { hydrate: "only" });
  expect(output).toBe(
    '<taipa-island data-taipa-component="ClientOnly" data-taipa-hydrate="only" data-taipa-version="3"><script type="application/json" data-taipa-props>{"token":"abc"}</script></taipa-island>',
  );
});

test("fallback markup must carry data-taipa-fallback", async () => {
  await expect(
    renderIsland(Badge, { label: "x" }, { hydrate: "only", fallback: raw(`<div>no marker</div>`) }),
  ).rejects.toThrow(/data-taipa-fallback/);
});

// ---------------------------------------------------------------------------
// Option validation: every scheduling/fallback option requires its policy
// ---------------------------------------------------------------------------

test("unknown hydration policies are rejected", async () => {
  await expect(renderIsland(Badge, { label: "x" }, { hydrate: "eager" as never })).rejects.toThrow(
    /hydration policy/,
  );
});

test("fallback requires the only policy", async () => {
  const fallback = raw(`<div data-taipa-fallback>x</div>`);
  await expect(renderIsland(Badge, { label: "x" }, { hydrate: "load", fallback })).rejects.toThrow(
    /fallback.*only/,
  );
  await expect(renderIsland(Badge, { label: "x" }, { fallback })).rejects.toThrow(/fallback.*only/);
});

test("idleTimeout requires idle; visibleRootMargin requires visible", async () => {
  await expect(
    renderIsland(Badge, { label: "x" }, { hydrate: "load", idleTimeout: 10 }),
  ).rejects.toThrow(/idleTimeout.*idle/);
  await expect(
    renderIsland(Badge, { label: "x" }, { hydrate: "idle", visibleRootMargin: "10px" }),
  ).rejects.toThrow(/visibleRootMargin.*visible/);
});

test("module and exportName require a hydration policy", async () => {
  await expect(renderIsland(Badge, { label: "x" }, { module: "/x.js" })).rejects.toThrow(/module/);
  await expect(renderIsland(Badge, { label: "x" }, { exportName: "Badge" })).rejects.toThrow(
    /exportName/,
  );
});

test("invalid scheduling values are rejected", async () => {
  await expect(
    renderIsland(Badge, { label: "x" }, { hydrate: "idle", idleTimeout: -5 }),
  ).rejects.toThrow(/idleTimeout/);
  await expect(
    renderIsland(Badge, { label: "x" }, { hydrate: "visible", visibleRootMargin: "  " }),
  ).rejects.toThrow(/visibleRootMargin/);
});

// ---------------------------------------------------------------------------
// Cross-runtime conformance fixtures (packages/conformance/fixtures/islands)
// ---------------------------------------------------------------------------

interface Fixture {
  readonly description: string;
  readonly component: string;
  readonly props: JsonObject;
  readonly state: JsonObject | null;
  readonly options: Record<string, unknown>;
  readonly expect: string;
}

const registry: Record<string, Component<JsonObject, JsonObject, JsonObject>> = {
  Counter,
  PriceChart,
  Badge,
};

const fixturesDir = new URL("../../../conformance/fixtures/islands/", import.meta.url);
const fixtures = readdirSync(fixturesDir)
  .filter((file) => file.endsWith(".json"))
  .map((file) => JSON.parse(readFileSync(new URL(file, fixturesDir), "utf8")) as Fixture);

test("conformance fixtures render byte-identical islands", async () => {
  expect(fixtures.length).toBeGreaterThanOrEqual(3);
  for (const fixture of fixtures) {
    const entry = registry[fixture.component];
    expect(entry, `registry entry for ${fixture.component}`).toBeDefined();
    const options = {
      ...fixture.options,
      ...(fixture.state === null ? {} : { state: fixture.state }),
    } as IslandRenderOptions<JsonObject>;
    const output = await renderIsland(entry, fixture.props, options);
    expect(output, fixture.description).toBe(fixture.expect);
  }
});
