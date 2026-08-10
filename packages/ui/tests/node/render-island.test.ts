import { readdirSync, readFileSync } from "node:fs";
import { expect, test, vi } from "vite-plus/test";
import { component } from "../../src/component";
import { renderIsland, type IslandRenderOptions } from "../../src/server/island";
import { html, raw } from "../../src/template/html";
import type { Component, JsonObject } from "../../src/types";

const Counter = component<{ initial: number }>("Counter")
  .state("count", ({ props }) => props.initial)
  .state("step", 1)
  .render(({ state }) => html`<output data-taipa-ref="count">${state.count()}</output>`);

const PriceChart = component<{ symbol: string }>("PriceChart").render(
  ({ props }) => html`<p data-taipa-ref="status">${props.symbol}</p>`,
);

const Badge = component<{ label: string }>("Badge").render(
  ({ props }) => html`<span>${props.label}</span>`,
);

const PayloadState = component("PayloadState")
  .state("payload", "")
  .render(() => html``);

// ---------------------------------------------------------------------------
// Attributes and scripts for every hydration policy.
// ---------------------------------------------------------------------------

test("static island omits all hydration metadata and scripts", async () => {
  expect(await renderIsland(Badge, { label: "Beta" })).toBe(
    '<taipa-island data-taipa-component="Badge"><span>Beta</span></taipa-island>',
  );
});

test("load island carries policy and inert JSON scripts", async () => {
  const output = await renderIsland(
    Counter,
    { initial: 3 },
    {
      hydrate: "load",
      state: { count: 5 },
    },
  );
  expect(output).toBe(
    '<taipa-island data-taipa-component="Counter" data-taipa-hydrate="load"><output data-taipa-ref="count">5</output><script type="application/json" data-taipa-props>{"initial":3}</script><script type="application/json" data-taipa-state>{"count":5}</script></taipa-island>',
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
  const Empty = component("Empty").render(() => html`<p>hi</p>`);
  const output = await renderIsland(Empty, {}, { hydrate: "load", state: {} });
  expect(output).toBe(
    '<taipa-island data-taipa-component="Empty" data-taipa-hydrate="load"><p>hi</p></taipa-island>',
  );
});

test("idle island serializes the timeout; visible island serializes the root margin", async () => {
  expect(
    await renderIsland(PriceChart, { symbol: "T" }, { hydrate: "idle", idleTimeout: 500 }),
  ).toBe(
    '<taipa-island data-taipa-component="PriceChart" data-taipa-hydrate="idle" data-taipa-idle-timeout="500"><p data-taipa-ref="status">T</p><script type="application/json" data-taipa-props>{"symbol":"T"}</script></taipa-island>',
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

test("server payload limits match client character-count semantics", async () => {
  const limit = 64 * 1024;
  const emptyPayloadLength = JSON.stringify({ label: "" }).length;
  const atLimit = "x".repeat(limit - emptyPayloadLength);

  await expect(renderIsland(Badge, { label: atLimit }, { hydrate: "load" })).resolves.toContain(
    `"label":"${atLimit}`,
  );
  await expect(renderIsland(Badge, { label: `${atLimit}x` }, { hydrate: "load" })).rejects.toThrow(
    /props payload.*64\s*KiB/i,
  );

  const emptyStateLength = JSON.stringify({ payload: "" }).length;
  const stateAtLimit = "x".repeat(limit - emptyStateLength);
  await expect(
    renderIsland(PayloadState, {}, { hydrate: "load", state: { payload: stateAtLimit } }),
  ).resolves.toContain(`"payload":"${stateAtLimit}`);
  await expect(
    renderIsland(PayloadState, {}, { hydrate: "load", state: { payload: `${stateAtLimit}x` } }),
  ).rejects.toThrow(/state payload.*64\s*KiB/i);
});

test("development warnings report payload metadata without payload contents", async () => {
  const originalEnvironment = process.env.NODE_ENV;
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  process.env.NODE_ENV = "development";
  const label = "x".repeat(64 * 1024 * 0.75);

  try {
    await renderIsland(Badge, { label }, { hydrate: "load" });
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/Badge.*characters.*UTF-8 bytes.*64 KiB/i),
    );
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining(label));

    warn.mockClear();
    process.env.NODE_ENV = "production";
    await renderIsland(Badge, { label }, { hydrate: "load" });
    expect(warn).not.toHaveBeenCalled();

    process.env.NODE_ENV = "development";
    await renderIsland(PayloadState, {}, { hydrate: "load", state: { payload: label } });
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/state payload.*PayloadState.*UTF-8 bytes/i),
    );
  } finally {
    process.env.NODE_ENV = originalEnvironment;
    warn.mockRestore();
  }
});

test("payload serialization supports runtimes without Node process", async () => {
  vi.stubGlobal("process", undefined);
  try {
    await expect(
      renderIsland(Badge, { label: "runtime neutral" }, { hydrate: "load" }),
    ).resolves.toContain('data-taipa-props>{"label":"runtime neutral"}</script>');
  } finally {
    vi.unstubAllGlobals();
  }
});

// ---------------------------------------------------------------------------
// client:only fallback rules.
// ---------------------------------------------------------------------------

test("only renders no view, emits the fallback as inert content plus scripts", async () => {
  let viewCalls = 0;
  const ClientOnly = component<{ token: string }>("ClientOnly")
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
    '<taipa-island data-taipa-component="ClientOnly" data-taipa-hydrate="only"><div data-taipa-fallback class="skeleton">Loading…</div><script type="application/json" data-taipa-props>{"token":"abc"}</script><script type="application/json" data-taipa-state>{"ready":false}</script></taipa-island>',
  );
});

test("only without a fallback emits empty content but still serializes props", async () => {
  const ClientOnly = component<{ token: string }>("ClientOnly").render(() => html`<p>never</p>`);
  const output = await renderIsland(ClientOnly, { token: "abc" }, { hydrate: "only" });
  expect(output).toBe(
    '<taipa-island data-taipa-component="ClientOnly" data-taipa-hydrate="only"><script type="application/json" data-taipa-props>{"token":"abc"}</script></taipa-island>',
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
