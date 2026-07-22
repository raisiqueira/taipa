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

// oxlint-disable-next-line no-unused-vars, no-explicit-any -- phantom params carry P/S/D identity; bare Component reads as an opaque handle
export interface Component<P = any, S = any, D = any> {
  readonly name: string;
  readonly contractVersion: string;
  readonly requiredRefs: readonly string[];
}

export interface HydrateOptions<P, S> {
  readonly props?: P;
  readonly state?: Partial<S>;
}

export interface MountOptions<P, S> extends HydrateOptions<P, S> {
  readonly replace?: boolean;
}

// oxlint-disable-next-line no-explicit-any -- bare ComponentInstance reads as an opaque handle
export interface ComponentInstance<P = any, S = any, D = any> {
  readonly host: HTMLElement;
  readonly props: Readonly<P>;
  readonly state: StateSignals<S>;
  readonly derived: DerivedSignals<D>;
  destroy(): void;
}

export type ComponentLoader = () => Promise<Record<string, unknown>>;

export interface RegistryEntry {
  readonly load: ComponentLoader;
  readonly exportName?: string;
}

export type ComponentRegistry = Readonly<Record<string, ComponentLoader | RegistryEntry>>;

export interface BootstrapOptions {
  readonly root?: ParentNode;
  readonly registry?: ComponentRegistry;
  readonly observe?: boolean;
  readonly resolveDomModule?: (specifier: string, host: HTMLElement) => ComponentLoader | null;
  readonly onError?: (error: unknown, host: HTMLElement) => void;
}

export interface BootstrapHandle {
  scan(root?: ParentNode): void;
  destroy(): void;
}

export type FormErrors = Readonly<Record<string, readonly string[]>>;
export type ValidationMode = "submit" | "blur" | "input";

export interface FormReadContext {
  readonly form: HTMLFormElement;
  readonly formData: FormData;
}

export interface FormValidationContext<T> {
  readonly form: HTMLFormElement;
  readonly values: Readonly<T>;
  readonly formData: FormData;
  readonly signal: AbortSignal;
}

export interface FormSubmitContext<T> extends FormValidationContext<T> {
  setErrors(errors: FormErrors): void;
}

export interface CreateFormOptions<T> {
  readonly read: (context: FormReadContext) => T;
  readonly validate?: (context: FormValidationContext<T>) => MaybePromise<FormErrors | void>;
  readonly mode?: ValidationMode;
  readonly submit?: (context: FormSubmitContext<T>) => MaybePromise<void>;
}

export interface FormController<T> {
  readonly values: ReadSignal<Readonly<T>>;
  readonly errors: ReadSignal<FormErrors>;
  readonly dirty: ReadSignal<boolean>;
  readonly touched: ReadSignal<ReadonlySet<string>>;
  readonly validating: ReadSignal<boolean>;
  readonly submitting: ReadSignal<boolean>;
  readonly valid: ReadSignal<boolean>;
  validate(fieldNames?: readonly string[]): Promise<boolean>;
  setErrors(errors: FormErrors): void;
  setValue(name: string, value: string | File | readonly string[]): void;
  reset(): void;
  destroy(): void;
}
