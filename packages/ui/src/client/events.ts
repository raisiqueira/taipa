/**
 * Event attachment: `.on()` registrations become native
 * listeners bound to the instance AbortSignal, so teardown removes every
 * listener without bookkeeping. Throwing or rejecting handlers surface as
 * `taipa:error` on the host instead of becoming unhandled failures.
 */
import type { EventRegistration } from "../component";
import type { ClientContext } from "../types";
import { dispatchIslandEvent } from "./instance";
import { elementForRef, type CollectedRefs } from "./refs";

export function attachEventListeners<P, S, D>(
  context: ClientContext<P, S, D>,
  refs: CollectedRefs,
  registrations: readonly EventRegistration<P, S, D>[],
  signal: AbortSignal,
  componentName: string,
): void {
  for (const registration of registrations) {
    const target = registration.ref === null ? context.host : elementForRef(refs, registration.ref);
    const listener = (event: Event) => {
      try {
        const result = registration.handler({ ...context, event, target });
        if (result instanceof Promise) {
          result.catch((error: unknown) => {
            dispatchIslandEvent(context.host, "taipa:error", {
              error,
              component: componentName,
              phase: "event",
            });
          });
        }
      } catch (error) {
        dispatchIslandEvent(context.host, "taipa:error", {
          error,
          component: componentName,
          phase: "event",
        });
      }
    };
    target.addEventListener(registration.type, listener, {
      ...registration.options,
      signal,
    });
  }
}
