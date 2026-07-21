/**
 * Direct-DOM hydration (design 2.3): attach behavior to the exact nodes the
 * server rendered. Hydration never renders, replaces, or re-parents nodes
 * (AE1); bindings are direct DOM API writes driven by alien-signals effects.
 *
 * Attachment is atomic (KTD14): every preflight check — contract version,
 * payload shape, required refs — completes before any listener, binding, or
 * connected hook touches the island, so a failure leaves the host inert apart
 * from one `taipa:error` event. If the commit phase itself fails, every
 * runtime resource created so far is disposed in reverse order and the host
 * is marked with `data-taipa-error`; DOM writes already applied by user code
 * are not reversible and are left alone.
 */
import { effect, effectScope } from "alien-signals";
import type { ComponentDefinition } from "../component.ts";
import { ATTR_PROPS_SCRIPT, ATTR_STATE_SCRIPT, ATTR_VERSION } from "../server/attributes.ts";
import {
  asComponentDefinition,
  prepareContext,
  validateProps,
  validateStateOverrides,
} from "../server/render.ts";
import type {
  ClientContext,
  Component,
  ComponentInstance,
  HydrateOptions,
  JsonObject,
  ReactiveContext,
} from "../types.ts";
import { attachEventListeners } from "./events.ts";
import { createComponentInstance, dispatchIslandEvent } from "./instance.ts";
import {
  assertRequiredRefs,
  collectRefs,
  createRefMap,
  elementForRef,
  type CollectedRefs,
} from "./refs.ts";
import { claimRuntimeOwner } from "./runtime-owner.ts";

const MAX_PAYLOAD_BYTES = 64 * 1024;
const DANGEROUS_KEYS = new Set(["__proto__", "prototype", "constructor"]);

export interface AttachOptions {
  readonly skipVersionCheck?: boolean;
}

export function hydrate<P, S, D>(
  host: HTMLElement,
  component: Component<P, S, D>,
  options?: HydrateOptions<P, S>,
): ComponentInstance<P, S, D> {
  return attachComponent(host, component, options);
}

export function attachComponent<P, S, D>(
  host: HTMLElement,
  component: Component<P, S, D>,
  options: HydrateOptions<P, S> | undefined,
  attachOptions?: AttachOptions,
): ComponentInstance<P, S, D> {
  const definition = asComponentDefinition(component);
  const owner = claimRuntimeOwner();

  // Preflight and staging: validate everything before touching the island.
  let context: ReactiveContext<P, S, D>;
  let collected: CollectedRefs;
  try {
    if (owner.liveInstanceFor(host) !== undefined) {
      throw new Error(`host already has a live instance of a taipa component`);
    }
    if (attachOptions?.skipVersionCheck !== true) {
      const version = host.getAttribute(ATTR_VERSION);
      if (version === null) {
        throw new Error(
          `component "${definition.name}" requires a data-taipa-version attribute on the island host`,
        );
      }
      if (version !== definition.contractVersion) {
        throw new Error(
          `contract version mismatch for component "${definition.name}": the markup declares "${version}" but the component requires "${definition.contractVersion}"`,
        );
      }
    }
    const payloadProps = readPayload(host, definition, ATTR_PROPS_SCRIPT, "props");
    const payloadState = readPayload(host, definition, ATTR_STATE_SCRIPT, "state");
    if (payloadState !== undefined) {
      assertKnownStateKeys(definition, payloadState);
    }
    if (options?.props !== undefined) {
      validateProps(definition, options.props);
    }
    if (options?.state !== undefined) {
      validateStateOverrides(definition, options.state);
    }
    const props = (options?.props ?? payloadProps ?? {}) as P;
    const overrides = mergeStateOverrides(payloadState, options?.state);
    // prepareContext requires JSON-compatible props; payload props are parsed
    // JSON and explicit props were validated above, so the bound holds.
    context = prepareContext(
      definition,
      props as P & JsonObject,
      overrides as Partial<S> | undefined,
    );
    collected = collectRefs(host);
    assertRequiredRefs(collected, definition.requiredRefs, definition.name);
  } catch (error) {
    dispatchIslandEvent(host, "taipa:error", {
      error,
      component: definition.name,
      phase: "preflight",
    });
    throw error;
  }

  // Commit: listeners, bindings, effects, and connected hooks. A failure
  // disposes runtime resources in reverse order and marks the host errored.
  const controller = new AbortController();
  const clientContext: ClientContext<P, S, D> = {
    ...context,
    host,
    refs: createRefMap(collected),
    signal: controller.signal,
  };
  const cleanups: (() => void)[] = [() => controller.abort()];
  try {
    let scopeError: { readonly error: unknown } | undefined;
    const disposeScope = effectScope(() => {
      try {
        for (const binding of definition.bindingRegistrations) {
          const element = elementForRef(collected, binding.refName);
          effect(() => {
            const cleanup = binding.update({ ...clientContext, element });
            return typeof cleanup === "function" ? cleanup : undefined;
          });
        }
        for (const registered of definition.effectRegistrations) {
          effect(() => {
            const cleanup = registered.run(clientContext);
            return typeof cleanup === "function" ? cleanup : undefined;
          });
        }
      } catch (error) {
        // effectScope(fn) never returns its disposer when fn throws, so a
        // synchronously failing binding or effect would strand everything
        // created before it. Capture, dispose, then rethrow.
        scopeError = { error };
      }
    });
    if (scopeError !== undefined) {
      disposeScope();
      throw scopeError.error;
    }
    cleanups.push(disposeScope);
    attachEventListeners(
      clientContext,
      collected,
      definition.eventRegistrations,
      controller.signal,
      definition.name,
    );
    for (const connected of definition.connectedRegistrations) {
      const cleanup = connected.run(clientContext);
      if (typeof cleanup === "function") {
        cleanups.push(cleanup);
      }
    }
  } catch (error) {
    runCleanups(cleanups);
    host.setAttribute("data-taipa-error", definition.name);
    dispatchIslandEvent(host, "taipa:error", {
      error,
      component: definition.name,
      phase: "commit",
    });
    throw error;
  }

  const instance = createComponentInstance(clientContext, () => runCleanups(cleanups), owner);
  owner.register(instance);
  // A live instance means a previously failed attach has been superseded.
  host.removeAttribute("data-taipa-error");
  dispatchIslandEvent(host, "taipa:hydrated", { component: definition.name, host });
  return instance;
}

function runCleanups(cleanups: readonly (() => void)[]): void {
  for (let index = cleanups.length - 1; index >= 0; index -= 1) {
    try {
      cleanups[index]?.();
    } catch {
      // Teardown must complete: a throwing cleanup never stops the rest.
    }
  }
}

function findPayloadScripts(host: HTMLElement, attribute: string): Element[] {
  const scripts: Element[] = [];
  const walker = host.ownerDocument.createTreeWalker(host, NodeFilter.SHOW_ELEMENT, {
    acceptNode(node) {
      const element = node as Element;
      if (element !== host && element.tagName === "TAIPA-ISLAND") {
        return NodeFilter.FILTER_REJECT;
      }
      if (element.tagName === "SCRIPT" && element.hasAttribute(attribute)) {
        return NodeFilter.FILTER_ACCEPT;
      }
      return NodeFilter.FILTER_SKIP;
    },
  });
  while (walker.nextNode()) {
    scripts.push(walker.currentNode as Element);
  }
  return scripts;
}

function readPayload(
  host: HTMLElement,
  definition: ComponentDefinition,
  attribute: string,
  label: "props" | "state",
): Record<string, unknown> | undefined {
  const scripts = findPayloadScripts(host, attribute);
  if (scripts.length === 0) {
    return undefined;
  }
  if (scripts.length > 1) {
    throw new Error(
      `component "${definition.name}" host carries duplicate ${label} payload scripts`,
    );
  }
  const text = scripts[0]?.textContent ?? "";
  if (text.length > MAX_PAYLOAD_BYTES) {
    throw new Error(
      `${label} payload for component "${definition.name}" exceeds the 64 KiB island payload limit`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`malformed JSON in the ${label} payload for component "${definition.name}"`);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new TypeError(
      `the ${label} payload for component "${definition.name}" must be a JSON object`,
    );
  }
  return sanitizeRecord(parsed, label) as Record<string, unknown>;
}

function sanitizeRecord(value: unknown, path: string): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => sanitizeRecord(item, `${path}[${index}]`));
  }
  const record: Record<string, unknown> = Object.create(null);
  for (const key of Object.keys(value)) {
    if (DANGEROUS_KEYS.has(key)) {
      throw new Error(`${path}: key "${key}" is not allowed in island payloads`);
    }
    record[key] = sanitizeRecord((value as Record<string, unknown>)[key], `${path}.${key}`);
  }
  return record;
}

function assertKnownStateKeys(
  definition: ComponentDefinition,
  payloadState: Record<string, unknown>,
): void {
  for (const key of Object.keys(payloadState)) {
    if (!definition.stateRegistrations.some((registration) => registration.name === key)) {
      throw new Error(`unknown state override "${key}" for component "${definition.name}"`);
    }
  }
}

function mergeStateOverrides(
  payloadState: Record<string, unknown> | undefined,
  explicit: unknown,
): Record<string, unknown> | undefined {
  if (payloadState === undefined && explicit === undefined) {
    return undefined;
  }
  const merged: Record<string, unknown> = Object.create(null);
  if (payloadState !== undefined) {
    Object.assign(merged, payloadState);
  }
  if (explicit !== undefined) {
    Object.assign(merged, explicit);
  }
  return merged;
}
