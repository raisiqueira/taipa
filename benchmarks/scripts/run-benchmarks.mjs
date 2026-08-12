import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { writeFile } from "node:fs/promises";
import { cpus, totalmem } from "node:os";

const availableFrameworks = ["taipa", "ilha", "vanillajs", "lit-html", "react", "vue"];
const frameworks = readFrameworks();
const warmupCount = readIntegerEnvironment("TAIPA_BENCH_WARMUPS", 5, 0);
const sampleCount = readIntegerEnvironment("TAIPA_BENCH_SAMPLES", 10, 2, 30);
const randomSeed = readIntegerEnvironment("TAIPA_BENCH_SEED", 0x7461_6970, 0) >>> 0;
const actionTimeout = readIntegerEnvironment("TAIPA_BENCH_ACTION_TIMEOUT", 120_000, 1_000);
const cpuScenarios = [
  {
    name: "create rows",
    setup: clearRows,
    actionId: "run",
    validate: (page, framework) => validateRowCount(page, framework, 1_000),
  },
  {
    name: "create 10,000 rows",
    setup: clearRows,
    actionId: "runlots",
    validate: (page, framework) => validateRowCount(page, framework, 10_000),
  },
  {
    name: "replace all rows",
    setup: prepareRows,
    actionId: "run",
    validate: validateReplacement,
  },
  {
    name: "append 1,000 rows",
    setup: prepareRows,
    actionId: "add",
    validate: validateAppend,
  },
  {
    name: "partial update",
    setup: prepareRows,
    actionId: "update",
    validate: validatePartialUpdate,
  },
  {
    name: "swap rows",
    setup: prepareRows,
    actionId: "swaprows",
    validate: validateSwap,
  },
];
const operations = [
  ...cpuScenarios.map(({ name }) => ({ name, metric: "milliseconds", unit: "ms" })),
  { name: "run memory", metric: "bytes", unit: "bytes" },
  { name: "update memory", metric: "bytes", unit: "bytes" },
];
const port = Number(process.env.TAIPA_BENCH_PORT ?? 5190);
const baseUrl = `http://127.0.0.1:${port}`;
const reportFile = new URL("../BENCHMARK_RESULTS.md", import.meta.url);
const dataFile = new URL("../src/results.json", import.meta.url);

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
  const random = seededRandom(randomSeed);
  results.push(...(await measureCpuScenarios(browser, random)));

  for (const framework of shuffled(frameworks, random)) {
    process.stdout.write(`Measuring ${framework} memory...\n`);
    const warmupPage = await openFrameworkPage(browser, framework);
    try {
      await warmup(warmupPage, () => createRows(warmupPage));
      await warmup(warmupPage, async () => {
        await createRows(warmupPage);
        await updateRows(warmupPage);
      });
    } finally {
      await warmupPage.close();
    }

    results.push(
      await measureMemory(browser, framework, "run memory", async (page) => {
        await createRows(page);
        await validateRowCount(page, framework, 1_000);
      }),
      await measureMemory(browser, framework, "update memory", async (page) => {
        const context = await prepareRows(page);
        await updateRows(page);
        await validatePartialUpdate(page, framework, context);
      }),
    );
  }

  const timestamp = new Date().toISOString();
  const gitState = await currentGitState();
  const processors = cpus();
  const environment = {
    chromium: browser.version(),
    node: process.version,
    platform: process.platform,
    architecture: process.arch,
    processor: processors[0]?.model ?? "unknown",
    logicalCores: processors.length,
    hostMemoryBytes: totalmem(),
  };
  await browser.close();
  const report = formatReport(results, timestamp, gitState, environment);
  await writeFile(reportFile, report);
  const dataReport = buildDataReport(results, timestamp, gitState, environment);
  await writeFile(dataFile, `${JSON.stringify(dataReport, null, 2)}\n`);
  process.stdout.write(report);
  process.stdout.write(`\nSaved benchmark report to ${reportFile.pathname}\n`);
  process.stdout.write(`Saved dashboard data to ${dataFile.pathname}\n`);
} finally {
  server.kill("SIGTERM");
  await once(server, "exit").catch(() => undefined);
}

async function measureCpuScenarios(browser, random) {
  const samples = new Map(
    frameworks.map((framework) => [
      framework,
      new Map(cpuScenarios.map((scenario) => [scenario.name, []])),
    ]),
  );
  const frameworkOrder = shuffled(frameworks, random);
  const scenarioOrders = new Map(
    frameworks.map((framework) => [framework, shuffled(cpuScenarios, random)]),
  );

  for (let round = 0; round < warmupCount; round += 1) {
    process.stdout.write(`CPU warmup ${round + 1}/${warmupCount}...\n`);
    await executeCpuRound(browser, frameworkOrder, scenarioOrders, round);
  }

  for (let round = 0; round < sampleCount; round += 1) {
    process.stdout.write(`CPU sample ${round + 1}/${sampleCount}...\n`);
    await executeCpuRound(browser, frameworkOrder, scenarioOrders, round, samples);
  }

  return frameworks.flatMap((framework) =>
    cpuScenarios.map((scenario) => {
      const summary = summarizeSamples(samples.get(framework).get(scenario.name));
      return {
        framework,
        operation: scenario.name,
        milliseconds: Number(summary.mean.toFixed(3)),
        confidenceLow: Number(summary.low.toFixed(3)),
        confidenceHigh: Number(summary.high.toFixed(3)),
        samples: summary.count,
      };
    }),
  );
}

async function executeCpuRound(browser, frameworkOrder, scenarioOrders, round, samples) {
  for (const framework of rotated(frameworkOrder, round)) {
    for (const scenario of rotated(scenarioOrders.get(framework), round)) {
      const page = await openFrameworkPage(browser, framework);
      try {
        const elapsed = await executeScenario(page, framework, scenario);
        samples?.get(framework).get(scenario.name).push(elapsed);
      } finally {
        await page.close();
      }
    }
  }
}

async function measureMemory(browser, framework, operation, action) {
  const page = await openFrameworkPage(browser, framework);
  try {
    const client = await page.context().newCDPSession(page);
    await client.send("Performance.enable");
    await action(page);
    await clearValidationState(page);
    return { framework, operation, bytes: await jsHeapUsed(page, client) };
  } finally {
    await page.close();
  }
}

async function executeScenario(page, framework, scenario) {
  try {
    const context = await scenario.setup(page);
    const elapsed = await measureAction(page, scenario.actionId);
    await scenario.validate(page, framework, context);
    return elapsed;
  } catch (error) {
    throw new Error(`${framework}/${scenario.name} failed: ${error.message}`, { cause: error });
  }
}

function formatReport(results, timestamp, gitState, environment) {
  return [
    "# Benchmark Results",
    "",
    `- Timestamp: ${timestamp}`,
    `- Git hash: ${gitState.hash}${gitState.dirty ? " (dirty working tree)" : ""}`,
    `- Chromium: ${environment.chromium}`,
    `- Node: ${environment.node} on ${environment.platform}`,
    `- Processor: ${environment.processor} (${environment.logicalCores} logical cores, ${environment.architecture})`,
    `- Host memory: ${formatHostMemory(environment.hostMemoryBytes)}`,
    `- Warmups: ${warmupCount}`,
    `- CPU samples: ${sampleCount}`,
    `- Randomization seed: ${randomSeed}`,
    "",
    operations.map((operation) => formatOperationResults(operation, results)).join("\n\n"),
    "",
  ].join("\n");
}

// Emit the structured data consumed by the Vite dashboard (src/dashboard.ts).
function buildDataReport(results, timestamp, gitState, environment) {
  return {
    timestamp,
    gitHash: gitState.hash,
    gitDirty: gitState.dirty,
    environment: {
      ...environment,
      warmups: warmupCount,
      cpuSamples: sampleCount,
      randomizationSeed: randomSeed,
    },
    frameworks,
    operations: operations.map((operation) => ({
      name: operation.name,
      metric: operation.metric,
      unit: operation.unit,
      results: results
        .filter((result) => result.operation === operation.name)
        .toSorted(
          (left, right) =>
            metricValue(left, operation.metric) - metricValue(right, operation.metric),
        )
        .map((result) => ({
          framework: result.framework,
          value: metricValue(result, operation.metric),
          ...(operation.unit === "ms"
            ? {
                confidenceLow: result.confidenceLow,
                confidenceHigh: result.confidenceHigh,
                samples: result.samples,
              }
            : {}),
        })),
    })),
  };
}

function formatOperationResults(operation, results) {
  const sortedResults = results
    .filter((result) => result.operation === operation.name)
    .toSorted(
      (left, right) => metricValue(left, operation.metric) - metricValue(right, operation.metric),
    );
  const valueHeading = operation.unit === "ms" ? "time" : "memory";
  const bestValue = metricValue(sortedResults[0], operation.metric);
  const rows = sortedResults.map((result, index) => {
    const value = metricValue(result, operation.metric);
    if (operation.unit === "ms") {
      return `| ${index + 1} | ${result.framework} | ${formatValue(value, operation.unit)} | ${formatConfidence(result)} | ${result.samples} | ${formatRelative(value, bestValue)} |`;
    }
    return `| ${index + 1} | ${result.framework} | ${formatValue(value, operation.unit)} | ${formatRelative(value, bestValue)} |`;
  });
  if (operation.unit === "ms") {
    return [
      `## ${operation.name}`,
      "",
      `| rank | framework | ${valueHeading} | 95% CI | samples | vs best |`,
      "| ---: | --- | ---: | ---: | ---: | ---: |",
      ...rows,
    ].join("\n");
  }
  return [
    `## ${operation.name}`,
    "",
    `| rank | framework | ${valueHeading} | vs best |`,
    "| ---: | --- | ---: | ---: |",
    ...rows,
  ].join("\n");
}

function formatConfidence(result) {
  return `${result.confidenceLow.toFixed(1)}-${result.confidenceHigh.toFixed(1)} ms`;
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

function formatHostMemory(bytes) {
  return `${(bytes / 1024 ** 3).toFixed(1)} GiB`;
}

function formatRelative(value, bestValue) {
  if (!Number.isFinite(value) || !Number.isFinite(bestValue) || bestValue === 0) return "n/a";
  if (value === bestValue) return "best";
  return `+${(((value - bestValue) / bestValue) * 100).toFixed(1)}%`;
}

async function warmup(page, action) {
  for (let i = 0; i < warmupCount; i += 1) {
    await action();
  }
}

async function createRows(page) {
  await click(page, "run");
  await waitForRows(page, 1_000);
}

async function clearRows(page) {
  await click(page, "clear");
  await waitForRows(page, 0);
}

async function prepareRows(page) {
  await createRows(page);
  return { rows: await captureRows(page) };
}

async function updateRows(page) {
  await click(page, "update");
  await page.waitForFunction(
    () =>
      document
        .querySelector("tbody tr:nth-child(1) td:nth-child(2) a")
        ?.textContent?.includes("!!!") === true,
  );
}

async function validateRowCount(page, framework, expectedCount) {
  const result = await inspectRows(page);
  if (
    result.rows.length !== expectedCount ||
    new Set(result.rows.map(({ id }) => id)).size !== expectedCount ||
    !result.validCells ||
    !result.validStructure ||
    !rowsMatch(result.rows, result.expectedRows)
  ) {
    throw new Error(`${framework} produced invalid DOM for ${expectedCount} rows`);
  }
}

async function validateReplacement(page, framework, context) {
  const inspected = await inspectRows(page);
  const result = await page.evaluate(
    ({ snapshotsBefore, preservePositions }) => {
      const nodesBefore = globalThis.__taipaBenchmarkPreviousRows;
      const nodesBeforeSet = new Set(nodesBefore);
      const rows = [...document.querySelectorAll("tbody tr")];
      const expectedRows = globalThis.__taipaBenchmarkLatestRows;
      const snapshots = rows.map((row) => ({
        id: row.getAttribute("data-id"),
        cellId: row.firstElementChild?.textContent ?? null,
        label: row.querySelector("td:nth-child(2) a")?.textContent ?? null,
      }));
      globalThis.__taipaBenchmarkPreviousRows = undefined;
      return {
        rows: snapshots,
        identityMatches: preservePositions
          ? rows.every((row, index) => row === nodesBefore[index])
          : rows.every((row) => !nodesBeforeSet.has(row)),
        reusedOldId: snapshots.some(({ id }) => snapshotsBefore.some((before) => before.id === id)),
        dataMatches:
          Array.isArray(expectedRows) &&
          snapshots.length === expectedRows.length &&
          snapshots.every(
            ({ id, label }, index) =>
              id === String(expectedRows[index].id) && label === expectedRows[index].label,
          ),
      };
    },
    { snapshotsBefore: context.rows, preservePositions: framework === "ilha" },
  );
  if (
    result.rows.length !== 1_000 ||
    new Set(result.rows.map(({ id }) => id)).size !== 1_000 ||
    !inspected.validCells ||
    !inspected.validStructure ||
    result.reusedOldId ||
    !result.dataMatches ||
    !result.identityMatches
  ) {
    throw new Error(`${framework} did not replace row data with the expected DOM identity`);
  }
}

async function validateAppend(page, framework, context) {
  const preservesExistingRows = framework !== "taipa" && framework !== "vanillajs";
  const inspected = await inspectRows(page);
  const result = await page.evaluate(
    ({ snapshotsBefore, preserve }) => {
      const nodesBefore = globalThis.__taipaBenchmarkPreviousRows;
      const appendedRows = globalThis.__taipaBenchmarkLatestRows;
      const rows = [...document.querySelectorAll("tbody tr")];
      const snapshots = rows.map((row) => ({
        id: row.getAttribute("data-id"),
        cellId: row.firstElementChild?.textContent ?? null,
        label: row.querySelector("td:nth-child(2) a")?.textContent ?? null,
      }));
      const existingDataPreserved = snapshotsBefore.every(
        (before, index) =>
          snapshots[index]?.id === before.id && snapshots[index]?.label === before.label,
      );
      const nodesBeforeSet = new Set(nodesBefore);
      const expectedRows = Array.isArray(appendedRows)
        ? snapshotsBefore.concat(appendedRows.map(({ id, label }) => ({ id: String(id), label })))
        : [];
      const existingIdentityMatches = preserve
        ? nodesBefore.every((row, index) => rows[index] === row)
        : rows.every((row) => !nodesBeforeSet.has(row));
      globalThis.__taipaBenchmarkPreviousRows = undefined;
      return {
        count: rows.length,
        existingDataPreserved,
        dataMatches:
          snapshots.length === expectedRows.length &&
          snapshots.every(
            ({ id, label }, index) =>
              id === expectedRows[index].id && label === expectedRows[index].label,
          ),
        existingIdentityMatches,
        uniqueIds: new Set(snapshots.map(({ id }) => id)).size,
        validCells: snapshots.every(
          ({ id, cellId, label }) => id !== null && cellId === id && label !== null && label !== "",
        ),
      };
    },
    { snapshotsBefore: context.rows, preserve: preservesExistingRows },
  );
  if (
    result.count !== 2_000 ||
    result.uniqueIds !== 2_000 ||
    !result.existingDataPreserved ||
    !result.dataMatches ||
    !result.validCells ||
    !inspected.validStructure ||
    !result.existingIdentityMatches
  ) {
    throw new Error(`${framework} produced invalid append DOM or row identity`);
  }
}

async function validatePartialUpdate(page, framework, context) {
  const replacesRows = framework === "taipa" || framework === "vanillajs";
  const inspected = await inspectRows(page);
  const valid = await page.evaluate(
    ({ snapshotsBefore, replace }) => {
      const nodesBefore = globalThis.__taipaBenchmarkPreviousRows;
      const nodesBeforeSet = new Set(nodesBefore);
      const rows = [...document.querySelectorAll("tbody tr")];
      const matches =
        rows.length === snapshotsBefore.length &&
        rows.every((row, index) => {
          const before = snapshotsBefore[index];
          const id = row.getAttribute("data-id");
          const label = row.querySelector("td:nth-child(2) a")?.textContent;
          const expectedLabel = index % 10 === 0 ? `${before.label} !!!` : before.label;
          return (
            id === before.id &&
            row.firstElementChild?.textContent === id &&
            label === expectedLabel &&
            (replace ? !nodesBeforeSet.has(row) : row === nodesBefore[index])
          );
        });
      globalThis.__taipaBenchmarkPreviousRows = undefined;
      return matches;
    },
    { snapshotsBefore: context.rows, replace: replacesRows },
  );
  if (!valid || !inspected.validStructure) {
    throw new Error(`${framework} produced invalid partial-update DOM or row identity`);
  }
}

async function validateSwap(page, framework, context) {
  const strategy =
    framework === "taipa" || framework === "vanillajs"
      ? "replace"
      : framework === "ilha"
        ? "position"
        : "keyed";
  const inspected = await inspectRows(page);
  const valid = await page.evaluate(
    ({ snapshotsBefore, expectedStrategy }) => {
      const nodesBefore = globalThis.__taipaBenchmarkPreviousRows;
      const nodesBeforeSet = new Set(nodesBefore);
      const rows = [...document.querySelectorAll("tbody tr")];
      const expected = snapshotsBefore.slice();
      [expected[1], expected[998]] = [expected[998], expected[1]];
      const matches =
        rows.length === expected.length &&
        rows.every((row, index) => {
          const snapshot = expected[index];
          const dataMatches =
            row.getAttribute("data-id") === snapshot.id &&
            row.firstElementChild?.textContent === snapshot.id &&
            row.querySelector("td:nth-child(2) a")?.textContent === snapshot.label;
          if (!dataMatches) return false;
          if (expectedStrategy === "replace") return !nodesBeforeSet.has(row);
          if (expectedStrategy === "position") return row === nodesBefore[index];
          const sourceIndex = index === 1 ? 998 : index === 998 ? 1 : index;
          return row === nodesBefore[sourceIndex];
        });
      globalThis.__taipaBenchmarkPreviousRows = undefined;
      return matches;
    },
    { snapshotsBefore: context.rows, expectedStrategy: strategy },
  );
  if (!valid || !inspected.validStructure) {
    throw new Error(`${framework} produced invalid swap DOM or row identity`);
  }
}

async function inspectRows(page) {
  return page.evaluate(() => {
    const rows = [...document.querySelectorAll("tbody tr")].map((row) => ({
      id: row.getAttribute("data-id"),
      cellId: row.firstElementChild?.textContent ?? null,
      label: row.querySelector("td:nth-child(2) a")?.textContent ?? null,
    }));
    return {
      rows: rows.map(({ id, label }) => ({ id, label })),
      expectedRows: Array.isArray(globalThis.__taipaBenchmarkLatestRows)
        ? globalThis.__taipaBenchmarkLatestRows.map(({ id, label }) => ({
            id: String(id),
            label,
          }))
        : [],
      validCells: rows.every(
        ({ id, cellId, label }) => id !== null && cellId === id && label !== null && label !== "",
      ),
      validStructure: [...document.querySelectorAll("tbody tr")].every((row) => {
        const cells = [...row.children];
        const removeIcon = cells[2]?.querySelector("a > span");
        return (
          row.className === "" &&
          cells.length === 4 &&
          cells.every((cell) => cell instanceof HTMLTableCellElement) &&
          cells[0].className === "col-md-1" &&
          cells[1].className === "col-md-4" &&
          cells[1].children.length === 1 &&
          cells[1].firstElementChild instanceof HTMLAnchorElement &&
          cells[2].className === "col-md-1" &&
          cells[2].children.length === 1 &&
          cells[2].firstElementChild instanceof HTMLAnchorElement &&
          removeIcon?.classList.contains("glyphicon") === true &&
          removeIcon.classList.contains("glyphicon-remove") &&
          removeIcon.getAttribute("aria-hidden") === "true" &&
          cells[3].className === "col-md-6" &&
          cells[3].children.length === 0 &&
          cells[3].textContent === ""
        );
      }),
    };
  });
}

function rowsMatch(actual, expected) {
  return (
    actual.length === expected.length &&
    actual.every(
      ({ id, label }, index) => id === expected[index].id && label === expected[index].label,
    )
  );
}

async function captureRows(page) {
  return page.evaluate(() => {
    const rows = [...document.querySelectorAll("tbody tr")];
    const expectedRows = globalThis.__taipaBenchmarkLatestRows;
    if (
      !Array.isArray(expectedRows) ||
      rows.length !== expectedRows.length ||
      !rows.every(
        (row, index) =>
          row.getAttribute("data-id") === String(expectedRows[index].id) &&
          row.querySelector("td:nth-child(2) a")?.textContent === expectedRows[index].label,
      )
    ) {
      throw new Error("benchmark setup DOM does not match the generated row model");
    }
    globalThis.__taipaBenchmarkPreviousRows = rows;
    return expectedRows.map(({ id, label }) => ({ id: String(id), label }));
  });
}

async function clearValidationState(page) {
  await page.evaluate(() => {
    globalThis.__taipaBenchmarkLatestRows = undefined;
    globalThis.__taipaBenchmarkPreviousRows = undefined;
  });
}

async function measureAction(page, id) {
  let timeout;
  try {
    return await Promise.race([
      page.evaluate(async (actionId) => {
        const button = document.querySelector(`#${actionId}`);
        if (!(button instanceof HTMLButtonElement)) {
          throw new Error(`benchmark action is missing: #${actionId}`);
        }
        const started = performance.now();
        button.click();
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return performance.now() - started;
      }, id),
      new Promise((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`benchmark action timed out after ${actionTimeout} ms: #${id}`)),
          actionTimeout,
        );
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

async function openFrameworkPage(browser, framework) {
  process.stdout.write(`Preparing ${framework}...\n`);
  const page = await browser.newPage();
  page.setDefaultTimeout(actionTimeout);
  await page.goto(`${baseUrl}/harness.html?framework=${framework}`, { waitUntil: "networkidle" });
  await waitForRows(page, 0);
  return page;
}

function summarizeSamples(values) {
  const count = values.length;
  const mean = values.reduce((total, value) => total + value, 0) / count;
  const variance = values.reduce((total, value) => total + (value - mean) ** 2, 0) / (count - 1);
  const margin = studentTCritical(count - 1) * Math.sqrt(variance / count);
  return { count, mean, low: mean - margin, high: mean + margin };
}

function studentTCritical(degreesOfFreedom) {
  const values = [
    12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16,
    2.145, 2.131, 2.12, 2.11, 2.101, 2.093, 2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052,
    2.048, 2.045,
  ];
  const critical = values[degreesOfFreedom - 1];
  if (critical === undefined) {
    throw new RangeError(`unsupported Student-t degrees of freedom: ${degreesOfFreedom}`);
  }
  return critical;
}

function seededRandom(seed) {
  let state = seed;
  return () => {
    state += 0x6d2b_79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function shuffled(values, random) {
  const result = values.slice();
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function rotated(values, offset) {
  const normalizedOffset = offset % values.length;
  return values.slice(normalizedOffset).concat(values.slice(0, normalizedOffset));
}

function readIntegerEnvironment(name, fallback, minimum, maximum = Number.POSITIVE_INFINITY) {
  const configured = process.env[name];
  if (configured === undefined) return fallback;
  const value = Number(configured);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    const range = Number.isFinite(maximum)
      ? `between ${minimum} and ${maximum}`
      : `greater than or equal to ${minimum}`;
    throw new TypeError(`${name} must be an integer ${range}`);
  }
  return value;
}

function readFrameworks() {
  const configured = process.env.TAIPA_BENCH_FRAMEWORKS;
  if (configured === undefined) return availableFrameworks;
  const selected = configured
    .split(",")
    .map((framework) => framework.trim())
    .filter(Boolean);
  const invalid = selected.filter((framework) => !availableFrameworks.includes(framework));
  if (selected.length === 0 || invalid.length !== 0) {
    throw new TypeError(
      `TAIPA_BENCH_FRAMEWORKS must select from ${availableFrameworks.join(", ")}; invalid: ${invalid.join(", ") || "empty selection"}`,
    );
  }
  return [...new Set(selected)];
}

async function currentGitState() {
  const [hash, status] = await Promise.all([
    gitOutput(["rev-parse", "HEAD"]),
    gitOutput(["status", "--porcelain"]),
  ]);
  return { hash: hash.trim() || "unknown", dirty: status.trim().length !== 0 };
}

async function gitOutput(arguments_) {
  const git = spawn("git", arguments_, {
    cwd: new URL("../..", import.meta.url),
    stdio: ["ignore", "pipe", "ignore"],
  });
  let stdout = "";
  git.stdout.on("data", (chunk) => {
    stdout += String(chunk);
  });
  const [code] = await once(git, "exit");
  return code === 0 ? stdout : "";
}

async function click(page, id) {
  await page.locator(`#${id}`).click({ timeout: actionTimeout });
}

async function waitForRows(page, count) {
  await page.waitForFunction(
    (expected) => document.querySelectorAll("tbody tr").length === expected,
    count,
  );
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
