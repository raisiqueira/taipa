import { component, html } from "@taipa/ui";
import { mount } from "@taipa/ui/client";
import { createForm } from "@taipa/ui/forms";

const Counter = component("Counter", { contractVersion: "1" })
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

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("missing app root");
void mount(app, Counter, { replace: true });

const form = document.createElement("form");
form.innerHTML = `<input name="title" value="demo" />`;
document.body.append(form);
createForm(form, { read: ({ formData }) => ({ title: String(formData.get("title") ?? "") }) });
