import { component, html } from "@taipa/ui";

export const LiveTime = component("LiveTime")
  .state("now", () => new Date().toISOString())
  .bind("time", ({ element, state }) => {
    element.dateTime = state.now();
    element.textContent = state.now();
  })
  .connected(({ state }) => {
    const timer = setInterval(() => {
      state.now(new Date().toISOString());
    }, 1000);
    return () => clearInterval(timer);
  })
  .render(
    ({ state }) => html`
      <p class="clock">Browser time: <time data-taipa-ref="time">${state.now()}</time></p>
    `,
  );
