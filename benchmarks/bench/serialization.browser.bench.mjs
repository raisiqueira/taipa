/**
 * Production browser benchmark for packaged @taipa/ui/client APIs.
 *
 * Direct hydrate() isolates payload JSON parsing and sanitization. bootstrap()
 * then measures equivalent hydration through the untrusted DOM JSON registry
 * and trusted JavaScript registry resolution paths independently.
 */
import { Bench } from "tinybench";
import { bootstrap, hydrate } from "@taipa/ui/client";

const { PayloadProbe, componentModuleUrl } = await import("./serialization.component.mjs");

const PAYLOAD_ITEM_COUNT = 100;
const payload = {
  label: "Quarterly <report>",
  count: 42,
  filters: {
    range: { from: "2026-01-01", to: "2026-03-31" },
    statuses: ["open", "pending", "closed"],
  },
  items: Array.from({ length: PAYLOAD_ITEM_COUNT }, (_, index) => ({
    id: index + 1,
    label: `Item ${index + 1}`,
    flags: { selected: index % 3 === 0, archived: false },
  })),
};
const payloadJson = JSON.stringify(payload).replace(/</g, "\\u003c");
const registryJson = JSON.stringify({
  PayloadProbe: { src: new URL(componentModuleUrl).pathname, export: "PayloadProbe" },
});

function fixture(includeRegistry) {
  return `<taipa-island data-taipa-component="PayloadProbe" data-taipa-hydrate="load"><output data-taipa-ref="value"></output><script type="application/json" data-taipa-props>${payloadJson}</script></taipa-island>${includeRegistry ? `<script id="taipa-registry" type="application/json">${registryJson}</script>` : ""}`;
}

function createRoot(includeRegistry) {
  const root = document.createElement("main");
  root.innerHTML = fixture(includeRegistry);
  document.body.append(root);
  return root;
}

function hostFor(root) {
  const host = root.querySelector("taipa-island");
  if (!(host instanceof HTMLElement)) throw new Error("benchmark fixture host is missing");
  return host;
}

function waitForHydration(host) {
  return new Promise((resolve, reject) => {
    host.addEventListener("taipa:hydrated", resolve, { once: true });
    host.addEventListener("taipa:error", (event) => reject(event.detail.error), { once: true });
  });
}

async function hydrateDirect(root) {
  const host = hostFor(root);
  const instance = hydrate(host, PayloadProbe);
  return instance;
}

async function hydrateFromJsonRegistry(root) {
  const host = hostFor(root);
  const hydrated = waitForHydration(host);
  const handle = bootstrap({ root });
  await hydrated;
  return handle;
}

async function hydrateFromJavaScriptRegistry(root) {
  const host = hostFor(root);
  const hydrated = waitForHydration(host);
  const handle = bootstrap({
    root,
    registry: {
      PayloadProbe: { load: async () => ({ PayloadProbe }), exportName: "PayloadProbe" },
    },
  });
  await hydrated;
  return handle;
}

function assertHydrated(root) {
  const value = root.querySelector("output");
  if (
    value?.textContent !== "Quarterly <report>:42" ||
    value.getAttribute("data-payload") !== String(PAYLOAD_ITEM_COUNT)
  ) {
    throw new Error(`unexpected hydrated DOM: ${value?.outerHTML ?? "missing output"}`);
  }
}

async function validate() {
  const checks = [
    [false, hydrateDirect],
    [true, hydrateFromJsonRegistry],
    [false, hydrateFromJavaScriptRegistry],
  ];
  for (const [includeRegistry, hydrateFixture] of checks) {
    const root = createRoot(includeRegistry);
    try {
      const handle = await hydrateFixture(root);
      assertHydrated(root);
      handle.destroy();
    } finally {
      root.remove();
    }
  }
}

if (!import.meta.env.PROD) {
  throw new Error("serialization benchmark must run from a Vite production bundle");
}
await validate();
console.warn(
  `BENCH_VALIDATION: PASS (3 hydration paths, ${PAYLOAD_ITEM_COUNT} payload items, hydrated DOM)`,
);

const bench = new Bench({ iterations: 20, time: 600, warmupTime: 200, throws: true });
const taskMetadata = new Map();

addTask(
  "hydrate payload JSON parsing and sanitization",
  { path: "hydrate-payload" },
  false,
  hydrateDirect,
);
addTask(
  "bootstrap DOM JSON registry resolution and hydration",
  { path: "dom-json-registry" },
  true,
  hydrateFromJsonRegistry,
);
addTask(
  "bootstrap JavaScript registry resolution and hydration",
  { path: "javascript-registry" },
  false,
  hydrateFromJavaScriptRegistry,
);

await bench.run();

const results = bench.tasks.map((task) => {
  const metadata = taskMetadata.get(task.name);
  const result = task.result;
  if (result === undefined || result.error !== undefined) {
    return { name: task.name, ...metadata, error: String(result?.error ?? "no result") };
  }
  return {
    name: task.name,
    ...metadata,
    opsPerSecond: Number(result.throughput.mean.toFixed(0)),
    meanMs: Number(result.latency.mean.toFixed(4)),
    rmePercent: Number(result.latency.rme.toFixed(2)),
    samples: result.latency.samples?.length ?? 0,
  };
});
console.warn(`BENCH_RESULT: ${JSON.stringify({ taskCount: bench.tasks.length, results })}`);
console.warn("BENCH_DONE: 1");
globalThis.__benchDone = true;

function addTask(name, metadata, includeRegistry, hydrateFixture) {
  taskMetadata.set(name, metadata);
  bench.add(
    name,
    async function () {
      this.handle = await hydrateFixture(this.root);
      return this.handle;
    },
    {
      beforeEach() {
        this.root = createRoot(includeRegistry);
      },
      afterEach() {
        // The public lifecycle handles own their active instances.
        this.handle?.destroy();
        this.root?.remove();
        this.handle = undefined;
        this.root = undefined;
      },
    },
  );
}
