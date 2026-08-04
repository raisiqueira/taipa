import { component, html } from "@taipa/ui";

export const Counter = component("Counter")
  .state("count", 0)
  .derived("double", ({ state }) => state.count() * 2)
  .bind("count", ({ element, state }) => {
    element.textContent = String(state.count());
  })
  .bind("double", ({ element, derived }) => {
    element.textContent = String(derived.double());
  })
  .on("increment@click", ({ state }) => {
    state.count(state.count() + 1);
  })
  .on("decrement@click", ({ state }) => {
    state.count(state.count() - 1);
  })
  .render(
    ({ state, derived }) => html`
      <div class="counter">
        <button type="button" data-taipa-ref="decrement" aria-label="Decrease count">-</button>
        <output data-taipa-ref="count">${state.count()}</output>
        <button type="button" data-taipa-ref="increment" aria-label="Increase count">+</button>
      </div>
      <div>
        <output data-taipa-ref="double">${derived.double()}</output>
      </div>
    `,
  );
