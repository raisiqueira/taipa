import { component, html } from "@taipa/ui";
import { renderToString } from "@taipa/ui/server";

const Probe = component("Probe").render(() => html`<p>deno</p>`);
if ((await renderToString(Probe, {})) !== "<p>deno</p>") {
  throw new Error("Deno render failed");
}
