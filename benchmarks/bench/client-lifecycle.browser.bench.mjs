/** Paired production-browser benchmark for packaged Taipa client lifecycle APIs. */
import { component, html } from "@taipa/ui";
import { bootstrap, hydrate, mount, unmount } from "@taipa/ui/client";

const WARMUP_ROUNDS = 8;
const MEASURED_ROUNDS = 40;
const RANDOM_SEED = 0x74616970;
const STUDENT_T_95_DF_39 = 2.0226909117347285;
const START = 7;
const STARTUP_INSTANCE_COUNT = 100;
const MUTATION_COUNT = 10_000;
const BOOTSTRAP_ISLAND_COUNT = 100;
const BOOTSTRAP_MUTATION_CYCLES = 20;

let activeConnectedCleanups = 0;
let connectedCleanupCalls = 0;
let duplicateConnectedCleanup = false;

const LifecycleProbe = component("LifecycleProbe")
  .state("count", ({ props }) => props.start)
  .bind("value", ({ element, state }) => {
    element.textContent = `value=${state.count()}`;
  })
  .on("increment@click", ({ state }) => {
    state.count(state.count() + 1);
  })
  .connected(() => {
    activeConnectedCleanups += 1;
    let active = true;
    return () => {
      if (!active) {
        duplicateConnectedCleanup = true;
        return;
      }
      active = false;
      activeConnectedCleanups -= 1;
      connectedCleanupCalls += 1;
    };
  })
  .render(
    ({ state }) => html`<button data-taipa-ref="increment">+</button
      ><output data-taipa-ref="value">${state.count()}</output>
      <div data-mutation-zone></div>`,
  );

const registry = {
  LifecycleProbe: async () => ({ default: LifecycleProbe }),
};

const pairs = [
  {
    name: "startup: hydrate() existing DOM vs mount() render/install/hydrate",
    path: "hydrate-vs-mount-startup",
    unit: "ms/instance",
    conditions: [
      {
        label: "hydrate(): attach to existing DOM",
        path: "hydrate-existing-dom",
        setup: setupHydrateStartup,
      },
      {
        label: "mount(): render, parse, install, then hydrate",
        path: "mount-render-install-hydrate",
        setup: setupMountStartup,
      },
    ],
  },
  {
    name: "unrelated child mutation: no live instance vs one hydrated live instance",
    path: "unrelated-mutation-live-instance",
    unit: "ms/mutation",
    conditions: [
      {
        label: "unrelated mutation with no live instance",
        path: "unrelated-no-live-instance",
        setup: () => setupMutation(false, false),
      },
      {
        label: "unrelated mutation with one hydrated live instance",
        path: "unrelated-one-live-instance",
        setup: () => setupMutation(true, false),
      },
    ],
  },
  {
    name: "descendant child mutation: no live instance vs one hydrated live instance",
    path: "descendant-mutation-live-instance",
    unit: "ms/mutation",
    conditions: [
      {
        label: "descendant mutation with no live instance",
        path: "descendant-no-live-instance",
        setup: () => setupMutation(false, true),
      },
      {
        label: "descendant mutation with one hydrated live instance",
        path: "descendant-one-live-instance",
        setup: () => setupMutation(true, true),
      },
    ],
  },
  {
    name: "bootstrap dynamic insertion: observe false vs true",
    path: "bootstrap-observe-dynamic-discovery",
    unit: "ms/20-cycle workload",
    conditions: [
      {
        label: "bootstrap observe:false insertion baseline",
        path: "bootstrap-observe-false",
        setup: () => setupBootstrapInsertion(false),
      },
      {
        label: "bootstrap observe:true discovery and registration",
        path: "bootstrap-observe-true",
        setup: () => setupBootstrapInsertion(true),
      },
    ],
  },
];

if (!import.meta.env.PROD) {
  throw new Error("client lifecycle benchmark must run from a Vite production bundle");
}

await validateLifecycleSemantics();
const random = seededRandom(RANDOM_SEED);
await runRounds(WARMUP_ROUNDS, random);
const measured = await runRounds(MEASURED_ROUNDS, random, true);
assertNoActiveConnections("after measured rounds");

const results = pairs.map((pair) => {
  const samples = measured.get(pair.path);
  if (samples === undefined) throw new Error(`missing samples for pair: ${pair.path}`);
  const [a, b] = samples;
  const absoluteDifferences = a.map((value, index) => b[index] - value);
  const percentageDifferences = a.map((value, index) => ((b[index] - value) / value) * 100);
  return {
    name: pair.name,
    path: pair.path,
    unit: pair.unit,
    seed: RANDOM_SEED,
    warmupRounds: WARMUP_ROUNDS,
    measuredRounds: MEASURED_ROUNDS,
    conditions: pair.conditions.map((condition, index) => ({
      label: condition.label,
      path: condition.path,
      rawSamplesMs: samples[index],
      ...summarizeMilliseconds(samples[index]),
    })),
    pairedAbsoluteDifferenceMs: summarize(absoluteDifferences),
    pairedPercentageDifference: summarize(percentageDifferences),
  };
});

console.warn(`BENCH_RESULT: ${JSON.stringify({ taskCount: pairs.length, results })}`);
console.warn(
  `BENCH_VALIDATION: PASS (4 causal pairs, ${WARMUP_ROUNDS} warmups, ${MEASURED_ROUNDS} paired rounds, ${connectedCleanupCalls} connected cleanups, zero active)`,
);
console.warn("BENCH_DONE: 1");
globalThis.__benchDone = true;

async function validateLifecycleSemantics() {
  assertNoActiveConnections("before validation");

  const hydrateRoot = document.createElement("main");
  const hydrateHost = createHydrationHost();
  const originalOutput = hydrateHost.querySelector("output");
  hydrateRoot.append(hydrateHost);
  document.body.append(hydrateRoot);
  const hydrated = hydrate(hydrateHost, LifecycleProbe);
  assertHydrated(hydrateHost, START);
  assert(
    originalOutput === hydrateHost.querySelector("output"),
    "hydrate() replaced an existing node",
  );
  hydrateHost.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  assertHydrated(hydrateHost, START + 1);
  hydrated.destroy();
  hydrateRoot.remove();
  assertNoActiveConnections("after hydration identity validation");

  const mountHost = document.createElement("div");
  document.body.append(mountHost);
  const mounted = await mount(mountHost, LifecycleProbe, { props: { start: START } });
  assertHydrated(mountHost, START);
  mounted.destroy();
  mountHost.remove();
  assertNoActiveConnections("after mount validation");

  await validateInsertedIsland(false);
  await validateInsertedIsland(true);

  const automaticRoot = document.createElement("main");
  const automaticHost = createHydrationHost();
  automaticRoot.append(automaticHost);
  document.body.append(automaticRoot);
  hydrate(automaticHost, LifecycleProbe);
  assert(activeConnectedCleanups === 1, "automatic teardown fixture did not connect");
  automaticHost.remove();
  await nextTask();
  assert(activeConnectedCleanups === 0, "disconnected instance was not automatically destroyed");
  assert(
    unmount(automaticHost) === false,
    "automatically destroyed host still had a live instance",
  );
  automaticRoot.remove();

  const explicitRoot = document.createElement("main");
  const explicitHost = createHydrationHost();
  explicitRoot.append(explicitHost);
  document.body.append(explicitRoot);
  hydrate(explicitHost, LifecycleProbe);
  assert(unmount(explicitHost) === true, "explicit unmount did not destroy the live instance");
  assert(unmount(explicitHost) === false, "explicit unmount destroyed the instance twice");
  explicitRoot.remove();
  assertNoActiveConnections("after lifecycle validation");
}

async function validateInsertedIsland(observe) {
  const root = document.createElement("main");
  document.body.append(root);
  const handle = bootstrap({ root, registry, observe });
  const host = createHydrationHost(true);
  const barrier = mutationBarrier(root);
  try {
    if (observe) {
      const hydrated = waitForHydration(host);
      root.append(host);
      await hydrated;
      assertHydrated(host, START);
      assert(activeConnectedCleanups === 1, "observed island did not register a live instance");
    } else {
      root.append(host);
      await barrier.promise;
      await nextTask();
      assert(
        host.querySelector("output")?.textContent === "",
        "observe:false discovered an island",
      );
      assert(unmount(host) === false, "observe:false registered a live instance");
    }
  } finally {
    barrier.disconnect();
    handle.destroy();
    root.remove();
  }
  assertNoActiveConnections(`after observe:${observe} validation`);
}

async function runRounds(roundCount, random, record = false) {
  const samples = new Map(pairs.map((pair) => [pair.path, [[], []]]));
  const conditionOrders = new Map(
    pairs.map((pair) => [pair.path, balancedConditionOrders(roundCount, random)]),
  );

  for (let round = 0; round < roundCount; round += 1) {
    for (const pair of fisherYates([...pairs], random)) {
      const order = conditionOrders.get(pair.path)?.[round];
      if (order === undefined) throw new Error(`missing condition order for ${pair.path}`);
      for (const conditionIndex of order) {
        const elapsed = await measureCondition(pair.conditions[conditionIndex]);
        if (record) samples.get(pair.path)[conditionIndex].push(elapsed);
      }
    }
  }
  return samples;
}

async function measureCondition(condition) {
  assertNoActiveConnections(`before ${condition.path} setup`);
  let fixture;
  try {
    fixture = await condition.setup();
    const elapsed = await fixture.measure();
    if (!Number.isFinite(elapsed) || elapsed <= 0) {
      throw new Error(`${condition.path} returned an invalid elapsed time: ${elapsed}`);
    }
    return elapsed;
  } finally {
    await fixture?.teardown();
    assertNoActiveConnections(`after ${condition.path} teardown`);
  }
}

async function setupHydrateStartup() {
  const root = document.createElement("main");
  const hosts = Array.from({ length: STARTUP_INSTANCE_COUNT }, createHydrationHost);
  const originalOutputs = hosts.map((host) => host.querySelector("output"));
  root.append(...hosts);
  document.body.append(root);
  let instances = [];
  return {
    measure() {
      const started = performance.now();
      instances = hosts.map((host) => hydrate(host, LifecycleProbe));
      const elapsedPerInstance = (performance.now() - started) / STARTUP_INSTANCE_COUNT;
      hosts.forEach((host, index) => {
        assertHydrated(host, START);
        assert(
          originalOutputs[index] === host.querySelector("output"),
          "timed hydrate() replaced a node",
        );
      });
      assert(
        activeConnectedCleanups === STARTUP_INSTANCE_COUNT,
        "timed hydrate() did not register every live instance",
      );
      return elapsedPerInstance;
    },
    teardown() {
      for (const instance of instances) instance.destroy();
      root.remove();
    },
  };
}

async function setupMountStartup() {
  const root = document.createElement("main");
  const hosts = Array.from({ length: STARTUP_INSTANCE_COUNT }, () => document.createElement("div"));
  root.append(...hosts);
  document.body.append(root);
  const instances = [];
  return {
    async measure() {
      const started = performance.now();
      for (const host of hosts) {
        instances.push(await mount(host, LifecycleProbe, { props: { start: START } }));
      }
      const elapsedPerInstance = (performance.now() - started) / STARTUP_INSTANCE_COUNT;
      for (const host of hosts) assertHydrated(host, START);
      assert(
        activeConnectedCleanups === STARTUP_INSTANCE_COUNT,
        "timed mount() did not register every live instance",
      );
      return elapsedPerInstance;
    },
    teardown() {
      for (const instance of instances) instance.destroy();
      root.remove();
    },
  };
}

async function setupMutation(live, descendant) {
  const root = document.createElement("main");
  const host = createHydrationHost();
  const unrelatedTarget = document.createElement("section");
  root.append(host, unrelatedTarget);
  document.body.append(root);
  let instance;
  if (live) {
    instance = hydrate(host, LifecycleProbe);
    assertHydrated(host, START);
  }
  assert(
    activeConnectedCleanups === (live ? 1 : 0),
    `mutation setup registered ${activeConnectedCleanups} live instances`,
  );
  const target = descendant ? host.querySelector("[data-mutation-zone]") : unrelatedTarget;
  assert(target instanceof HTMLElement, "mutation target is missing");
  target.textContent = "initial";
  const barrier = mutationBarrier(target);
  return {
    async measure() {
      const started = performance.now();
      for (let index = 0; index < MUTATION_COUNT; index += 1) {
        target.textContent = String(index);
      }
      await barrier.promise;
      const elapsedPerMutation = (performance.now() - started) / MUTATION_COUNT;
      assert(
        target.textContent === String(MUTATION_COUNT - 1),
        "timed mutations did not reach the final value",
      );
      return elapsedPerMutation;
    },
    teardown() {
      barrier.disconnect();
      instance?.destroy();
      root.remove();
    },
  };
}

async function setupBootstrapInsertion(observe) {
  const root = document.createElement("main");
  document.body.append(root);
  // Register the benchmark barrier first. Its continuation runs after all
  // mutation callbacks, but before bootstrap's queued load activation.
  const barrier = mutationBarrier(root);
  const handle = bootstrap({ root, registry, observe });
  const hosts = Array.from({ length: BOOTSTRAP_ISLAND_COUNT }, () => createHydrationHost(true));
  const fragment = document.createElement("section");
  fragment.append(...hosts);
  const hydrated = observe ? Promise.all(hosts.map(waitForHydration)) : undefined;
  return {
    async measure() {
      const started = performance.now();
      for (let index = 0; index < BOOTSTRAP_MUTATION_CYCLES; index += 1) {
        root.append(fragment);
        fragment.remove();
      }
      root.append(fragment);
      await barrier.promise;
      // Include bootstrap's queued load-policy checks, but keep asynchronous
      // component resolution and hydration outside the measured interval.
      await Promise.resolve();
      const elapsed = performance.now() - started;
      if (hydrated !== undefined) {
        await hydrated;
      } else {
        await nextTask();
      }
      if (observe) {
        for (const host of hosts) assertHydrated(host, START);
        assert(
          activeConnectedCleanups === BOOTSTRAP_ISLAND_COUNT,
          "observe:true did not register every live instance",
        );
      } else {
        assert(
          hosts.every((host) => host.querySelector("output")?.textContent === ""),
          "observe:false hydrated an insertion",
        );
        assert(activeConnectedCleanups === 0, "observe:false registered an inserted island");
      }
      return elapsed;
    },
    teardown() {
      barrier.disconnect();
      handle.destroy();
      root.remove();
    },
  };
}

function createHydrationHost(dynamic = false) {
  const template = document.createElement("template");
  const attributes = dynamic
    ? ' data-taipa-component="LifecycleProbe" data-taipa-hydrate="load"'
    : "";
  template.innerHTML = `<taipa-island${attributes}><button data-taipa-ref="increment">+</button><output data-taipa-ref="value"></output><div data-mutation-zone></div><script type="application/json" data-taipa-props>{"start":${START}}</script></taipa-island>`;
  const host = template.content.firstElementChild;
  assert(host instanceof HTMLElement, "failed to create hydration host");
  return host;
}

function assertHydrated(host, expected) {
  const output = host.querySelector("output");
  assert(
    output?.textContent === `value=${expected}`,
    `unexpected hydrated DOM: ${output?.outerHTML}`,
  );
  assert(host.querySelector("button") instanceof HTMLButtonElement, "hydrated button is missing");
}

function mutationBarrier(root) {
  let observer;
  const promise = new Promise((resolve) => {
    observer = new MutationObserver(() => {
      observer.disconnect();
      resolve();
    });
    observer.observe(root, { childList: true, subtree: true });
  });
  return { promise, disconnect: () => observer.disconnect() };
}

function waitForHydration(host) {
  return new Promise((resolve, reject) => {
    const onHydrated = () => {
      host.removeEventListener("taipa:error", onError);
      resolve();
    };
    const onError = (event) => {
      host.removeEventListener("taipa:hydrated", onHydrated);
      reject(event.detail?.error ?? new Error("dynamic island hydration failed"));
    };
    host.addEventListener("taipa:hydrated", onHydrated, { once: true });
    host.addEventListener("taipa:error", onError, { once: true });
  });
}

function balancedConditionOrders(roundCount, random) {
  assert(roundCount % 2 === 0, "round count must be even for balanced AB/BA ordering");
  const orders = Array.from({ length: roundCount }, (_, index) =>
    index < roundCount / 2 ? [0, 1] : [1, 0],
  );
  return fisherYates(orders, random);
}

function fisherYates(values, random) {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
  }
  return values;
}

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function summarizeMilliseconds(samples) {
  const summary = summarize(samples);
  return { sampleCount: summary.sampleCount, meanMs: summary.mean, ci95Ms: summary.ci95 };
}

function summarize(samples) {
  assert(samples.length === MEASURED_ROUNDS, `expected ${MEASURED_ROUNDS} measured samples`);
  assert(samples.every(Number.isFinite), "samples contain a non-finite value");
  const mean = samples.reduce((total, value) => total + value, 0) / samples.length;
  const variance =
    samples.reduce((total, value) => total + (value - mean) ** 2, 0) / (samples.length - 1);
  const margin = STUDENT_T_95_DF_39 * Math.sqrt(variance / samples.length);
  return {
    sampleCount: samples.length,
    mean,
    ci95: { lower: mean - margin, upper: mean + margin },
  };
}

function assertNoActiveConnections(context) {
  assert(!duplicateConnectedCleanup, `${context}: a connected cleanup ran more than once`);
  assert(
    activeConnectedCleanups === 0,
    `${context}: expected zero active connected cleanups, found ${activeConnectedCleanups}`,
  );
}

function nextTask() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
