// Compile-time only assertions for the spec-parsing conditional types.
import type { EventFor, EventForSpec, OnSpec, ParseEvent, ParseRef } from "../../src/types";

type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;

// Ref segments and host-targeted specs.
export type RefSave = Assert<Equal<ParseRef<"save@click">, "save">>;
export type RefHyphen = Assert<Equal<ParseRef<"my-ref@click">, "my-ref">>;
export type RefHost = Assert<Equal<ParseRef<"@keydown">, never>>;
export type RefInput = Assert<Equal<ParseRef<"count@input">, "count">>;

// Event segments and HTMLElementEventMap lookup.
export type EventClick = Assert<Equal<ParseEvent<"save@click">, "click">>;
export type EventKeydown = Assert<Equal<ParseEvent<"@keydown">, "keydown">>;
export type LookupClick = Assert<Equal<EventFor<"click">, PointerEvent>>;
export type LookupKeydown = Assert<Equal<EventFor<"keydown">, KeyboardEvent>>;
export type LookupUnknown = Assert<Equal<EventFor<"customthing">, Event>>;
export type SpecClick = Assert<Equal<EventForSpec<"save@click">, PointerEvent>>;
export type SpecKeydown = Assert<Equal<EventForSpec<"@keydown">, KeyboardEvent>>;
export type SpecUnknown = Assert<Equal<EventForSpec<"save@customthing">, Event>>;

// Malformed specs mirror the runtime parser by resolving to never.
export type MultipleAtRef = Assert<Equal<ParseRef<"a@b@click">, never>>;
export type EmptyEventRef = Assert<Equal<ParseRef<"save@">, never>>;
export type MultipleAtEvent = Assert<Equal<ParseEvent<"a@b@click">, never>>;
export type EmptyEvent = Assert<Equal<ParseEvent<"save@">, never>>;
export type MultipleAtSpec = Assert<Equal<EventForSpec<"a@b@click">, never>>;
export type EmptyEventSpec = Assert<Equal<EventForSpec<"save@">, never>>;

export type RefSpec = Assert<"save@click" extends OnSpec ? true : false>;
export type HostSpec = Assert<"@keydown" extends OnSpec ? true : false>;
