// Compile-time-only builder assertions. `tests/types` is covered by the
// package tsconfig but excluded from all Vitest project globs.
import { component } from "../../src/component";
import { raw } from "../../src/template/html";

function assertType<T>(_value: T): void {}

export const inferredRefs = component("InferredRefs")
  .bind("count", (context) => {
    assertType<Element>(context.element);
    assertType<Element>(context.refs.one("count"));
    // @ts-expect-error one() rejects undeclared names.
    context.refs.one("missing");
  })
  .on("save@click", (context) => {
    assertType<PointerEvent>(context.event);
    assertType<Element>(context.target);
    assertType<Element>(context.refs.one("save"));
    // @ts-expect-error one() rejects undeclared names inside event handlers.
    context.refs.one("missing");
  })
  .on("@keydown", (context) => {
    assertType<KeyboardEvent>(context.event);
    assertType<HTMLElement>(context.target);
  })
  .effect((context) => {
    assertType<Element>(context.refs.one("count"));
    assertType<Element | null>(context.refs.optional("maybe"));
    assertType<readonly Element[]>(context.refs.all("items"));
  })
  .connected((context) => {
    assertType<Element>(context.refs.one("save"));
  })
  .render(() => raw(""));

export const typedRefs = component("TypedRefs")
  .bind<"count", HTMLOutputElement>("count", (context) => {
    assertType<HTMLOutputElement>(context.element);
    assertType<HTMLOutputElement>(context.refs.one("count"));
  })
  .on<"save@click", PointerEvent, HTMLButtonElement>("save@click", (context) => {
    assertType<HTMLButtonElement>(context.target);
    assertType<HTMLButtonElement>(context.refs.one("save"));
  })
  .effect((context) => {
    assertType<HTMLOutputElement>(context.refs.one("count"));
    assertType<HTMLButtonElement>(context.refs.one("save"));
  })
  .render(() => raw(""));

export const preservedRef = component("PreservedRef")
  .bind<"save", HTMLButtonElement>("save", (context) => {
    assertType<HTMLButtonElement>(context.element);
  })
  .on("save@click", (context) => {
    assertType<HTMLButtonElement>(context.target);
    assertType<HTMLButtonElement>(context.refs.one("save"));
  })
  .render(() => raw(""));

export const replacedRef = component("ReplacedRef")
  .bind<"save", HTMLButtonElement>("save", () => {})
  .bind<"save", HTMLInputElement>("save", (context) => {
    assertType<HTMLInputElement>(context.element);
    assertType<HTMLInputElement>(context.refs.one("save"));
  })
  .render(() => raw(""));

export const unknownEvent = component("UnknownEvent")
  .on("save@customthing", (context) => {
    assertType<Event>(context.event);
  })
  .render(() => raw(""));

export const explicitEvent = component("ExplicitEvent")
  .on<"save@customthing", CustomEvent>("save@customthing", (context) => {
    assertType<CustomEvent>(context.event);
    assertType<Element>(context.refs.one("save"));
  })
  .render(() => raw(""));

// @ts-expect-error known native events cannot be overridden incompatibly.
component("InvalidEventOverride").on<"save@click", KeyboardEvent>("save@click", () => {});

const malformedSpecs = component("MalformedSpecs");
// @ts-expect-error malformed specs are rejected before runtime parsing.
malformedSpecs.on("save@", () => {});
// @ts-expect-error malformed specs are rejected before runtime parsing.
malformedSpecs.on("save@click@extra", () => {});
