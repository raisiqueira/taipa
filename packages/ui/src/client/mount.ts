/**
 * Client-side mounting: the one place besides the server
 * lane where a view renders. mount() renders exactly once through
 * renderToString, installs the markup atomically via a native template parse
 * (inserted scripts stay inert by construction), then hands the new nodes to
 * the standard hydration path. The view is never invoked again afterwards.
 *
 * Every validation that can fail runs before any DOM mutation: a rejected
 * mount leaves the target exactly as it was found.
 */
import type { Component, ComponentInstance, JsonObject, MountOptions } from "../types";
import { asComponentDefinition, renderToString } from "../server/render";
import { attachComponent } from "./hydrate";
import { claimRuntimeOwner } from "./runtime-owner";

export async function mount<P extends JsonObject, S, D>(
  host: HTMLElement,
  component: Component<P, S, D>,
  options?: MountOptions<P, S>,
): Promise<ComponentInstance<P, S, D>> {
  const definition = asComponentDefinition(component);
  const owner = claimRuntimeOwner();
  if (owner.liveInstanceFor(host) !== undefined) {
    throw new Error("host already has a live instance of a taipa component");
  }
  if (!options?.replace && host.firstChild !== null) {
    throw new Error("mount target is not empty; pass { replace: true } to overwrite its content");
  }
  const props = options?.props ?? ({} as P);
  // renderToString validates props and state overrides before rendering, so
  // invalid input rejects above the DOM mutations below.
  const markup = await renderToString(definition, props, { state: options?.state });
  const template = document.createElement("template");
  template.innerHTML = markup;
  if (options?.replace) {
    host.replaceChildren(template.content);
  } else {
    host.append(template.content);
  }
  return attachComponent(host, definition, { props, state: options?.state });
}
