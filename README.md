# Taipa UI

[![CodSpeed](https://img.shields.io/endpoint?url=https://codspeed.io/badge.json)](https://app.codspeed.io/raisiqueira/taipa?utm_source=badge)

> Note: Taipa UI is alpha software. The public API is being validated through packed-artifact, browser, and server-rendering checks before the first npm prerelease.

Taipa UI is a small ESM-first islands framework for server-authored HTML. It renders safe HTML on JavaScript servers, hydrates existing DOM without a Virtual DOM or reconciliation pass, and progressively enhances native forms.

## Install

```sh
pnpm add @taipa/ui alien-signals
```

`alien-signals` is a runtime dependency of `@taipa/ui`; installing it explicitly is useful when you use import maps or no-build browser imports.

## Basic Usage

Define one component and use it from both server rendering and browser hydration:

```ts
import { component, html } from "@taipa/ui";
import { renderIsland } from "@taipa/ui/server";

const Counter = component("Counter")
  .state("count", 0)
  .bind("count", ({ element, state }) => {
    element.textContent = String(state.count());
  })
  .on("increment@click", ({ state }) => {
    state.count(state.count() + 1);
  })
  .render(
    ({ state }) => html`
      <button data-taipa-ref="increment">+</button>
      <output data-taipa-ref="count">${state.count()}</output>
    `,
  );

const markup = await renderIsland(Counter, {}, { hydrate: "load" });
```

Render a static sequence as safe initial markup. `repeat()` does not reconcile items after hydration;
use direct DOM code when a list must change later.

```ts
import { html, repeat } from "@taipa/ui";

const rows = repeat(products, (product) => html`<li>${product.name}</li>`);
const markup = html`<ul>
  ${rows}
</ul>`;
```

Ref names declared through `.bind()` and ref-targeted `.on()` calls are retained
in client callbacks. `refs.one("count")` is accepted here; an undeclared name
fails type checking. Use an element generic when the element contract is known:

```ts
.bind<"count", HTMLOutputElement>("count", ({ element }) => {
  element.value = "42";
})
```

Hydrate that server-authored markup in the browser:

```ts
import { bootstrap } from "@taipa/ui/client";
import { Counter } from "./counter";

bootstrap({
  registry: {
    Counter: { load: async () => ({ Counter }), exportName: "Counter" },
  },
});
```

Enhance a native form without replacing controls:

```ts
import { createForm, standardSchema } from "@taipa/ui/forms";

createForm(document.querySelector("form")!, {
  read: ({ formData }) => ({
    email: String(formData.get("email") ?? ""),
  }),
  validate: standardSchema(emailSchema),
});
```

## Workspace Commands

- `pnpm ready` runs the main check, test, and build lanes.
- `pnpm verify:consumer` packs `@taipa/ui` and imports all public subpaths in a clean Node consumer.
- `pnpm verify:package` checks the packed artifact shape and release-facing metadata.
- `pnpm verify:release` checks release preconditions used by the npm publishing workflow.
- `pnpm docs:check` validates the Astro documentation site.
- `pnpm --filter @taipa/playground dev` starts the local playground.
- `pnpm benchmark` runs the local benchmark subset and records its environment.
- `pnpm --filter @taipa/benchmarks bench:ui` runs the CodSpeed benchmarks for the packed
  `@taipa/ui` artifacts (build first). CI runs the same suite under CodSpeed's
  CPU simulation instrument on every push and pull request.
- `pnpm --filter @taipa/benchmarks bench:repeat` compares the production bundles
  of Taipa's `repeat()` helper and Lit's `repeat` directive in Chromium.

## Public Subpaths

- `@taipa/ui` — component builder, safe templates, safe URLs, and reactivity exports.
- `@taipa/ui/client` — explicit hydration, mounting, unmounting, and bootstrap APIs.
- `@taipa/ui/server` — DOM-free server rendering and island serialization.
- `@taipa/ui/forms` — progressive forms and Standard Schema-compatible validation helpers.
