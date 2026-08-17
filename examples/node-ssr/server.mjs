import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { html } from "@taipa/ui";
import { renderIsland } from "@taipa/ui/server";
import { Hono } from "hono";
import { Counter } from "./counter.mjs";
import { Greeting } from "./greeting.mjs";
import { LiveTime } from "./live-time.mjs";
import { page } from "./page.mjs";
import { SignupForm } from "./signup-form.mjs";

const islandModule = {
  module: "/assets/client.js",
};

const app = new Hono();

app.use("/assets/*", serveStatic({ root: "./dist" }));

app.get("/", async (context) => {
  const name = context.req.query("name") ?? "Taipa";
  const greeting = await renderIsland(Greeting, { name }, { hydrate: false });

  return context.html(
    page({
      title: "Taipa SSR kitchensink",
      heading: "Server HTML stays the page",
      lede: "This greeting is rendered on the server and never hydrated. Open the next examples to attach behavior without replacing those nodes.",
      body: `<main class="stack">
        <section class="island-block">
          ${greeting}
        </section>
      </main>`,
    }),
  );
});

app.get("/interactive", async (context) => {
  const counter = await renderIsland(
    Counter,
    {},
    {
      id: "counter",
      hydrate: "load",
      ...islandModule,
      exportName: "Counter",
      state: { count: 3 },
    },
  );

  return context.html(
    page({
      title: "Load policy · Taipa SSR",
      heading: "Hydrate on load",
      lede: 'The count arrives as server HTML. <code>hydrate: "load"</code> attaches listeners as soon as the approved module resolves.',
      script: true,
      body: `<main class="stack">
        <section class="island-block" aria-labelledby="counter-title">
          <h2 id="counter-title">Server-rendered counter</h2>
          <p>This value is rendered on the server, then hydrated in place.</p>
          <p class="status" data-hydrate-status="counter">server HTML</p>
          ${counter}
        </section>
      </main>`,
    }),
  );
});

app.get("/policies", async (context) => {
  const [staticIsland, loadIsland, idleIsland, visibleIsland, onlyIsland] = await Promise.all([
    renderIsland(Greeting, { name: "static island" }, { id: "static-island", hydrate: false }),
    renderIsland(
      Counter,
      {},
      {
        id: "load-island",
        hydrate: "load",
        ...islandModule,
        exportName: "Counter",
        state: { count: 1 },
      },
    ),
    renderIsland(
      Counter,
      {},
      {
        id: "idle-island",
        hydrate: "idle",
        idleTimeout: 200,
        ...islandModule,
        exportName: "Counter",
        state: { count: 2 },
      },
    ),
    renderIsland(
      Counter,
      {},
      {
        id: "visible-island",
        hydrate: "visible",
        visibleRootMargin: "80px",
        ...islandModule,
        exportName: "Counter",
        state: { count: 4 },
      },
    ),
    renderIsland(
      LiveTime,
      {},
      {
        id: "only-island",
        hydrate: "only",
        ...islandModule,
        exportName: "LiveTime",
        fallback: html`<p class="status" data-taipa-fallback>Waiting for the browser clock.</p>`,
      },
    ),
  ]);

  return context.html(
    page({
      title: "Hydration policies · Taipa SSR",
      heading: "Every hydration policy",
      lede: "Same page, five hosts. Static HTML stays inert. <code>load</code> and <code>idle</code> wake near the top. <code>visible</code> waits for the fold. <code>only</code> keeps fallback until the client render preflights.",
      script: true,
      body: `<main class="stack">
        <section class="island-block" aria-labelledby="static-title">
          <h2 id="static-title">false — never hydrate</h2>
          <p>No <code>data-taipa-hydrate</code> attribute. Bootstrap must leave this host alone.</p>
          <div class="well">${staticIsland}</div>
        </section>
        <section class="island-block" aria-labelledby="load-title">
          <h2 id="load-title">load — primary interaction</h2>
          <p>Activates as soon as the registry module resolves.</p>
          <p class="status" data-hydrate-status="load-island">server HTML</p>
          ${loadIsland}
        </section>
        <section class="island-block" aria-labelledby="idle-title">
          <h2 id="idle-title">idle — after the browser is quiet</h2>
          <p>Uses <code>requestIdleCallback</code> with a 200ms timeout fallback.</p>
          <p class="status" data-hydrate-status="idle-island">server HTML</p>
          ${idleIsland}
        </section>
        <div class="spacer" aria-hidden="true"></div>
        <section class="island-block" aria-labelledby="visible-title">
          <h2 id="visible-title">visible — when the host approaches</h2>
          <p>IntersectionObserver with an 80px root margin. Scroll to attach.</p>
          <p class="status" data-hydrate-status="visible-island">server HTML</p>
          ${visibleIsland}
        </section>
        <section class="island-block" aria-labelledby="only-title">
          <h2 id="only-title">only — client render, honest fallback</h2>
          <p>Fallback stays in the document until the module renders off-DOM and preflight succeeds.</p>
          ${onlyIsland}
        </section>
      </main>`,
    }),
  );
});

app.get("/form", async (context) => {
  const form = await renderIsland(
    SignupForm,
    {},
    {
      id: "signup",
      hydrate: "load",
      ...islandModule,
      exportName: "SignupForm",
    },
  );

  return context.html(
    page({
      title: "Progressive form · Taipa SSR",
      heading: "Native form, then enhance",
      lede: "Labels, constraints, and POST stay in the HTML. JavaScript adds field errors. A draft submitter with <code>formnovalidate</code> skips both browser and Taipa checks.",
      script: true,
      body: `<main class="stack">
        <section class="island-block" aria-labelledby="form-title">
          <h2 id="form-title">Signup</h2>
          <p class="status" data-hydrate-status="signup">native form, waiting for enhancement</p>
          ${form}
        </section>
      </main>`,
    }),
  );
});

app.post("/signup", async (context) => {
  const body = await context.req.parseBody();
  const name = String(body.name ?? "");
  const email = String(body.email ?? "");
  const intent = String(body.intent ?? "join");
  const greeting = await renderIsland(Greeting, { name: name || "friend" }, { hydrate: false });

  return context.html(
    page({
      title: "Submitted · Taipa SSR",
      heading: intent === "draft" ? "Draft saved by native POST" : "Joined by native POST",
      lede: "This response is ordinary form navigation. The server received the same controls a no-JS browser would send.",
      body: `<main class="stack">
        <section class="island-block">
          ${greeting}
          <pre class="log">${escapeLog({ name, email, intent })}</pre>
        </section>
      </main>`,
    }),
  );
});

const port = Number(process.env.PORT ?? 3000);

serve({ fetch: app.fetch, port }, ({ port: listeningPort }) => {
  process.stdout.write(`Taipa SSR example running at http://localhost:${listeningPort}\n`);
});

function escapeLog(value) {
  return JSON.stringify(value, null, 2)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
