/**
 * Lookup recording and unused-ref warn-once do not need a live document.
 * Browser coverage for the same helpers lives in tests/browser/refs.test.ts.
 */
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import {
  createRefMap,
  lookedUpRefNames,
  warnUnusedCollectedRefs,
  warnUnusedRef,
} from "../../src/client/refs";

function emptyRefs() {
  return createRefMap({ byName: new Map() });
}

describe("lookedUpRefNames", () => {
  test("records every lookup argument, including misses and throws", () => {
    const refs = emptyRefs();
    expect(refs.optional("form")).toBeNull();
    expect(refs.all("rows")).toEqual([]);
    expect(() => refs.one("absent")).toThrowError(/"absent"/);
    expect([...lookedUpRefNames(refs)]).toEqual(["form", "rows", "absent"]);
  });
});

describe("warnUnusedRef", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("warns once per component, kind, and leftover name", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    warnUnusedRef("WarnOnceNodeAlpha", "dead");
    warnUnusedRef("WarnOnceNodeAlpha", "dead");
    warnUnusedRef("WarnOnceNodeAlpha", "other");
    expect(warn.mock.calls).toEqual([
      [
        '[Taipa] component "WarnOnceNodeAlpha" has unused data-taipa-ref="dead"; check the island markup',
      ],
      [
        '[Taipa] component "WarnOnceNodeAlpha" has unused data-taipa-ref="other"; check the island markup',
      ],
    ]);
  });
});

describe("warnUnusedCollectedRefs", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function collected(...names: string[]) {
    const byName = new Map<string, readonly Element[]>();
    for (const name of names) {
      byName.set(name, [{} as Element]);
    }
    return { byName };
  }

  test("warns leftover names and stays silent for required or looked-up names", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    warnUnusedCollectedRefs(
      collected("save", "form", "from"),
      ["save"],
      ["form"],
      "WarnOnceNodeBeta",
    );
    expect(warn.mock.calls).toEqual([
      [
        '[Taipa] component "WarnOnceNodeBeta" has unused data-taipa-ref="from"; check the island markup',
      ],
    ]);
  });

  test("swallows a throwing console.warn", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {
      throw new Error("warn boom");
    });
    expect(() =>
      warnUnusedCollectedRefs(collected("orphan-throw"), [], [], "WarnOnceNodeGamma"),
    ).not.toThrow();
  });
});
