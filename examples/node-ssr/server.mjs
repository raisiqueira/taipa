import { component, html } from "@taipa/ui";
import { renderIsland } from "@taipa/ui/server";

const Greeting = component("Greeting")
  .state("name", ({ props }) => props.name)
  .render(({ state }) => html`<p>Hello, ${state.name()}.</p>`);

const page = await renderIsland(Greeting, { name: "Taipa" }, { hydrate: false });
process.stdout.write(`<!doctype html><main>${page}</main>\n`);
