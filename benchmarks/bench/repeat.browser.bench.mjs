/**
 * Dedicated production-browser benchmark: Taipa `repeat()` vs Lit `repeat`.
 *
 * Taipa's `repeat()` returns a server-rendered `SafeHtml` string — there is no
 * reconciliation path. Lit's `repeat` directive commits keyed items into a DOM
 * container and diffs on re-render. The tasks below measure each library in its
 * native form for the workload both are designed for: producing N rows of markup
 * from an iterable.
 *
 * First-render tasks compare the raw "build N rows" cost (taipa concatenates a
 * string; Lit commits to a detached container). Update tasks re-render with the
 * rows reversed: Lit `repeat` moves DOM ranges by key, Lit `Array.map` updates
 * its iterable parts positionally, and taipa `repeat` simply re-concatenates the
 * whole string (there is no client-side reconciliation path).
 *
 * Each task also runs an equivalence check so the benchmark doubles as a
 * validation that taipa `repeat()` and Lit `repeat` produce identical markup for
 * the same input.
 *
 * The runner first rebuilds Taipa's package output, then bundles this module in
 * Vite production mode. That resolves Lit's production export and minifies the
 * Taipa, Lit, and benchmark code served to Chromium.
 *
 * Run: pnpm --filter @taipa/benchmarks bench:repeat
 */
import { Bench } from "tinybench";
import { html, repeat } from "@taipa/ui";
import { html as litHtml, render } from "lit-html";
import { repeat as litRepeat } from "lit-html/directives/repeat.js";

/** Row count large enough to dominate fixed scanning/setup costs. */
const ROW_COUNT = 500;

const rows = Array.from({ length: ROW_COUNT }, (_, index) => ({
  id: index + 1,
  label: `Item ${index + 1}`,
}));

/** Per-row templates that produce byte-identical markup in each library. */
const taipaRow = (row) => html`<li data-id="${row.id}">${row.label}</li>`;
// Lit attribute/element rendering requires a commit target, so its row builder
// returns the Lit template result; the surrounding task supplies the container.
const litRow = (row) => litHtml`<li data-id="${row.id}">${row.label}</li>`;
const taipaListStrings = Object.assign(["<ul>", "</ul>"], {
  raw: ["<ul>", "</ul>"],
});

const taipaRepeatList = (items) => html(taipaListStrings, repeat(items, taipaRow)).value;
const taipaMapList = (items) => html(taipaListStrings, items.map(taipaRow)).value;

// Keep each Lit wrapper at one template-literal call site. Lit keys its
// Template cache by the TemplateStringsArray identity, so separate call sites
// would replace the outer template instead of exercising update behavior.
const litRepeatList = (items) => litHtml`<ul>${litRepeat(items, (row) => row.id, litRow)}</ul>`;
const litMapList = (items) => litHtml`<ul>${items.map(litRow)}</ul>`;

/** Reversed-order rows for the update tasks. */
const reversedRows = rows.toReversed();

// ---- Validation: both libraries must emit equivalent HTML for the same input. --
// Lit interleaves marker comment nodes (`<!--?lit$n$-->`, `<!---->`) at every
// template expression boundary; strip comments from both sides before comparing.
function normalize(markup) {
  return markup.replace(/<!--[\s\S]*?-->/g, "");
}

function validate() {
  const initialMarkup = normalize(taipaRepeatList(rows));
  const reversedMarkup = normalize(taipaRepeatList(reversedRows));

  const keyedContainer = document.createElement("div");
  render(litRepeatList(rows), keyedContainer);
  const initialKeyedMarkup = normalize(keyedContainer.innerHTML);
  const keyedFirstRow = keyedContainer.querySelector('li[data-id="1"]');
  render(litRepeatList(reversedRows), keyedContainer);

  const positionalContainer = document.createElement("div");
  render(litMapList(rows), positionalContainer);
  const initialPositionalMarkup = normalize(positionalContainer.innerHTML);
  const positionalFirstRow = positionalContainer.querySelector("li");
  render(litMapList(reversedRows), positionalContainer);

  return {
    characterCount: initialMarkup.length,
    checks: [
      {
        name: "Taipa Array.map first render",
        actual: normalize(taipaMapList(rows)),
        expected: initialMarkup,
      },
      { name: "Lit repeat first render", actual: initialKeyedMarkup, expected: initialMarkup },
      {
        name: "Lit Array.map first render",
        actual: initialPositionalMarkup,
        expected: initialMarkup,
      },
      {
        name: "Taipa Array.map reversed render",
        actual: normalize(taipaMapList(reversedRows)),
        expected: reversedMarkup,
      },
      {
        name: "Lit repeat keyed update",
        actual: normalize(keyedContainer.innerHTML),
        expected: reversedMarkup,
      },
      {
        name: "Lit Array.map positional update",
        actual: normalize(positionalContainer.innerHTML),
        expected: reversedMarkup,
      },
      {
        name: "Lit repeat preserves keyed row identity",
        actual: String(keyedContainer.querySelector('li[data-id="1"]') === keyedFirstRow),
        expected: "true",
      },
      {
        name: "Lit Array.map preserves position identity",
        actual: String(
          positionalContainer.querySelector("li") === positionalFirstRow &&
            positionalFirstRow?.getAttribute("data-id") === String(ROW_COUNT),
        ),
        expected: "true",
      },
    ],
  };
}

const validation = validate();
const failedValidation = validation.checks.find((check) => check.actual !== check.expected);
if (!import.meta.env.PROD) {
  throw new Error("repeat benchmark must run from a Vite production bundle");
}
if (failedValidation === undefined) {
  console.warn(
    `BENCH_VALIDATION: PASS (${validation.checks.length} checks, 2 row orders, ${validation.characterCount} chars, ${ROW_COUNT} rows)`,
  );
} else {
  console.warn(`BENCH_VALIDATION: FAIL (${failedValidation.name})`);
  console.warn(`BENCH_EXPECTED_PREFIX: ${failedValidation.expected.slice(0, 256)}`);
  console.warn(`BENCH_ACTUAL_PREFIX: ${failedValidation.actual.slice(0, 256)}`);
  console.warn(`BENCH_EXPECTED_LENGTH: ${failedValidation.expected.length}`);
  console.warn(`BENCH_ACTUAL_LENGTH: ${failedValidation.actual.length}`);
  throw new Error(`benchmark validation failed: ${failedValidation.name}`);
}

const bench = new Bench({ iterations: 20, time: 600, warmupTime: 200, throws: true });
const taskMetadata = new Map();

addTask(
  `taipa repeat: first render ${ROW_COUNT} rows`,
  { library: "taipa", workload: "first-render", isBaseline: false },
  () => {
    return taipaRepeatList(rows);
  },
);
addTask(
  `taipa Array.map: first render ${ROW_COUNT} rows (baseline)`,
  { library: "taipa", workload: "first-render", isBaseline: true },
  () => {
    return taipaMapList(rows);
  },
);
addTask(
  `taipa repeat: re-render ${ROW_COUNT} reversed rows (no reconciliation)`,
  { library: "taipa", workload: "re-render", isBaseline: false },
  () => {
    return taipaRepeatList(reversedRows);
  },
);
addTask(
  `taipa Array.map: re-render ${ROW_COUNT} reversed rows (baseline)`,
  { library: "taipa", workload: "re-render", isBaseline: true },
  () => {
    return taipaMapList(reversedRows);
  },
);
addTask(
  `lit repeat: first render ${ROW_COUNT} rows (keyed)`,
  { library: "lit", workload: "first-render", isBaseline: false },
  () => {
    const container = document.createElement("div");
    render(litRepeatList(rows), container);
    return container;
  },
);
addTask(
  `lit Array.map: first render ${ROW_COUNT} rows (baseline)`,
  { library: "lit", workload: "first-render", isBaseline: true },
  () => {
    const container = document.createElement("div");
    render(litMapList(rows), container);
    return container;
  },
);
addTask(
  `lit repeat: re-render ${ROW_COUNT} reversed rows (keyed update)`,
  { library: "lit", workload: "re-render", isBaseline: false },
  function () {
    render(litRepeatList(reversedRows), this.container);
    return this.container;
  },
  {
    beforeAll() {
      this.container = document.createElement("div");
    },
    beforeEach() {
      // Reset to original-order render so every iteration measures the
      // original -> reversed diff (Lit `repeat` reorders in place by key).
      render(litRepeatList(rows), this.container);
    },
    afterAll() {
      this.container.remove();
      this.container = null;
    },
  },
);
addTask(
  `lit Array.map: re-render ${ROW_COUNT} reversed rows (unkeyed update)`,
  { library: "lit", workload: "re-render", isBaseline: true },
  function () {
    render(litMapList(reversedRows), this.container);
    return this.container;
  },
  {
    beforeAll() {
      this.container = document.createElement("div");
    },
    beforeEach() {
      // Reset to original order; `map` has no keys, so Lit updates its row
      // parts positionally instead of moving existing rows by identity.
      render(litMapList(rows), this.container);
    },
    afterAll() {
      this.container.remove();
      this.container = null;
    },
  },
);

await bench.run();

// Serialize results with a tagged prefix the Node runner scrapes from console.
const payload = bench.tasks.map((task) => {
  const metadata = taskMetadata.get(task.name);
  if (metadata === undefined) {
    throw new Error(`missing metadata for benchmark task: ${task.name}`);
  }
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
console.warn(
  `BENCH_RESULT: ${JSON.stringify({ taskCount: bench.tasks.length, results: payload })}`,
);
console.warn("BENCH_DONE: 1");
// Sentinel the Node runner polls for, so it never races a missed console event.
globalThis.__benchDone = true;

function addTask(name, metadata, task, hooks) {
  taskMetadata.set(name, metadata);
  bench.add(name, task, hooks);
}
