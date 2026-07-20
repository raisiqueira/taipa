/**
 * Shared public types for Taipa's universal entry point.
 *
 * These types are DOM-free at runtime: `Element`/`HTMLElement` appear only in
 * type positions, so importing this module (or the root entry) never touches
 * DOM or Node globals.
 */

export type MaybePromise<T> = T | Promise<T>;
export type Cleanup = () => void;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };
export type JsonObject = { readonly [key: string]: JsonValue };

export type Signal<T> = {
  (): T;
  (value: T): void;
};

export type ReadSignal<T> = () => T;
export type StateSignals<S> = { readonly [K in keyof S]: Signal<S[K]> };
export type DerivedSignals<D> = { readonly [K in keyof D]: ReadSignal<D[K]> };

/**
 * Nominal brands. Declared but never assigned a runtime value, so consumers
 * cannot name the property key and structurally forge a safe value; only the
 * factories (`html`, `raw`, `safeUrl`) can produce instances that type-check.
 * At runtime the factories also stamp a `Symbol.for` key so brand checks keep
 * working when esm.sh package-boundary bundling duplicates this module across
 * entry points.
 */
export declare const safeHtmlBrand: unique symbol;
export declare const safeUrlBrand: unique symbol;

export interface SafeHtml {
  readonly value: string;
  readonly __brand: "SafeHtml";
  readonly [safeHtmlBrand]: true;
}

export interface SafeUrl {
  readonly value: string;
  readonly __brand: "SafeUrl";
  readonly [safeUrlBrand]: true;
}

export interface RefMap {
  one<T extends Element = Element>(name: string): T;
  optional<T extends Element = Element>(name: string): T | null;
  all<T extends Element = Element>(name: string): readonly T[];
}

export interface ReactiveContext<P, S, D> {
  readonly props: Readonly<P>;
  readonly state: StateSignals<S>;
  readonly derived: DerivedSignals<D>;
}

export interface ClientContext<P, S, D> extends ReactiveContext<P, S, D> {
  readonly host: HTMLElement;
  readonly refs: RefMap;
  readonly signal: AbortSignal;
}

// oxlint-disable-next-line no-unused-vars -- phantom params carry P/S/D identity for renderer and hydration signatures
export interface Component<P, S, D> {
  readonly name: string;
  readonly contractVersion: string;
  readonly requiredRefs: readonly string[];
}
