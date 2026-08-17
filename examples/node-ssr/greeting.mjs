import { component, html } from "@taipa/ui";

export const Greeting = component("Greeting")
  .state("name", ({ props }) => props.name)
  .render(({ state }) => html`<p>Hello, ${state.name()}.</p>`);
