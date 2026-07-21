/**
 * Component instances (design 3.5): the live attachment between a component
 * definition and one island host. `destroy()` tears down exactly once and in
 * reverse attach order — connected cleanups, the effect scope (bindings and
 * effects), then the abort signal that removes every listener.
 */
import type { ClientContext, ComponentInstance } from "../types.ts";
import { claimRuntimeOwner } from "./runtime-owner.ts";

export function dispatchIslandEvent(
  host: HTMLElement,
  type: "taipa:hydrated" | "taipa:error",
  detail: Record<string, unknown>,
): void {
  host.dispatchEvent(new CustomEvent(type, { bubbles: true, detail }));
}

interface DestroyableOwner {
  unregister(instance: ComponentInstance): void;
}

export function createComponentInstance<P, S, D>(
  context: ClientContext<P, S, D>,
  destroyResources: () => void,
  owner: DestroyableOwner,
): ComponentInstance<P, S, D> {
  let destroyed = false;
  const instance: ComponentInstance<P, S, D> = {
    host: context.host,
    props: context.props,
    state: context.state,
    derived: context.derived,
    destroy() {
      if (destroyed) {
        return;
      }
      destroyed = true;
      owner.unregister(instance);
      destroyResources();
    },
  };
  return instance;
}

export function unmount(host: HTMLElement): boolean {
  const instance = claimRuntimeOwner().liveInstanceFor(host);
  if (instance === undefined) {
    return false;
  }
  instance.destroy();
  return true;
}
