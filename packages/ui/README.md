# @taipa/ui

> Note: `@taipa/ui` is in alpha. Use it to validate server-authored islands and progressive forms, but expect the contract to tighten before a stable release.

Taipa UI provides direct-DOM islands for server-rendered applications. Server HTML remains authoritative; the client runtime only attaches behavior to declared refs and updates retained nodes through `alien-signals`.

## Install

```sh
pnpm add @taipa/ui alien-signals
```

For npm:

```sh
npm install @taipa/ui alien-signals
```

## Practical Usage

Create a component once:

```ts
import { component, html } from "@taipa/ui";

export const Counter = component("Counter", { contractVersion: "1" })
  .state("count", 0)
  .bind("count", ({ element, state }) => {
    element.textContent = String(state.count());
  })
  .on("increment@click", ({ state }) => {
    state.count(state.count() + 1);
  })
  .render(
    ({ state }) => html`
      <button data-taipa-ref="increment">Increment</button>
      <output data-taipa-ref="count">${state.count()}</output>
    `,
  );
```

Render an island on a JavaScript server:

```ts
import { renderIsland } from "@taipa/ui/server";
import { Counter } from "./counter";

const html = await renderIsland(Counter, {}, { hydrate: "load" });
```

Activate the island in the browser:

```ts
import { bootstrap } from "@taipa/ui/client";
import { Counter } from "./counter";

bootstrap({
  registry: {
    Counter: { load: async () => ({ Counter }), exportName: "Counter" },
  },
});
```

Enhance a native form with a Standard Schema-compatible validator:

```ts
import { createForm, standardSchema } from "@taipa/ui/forms";

createForm(document.querySelector("form")!, {
  read: ({ formData }) => ({ email: String(formData.get("email") ?? "") }),
  validate: standardSchema(emailSchema),
});
```

## Entrypoints

- `@taipa/ui` is safe for universal code.
- `@taipa/ui/server` renders strings and does not access DOM globals at import time.
- `@taipa/ui/client` is side-effect free until `hydrate`, `mount`, `unmount`, or `bootstrap` is called.
- `@taipa/ui/forms` keeps native form controls as the source of truth.
