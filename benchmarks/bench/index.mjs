/**
 * CodSpeed benchmark entry point for the Taipa benchmarks package.
 *
 * The suites below run against the packed ESM artifacts in `dist/`, so the
 * numbers describe what consumers actually import. Run `vp run build` (or
 * `pnpm --filter @taipa/ui build`) before benchmarking.
 *
 * Local run:      pnpm --filter @taipa/benchmarks bench:ui
 * Instrumented:   codspeed run --mode simulation -- pnpm --filter @taipa/benchmarks bench:ui
 */
import { withCodSpeed } from "@codspeed/tinybench-plugin";
import { Bench } from "tinybench";
import { register as registerReactivity } from "./reactivity.bench.mjs";
import { register as registerServer } from "./server.bench.mjs";
import { register as registerTemplate } from "./template.bench.mjs";

// CodSpeed drives iteration counts itself; the options below only shape the
// uninstrumented local run so it stays quick.
const bench = withCodSpeed(new Bench({ iterations: 10, time: 250, warmupTime: 100 }));

registerTemplate(bench);
registerServer(bench);
registerReactivity(bench);

await bench.run();

// Under CodSpeed the plugin reports every task itself and tinybench collects no
// samples, so only the uninstrumented local run prints a summary. `console` is
// reserved for warnings and errors in this workspace, hence stdout directly.
if (process.env.CODSPEED_ENV === undefined) {
  const summary = bench.tasks
    .map((task) => {
      const result = task.result;
      if (result === undefined || result.error !== undefined) {
        return `${task.name.padEnd(56)} no result`;
      }
      const opsPerSecond = result.throughput.mean.toFixed(0).padStart(12);
      const meanMs = result.latency.mean.toFixed(4).padStart(10);
      return `${task.name.padEnd(56)} ${opsPerSecond} ops/s ${meanMs} ms`;
    })
    .join("\n");

  process.stdout.write(`${summary}\n`);
}
