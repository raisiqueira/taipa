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

Run the interactive benchmark page:

```sh
pnpm --filter @taipa/benchmarks dev
```

Open a specific implementation:

```text
http://localhost:5173/?framework=taipa
http://localhost:5173/?framework=react
```

Run the automated local pass:

```sh
pnpm --filter @taipa/benchmarks bench
```

The runner performs five warmup executions before the measured pass for each framework/operation. It prints one table per operation, sorted from best to worst, and writes the same output to `benchmarks/BENCHMARK_RESULTS.md` with the run timestamp and current git hash. CPU timings are ranked by lower milliseconds. Memory readings are ranked by lower Chromium `JSHeapUsedSize` bytes. The `vs best` column shows the percentage slower or heavier than the top-ranked result for that operation. Treat these as local development signals, not official js-framework-benchmark results.
