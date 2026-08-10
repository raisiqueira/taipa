import { component, html } from "@taipa/ui";

// This module is a separate Vite entry so the DOM registry imports a real
// production chunk instead of resolving a benchmark-only in-memory loader.
export const componentModuleUrl = import.meta.url;

export const PayloadProbe = component("PayloadProbe")
  .state("count", ({ props }) => props.count)
  .bind("value", ({ props, state, element }) => {
    element.textContent = `${props.label}:${state.count()}`;
    element.setAttribute("data-payload", String(props.items.length));
  })
  .render(() => html`<output data-taipa-ref="value"></output>`);
