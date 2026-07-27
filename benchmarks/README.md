# Taipa Benchmarks

Local benchmark harness inspired by [`krausest/js-framework-benchmark`](https://github.com/krausest/js-framework-benchmark/tree/master).

This first slice compares:

- `taipa`
- `ilha`
- `vanillajs`
- `lit-html`
- `react`
- `vue` (`vue@3.6` is not published on npm at the time of setup; this uses the resolved Vue 3 catalog version)

Implemented operations:

- `create rows` (`#run`, 1,000 rows)
- `replace all rows` (`#run` over an existing 1,000-row table)
- `partial update` (`#update`, every 10th row)
- `run memory` (JS heap after `#run`)
- `update memory` (local extension: JS heap after `#run` + `#update`)

## Results dashboard

Start the dev server to view the results dashboard — a single page that renders the latest run from `src/results.json` with an overall standing (geometric mean vs the best framework per operation) and a ranked bar chart per operation:

```sh
pnpm --filter @taipa/benchmarks dev
```

- `http://localhost:5173/` — results dashboard
- `http://localhost:5173/harness.html?framework=taipa` — interactive harness for a single framework
- `http://localhost:5173/harness.html?framework=react`

The dashboard is styled with Tailwind CSS and highlights Taipa across every operation.

## Running the benchmarks

Run the automated local pass:

```sh
pnpm --filter @taipa/benchmarks bench
```

The runner performs five warmup executions before the measured pass for each framework/operation. It drives the per-framework harness (`harness.html`), prints one table per operation sorted from best to worst, and writes two artifacts with the run timestamp and current git hash:

- `benchmarks/src/results.json` — structured data consumed by the dashboard.
- `benchmarks/BENCHMARK_RESULTS.md` — the same numbers as Markdown tables.

CPU timings are ranked by lower milliseconds. Memory readings are ranked by lower Chromium `JSHeapUsedSize` bytes. The `vs best` column shows the percentage slower or heavier than the top-ranked result for that operation. Treat these as local development signals, not official js-framework-benchmark results.
