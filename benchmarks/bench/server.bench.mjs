/**
 * Taipa UI server rendering: `renderToString` and `renderIsland`.
 *
 * These are the entry points a JavaScript server calls per request, so they
 * carry the whole cost of prop validation, per-render signal instantiation,
 * view execution inside an effect scope, disposal, and — for islands — inert
 * JSON serialization of props and state overrides.
 */
import { renderIsland, renderToString } from "@taipa/ui/server";
import { Counter, Dashboard, largeProps, rows, Table } from "./fixtures.mjs";

export function register(bench) {
  bench
    .add("renderToString: single-state component", async () => {
      return await renderToString(Counter, { initial: 3 });
    })
    .add("renderToString: many states and deriveds", async () => {
      return await renderToString(Dashboard, { title: "Overview", query: "status:open" });
    })
    .add(`renderToString: table of ${rows.length} rows`, async () => {
      return await renderToString(Table, { rows });
    })
    .add("renderIsland: static island, no hydration metadata", async () => {
      return await renderIsland(Counter, { initial: 3 });
    })
    .add("renderIsland: hydrate on load with state overrides", async () => {
      return await renderIsland(
        Counter,
        { initial: 3 },
        { hydrate: "load", state: { count: 9, step: 2 } },
      );
    })
    .add("renderIsland: hydrate when visible, lazy module", async () => {
      return await renderIsland(
        Dashboard,
        { title: "Overview", query: "status:open" },
        {
          hydrate: "visible",
          visibleRootMargin: "200px",
          module: "/assets/dashboard.mjs",
          exportName: "Dashboard",
        },
      );
    })
    .add("renderIsland: serialize a large props payload", async () => {
      return await renderIsland(Dashboard, largeProps, { hydrate: "idle", idleTimeout: 500 });
    })
    .add(`renderIsland: table of ${rows.length} rows, hydrate on load`, async () => {
      return await renderIsland(Table, { rows }, { hydrate: "load" });
    });
}
