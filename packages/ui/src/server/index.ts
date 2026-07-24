/**
 * `@taipa/ui/server` — server rendering and island serialization (design 3.4).
 *
 * This entry point runs in plain Node (or any JS runtime) with no DOM and no
 * DOM shim. It renders one initial pass per call and disposes every
 * render-local resource afterwards.
 */
export { renderIsland, type HydrationPolicy, type IslandRenderOptions } from "./island";
export { renderToString, type RenderOptions } from "./render";
