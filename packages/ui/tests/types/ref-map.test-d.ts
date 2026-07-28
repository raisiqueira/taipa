// Compile-time only assertions for `RefMap<Refs>`.
import type { RefElement, RefMap } from "../../src/types";

type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;

type SaveRefs = { save: HTMLButtonElement };
type SaveMap = RefMap<SaveRefs>;
type BareMap = RefMap;

// Strict one() accepts declared names and returns their element type.
export type OneName = Assert<Equal<Parameters<SaveMap["one"]>[0], "save">>;
export type OneResult = Assert<Equal<RefElement<SaveRefs, "save">, HTMLButtonElement>>;

// Permissive optional()/all() preserve a declared type or fall back to Element.
export type OptionalKnown = Assert<
  Equal<RefElement<SaveRefs, "save"> | null, HTMLButtonElement | null>
>;
export type OptionalUnknown = Assert<Equal<RefElement<SaveRefs, "maybe"> | null, Element | null>>;
export type AllKnown = Assert<
  Equal<readonly RefElement<SaveRefs, "save">[], readonly HTMLButtonElement[]>
>;
export type AllUnknown = Assert<
  Equal<readonly RefElement<SaveRefs, "items">[], readonly Element[]>
>;

// Bare RefMap preserves today's permissive string/Element behavior.
export type BareOneName = Assert<Equal<Parameters<BareMap["one"]>[0], string>>;
export type BareOneResult = Assert<Equal<RefElement<Record<string, Element>, "anything">, Element>>;

declare const save: SaveMap;
const optionalKnown = save.optional("save");
const optionalUnknown = save.optional("maybe");
const allKnown = save.all("save");
const allUnknown = save.all("items");
export type OptionalKnownResult = Assert<Equal<typeof optionalKnown, HTMLButtonElement | null>>;
export type OptionalUnknownResult = Assert<Equal<typeof optionalUnknown, Element | null>>;
export type AllKnownResult = Assert<Equal<typeof allKnown, readonly HTMLButtonElement[]>>;
export type AllUnknownResult = Assert<Equal<typeof allUnknown, readonly Element[]>>;

// @ts-expect-error one() accepts only names declared in Refs.
save.one("missing");
// @ts-expect-error known refs cannot be asserted as incompatible element types.
save.one<HTMLInputElement>("save");
