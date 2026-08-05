# @taipa/ui

**Direct-DOM islands and progressive forms for server-rendered applications.**

Taipa renders safe HTML once, then attaches events and signal-driven bindings to declared DOM
refs. Server HTML remains authoritative: hydration does not rerender, replace, or re-parent it.

> [!WARNING]
> `@taipa/ui` is in alpha. Use it to validate server-authored islands and progressive forms, but
> expect the contract to tighten before a stable release.

## Install

```sh
pnpm add @taipa/ui alien-signals
```

```sh
npm install @taipa/ui alien-signals
```

## Pick your starting point

| Goal                                 | API                                        |
| ------------------------------------ | ------------------------------------------ |
| Render into an empty browser element | `mount()` from `@taipa/ui/client`          |
| Activate server-authored islands     | `renderIsland()` + `bootstrap()`           |
| Produce server-only HTML             | `renderToString()` from `@taipa/ui/server` |
| Enhance an existing native form      | `createForm()` from `@taipa/ui/forms`      |

## Client-side

### Simple: mount a component

Add an empty host to the page:

```html
<div id="counter"></div>
```

Keep the component definition DOM-free in `counter.ts` so both browser and server code can import it:

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

The view runs once. After mounting, writes to `state.count` update the retained `<output>` through
its binding without rendering the view again. A non-empty host requires `{ replace: true }`.

### Advanced: hydrate lazy islands

Use `bootstrap()` when the server already produced `<taipa-island>` hosts. The registry explicitly
approves which module can activate each component:

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

`bootstrap()` respects the island's `load`, `idle`, `visible`, or `only` policy. Before activation,
Taipa validates serialized props, state overrides, and required refs; then it attaches listeners,
bindings, effects, and lifecycle hooks to the existing nodes. `observe: true` includes islands added
later by navigation or streamed fragments. Keep the returned handle when you need to rescan a root
or destroy the runtime.

For one known host and component, import `hydrate()` directly instead of scanning a document.

## Server-side

### Basic: render a string

The server entrypoint is DOM-free at import time:

```ts
import { component, html } from "@taipa/ui";
import { renderToString } from "@taipa/ui/server";

const Greeting = component<{ name: string }>("Greeting").render(
  ({ props }) => html`<p>Hello, ${props.name}!</p>`,
);

const markup = await renderToString(Greeting, { name: "Ada" });
// <p>Hello, Ada!</p>
```

Dynamic text and attributes are escaped by default. To send an interactive component, render an
island and approve the same component name in the browser registry:

```ts
import { renderIsland } from "@taipa/ui/server";
import { Counter } from "./counter";

const markup = await renderIsland(
  Counter,
  { initial: 3 },
  { hydrate: "visible", visibleRootMargin: "200px" },
);
```

Props and state overrides are serialized as inert JSON. Hydration later attaches to the exact DOM
created from this response.

### Render repeated markup

`repeat()` composes a synchronous iterable into safe initial HTML:

```ts
import { html, repeat } from "@taipa/ui";

const rows = repeat(products, (product) => html`<li>${product.name}</li>`);
const markup = html`<ul>
  ${rows}
</ul>`;
```

Every callback must return `SafeHtml` from `html` or `raw`. `repeat()` does not reconcile items after
hydration; use direct DOM code when a live list must change.

## Forms

`createForm()` adds reactive state and validation to a real form while preserving native controls,
browser constraints, accessibility, and the normal server POST path.

```html
<form id="signup" action="/signup" method="post">
  <label for="email">Email</label>
  <input id="email" name="email" type="email" required aria-describedby="email-error" />
  <p id="email-error" data-taipa-error-for="email"></p>

  <p data-taipa-error-for="$form" role="status"></p>
  <button type="submit">Create account</button>
</form>
```

```ts
import { createForm } from "@taipa/ui/forms";

const form = document.querySelector<HTMLFormElement>("#signup");

if (form !== null) {
  const controller = createForm(form, {
    read: ({ formData }) => ({
      email: String(formData.get("email") ?? ""),
    }),
    validate: ({ values }) =>
      values.email.includes("@") ? undefined : { email: ["Enter a valid email address."] },
    mode: "blur",
  });

  // Signals are available when surrounding UI needs them.
  controller.valid();
  controller.errors();
}
```

Without a custom `submit` handler, Taipa validates and then replays the native submission. Provide
`submit` for enhanced requests, or use `standardSchema(schema)` with any Standard Schema V1
validator. Server-side validation remains required in every case.

## Entrypoints

| Entrypoint         | Purpose                                                                   |
| ------------------ | ------------------------------------------------------------------------- |
| `@taipa/ui`        | Components, safe templates, safe URLs, `repeat()`, and reactivity exports |
| `@taipa/ui/client` | `mount`, `hydrate`, `unmount`, and `bootstrap`                            |
| `@taipa/ui/server` | `renderToString` and `renderIsland` without DOM globals                   |
| `@taipa/ui/forms`  | Progressive forms and Standard Schema adapters                            |

All entrypoints are ESM. Client and forms imports are side-effect free until you call an explicit
runtime API.
