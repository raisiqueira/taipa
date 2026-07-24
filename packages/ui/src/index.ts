/**
 * `@taipa/ui` — the universal entry point (R1, R3–R4, R15; design 3.2).
 *
 * Universal component definitions, the safe `html` template, branded safe
 * values, and the alien-signals reactivity surface. This module is DOM-free
 * and performs no work at import time (AE9): no `window`/`document` access,
 * no Node imports, no auto-bootstrap.
 */
export type {
  Cleanup,
  ClientContext,
  Component,
  DerivedSignals,
  JsonObject,
  JsonPrimitive,
  JsonValue,
  MaybePromise,
  ReactiveContext,
  ReadSignal,
  RefMap,
  SafeHtml,
  SafeUrl,
  Signal,
  StateSignals,
} from "./types";

export { component } from "./component";
export type { ComponentOptions } from "./component";

export { html, raw } from "./template/html";
export { safeUrl } from "./template/safe-url";
export type { SafeUrlOptions } from "./template/safe-url";

export { batch, computed, effect, effectScope, signal } from "./reactivity";
