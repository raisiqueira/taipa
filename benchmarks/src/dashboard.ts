import "./dashboard.css";
import report from "./results.json";

interface OperationResult {
  readonly framework: string;
  readonly value: number;
  readonly confidenceLow?: number;
  readonly confidenceHigh?: number;
  readonly samples?: number;
}

interface Operation {
  readonly name: string;
  readonly metric: "milliseconds" | "bytes";
  readonly unit: "ms" | "bytes";
  readonly results: readonly OperationResult[];
}

interface BenchmarkReport {
  readonly timestamp: string;
  readonly gitHash: string;
  readonly gitDirty: boolean;
  readonly frameworks: readonly string[];
  readonly operations: readonly Operation[];
}

const data = report as BenchmarkReport;

// Taipa is the framework this repository ships, so it is the reference we highlight.
const HIGHLIGHT = "taipa";

const DISPLAY_NAMES: Record<string, string> = {
  taipa: "Taipa",
  ilha: "Ilha",
  vanillajs: "VanillaJS",
  "lit-html": "lit-html",
  react: "React",
  vue: "Vue",
};

function displayName(framework: string): string {
  return DISPLAY_NAMES[framework] ?? framework;
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ??
      character,
  );
}

function bestValue(operation: Operation): number {
  return Math.min(...operation.results.map((result) => result.value));
}

function maxValue(operation: Operation): number {
  return Math.max(...operation.results.map((result) => result.value));
}

function sortedResults(operation: Operation): OperationResult[] {
  return operation.results.slice().sort((left, right) => left.value - right.value);
}

function formatValue(value: number, unit: Operation["unit"]): string {
  if (unit === "ms") return `${value.toFixed(1)} ms`;
  return `${(value / 1024 / 1024).toFixed(2)} MB`;
}

function formatResultValue(result: OperationResult, unit: Operation["unit"]): string {
  const value = formatValue(result.value, unit);
  if (unit !== "ms" || result.confidenceLow === undefined || result.confidenceHigh === undefined) {
    return value;
  }
  return `${value} (${result.confidenceLow.toFixed(1)}-${result.confidenceHigh.toFixed(1)})`;
}

function relativePercent(value: number, best: number): number {
  if (best === 0) return 0;
  return ((value - best) / best) * 100;
}

function relativeLabel(value: number, best: number): string {
  if (value === best) return "best";
  return `+${relativePercent(value, best).toFixed(1)}%`;
}

// Solid tints only (no gradients) — a light traffic-light read on how far off the best each row is.
function relativeBadgeClasses(value: number, best: number): string {
  if (value === best) return "bg-emerald-100 text-emerald-800";
  const delta = relativePercent(value, best);
  if (delta <= 25) return "bg-slate-100 text-slate-700";
  if (delta <= 100) return "bg-amber-100 text-amber-800";
  return "bg-rose-100 text-rose-800";
}

function operationSection(operation: Operation): string {
  const best = bestValue(operation);
  const max = maxValue(operation);
  const unitLabel = operation.unit === "ms" ? "milliseconds" : "megabytes";

  const rows = sortedResults(operation)
    .map((result, index) => {
      const highlighted = result.framework === HIGHLIGHT;
      const width = Math.max(2, (result.value / max) * 100);
      const barClass = highlighted ? "bg-indigo-500" : "bg-slate-300";
      const labelClass = highlighted ? "font-semibold text-indigo-700" : "text-slate-700";
      const badgeClass = relativeBadgeClasses(result.value, best);
      return `
        <li class="grid grid-cols-[7.5rem_1fr_auto] items-center gap-4 py-2">
          <span class="flex items-center gap-1.5 text-sm ${labelClass}">
            <span class="w-4 text-right text-xs tabular-nums text-slate-400">${index + 1}</span>
            ${escapeHtml(displayName(result.framework))}
          </span>
          <span class="h-2.5 rounded-full bg-slate-100">
            <span class="block h-2.5 rounded-full ${barClass}" style="width: ${width.toFixed(2)}%"></span>
          </span>
          <span class="flex items-center justify-end gap-2 whitespace-nowrap">
            <span class="font-mono text-sm tabular-nums text-slate-800">${formatResultValue(result, operation.unit)}</span>
            <span class="rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${badgeClass}">${relativeLabel(result.value, best)}</span>
          </span>
        </li>`;
    })
    .join("");

  return `
    <section class="rounded-lg border border-slate-200 p-5">
      <div class="flex items-baseline justify-between">
        <h3 class="text-base font-semibold text-slate-900">${escapeHtml(operation.name)}</h3>
        <span class="text-xs uppercase tracking-wide text-slate-400">${unitLabel} &middot; lower is better</span>
      </div>
      <ul class="mt-4">${rows}</ul>
    </section>`;
}

function header(): string {
  const timestamp = new Date(data.timestamp);
  const formattedTimestamp = Number.isNaN(timestamp.getTime())
    ? data.timestamp
    : timestamp
        .toISOString()
        .replace("T", " ")
        .replace(/\.\d+Z$/, " UTC");
  const shortHash = data.gitHash.slice(0, 10);

  return `
    <header class="border-b border-slate-200 pb-8">
      <h1 class="text-3xl font-semibold tracking-tight text-slate-900">Taipa UI Benchmarks</h1>
      <p class="mt-3 max-w-2xl text-slate-600">
        A local <a class="text-indigo-600 underline-offset-2 hover:underline" href="https://github.com/krausest/js-framework-benchmark" target="_blank" rel="noreferrer">js-framework-benchmark</a>-style
        comparison of Taipa UI against a handful of libraries, measured in this repository. Treat these as
        development signals, not official results.
      </p>
      <dl class="mt-6 flex flex-wrap gap-x-10 gap-y-3 text-sm">
        <div>
          <dt class="text-xs uppercase tracking-wide text-slate-400">Run</dt>
          <dd class="mt-0.5 font-mono text-slate-700">${escapeHtml(formattedTimestamp)}</dd>
        </div>
        <div>
          <dt class="text-xs uppercase tracking-wide text-slate-400">Source</dt>
          <dd class="mt-0.5 font-mono text-slate-700">${escapeHtml(shortHash)}${data.gitDirty ? " (dirty)" : ""}</dd>
        </div>
        <div>
          <dt class="text-xs uppercase tracking-wide text-slate-400">Frameworks</dt>
          <dd class="mt-0.5 font-mono text-slate-700">${data.frameworks.length}</dd>
        </div>
      </dl>
    </header>`;
}

function legend(): string {
  return `
    <div class="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-500">
      <span class="flex items-center gap-2">
        <span class="inline-block h-2.5 w-4 rounded-full bg-indigo-500"></span>Taipa (this repo)
      </span>
      <span class="flex items-center gap-2">
        <span class="inline-block h-2.5 w-4 rounded-full bg-slate-300"></span>Other frameworks
      </span>
      <span class="flex items-center gap-2">
        <span class="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800">best</span>
        <span class="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">+ up to 100%</span>
        <span class="rounded-full bg-rose-100 px-2 py-0.5 text-rose-800">+ over 100%</span>
      </span>
    </div>`;
}

function render(): string {
  return `
    <main class="mx-auto max-w-4xl px-6 py-12">
      ${header()}
      <section class="mt-10">
        <h2 class="text-lg font-semibold text-slate-900">Per-operation results</h2>
        <p class="mt-1 text-sm text-slate-500">
          Adapters retain their native row-identity strategies, so these point estimates are not combined into an overall score.
        </p>
        ${legend()}
        <div class="mt-5 grid gap-5">
          ${data.operations.map(operationSection).join("")}
        </div>
      </section>
      <footer class="mt-12 border-t border-slate-200 pt-6 text-sm text-slate-400">
        Regenerate with <code class="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-slate-600">pnpm --filter @taipa/benchmarks bench</code>.
      </footer>
    </main>`;
}

const root = document.querySelector<HTMLElement>("#app");
if (root === null) {
  throw new Error("Dashboard root #app is missing");
}
root.className = "min-h-screen bg-white text-slate-900";
root.innerHTML = render();
