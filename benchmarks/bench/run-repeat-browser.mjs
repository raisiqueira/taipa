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
import { chromium } from "playwright";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build, preview } from "vite";

const configuredPort = process.env.TAIPA_REPEAT_BENCH_PORT;
const port = configuredPort === undefined ? 0 : Number(configuredPort);
if (!Number.isInteger(port) || port < 0 || port > 65_535) {
  throw new TypeError(`invalid TAIPA_REPEAT_BENCH_PORT: ${configuredPort}`);
}
const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const workspaceRoot = fileURLToPath(new URL("../../", import.meta.url));
const benchmarkEntry = fileURLToPath(new URL("./repeat.browser.html", import.meta.url));
const productionPage = "/bench/repeat.browser.html";
const expectedGroups = new Set([
  "taipa:first-render",
  "taipa:re-render",
  "lit:first-render",
  "lit:re-render",
]);
const bundleRoot = await mkdtemp(join(tmpdir(), "taipa-repeat-benchmark-"));

let server;
let browser;
let validationPassed = false;
let validationMessage = "missing";
let resultParseError;
let expectedTaskCount;
const results = [];

try {
  // The bench imports `@taipa/ui`, whose package exports point at `dist/index.mjs`.
  // Rebuild on every run so a stale package artifact cannot skew the comparison.
  process.stdout.write("Building @taipa/ui production package…\n");
  const packageBuild = spawnSync("pnpm", ["--filter", "@taipa/ui", "build"], {
    cwd: workspaceRoot,
    stdio: "inherit",
  });
  if (packageBuild.status !== 0) {
    throw new Error("@taipa/ui production build failed; benchmark aborted");
  }

  process.stdout.write("Bundling Taipa and Lit in Vite production mode…\n");
  await build({
    root: packageRoot,
    configFile: false,
    mode: "production",
    logLevel: "warn",
    build: {
      outDir: bundleRoot,
      emptyOutDir: true,
      minify: "esbuild",
      sourcemap: false,
      rollupOptions: { input: benchmarkEntry },
    },
  });

  server = await preview({
    root: packageRoot,
    configFile: false,
    logLevel: "error",
    build: { outDir: bundleRoot },
    preview: { host: "127.0.0.1", port, strictPort: true },
  });
  const address = server.httpServer.address();
  if (address === null || typeof address === "string") {
    throw new Error("Vite preview server did not expose a TCP port");
  }
  const benchmarkUrl = `http://127.0.0.1:${address.port}${productionPage}`;
  browser = await chromium.launch({ args: ["--js-flags=--expose-gc"] });
  const page = await browser.newPage();

  page.on("console", (message) => {
    const text = message.text();
    if (!text.startsWith("BENCH_")) return;
    process.stdout.write(`${text}\n`);
    if (text.startsWith("BENCH_VALIDATION:")) {
      validationPassed = text.startsWith("BENCH_VALIDATION: PASS");
      validationMessage = text.slice("BENCH_VALIDATION:".length).trim();
    } else if (text.startsWith("BENCH_RESULT:")) {
      const payload = text.slice("BENCH_RESULT:".length).trim();
      try {
        const parsed = JSON.parse(payload);
        if (!Number.isInteger(parsed.taskCount) || !Array.isArray(parsed.results)) {
          throw new TypeError("BENCH_RESULT must contain an integer taskCount and results array");
        }
        expectedTaskCount = parsed.taskCount;
        results.push(...parsed.results);
      } catch (error) {
        resultParseError = error;
      }
    }
  });
  const pageFailure = new Promise((_, reject) => {
    page.on("pageerror", (error) => {
      process.stderr.write(`pageerror: ${error.message}\n`);
      reject(error);
    });
  });

  const benchmarkCompletion = (async () => {
    await page.goto(benchmarkUrl, { waitUntil: "load", timeout: 60000 });
    await page.waitForFunction(() => globalThis.__benchDone === true, null, {
      timeout: 240000,
    });
  })();
  await Promise.race([benchmarkCompletion, pageFailure]);
  validateResults(results, expectedTaskCount, resultParseError);
  process.stdout.write(
    `\n${formatReport(results, validationMessage, browser.version(), new Date().toISOString())}\n`,
  );
} catch (error) {
  process.stderr.write(`Benchmark failed: ${error.message}\n`);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await server?.close();
  await rm(bundleRoot, { recursive: true, force: true });
}

if (!validationPassed) process.exitCode = 1;

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
