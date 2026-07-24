/**
 * Scoped ref collection (design 2.3/2.4).
 *
 * A single TreeWalker traversal gathers `data-taipa-ref` elements inside a
 * host. Nested `<taipa-island>` subtrees are hard boundaries: their interiors
 * are rejected outright, so a parent island never observes (or interferes
 * with) a nested island's refs, and repeated names across island boundaries
 * stay independent.
 *
 * `.bind()`/`.on()` refs are singular by contract; repetition is only
 * reachable through `refs.all()` inside `.connected()`/`.effect()`. Singular
 * validation runs here, once, as part of the atomic preflight — before any
 * listener is attached or binding applied (KTD7/AE2).
 */
import type { RefMap } from "../types";
import { ISLAND_TAG } from "../server/attributes";

const REF_ATTRIBUTE = "data-taipa-ref";

export interface CollectedRefs {
  readonly byName: ReadonlyMap<string, readonly Element[]>;
}

export function collectRefs(host: Element): CollectedRefs {
  const byName = new Map<string, Element[]>();
  const document = host.ownerDocument;
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_ELEMENT, {
    acceptNode(node) {
      const element = node as Element;
      if (element.tagName === ISLAND_TAG.toUpperCase()) {
        // Nested island: reject the whole subtree so its interior is never
        // traversed from the parent scope.
        return NodeFilter.FILTER_REJECT;
      }
      return element.hasAttribute(REF_ATTRIBUTE)
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_SKIP;
    },
  });
  let current = walker.nextNode();
  while (current !== null) {
    const name = (current as Element).getAttribute(REF_ATTRIBUTE) ?? "";
    if (name !== "") {
      const list = byName.get(name);
      if (list === undefined) {
        byName.set(name, [current as Element]);
      } else {
        list.push(current as Element);
      }
    }
    current = walker.nextNode();
  }
  return { byName };
}

export function assertRequiredRefs(
  refs: CollectedRefs,
  requiredRefs: readonly string[],
  componentName: string,
): void {
  for (const name of requiredRefs) {
    const count = refs.byName.get(name)?.length ?? 0;
    if (count === 0) {
      throw new Error(
        `component "${componentName}" requires ref "${name}" but it is missing from the island markup`,
      );
    }
    if (count > 1) {
      throw new Error(
        `component "${componentName}" requires singular ref "${name}" but ${count} matches were found; ` +
          "bound/on refs must appear exactly once per island",
      );
    }
  }
}

/**
 * Resolve a ref that preflight has already validated as singular (required
 * refs for `.bind()`/`.on()`). A mismatch here means the island markup
 * changed between collection and attachment, which is a runtime defect.
 */
export function elementForRef(refs: CollectedRefs, name: string): Element {
  const matches = refs.byName.get(name) ?? [];
  if (matches.length !== 1) {
    throw new Error(`ref "${name}" must resolve to exactly one element`);
  }
  return matches[0] as Element;
}

export function createRefMap(refs: CollectedRefs): RefMap {
  const singular = (name: string): Element => {
    const matches = refs.byName.get(name) ?? [];
    if (matches.length === 1) {
      return matches[0] as Element;
    }
    if (matches.length === 0) {
      throw new Error(`ref "${name}" does not exist in this island`);
    }
    throw new Error(
      `ref "${name}" is not singular (${matches.length} matches in this island); use refs.all("${name}") instead`,
    );
  };
  return {
    one<T extends Element = Element>(name: string): T {
      return singular(name) as T;
    },
    optional<T extends Element = Element>(name: string): T | null {
      const matches = refs.byName.get(name) ?? [];
      if (matches.length === 0) {
        return null;
      }
      return singular(name) as T;
    },
    all<T extends Element = Element>(name: string): readonly T[] {
      return Object.freeze([...(refs.byName.get(name) ?? [])]) as readonly T[];
    },
  };
}
