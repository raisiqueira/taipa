/** Node runner for the packaged Taipa browser serialization benchmark. */
import { fileURLToPath } from "node:url";
import { runProductionBrowserBenchmark } from "./browser-bench-harness.mjs";

const benchmarkEntry = fileURLToPath(new URL("./serialization.browser.html", import.meta.url));

await runProductionBrowserBenchmark({
  benchmarkEntry,
  bundleLabel: "packaged Taipa client serialization paths",
  portEnvironmentVariable: "TAIPA_SERIALIZATION_BENCH_PORT",
  productionPage: "/bench/serialization.browser.html",
  validateResults,
  formatReport,
});

function validateResults(results, expectedTaskCount, parseError) {
  if (parseError !== undefined) {
    throw new Error(`failed to parse BENCH_RESULT payload: ${parseError.message}`);
  }
  if (expectedTaskCount !== 3 || results.length !== 3) {
    throw new Error(
      `expected 3 benchmark results, browser declared ${expectedTaskCount ?? "none"} and returned ${results.length}`,
    );
  }
  const expectedPaths = new Set(["hydrate-payload", "dom-json-registry", "javascript-registry"]);
  for (const result of results) {
    if (result.error !== undefined) {
      throw new Error(`benchmark task failed: ${result.name}: ${result.error}`);
    }
    const metrics = [result.opsPerSecond, result.meanMs, result.rmePercent, result.samples];
    if (!metrics.every((value) => typeof value === "number" && Number.isFinite(value))) {
      throw new Error(`benchmark task returned invalid metrics: ${result.name}`);
    }
    if (!expectedPaths.delete(result.path)) {
      throw new Error(`benchmark returned an unexpected or duplicate path: ${result.path}`);
    }
  }
  if (expectedPaths.size !== 0) {
    throw new Error(`benchmark did not return paths: ${[...expectedPaths].join(", ")}`);
  }
}

function formatReport(results, validationMessage, chromiumVersion, timestamp) {
  const header = [
    "Taipa browser serialization - production benchmark",
    "",
    `Timestamp: ${timestamp}`,
    "Bundle: Vite production mode, minified, consuming @taipa/ui and @taipa/ui/client package exports.",
    `Chromium: ${chromiumVersion}`,
    `Validation: ${validationMessage}`,
    "Direct hydration isolates payload JSON parsing/sanitization. Registry rows include equivalent hydration after their respective resolution path.",
    "",
    "| path | ops/s | mean (ms) | +/- % | samples |",
    "| --- | ---: | ---: | ---: | ---: |",
  ];
  const lines = results.map(
    (result) =>
      `| ${result.name} | ${result.opsPerSecond.toLocaleString("en-US")} | ${result.meanMs.toFixed(4)} | ${result.rmePercent} | ${result.samples} |`,
  );
  return header.concat(lines).join("\n");
}
