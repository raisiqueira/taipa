import { component, html } from "@taipa/ui";

export const Counter = component("Counter")
  .state("count", 0)
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
      <section aria-labelledby="counter-title">
        <h1 id="counter-title">Server-rendered counter</h1>
        <p>This value is rendered on the server, then hydrated in place.</p>
        <div class="counter">
          <button type="button" data-taipa-ref="decrement" aria-label="Decrease count">-</button>
          <output data-taipa-ref="count" aria-live="polite">${state.count()}</output>
          <button type="button" data-taipa-ref="increment" aria-label="Increase count">+</button>
        </div>
      </section>
    `,
  );
