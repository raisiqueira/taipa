/**
 * Server rendering: one initial render per call, then disposal.
 *
 * A render instantiates fresh state signals and derived computeds from the
 * component definition, applies validated state overrides, runs the view
 * inside an effect scope, and disposes every render-local effect afterwards.
 * No effects, subscriptions, or DOM nodes survive the call, so concurrent and
 * sequential renders can never observe each other. Only the server lane
 * (this file and `island.ts`) builds render contexts; client lifecycles are
 * a later unit's concern.
 */
import { computed, effectScope, signal } from "alien-signals";
import type { ComponentDefinition, StateRegistration } from "../component";
import { isSafeHtml } from "../template/html";
import type {
  Component,
  JsonObject,
  MaybePromise,
  ReactiveContext,
  SafeHtml,
  Signal,
} from "../types";
import { assertJsonSafe } from "./json";

export interface RenderOptions<S> {
  readonly state?: Partial<S>;
}

export function asComponentDefinition<P, S, D>(
  component: Component<P, S, D>,
): ComponentDefinition<P, S, D> {
  const candidate = component as ComponentDefinition<P, S, D>;
  if (
    candidate === null ||
    typeof candidate !== "object" ||
    typeof candidate.view !== "function" ||
    !Array.isArray(candidate.stateRegistrations) ||
    !Array.isArray(candidate.derivedRegistrations)
  ) {
    throw new TypeError("expected a component definition created by component(...).render(...)");
  }
  return candidate;
}

export function validateProps<P, S, D>(
  definition: ComponentDefinition<P, S, D>,
  props: unknown,
): asserts props is P {
  if (typeof props !== "object" || props === null || Array.isArray(props)) {
    throw new TypeError(`props for component "${definition.name}" must be a plain object`);
  }
  assertJsonSafe(props, "props");
}

export function validateStateOverrides<P, S, D>(
  definition: ComponentDefinition<P, S, D>,
  overrides: unknown,
): void {
  if (overrides === undefined) {
    return;
  }
  if (typeof overrides !== "object" || overrides === null || Array.isArray(overrides)) {
    throw new TypeError(
      `state overrides for component "${definition.name}" must be a plain object`,
    );
  }
  const prototype: unknown = Object.getPrototypeOf(overrides);
  if (prototype !== null && prototype !== Object.prototype) {
    throw new TypeError(
      `state overrides for component "${definition.name}" must be a plain object`,
    );
  }
  assertJsonSafe(overrides, "state");
  for (const key of Object.keys(overrides)) {
    if (!definition.stateRegistrations.some((registration) => registration.name === key)) {
      throw new Error(`unknown state override "${key}" for component "${definition.name}"`);
    }
  }
}

function resolveInitial<P, S, D>(
  definition: ComponentDefinition<P, S, D>,
  registration: StateRegistration,
  props: Readonly<P>,
): unknown {
  if (typeof registration.initial !== "function") {
    return registration.initial;
  }
  const initializer = registration.initial as (context: { readonly props: Readonly<P> }) => unknown;
  try {
    return initializer({ props });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `state initializer for "${registration.name}" in component "${definition.name}" threw: ${message}`,
      { cause: error },
    );
  }
}

export function prepareContext<P extends JsonObject, S, D>(
  definition: ComponentDefinition<P, S, D>,
  props: P,
  overrides?: Partial<S>,
): ReactiveContext<P, S, D> {
  const frozenProps = Object.freeze({ ...props }) as Readonly<P>;
  const state: Record<string, Signal<unknown>> = {};
  for (const registration of definition.stateRegistrations) {
    const hasOverride = overrides !== undefined && Object.hasOwn(overrides, registration.name);
    const initial = hasOverride
      ? (overrides as Record<string, unknown>)[registration.name]
      : resolveInitial(definition, registration, frozenProps);
    assertJsonSafe(initial, `state.${registration.name}`);
    state[registration.name] = signal(initial);
  }
  const derived: Record<string, () => unknown> = {};
  const context = { props: frozenProps, state, derived } as unknown as ReactiveContext<P, S, D>;
  for (const registration of definition.derivedRegistrations) {
    derived[registration.name] = computed(() => registration.read(context));
  }
  return context;
}

export async function renderViewInScope<P, S, D>(
  definition: ComponentDefinition<P, S, D>,
  context: ReactiveContext<P, S, D>,
): Promise<string> {
  let viewResult: MaybePromise<SafeHtml> | undefined;
  let syncError: { readonly error: unknown } | undefined;
  const dispose = effectScope(() => {
    try {
      viewResult = definition.view(context);
    } catch (error) {
      // effectScope(fn) only returns its disposer when fn returns normally, so
      // a synchronously throwing view would strand render-local effects.
      // Capture the error, dispose, then rethrow.
      syncError = { error };
    }
  });
  if (syncError !== undefined) {
    dispose();
    throw syncError.error;
  }
  try {
    const rendered = await viewResult;
    if (!isSafeHtml(rendered)) {
      throw new TypeError(
        `component "${definition.name}" view must return SafeHtml produced by the html tag (or raw)`,
      );
    }
    return rendered.value;
  } finally {
    // Disposal covers effects created by the synchronous portion of the view.
    // Effects created after an await escape the scope by construction; views
    // have no supported reason to create effects, so this is not a v1 concern.
    dispose();
  }
}

export async function renderToString<P extends JsonObject, S, D>(
  component: Component<P, S, D>,
  props: P,
  options?: RenderOptions<S>,
): Promise<string> {
  const definition = asComponentDefinition(component);
  validateProps(definition, props);
  validateStateOverrides(definition, options?.state);
  const context = prepareContext(definition, props, options?.state);
  return renderViewInScope(definition, context);
}
