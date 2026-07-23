import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { writeFile } from "node:fs/promises";

const frameworks = ["taipa", "ilha", "vanillajs", "lit-html", "react", "vue"];
const operations = [
  { name: "create rows", metric: "milliseconds", unit: "ms" },
  { name: "replace all rows", metric: "milliseconds", unit: "ms" },
  { name: "partial update", metric: "milliseconds", unit: "ms" },
  { name: "run memory", metric: "bytes", unit: "bytes" },
  { name: "update memory", metric: "bytes", unit: "bytes" },
];
const port = Number(process.env.TAIPA_BENCH_PORT ?? 5190);
const baseUrl = `http://127.0.0.1:${port}`;
const reportFile = new URL("../BENCHMARK_RESULTS.md", import.meta.url);

const server = spawn("pnpm", ["exec", "vite", "--host", "127.0.0.1", "--port", String(port)], {
  cwd: new URL("..", import.meta.url),
  stdio: ["ignore", "pipe", "pipe"],
});

let serverOutput = "";
server.stdout.on("data", (chunk) => {
  serverOutput += String(chunk);
});
server.stderr.on("data", (chunk) => {
  serverOutput += String(chunk);
});

try {
  await waitForServer();
  const browser = await chromium.launch({
    args: ["--js-flags=--expose-gc", "--enable-precise-memory-info"],
  });
  const results = [];

  for (const framework of frameworks) {
    const page = await browser.newPage();
    const client = await page.context().newCDPSession(page);
    await client.send("Performance.enable");
    await page.goto(`${baseUrl}/?framework=${framework}`, { waitUntil: "networkidle" });
    await waitForRows(page, 0);

    results.push(
      await measureCpu(page, framework, "create rows", async () => {
        await click(page, "run");
        await waitForRows(page, 1000);
      }),
    );

    await click(page, "clear");
    await waitForRows(page, 0);
    await click(page, "run");
    await waitForRows(page, 1000);
    results.push(
      await measureCpu(page, framework, "replace all rows", async () => {
        const firstId = await firstRowId(page);
        await click(page, "run");
        await page.waitForFunction((previousId) => {
          const row = document.querySelector("tbody tr");
          return row !== null && row.firstElementChild?.textContent !== String(previousId);
        }, firstId);
        await waitForRows(page, 1000);
      }),
    );

    await click(page, "clear");
    await waitForRows(page, 0);
    await click(page, "run");
    await waitForRows(page, 1000);
    results.push(
      await measureCpu(page, framework, "partial update", async () => {
        await click(page, "update");
        await page.waitForFunction(
          () =>
            document
              .querySelector("tbody tr:nth-child(1) td:nth-child(2) a")
              ?.textContent?.includes("!!!") === true,
        );
      }),
    );

    await click(page, "clear");
    await waitForRows(page, 0);
    await click(page, "run");
    await waitForRows(page, 1000);
    results.push({ framework, operation: "run memory", bytes: await jsHeapUsed(page, client) });

    await click(page, "update");
    await page.waitForFunction(
      () =>
        document
          .querySelector("tbody tr:nth-child(1) td:nth-child(2) a")
          ?.textContent?.includes("!!!") === true,
    );
    results.push({ framework, operation: "update memory", bytes: await jsHeapUsed(page, client) });

    await page.close();
  }

  await browser.close();
  const report = await formatReport(results);
  await writeFile(reportFile, report);
  process.stdout.write(report);
  process.stdout.write(`\nSaved benchmark report to ${reportFile.pathname}\n`);
} finally {
  server.kill("SIGTERM");
  await once(server, "exit").catch(() => undefined);
}

async function measureCpu(page, framework, operation, action) {
  const start = await page.evaluate(() => performance.now());
  await action();
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  const end = await page.evaluate(() => performance.now());
  return { framework, operation, milliseconds: Number((end - start).toFixed(3)) };
}

async function formatReport(results) {
  const timestamp = new Date().toISOString();
  const gitHash = await currentGitHash();
  return [
    "# Benchmark Results",
    "",
    `- Timestamp: ${timestamp}`,
    `- Git hash: ${gitHash}`,
    "",
    operations.map((operation) => formatOperationResults(operation, results)).join("\n\n"),
    "",
  ].join("\n");
}

function formatOperationResults(operation, results) {
  const sortedResults = results
    .filter((result) => result.operation === operation.name)
    .toSorted(
      (left, right) => metricValue(left, operation.metric) - metricValue(right, operation.metric),
    );
  const valueHeading = operation.unit === "ms" ? "time" : "memory";
  const rows = sortedResults.map((result, index) => {
    const value = metricValue(result, operation.metric);
    return `| ${index + 1} | ${result.framework} | ${formatValue(value, operation.unit)} |`;
  });
  return [
    `## ${operation.name}`,
    "",
    `| rank | framework | ${valueHeading} |`,
    "| ---: | --- | ---: |",
    ...rows,
  ].join("\n");
}

function metricValue(result, metric) {
  const value = result[metric];
  return typeof value === "number" ? value : Number.POSITIVE_INFINITY;
}

function formatValue(value, unit) {
  if (!Number.isFinite(value)) return "n/a";
  if (unit === "ms") return `${value.toFixed(1)} ms`;
  return `${value.toLocaleString("en-US")} bytes`;
}

async function currentGitHash() {
  const git = spawn("git", ["rev-parse", "HEAD"], {
    cwd: new URL("../..", import.meta.url),
    stdio: ["ignore", "pipe", "pipe"],
  });
  const [stdout] = await once(git.stdout, "data");
  const [code] = await once(git, "exit");
  return code === 0 ? String(stdout).trim() : "unknown";
}

async function click(page, id) {
  await page.locator(`#${id}`).click();
}

async function waitForRows(page, count) {
  await page.waitForFunction(
    (expected) => document.querySelectorAll("tbody tr").length === expected,
    count,
  );
}

async function firstRowId(page) {
  return page.locator("tbody tr:first-child td:first-child").textContent();
}

async function jsHeapUsed(page, client) {
  await page.evaluate(() => {
    const maybeGc = globalThis.gc;
    if (typeof maybeGc === "function") maybeGc();
  });
  const metrics = await client.send("Performance.getMetrics");
  const metric = metrics.metrics.find((entry) => entry.name === "JSHeapUsedSize");
  return metric === undefined ? null : Math.round(metric.value);
}

async function waitForServer() {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // Keep polling until Vite finishes booting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Benchmark dev server did not start on ${baseUrl}. Output:\n${serverOutput}`);
}
