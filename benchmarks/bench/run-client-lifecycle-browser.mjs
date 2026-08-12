/** Node runner for the packaged Taipa client lifecycle causal benchmark. */
import { execFileSync } from "node:child_process";
import { cpus, totalmem } from "node:os";
import { fileURLToPath } from "node:url";
import { runProductionBrowserBenchmark } from "./browser-bench-harness.mjs";

const STUDENT_T_95_DF_39 = 2.0226909117347285;
const processors = cpus();
const environment = {
  architecture: process.arch,
  gitDirty: execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim() !== "",
  gitHash: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  logicalCores: processors.length,
  node: process.version,
  platform: process.platform,
  processor: processors[0]?.model ?? "unknown",
  totalMemoryBytes: totalmem(),
};
const benchmarkEntry = fileURLToPath(new URL("./client-lifecycle.browser.html", import.meta.url));
const expectedPaths = new Map([
  [
    "hydrate-vs-mount-startup",
    {
      conditions: ["hydrate-existing-dom", "mount-render-install-hydrate"],
      unit: "ms/instance",
    },
  ],
  [
    "unrelated-mutation-live-instance",
    {
      conditions: ["unrelated-no-live-instance", "unrelated-one-live-instance"],
      unit: "ms/mutation",
    },
  ],
  [
    "descendant-mutation-live-instance",
    {
      conditions: ["descendant-no-live-instance", "descendant-one-live-instance"],
      unit: "ms/mutation",
    },
  ],
  [
    "bootstrap-observe-dynamic-discovery",
    {
      conditions: ["bootstrap-observe-false", "bootstrap-observe-true"],
      unit: "ms/20-cycle workload",
    },
  ],
]);

await runProductionBrowserBenchmark({
  benchmarkEntry,
  bundleLabel: "packaged Taipa client lifecycle causal paths",
  portEnvironmentVariable: "TAIPA_CLIENT_LIFECYCLE_BENCH_PORT",
  productionPage: "/bench/client-lifecycle.browser.html",
  validateResults,
  formatReport,
});

function validateResults(results, expectedTaskCount, parseError) {
  if (parseError !== undefined) {
    throw new Error(`failed to parse BENCH_RESULT payload: ${parseError.message}`);
  }
  if (expectedTaskCount !== expectedPaths.size || results.length !== expectedPaths.size) {
    throw new Error(
      `expected ${expectedPaths.size} benchmark results, browser declared ${expectedTaskCount ?? "none"} and returned ${results.length}`,
    );
  }

  const remainingPaths = new Set(expectedPaths.keys());
  for (const result of results) {
    if (result === null || typeof result !== "object") {
      throw new TypeError("benchmark result must be an object");
    }
    const expectation = expectedPaths.get(result.path);
    if (expectation === undefined || !remainingPaths.delete(result.path)) {
      throw new Error(`benchmark returned an unexpected or duplicate path: ${result.path}`);
    }
    if (result.unit !== expectation.unit) {
      throw new Error(`benchmark returned an unexpected unit for ${result.path}: ${result.unit}`);
    }
    if (result.seed !== 0x74616970 || result.warmupRounds !== 8 || result.measuredRounds !== 40) {
      throw new Error(`benchmark returned invalid run metadata: ${result.path}`);
    }
    if (!Array.isArray(result.conditions) || result.conditions.length !== 2) {
      throw new Error(`benchmark pair must contain exactly two conditions: ${result.path}`);
    }
    for (const [index, condition] of result.conditions.entries()) {
      if (condition.path !== expectation.conditions[index]) {
        throw new Error(
          `benchmark returned an unexpected condition path for ${result.path}: ${condition.path}`,
        );
      }
      validateCondition(condition, `${result.path}/${condition.path}`);
    }
    validateDifference(result.pairedAbsoluteDifferenceMs, `${result.path} absolute difference`);
    validateDifference(result.pairedPercentageDifference, `${result.path} percentage difference`);
    validatePairConsistency(result);
  }
  if (remainingPaths.size !== 0) {
    throw new Error(`benchmark did not return paths: ${[...remainingPaths].join(", ")}`);
  }
}

function validatePairConsistency(result) {
  const [conditionA, conditionB] = result.conditions;
  const absoluteDifferences = conditionA.rawSamplesMs.map(
    (value, index) => conditionB.rawSamplesMs[index] - value,
  );
  const percentageDifferences = conditionA.rawSamplesMs.map(
    (value, index) => ((conditionB.rawSamplesMs[index] - value) / value) * 100,
  );

  assertSummaryMatches(
    result.pairedAbsoluteDifferenceMs,
    summarize(absoluteDifferences),
    `${result.path} absolute difference`,
  );
  assertSummaryMatches(
    result.pairedPercentageDifference,
    summarize(percentageDifferences),
    `${result.path} percentage difference`,
  );
}

function validateCondition(condition, label) {
  if (typeof condition.label !== "string" || condition.label.length === 0) {
    throw new Error(`benchmark condition is missing its label: ${label}`);
  }
  if (condition.sampleCount !== 40) {
    throw new Error(`benchmark condition returned an invalid sample count: ${label}`);
  }
  if (
    !Array.isArray(condition.rawSamplesMs) ||
    condition.rawSamplesMs.length !== 40 ||
    !condition.rawSamplesMs.every((value) => Number.isFinite(value) && value > 0)
  ) {
    throw new Error(`benchmark condition returned invalid raw samples: ${label}`);
  }
  validateInterval(condition.meanMs, condition.ci95Ms, label);
  if (condition.meanMs <= 0) {
    throw new Error(`benchmark condition returned a non-positive mean: ${label}`);
  }
  const expected = summarize(condition.rawSamplesMs);
  assertSummaryMatches(
    { sampleCount: condition.sampleCount, mean: condition.meanMs, ci95: condition.ci95Ms },
    expected,
    label,
  );
}

function validateDifference(difference, label) {
  if (difference === null || typeof difference !== "object" || difference.sampleCount !== 40) {
    throw new Error(`benchmark returned an invalid paired sample count: ${label}`);
  }
  validateInterval(difference.mean, difference.ci95, label);
}

function validateInterval(mean, interval, label) {
  const metrics = [mean, interval?.lower, interval?.upper];
  if (!metrics.every((value) => typeof value === "number" && Number.isFinite(value))) {
    throw new Error(`benchmark returned non-finite metrics: ${label}`);
  }
  if (interval.lower > mean || mean > interval.upper) {
    throw new Error(`benchmark returned an incorrectly ordered confidence interval: ${label}`);
  }
}

function summarize(samples) {
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

function assertSummaryMatches(actual, expected, label) {
  const values = [
    [actual.sampleCount, expected.sampleCount],
    [actual.mean, expected.mean],
    [actual.ci95.lower, expected.ci95.lower],
    [actual.ci95.upper, expected.ci95.upper],
  ];
  if (values.some(([left, right]) => Math.abs(left - right) > 1e-12)) {
    throw new Error(`benchmark returned an inconsistent paired summary: ${label}`);
  }
}

function formatReport(results, validationMessage, chromiumVersion, timestamp) {
  const header = [
    "Taipa client lifecycle causal benchmark - production browser",
    "",
    `Timestamp: ${timestamp}`,
    `Source: ${environment.gitDirty ? "dirty working tree based on " : "commit "}${environment.gitHash}`,
    "Bundle: Vite production mode, minified, consuming packaged @taipa/ui and @taipa/ui/client exports.",
    `Chromium: ${chromiumVersion}`,
    `Node: ${environment.node} on ${environment.platform}/${environment.architecture}`,
    `Processor: ${environment.processor} (${environment.logicalCores} logical cores, ${(environment.totalMemoryBytes / 1024 ** 3).toFixed(1)} GiB host memory)`,
    `Validation: ${validationMessage}`,
    "Protocol: 8 warmup rounds, 40 measured paired rounds, seed 0x74616970, balanced randomized AB/BA order.",
    "Positive paired differences mean condition B took longer than condition A.",
    "The startup pair compares distinct API paths: mount() includes rendering, parsing, DOM installation, and hydration; hydrate() attaches to existing DOM.",
    "Mutation rows are reported per textContent replacement. The dynamic insertion pair times 20 insert/remove cycles of 100 islands plus the final insertion; hydration is awaited and validated outside timing.",
    "",
    "| comparison and unit | condition A mean (95% CI) | condition B mean (95% CI) | paired B-A (95% CI) | paired B vs A % (95% CI) |",
    "| --- | ---: | ---: | ---: | ---: |",
  ];
  const lines = results.map((result) => {
    const [a, b] = result.conditions;
    const absolute = result.pairedAbsoluteDifferenceMs;
    const percentage = result.pairedPercentageDifference;
    return `| ${result.name}<br><code>${a.path}</code> / <code>${b.path}</code><br>${result.unit} | ${formatCondition(a)} | ${formatCondition(b)} | ${formatSummary(absolute, 4)} | ${formatSummary(percentage, 2)} |`;
  });
  return header.concat(lines).join("\n");
}

function formatCondition(condition) {
  return `${condition.meanMs.toFixed(4)} [${condition.ci95Ms.lower.toFixed(4)}, ${condition.ci95Ms.upper.toFixed(4)}]`;
}

function formatSummary(summary, digits) {
  return `${formatSigned(summary.mean, digits)} [${formatSigned(summary.ci95.lower, digits)}, ${formatSigned(summary.ci95.upper, digits)}]`;
}

function formatSigned(value, digits) {
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
}
