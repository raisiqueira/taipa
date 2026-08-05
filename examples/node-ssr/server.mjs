import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { component, html } from "@taipa/ui";
import { renderIsland } from "@taipa/ui/server";
import { Hono } from "hono";
import { Counter } from "./counter.mjs";

const Greeting = component("Greeting")
  .state("name", ({ props }) => props.name)
  .render(({ state }) => html`<p>Hello, ${state.name()}.</p>`);

const app = new Hono();

app.use("/assets/*", serveStatic({ root: "./dist" }));

app.get("/", async (context) => {
  const name = context.req.query("name") ?? "Taipa";
  const greeting = await renderIsland(Greeting, { name }, { hydrate: false });

  return context.html(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Taipa SSR with Hono</title>
  </head>
  <body>
    <main>
      ${greeting}
      <p><a href="/interactive">Open the interactive SSR example</a></p>
    </main>
  </body>
</html>`);
});

app.get("/interactive", async (context) => {
  const counter = await renderIsland(
    Counter,
    {},
    {
      id: "counter",
      hydrate: "load",
      module: "/assets/client.js",
      exportName: "Counter",
      state: { count: 3 },
    },
  );

  return context.html(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Interactive Taipa SSR with Hono</title>
    <style>
      :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
      body { margin: 0; }
      main { margin: 0 auto; max-width: 36rem; padding: 4rem 1.5rem; }
      .counter { align-items: center; display: flex; gap: 1rem; }
      button { font: inherit; min-height: 2.75rem; min-width: 2.75rem; }
      output { font-size: 1.5rem; min-width: 3ch; text-align: center; }
    </style>
  </head>
  <body>
    <main>${counter}</main>
    <script type="module" src="/assets/client.js"></script>
  </body>
</html>`);
});

const port = Number(process.env.PORT ?? 3000);

serve({ fetch: app.fetch, port }, ({ port: listeningPort }) => {
  process.stdout.write(`Taipa SSR example running at http://localhost:${listeningPort}\n`);
});
