/**
 * Shared production-browser lifecycle for benchmarks that consume packaged
 * Taipa APIs. Individual runners define their own result validation and report.
 */
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { build, preview } from "vite";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const workspaceRoot = fileURLToPath(new URL("../../", import.meta.url));

export async function runProductionBrowserBenchmark({
  benchmarkEntry,
  bundleInput = benchmarkEntry,
  bundleLabel,
  formatReport,
  portEnvironmentVariable,
  productionPage,
  validateResults,
}) {
  const configuredPort = process.env[portEnvironmentVariable];
  const port = configuredPort === undefined ? 0 : Number(configuredPort);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new TypeError(`invalid ${portEnvironmentVariable}: ${configuredPort}`);
  }

  const bundleRoot = await mkdtemp(join(tmpdir(), "taipa-browser-benchmark-"));
  let server;
  let browser;
  let validationPassed = false;
  let validationMessage = "missing";
  let resultParseError;
  let expectedTaskCount;
  const results = [];

  try {
    // Package exports, rather than source aliases, are the benchmark subject.
    process.stdout.write("Building @taipa/ui production package…\n");
    const packageBuild = spawnSync("pnpm", ["--filter", "@taipa/ui", "build"], {
      cwd: workspaceRoot,
      stdio: "inherit",
    });
    if (packageBuild.status !== 0) {
      throw new Error("@taipa/ui production build failed; benchmark aborted");
    }

    process.stdout.write(`Bundling ${bundleLabel} in Vite production mode…\n`);
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
        rollupOptions: { input: bundleInput },
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
    const benchmarkUrl = `http://127.0.0.1:${address.port}${productionPage}`;
    const benchmarkCompletion = (async () => {
      await page.goto(benchmarkUrl, { waitUntil: "load", timeout: 60000 });
      await page.waitForFunction(() => globalThis.__benchDone === true, null, {
        timeout: 240000,
      });
    })();
    await Promise.race([benchmarkCompletion, pageFailure]);
    if (!validationPassed) {
      throw new Error(`benchmark validation did not pass: ${validationMessage}`);
    }
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
}
