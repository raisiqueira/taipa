import { component, html } from "@taipa/ui";
import { renderToString } from "@taipa/ui/server";
import { issuesToFormErrors } from "@taipa/ui/forms";

const Probe = component("Probe").render(() => html`<p>ok</p>`);

if ((await renderToString(Probe, {})) !== "<p>ok</p>") {
  throw new Error("server render failed");
}

if (
  issuesToFormErrors([{ message: "Required", path: ["user", "email"] }])["user.email"]?.[0] !==
  "Required"
) {
  throw new Error("forms entry failed");
}
