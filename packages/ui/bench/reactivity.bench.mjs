/**
 * Reactivity and component definition.
 *
 * Taipa re-exports alien-signals verbatim and only wraps batching, so these
 * tasks track the reactive graph cost that hydrated islands pay on every state
 * write, plus the one-off cost of building a component definition (an immutable
 * builder chain that copies its registrations on each step).
 */
import { batch, component, computed, effect, effectScope, html, signal } from "@taipa/ui";

const WRITES = 1_000;
const SUBSCRIBERS = 100;

export function register(bench) {
  bench
    .add(`signal: ${WRITES} write/read round trips`, () => {
      const count = signal(0);
      let last = 0;
      for (let index = 0; index < WRITES; index += 1) {
        count(index);
        last = count();
      }
      return last;
    })
    .add("computed: recompute a 10-deep chain on every write", () => {
      const source = signal(0);
      let node = computed(() => source() + 1);
      for (let depth = 0; depth < 9; depth += 1) {
        const previous = node;
        node = computed(() => previous() + 1);
      }
      let last = 0;
      for (let index = 0; index < 100; index += 1) {
        source(index);
        last = node();
      }
      return last;
    })
    .add(`effect: propagate one write to ${SUBSCRIBERS} effects`, () => {
      const source = signal(0);
      let runs = 0;
      const stop = effectScope(() => {
        for (let index = 0; index < SUBSCRIBERS; index += 1) {
          effect(() => {
            source();
            runs += 1;
          });
        }
      });
      source(1);
      stop();
      return runs;
    })
    .add(`batch: coalesce ${WRITES} writes into one flush`, () => {
      const a = signal(0);
      const b = signal(0);
      let runs = 0;
      const stop = effect(() => {
        a();
        b();
        runs += 1;
      });
      batch(() => {
        for (let index = 0; index < WRITES; index += 1) {
          a(index);
          b(index);
        }
      });
      stop();
      return runs;
    })
    .add("component: build a definition with 12 registrations", () => {
      return component("Wide")
        .state("a", 0)
        .state("b", 1)
        .state("c", ({ props }) => props.seed)
        .derived("sum", ({ state }) => state.a() + state.b())
        .derived("label", ({ derived }) => `sum:${derived.sum()}`)
        .on("@click", () => {})
        .on("increment@click", ({ state }) => {
          state.a(state.a() + 1);
        })
        .bind("total", ({ element, derived }) => {
          element.textContent = derived.label();
        })
        .effect(() => {})
        .connected(() => {})
        .render(({ derived }) => html`<output data-taipa-ref="total">${derived.label()}</output>`);
    });
}
