# Taipa UI

[![CodSpeed](https://img.shields.io/endpoint?url=https://codspeed.io/badge.json)](https://app.codspeed.io/raisiqueira/taipa?utm_source=badge)

**Direct-DOM islands for server-authored HTML.**

Taipa renders safe HTML on JavaScript servers, hydrates the exact DOM the server produced, and
progressively enhances native forms. There is no Virtual DOM and no client-side reconciliation
pass: a component renders once, then signals update declared DOM refs directly.

> [!WARNING]
> Taipa UI is alpha software. The public API is being validated through packed-artifact, browser,
> server-rendering, and performance checks before the first npm prerelease.

## Why Taipa?

- **Server HTML stays authoritative.** Hydration attaches behavior without replacing or re-parenting
  the existing nodes.
- **Updates are direct.** Signals drive small DOM bindings instead of rerendering a component tree.
- **Templates are safe by default.** Dynamic text and attributes are escaped, while trusted HTML
  and URLs require explicit branded values.
- **Forms remain native.** Browser constraints, normal POST fallbacks, labels, controls, and server
  validation continue to work without JavaScript.
- **Each runtime is explicit.** Universal, client, server, and forms APIs live in separate entrypoints.

## How it works

1. Define a component with state, events, bindings, and one safe initial view.
2. Render it once—either into an empty browser host with `mount()` or on the server.
3. On the client, Taipa retains declared `data-taipa-ref` nodes and updates them through signals.
4. Tear down with `unmount()` or the returned component instance when the host leaves the page.

| What you want to do                              | Start with                                 |
| ------------------------------------------------ | ------------------------------------------ |
| Render a component into an empty browser element | `mount()` from `@taipa/ui/client`          |
| Hydrate server-authored islands                  | `renderIsland()` + `bootstrap()`           |
| Produce server-only HTML                         | `renderToString()` from `@taipa/ui/server` |
| Enhance an existing native form                  | `createForm()` from `@taipa/ui/forms`      |

## Install

```sh
pnpm add @taipa/ui alien-signals
```

```sh
npm install @taipa/ui alien-signals
```

`alien-signals` is a runtime dependency of `@taipa/ui`; installing it explicitly is useful for
import maps and no-build browser setups.

## Client-side

### Simple: mount a counter

Start with an empty host:

```html
<div id="counter"></div>
```

Keep the component definition DOM-free in `counter.ts` so both the browser and server can import it:

```ts
import { component, html } from "@taipa/ui";

export const Counter = component<{ initial: number }>("Counter")
  .state("count", ({ props }) => props.initial)
  .bind("count", ({ element, state }) => {
    element.textContent = String(state.count());
  })
  .on("decrement@click", ({ state }) => {
    state.count(state.count() - 1);
  })
  .on("increment@click", ({ state }) => {
    state.count(state.count() + 1);
  })
  .render(
    ({ state }) => html`
      <button type="button" data-taipa-ref="decrement">−</button>
      <output data-taipa-ref="count" aria-live="polite">${state.count()}</output>
      <button type="button" data-taipa-ref="increment">+</button>
    `,
  );
```

Mount it from a browser-only entry such as `counter.client.ts`:

```ts
import { mount } from "@taipa/ui/client";
import { Counter } from "./counter";

const host = document.querySelector<HTMLElement>("#counter");

if (host !== null) {
  await mount(host, Counter, { props: { initial: 0 } });
}
```

`mount()` renders the view once, installs the markup, and activates its refs. Later state writes run
the `count` binding directly—the view is not called again.

### Advanced: hydrate lazy server islands

For server-authored pages, let `bootstrap()` discover islands and lazily load the universal
component module only when it needs behavior:

```ts
import { bootstrap } from "@taipa/ui/client";

bootstrap({
  registry: {
    Counter: {
      load: () => import("./counter.js"),
      exportName: "Counter",
    },
  },
  observe: true,
  onError(error, host) {
    host.setAttribute("data-taipa-failed", "");
    reportError(error);
  },
});
```

The JavaScript registry is the approved module source for each component. `observe: true` also
hydrates islands added later by navigation or streamed fragments. Hydration validates props and
required refs before attaching listeners, bindings, effects, and lifecycle hooks. `bootstrap()`
returns a handle that can rescan a root or destroy the runtime when an application shell is removed.

## Server-side

### Basic: render safe HTML

The server entrypoint does not access DOM globals, so it can render a component in Node.js or any
compatible JavaScript server:

```ts
import { component, html } from "@taipa/ui";
import { renderToString } from "@taipa/ui/server";

const Greeting = component<{ name: string }>("Greeting").render(
  ({ props }) => html`<p>Hello, ${props.name}!</p>`,
);

const markup = await renderToString(Greeting, { name: "Ada" });
// <p>Hello, Ada!</p>
```

Dynamic values are escaped by `html`, and the returned string can be inserted into the server
response.

To make a component interactive, render an island with a hydration policy and approve its module
in the client registry shown above:

```ts
import { renderIsland } from "@taipa/ui/server";
import { Counter } from "./counter";

const island = await renderIsland(
  Counter,
  { initial: 3 },
  { hydrate: "visible", visibleRootMargin: "200px" },
);
```

Taipa serializes JSON-compatible props as inert data. When the island becomes visible,
`bootstrap()` loads `Counter` and attaches behavior to the server-created nodes.

### Safe repeated markup

Use `repeat()` for synchronous, server-safe list composition. Each callback must return `SafeHtml`:

```ts
import { html, repeat } from "@taipa/ui";

const rows = repeat(products, (product) => html`<li>${product.name}</li>`);
const markup = html`<ul>
  ${rows}
</ul>`;
```

`repeat()` creates initial markup; it does not reconcile list items after hydration. Use direct DOM
code when a hydrated list must change later.

## Forms

Taipa enhances the native `<form>` instead of replacing it. Keep a real action, method, labels,
constraints, and server-side validation so the form remains useful before JavaScript loads.

```html
<form id="signup" action="/signup" method="post">
  <label for="email">Email</label>
  <input id="email" name="email" type="email" required aria-describedby="email-error" />
  <p id="email-error" data-taipa-error-for="email"></p>

  <p data-taipa-error-for="$form" role="status"></p>
  <button type="submit" data-taipa-disable-while-submitting>Create account</button>
</form>
```

```ts
import { createForm } from "@taipa/ui/forms";

const form = document.querySelector<HTMLFormElement>("#signup");

if (form !== null) {
  createForm(form, {
    read: ({ formData }) => ({
      email: String(formData.get("email") ?? ""),
    }),
    validate: ({ values }) =>
      values.email.includes("@") ? undefined : { email: ["Enter a valid email address."] },
    mode: "blur",
    async submit({ form, formData, signal, setErrors }) {
      try {
        const response = await fetch(form.action, {
          method: form.method,
          body: formData,
          signal,
        });

        if (!response.ok) {
          setErrors({ $form: ["We could not create your account. Please try again."] });
        }
      } catch {
        if (!signal.aborted) {
          setErrors({ $form: ["The network request failed. Please try again."] });
        }
      }
    },
  });
}
```

`createForm()` exposes reactive values, errors, dirty/touched state, validation state, submission
state, and imperative helpers. If your validator implements Standard Schema V1, adapt it with
`standardSchema(schema)` from the same entrypoint.

## Public entrypoints

| Entrypoint         | Purpose                                                                          |
| ------------------ | -------------------------------------------------------------------------------- |
| `@taipa/ui`        | Component builder, safe templates, safe URLs, `repeat()`, and reactivity exports |
| `@taipa/ui/client` | Explicit mounting, hydration, unmounting, and island bootstrapping               |
| `@taipa/ui/server` | DOM-free string rendering and island serialization                               |
| `@taipa/ui/forms`  | Progressive forms and Standard Schema-compatible validation                      |

All entrypoints are ESM and side-effect free until you call an explicit runtime API.

## Workspace commands

- `pnpm ready` runs the main check, test, and build lanes.
- `pnpm verify:consumer` packs `@taipa/ui` and imports all public subpaths in a clean Node consumer.
- `pnpm verify:package` checks the packed artifact shape and release-facing metadata.
- `pnpm verify:release` checks release preconditions used by the npm publishing workflow.
- `pnpm docs:check` validates the Astro documentation site.
- `pnpm --filter @taipa/playground dev` starts the local playground.
- `pnpm benchmark` runs the local benchmark subset and records its environment.
- `pnpm --filter @taipa/benchmarks bench:ui` runs the CodSpeed suite for packed `@taipa/ui`
  artifacts. CI runs the same suite under CodSpeed's CPU simulation instrument.
- `pnpm --filter @taipa/benchmarks bench:repeat` compares the production bundles of Taipa's
  `repeat()` helper and Lit's `repeat` directive in Chromium.
