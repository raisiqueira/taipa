/**
 * Node runner for the Taipa `repeat()` vs Lit `repeat` browser benchmark.
 *
 * Rebuilds Taipa's package output, creates a minified Vite production bundle,
 * serves that bundle with Vite preview, launches headless Chromium, and scrapes
 * the tagged `BENCH_*` console messages. Vite production resolution selects
 * Lit's production export; Taipa is consumed through its built package entry.
 *
 * Run:  pnpm --filter @taipa/benchmarks bench:repeat
 */
import { fileURLToPath } from "node:url";
import { runProductionBrowserBenchmark } from "./browser-bench-harness.mjs";

const benchmarkEntry = fileURLToPath(new URL("./repeat.browser.html", import.meta.url));
const productionPage = "/bench/repeat.browser.html";
const expectedGroups = new Set([
  "taipa:first-render",
  "taipa:re-render",
  "lit:first-render",
  "lit:re-render",
]);
await runProductionBrowserBenchmark({
  benchmarkEntry,
  bundleLabel: "Taipa and Lit",
  formatReport,
  portEnvironmentVariable: "TAIPA_REPEAT_BENCH_PORT",
  productionPage,
  validateResults,
});

function formatReport(results, validationMessage, chromiumVersion, timestamp) {
  const header = [
    "Taipa repeat() vs lit repeat — production browser benchmark",
    "",
    `Timestamp: ${timestamp}`,
    `Bundle: Vite production mode, minified (Taipa package output + Lit production export)`,
    `Chromium: ${chromiumVersion}`,
    `Validation: ${validationMessage}`,
    "Comparison: Taipa builds SafeHtml strings; Lit commits or updates DOM.",
    "Interpret `vs Array.map` within the same library and workload; absolute cross-library times do not represent equivalent DOM work.",
    "",
    "| task | ops/s | mean (ms) | ±% | samples | vs Array.map |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
  ];
  const baselines = {};
  for (const row of results) {
    if (row.isBaseline) {
      baselines[resultGroup(row)] = row.meanMs;
    }
  }
  const lines = results.map((row) => {
    const baseline = baselines[resultGroup(row)];
    const relative = row.isBaseline
      ? "baseline"
      : baseline === undefined
        ? "n/a"
        : formatRelativeLatency(row.meanMs, baseline);
    return `| ${row.name} | ${row.opsPerSecond.toLocaleString("en-US")} | ${row.meanMs.toFixed(4)} | ${row.rmePercent} | ${row.samples} | ${relative} |`;
  });
  return header.concat(lines).join("\n");
}

function validateResults(results, expectedTaskCount, parseError) {
  if (parseError !== undefined) {
    throw new Error(`failed to parse BENCH_RESULT payload: ${parseError.message}`);
  }
  const requiredTaskCount = expectedGroups.size * 2;
  if (expectedTaskCount !== requiredTaskCount || results.length !== requiredTaskCount) {
    throw new Error(
      `expected ${requiredTaskCount} benchmark results, browser declared ${expectedTaskCount ?? "none"} and returned ${results.length}`,
    );
  }
  for (const result of results) {
    if (result.error !== undefined) {
      throw new Error(`benchmark task failed: ${result.name}: ${result.error}`);
    }
    const metrics = [result.opsPerSecond, result.meanMs, result.rmePercent, result.samples];
    if (!metrics.every((value) => typeof value === "number" && Number.isFinite(value))) {
      throw new Error(`benchmark task returned invalid metrics: ${result.name}`);
    }
  }
  const groups = Object.groupBy(results, resultGroup);
  if (
    Object.keys(groups).length !== expectedGroups.size ||
    Object.keys(groups).some((group) => !expectedGroups.has(group))
  ) {
    throw new Error(`benchmark returned unexpected groups: ${Object.keys(groups).join(", ")}`);
  }
  for (const group of expectedGroups) {
    const groupResults = groups[group] ?? [];
    const baselineCount = groupResults.filter((result) => result.isBaseline).length;
    if (groupResults.length !== 2 || baselineCount !== 1) {
      throw new Error(`benchmark group must contain one candidate and one baseline: ${group}`);
    }
  }
}

function resultGroup(result) {
  return `${result.library}:${result.workload}`;
}

function formatRelativeLatency(value, baseline) {
  const percent = ((value - baseline) / baseline) * 100;
  if (Math.abs(percent) < 0.05) return "same";
  return `${percent > 0 ? "+" : ""}${percent.toFixed(1)}%`;
}
