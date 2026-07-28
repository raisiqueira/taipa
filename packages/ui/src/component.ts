/**
 * Universal component definitions.
 *
 * A component definition is immutable metadata plus ordered lifecycle
 * registrations. No signals, effects, or DOM nodes exist here: state signals
 * and scopes are created per instance by the server renderer and the client
 * runtime. Every builder method returns a new frozen builder,
 * and `.render()` finalizes the chain.
 */
import type {
  Cleanup,
  ClientContext,
  Component,
  EventForSpec,
  JsonObject,
  MaybePromise,
  OnSpec,
  ParseEvent,
  ParseRef,
  ReactiveContext,
  RefElement,
  SafeHtml,
} from "./types";

export interface ComponentOptions {
  readonly contractVersion: string;
}

export type EventRegistrationHandler<P, S, D> = (
  context: ClientContext<P, S, D> & {
    readonly event: Event;
    readonly target: Element;
  },
) => MaybePromise<void>;

export interface StateRegistration {
  readonly name: string;
  readonly initial: unknown;
}

export interface DerivedRegistration<P, S, D> {
  readonly name: string;
  readonly read: (context: ReactiveContext<P, S, D>) => unknown;
}

export interface EventRegistration<P, S, D> {
  /** Ref name for `ref@type` specs, or `null` for host-targeted `@type`. */
  readonly ref: string | null;
  readonly type: string;
  readonly handler: EventRegistrationHandler<P, S, D>;
  readonly options?: AddEventListenerOptions;
}

export interface BindingRegistration<P, S, D> {
  readonly refName: string;
  readonly update: (
    context: ClientContext<P, S, D> & { readonly element: Element },
  ) => void | Cleanup;
}

export interface EffectRegistration<P, S, D> {
  readonly run: (context: ClientContext<P, S, D>) => void | Cleanup;
}

export interface ConnectedRegistration<P, S, D> {
  readonly run: (context: ClientContext<P, S, D>) => void | Cleanup;
}

/**
 * The full internal metadata carried by a component definition. Later units
 * (server rendering, hydration) consume these ordered registrations; the
 * public surface exposes only `Component` (name, contractVersion,
 * requiredRefs).
 */
// oxlint-disable-next-line no-explicit-any -- bare ComponentDefinition reads as an opaque handle
export interface ComponentDefinition<P = any, S = any, D = any> extends Component<P, S, D> {
  readonly view: (context: ReactiveContext<P, S, D>) => MaybePromise<SafeHtml>;
  readonly stateRegistrations: readonly StateRegistration[];
  readonly derivedRegistrations: readonly DerivedRegistration<P, S, D>[];
  readonly eventRegistrations: readonly EventRegistration<P, S, D>[];
  readonly bindingRegistrations: readonly BindingRegistration<P, S, D>[];
  readonly effectRegistrations: readonly EffectRegistration<P, S, D>[];
  readonly connectedRegistrations: readonly ConnectedRegistration<P, S, D>[];
}

type RefRecord = Record<string, Element>;

type MergedRefElement<Refs extends RefRecord, Name extends string, E extends Element> = [
  Element,
] extends [E]
  ? Name extends keyof Refs
    ? Refs[Name]
    : E
  : E;

type MergeRefs<Refs extends RefRecord, Name extends string, E extends Element> = Omit<Refs, Name> &
  Record<Name, MergedRefElement<Refs, Name, E>>;

type EventTarget<Refs extends RefRecord, Spec extends string, E extends Element> = [
  ParseRef<Spec>,
] extends [never]
  ? HTMLElement
  : RefElement<MergeRefs<Refs, ParseRef<Spec>, E>, ParseRef<Spec>>;

type ValidOnSpec<Spec extends OnSpec> = [ParseEvent<Spec>] extends [never] ? never : Spec;

export interface ComponentBuilder<P, S, D, Refs extends RefRecord = RefRecord> {
  state<K extends string, V>(
    name: Exclude<K, keyof S>,
    initial: V | ((context: { readonly props: Readonly<P> }) => V),
  ): ComponentBuilder<P, S & Record<K, V>, D, Refs>;

  derived<K extends string, V>(
    name: Exclude<K, keyof D>,
    read: (context: ReactiveContext<P, S, D>) => V,
  ): ComponentBuilder<P, S, D & Record<K, V>, Refs>;

  on<
    Spec extends OnSpec,
    E extends EventForSpec<Spec> = EventForSpec<Spec>,
    El extends Element = Element,
  >(
    spec: ValidOnSpec<Spec>,
    handler: (
      context: ClientContext<P, S, D, MergeRefs<Refs, ParseRef<Spec>, El>> & {
        readonly event: E;
        readonly target: EventTarget<Refs, Spec, El>;
      },
    ) => MaybePromise<void>,
    options?: AddEventListenerOptions,
  ): ComponentBuilder<P, S, D, MergeRefs<Refs, ParseRef<Spec>, El>>;

  bind<Name extends string, E extends Element = Element>(
    refName: Name,
    update: (
      context: ClientContext<P, S, D, MergeRefs<Refs, Name, E>> & {
        readonly element: RefElement<MergeRefs<Refs, Name, E>, Name>;
      },
    ) => void | Cleanup,
  ): ComponentBuilder<P, S, D, MergeRefs<Refs, Name, E>>;

  effect(
    run: (context: ClientContext<P, S, D, Refs>) => void | Cleanup,
  ): ComponentBuilder<P, S, D, Refs>;

  connected(
    run: (context: ClientContext<P, S, D, Refs>) => void | Cleanup,
  ): ComponentBuilder<P, S, D, Refs>;

  render(view: (context: ReactiveContext<P, S, D>) => MaybePromise<SafeHtml>): Component<P, S, D>;
}

interface BuilderRegistrations<P, S, D> {
  readonly states: readonly StateRegistration[];
  readonly deriveds: readonly DerivedRegistration<P, S, D>[];
  readonly events: readonly EventRegistration<P, S, D>[];
  readonly bindings: readonly BindingRegistration<P, S, D>[];
  readonly effects: readonly EffectRegistration<P, S, D>[];
  readonly connecteds: readonly ConnectedRegistration<P, S, D>[];
  /** First-seen declaration order of singular refs from `.bind()`/`.on()`. */
  readonly requiredRefs: readonly string[];
}

function parseEventSpec(spec: string): { readonly ref: string | null; readonly type: string } {
  const firstAt = spec.indexOf("@");
  if (firstAt === -1 || firstAt !== spec.lastIndexOf("@")) {
    throw new Error(
      `invalid event spec "${spec}"; expected "@type" (host) or "ref@type" (single @ separator)`,
    );
  }
  const ref = spec.slice(0, firstAt);
  const type = spec.slice(firstAt + 1);
  if (type === "") {
    throw new Error(`invalid event spec "${spec}"; the event type after "@" must be non-empty`);
  }
  return { ref: ref === "" ? null : ref, type };
}

function requireRefName(refName: string, method: string): void {
  if (typeof refName !== "string" || refName.trim() === "") {
    throw new TypeError(`${method}() requires a non-empty ref name`);
  }
}

function freezeRecord<T extends object>(record: T): T {
  return Object.freeze(record);
}

function makeBuilder<P, S, D, Refs extends RefRecord>(
  name: string,
  contractVersion: string,
  registrations: BuilderRegistrations<P, S, D>,
): ComponentBuilder<P, S, D, Refs> {
  function extend(patch: Partial<BuilderRegistrations<P, S, D>>): ComponentBuilder<P, S, D, Refs> {
    return makeBuilder(name, contractVersion, { ...registrations, ...patch });
  }

  function assertUniqueValueName(valueName: string): void {
    const duplicated =
      registrations.states.some((entry) => entry.name === valueName) ||
      registrations.deriveds.some((entry) => entry.name === valueName);
    if (duplicated) {
      throw new Error(`duplicate state or derived name "${valueName}" in component "${name}"`);
    }
  }

  function trackRequiredRef(ref: string): readonly string[] {
    if (registrations.requiredRefs.includes(ref)) {
      return registrations.requiredRefs;
    }
    return Object.freeze([...registrations.requiredRefs, ref]);
  }

  return Object.freeze({
    state(valueName: string, initial: unknown) {
      requireRefName(valueName, "state");
      assertUniqueValueName(valueName);
      return extend({
        states: Object.freeze([
          ...registrations.states,
          freezeRecord({ name: valueName, initial }),
        ]),
      });
    },

    derived(valueName: string, read: (context: ReactiveContext<P, S, D>) => unknown) {
      requireRefName(valueName, "derived");
      assertUniqueValueName(valueName);
      return extend({
        deriveds: Object.freeze([
          ...registrations.deriveds,
          freezeRecord({ name: valueName, read }),
        ]),
      });
    },

    on(
      spec: string,
      handler: EventRegistrationHandler<P, S, D>,
      options?: AddEventListenerOptions,
    ) {
      const { ref, type } = parseEventSpec(spec);
      return extend({
        events: Object.freeze([
          ...registrations.events,
          freezeRecord({ ref, type, handler, options }),
        ]),
        requiredRefs: ref === null ? registrations.requiredRefs : trackRequiredRef(ref),
      });
    },

    bind(
      refName: string,
      update: (context: ClientContext<P, S, D> & { readonly element: Element }) => void | Cleanup,
    ) {
      requireRefName(refName, "bind");
      return extend({
        bindings: Object.freeze([...registrations.bindings, freezeRecord({ refName, update })]),
        requiredRefs: trackRequiredRef(refName),
      });
    },

    effect(run: (context: ClientContext<P, S, D>) => void | Cleanup) {
      return extend({
        effects: Object.freeze([...registrations.effects, freezeRecord({ run })]),
      });
    },

    connected(run: (context: ClientContext<P, S, D>) => void | Cleanup) {
      return extend({
        connecteds: Object.freeze([...registrations.connecteds, freezeRecord({ run })]),
      });
    },

    render(
      view: (context: ReactiveContext<P, S, D>) => MaybePromise<SafeHtml>,
    ): Component<P, S, D> {
      const definition: ComponentDefinition<P, S, D> = {
        name,
        contractVersion,
        requiredRefs: Object.freeze([...registrations.requiredRefs]),
        view,
        stateRegistrations: Object.freeze([...registrations.states]),
        derivedRegistrations: Object.freeze([...registrations.deriveds]),
        eventRegistrations: Object.freeze([...registrations.events]),
        bindingRegistrations: Object.freeze([...registrations.bindings]),
        effectRegistrations: Object.freeze([...registrations.effects]),
        connectedRegistrations: Object.freeze([...registrations.connecteds]),
      };
      return Object.freeze(definition);
    },
  }) as unknown as ComponentBuilder<P, S, D, Refs>;
}

export function component<P extends JsonObject = Record<string, never>>(
  name: string,
  options: ComponentOptions,
  // The empty-S/D base must be `{}` so `Exclude<K, keyof S>` keeps K.
): ComponentBuilder<P, {}, {}, {}> {
  if (typeof name !== "string" || name.trim() === "") {
    throw new TypeError("component() requires a non-empty component name");
  }
  if (typeof options?.contractVersion !== "string" || options.contractVersion.trim() === "") {
    throw new TypeError(`component("${name}") requires a non-empty options.contractVersion string`);
  }
  return makeBuilder(name, options.contractVersion, {
    states: Object.freeze([]),
    deriveds: Object.freeze([]),
    events: Object.freeze([]),
    bindings: Object.freeze([]),
    effects: Object.freeze([]),
    connecteds: Object.freeze([]),
    requiredRefs: Object.freeze([]),
  });
}
