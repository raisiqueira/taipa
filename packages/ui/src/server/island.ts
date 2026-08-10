/**
 * Island rendering: the `<taipa-island>` host around one initial render
 * that the client runtime can activate.
 *
 * Hydratable islands carry the hydration policy, inert props JSON, and
 * optional state-override JSON. Static islands (no policy)
 * omit every piece of hydration metadata. `client:only` islands skip the
 * server render entirely and carry the optional fallback element as inert
 * content; the bootstrapper replaces it after an off-DOM render succeeds.
 */
import { isSafeHtml } from "../template/html";
import type { Component, JsonObject, SafeHtml } from "../types";
import {
  ATTR_COMPONENT,
  ATTR_EXPORT,
  ATTR_HYDRATE,
  ATTR_IDLE_TIMEOUT,
  ATTR_PROPS_SCRIPT,
  ATTR_SRC,
  ATTR_STATE_SCRIPT,
  ATTR_VISIBLE_ROOT_MARGIN,
  FALLBACK_MARKER,
  ISLAND_TAG,
  MAX_ISLAND_PAYLOAD_CHARS,
  jsonScript,
  serializeAttributes,
  type Attribute,
} from "./attributes";
import { toInertJson } from "./json";
import {
  asComponentDefinition,
  prepareContext,
  renderViewInScope,
  validateProps,
  validateStateOverrides,
  type RenderOptions,
} from "./render";

export type HydrationPolicy = false | "load" | "idle" | "visible" | "only";

export interface IslandRenderOptions<S> extends RenderOptions<S> {
  readonly id?: string;
  readonly hydrate?: HydrationPolicy;
  readonly module?: string;
  readonly exportName?: string;
  readonly idleTimeout?: number;
  readonly visibleRootMargin?: string;
  readonly fallback?: SafeHtml;
}

const HYDRATION_POLICIES: ReadonlySet<string> = new Set(["load", "idle", "visible", "only"]);
const PAYLOAD_WARNING_THRESHOLD = MAX_ISLAND_PAYLOAD_CHARS * 0.75;

function resolveHydrationPolicy(input: unknown): HydrationPolicy {
  if (input === undefined || input === false) {
    return false;
  }
  if (typeof input === "string" && HYDRATION_POLICIES.has(input)) {
    return input as Exclude<HydrationPolicy, false>;
  }
  throw new Error(
    `unknown hydration policy ${JSON.stringify(input)}; expected "load", "idle", "visible", "only", or false`,
  );
}

function validateIslandOptions<S>(
  definitionName: string,
  hydrate: HydrationPolicy,
  options: IslandRenderOptions<S>,
): void {
  if (hydrate === false) {
    for (const key of ["module", "exportName", "idleTimeout", "visibleRootMargin"] as const) {
      if (options[key] !== undefined) {
        throw new Error(`option "${key}" requires a hydration policy`);
      }
    }
  }
  if (options.idleTimeout !== undefined) {
    if (hydrate !== "idle") {
      throw new Error(`option "idleTimeout" requires hydrate: "idle"`);
    }
    if (!Number.isFinite(options.idleTimeout) || options.idleTimeout < 0) {
      throw new TypeError(`option "idleTimeout" must be a non-negative finite number`);
    }
  }
  if (options.visibleRootMargin !== undefined) {
    if (hydrate !== "visible") {
      throw new Error(`option "visibleRootMargin" requires hydrate: "visible"`);
    }
    if (typeof options.visibleRootMargin !== "string" || options.visibleRootMargin.trim() === "") {
      throw new TypeError(`option "visibleRootMargin" must be a non-empty string`);
    }
  }
  if (options.fallback !== undefined) {
    if (hydrate !== "only") {
      throw new Error(`option "fallback" requires hydrate: "only"`);
    }
    if (!isSafeHtml(options.fallback)) {
      throw new TypeError(`option "fallback" must be SafeHtml produced by the html tag (or raw)`);
    }
    if (!options.fallback.value.includes(FALLBACK_MARKER)) {
      throw new Error(
        `fallback markup for component "${definitionName}" must carry ${FALLBACK_MARKER}`,
      );
    }
  }
}

function serializePayload(
  componentName: string,
  label: "props" | "state",
  markerAttribute: string,
  value: JsonObject,
): string {
  const payload = toInertJson(value);
  if (payload.length > MAX_ISLAND_PAYLOAD_CHARS) {
    throw new Error(
      `${label} payload for component "${componentName}" exceeds the 64 KiB island payload limit`,
    );
  }
  if (
    typeof process !== "undefined" &&
    process.env.NODE_ENV === "development" &&
    payload.length >= PAYLOAD_WARNING_THRESHOLD
  ) {
    const bytes = new TextEncoder().encode(payload).byteLength;
    console.warn(
      `Taipa ${label} payload for component "${componentName}" is ${payload.length} characters (${bytes} UTF-8 bytes), approaching the 64 KiB island payload limit`,
    );
  }
  return jsonScript(markerAttribute, payload);
}

export async function renderIsland<P extends JsonObject, S, D>(
  component: Component<P, S, D>,
  props: P,
  options: IslandRenderOptions<S> = {},
): Promise<string> {
  const definition = asComponentDefinition(component);
  const hydrate = resolveHydrationPolicy(options.hydrate);
  validateIslandOptions(definition.name, hydrate, options);
  validateProps(definition, props);
  validateStateOverrides(definition, options.state);

  const scripts: string[] = [];
  if (hydrate !== false) {
    if (Object.keys(props).length > 0) {
      scripts.push(serializePayload(definition.name, "props", ATTR_PROPS_SCRIPT, props));
    }
    if (options.state !== undefined && Object.keys(options.state).length > 0) {
      scripts.push(
        serializePayload(definition.name, "state", ATTR_STATE_SCRIPT, options.state as JsonObject),
      );
    }
  }

  let inner: string;
  if (hydrate === "only") {
    inner = options.fallback?.value ?? "";
  } else {
    const context = prepareContext(definition, props, options.state);
    inner = await renderViewInScope(definition, context);
  }

  // Canonical attribute order: id, component, module resolution, policy,
  // scheduling hints.
  const attributes: Attribute[] = [];
  if (options.id !== undefined) {
    attributes.push(["id", options.id]);
  }
  attributes.push([ATTR_COMPONENT, definition.name]);
  if (options.module !== undefined) {
    attributes.push([ATTR_SRC, options.module]);
  }
  if (options.exportName !== undefined) {
    attributes.push([ATTR_EXPORT, options.exportName]);
  }
  if (hydrate !== false) {
    attributes.push([ATTR_HYDRATE, hydrate]);
    if (options.visibleRootMargin !== undefined) {
      attributes.push([ATTR_VISIBLE_ROOT_MARGIN, options.visibleRootMargin]);
    }
    if (options.idleTimeout !== undefined) {
      attributes.push([ATTR_IDLE_TIMEOUT, String(options.idleTimeout)]);
    }
  }

  return `<${ISLAND_TAG} ${serializeAttributes(attributes)}>${inner}${scripts.join("")}</${ISLAND_TAG}>`;
}
