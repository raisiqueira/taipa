# Examples

Runnable kitchensink from a browser-only counter to every hydration policy.

| Example                    | What it shows                                                                                           | Start                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| [`no-build/`](./no-build/) | Simplest path: `mount()` a counter through an import map, no bundler                                    | open `index.html`                             |
| [`node-ssr/`](./node-ssr/) | Server-authored HTML with Hono: static islands, `load` / `idle` / `visible` / `only`, and a native form | `pnpm --filter @taipa/example-node-ssr start` |

## Node SSR routes

| Path           | Policy   | Point                                                                                                                   |
| -------------- | -------- | ----------------------------------------------------------------------------------------------------------------------- |
| `/`            | `false`  | Server HTML only. No `data-taipa-hydrate`, so bootstrap never attaches.                                                 |
| `/interactive` | `load`   | The README counter: server count `3`, listeners attach as soon as the module resolves.                                  |
| `/policies`    | all five | Static, load, idle (200ms timeout), visible (below the fold, 80px margin), and client-only with fallback.               |
| `/form`        | `load`   | Native `<form>` with labels, constraints, and POST. JavaScript adds field errors; `formnovalidate` still posts a draft. |

Open `/policies` and scroll: the visible island stays inert until it approaches the viewport. The `only` island keeps its fallback until the client render preflights.
