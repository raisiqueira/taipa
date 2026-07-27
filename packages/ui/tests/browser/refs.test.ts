/**
 * Scoped ref collection: one traversal that gathers
 * data-taipa-ref elements inside a host while never crossing into nested
 * island interiors. Nested islands own their refs independently, so the
 * parent must not see them (and vice versa).
 */
import { describe, expect, test } from "vite-plus/test";
import { assertRequiredRefs, collectRefs, createRefMap } from "../../src/client/refs";

function hostFrom(markup: string): HTMLElement {
  const template = document.createElement("template");
  template.innerHTML = markup;
  const host = template.content.firstElementChild;
  if (!(host instanceof HTMLElement)) {
    throw new Error("test markup must produce one root element");
  }
  return host;
}

describe("collectRefs", () => {
  test("collects refs at any depth inside the host, in document order", () => {
    const host = hostFrom(`<taipa-island>
      <button data-taipa-ref="save">save</button>
      <section><p><span data-taipa-ref="label">hi</span></p></section>
      <footer><button data-taipa-ref="save">save2</button></footer>
    </taipa-island>`);
    const refs = collectRefs(host);
    expect(refs.byName.get("save")?.length).toBe(2);
    expect(refs.byName.get("label")?.length).toBe(1);
    const saves = refs.byName.get("save") ?? [];
    expect(saves[0]?.textContent).toBe("save");
    expect(saves[1]?.textContent).toBe("save2");
  });

  test("never crosses into nested island interiors", () => {
    const host = hostFrom(`<taipa-island>
      <span data-taipa-ref="outer">o</span>
      <taipa-island>
        <span data-taipa-ref="inner">i</span>
        <div><span data-taipa-ref="outer">shadowed</span></div>
        <taipa-island><span data-taipa-ref="deep">d</span></taipa-island>
      </taipa-island>
      <span data-taipa-ref="outer">o2</span>
    </taipa-island>`);
    const refs = collectRefs(host);
    expect(refs.byName.has("inner")).toBe(false);
    expect(refs.byName.has("deep")).toBe(false);
    const outers = refs.byName.get("outer") ?? [];
    expect(outers.map((element) => element.textContent)).toEqual(["o", "o2"]);
  });

  test("the host element itself is not collected even if it carries a ref", () => {
    const host = hostFrom(
      `<taipa-island data-taipa-ref="self"><span data-taipa-ref="child">c</span></taipa-island>`,
    );
    const refs = collectRefs(host);
    expect(refs.byName.has("self")).toBe(false);
    expect(refs.byName.get("child")?.length).toBe(1);
  });

  test("ignores empty ref names", () => {
    const host = hostFrom(
      `<taipa-island><span data-taipa-ref="">x</span><span data-taipa-ref="real">y</span></taipa-island>`,
    );
    const refs = collectRefs(host);
    expect(refs.byName.has("")).toBe(false);
    expect(refs.byName.get("real")?.length).toBe(1);
  });
});

describe("assertRequiredRefs", () => {
  test("passes when every required ref exists exactly once", () => {
    const host = hostFrom(`<taipa-island>
      <button data-taipa-ref="save">s</button>
      <span data-taipa-ref="label">l</span>
      <i data-taipa-ref="extra">e</i><i data-taipa-ref="extra">e2</i>
    </taipa-island>`);
    expect(() => assertRequiredRefs(collectRefs(host), ["save", "label"], "widget")).not.toThrow();
  });

  test("throws naming component and ref when a required ref is missing", () => {
    const host = hostFrom(`<taipa-island><span data-taipa-ref="label">l</span></taipa-island>`);
    expect(() => assertRequiredRefs(collectRefs(host), ["save"], "widget")).toThrowError(
      /"widget"[\s\S]*"save"|"save"[\s\S]*"widget"/,
    );
  });

  test("throws when a required ref is duplicated", () => {
    const host = hostFrom(`<taipa-island>
      <button data-taipa-ref="save">1</button><button data-taipa-ref="save">2</button>
    </taipa-island>`);
    expect(() => assertRequiredRefs(collectRefs(host), ["save"], "widget")).toThrowError(/"save"/);
  });
});

describe("createRefMap", () => {
  const host = hostFrom(`<taipa-island>
    <button data-taipa-ref="save">s</button>
    <i data-taipa-ref="dot">1</i><i data-taipa-ref="dot">2</i><i data-taipa-ref="dot">3</i>
  </taipa-island>`);
  const refs = createRefMap(collectRefs(host));

  test("one() returns the single element and throws for missing or repeated names", () => {
    expect(refs.one("save").textContent).toBe("s");
    expect(() => refs.one("missing")).toThrowError(/"missing"/);
    expect(() => refs.one("dot")).toThrowError(/"dot"/);
  });

  test("optional() returns element, null, or throws for repeated names", () => {
    expect(refs.optional("save")?.textContent).toBe("s");
    expect(refs.optional("missing")).toBeNull();
    expect(() => refs.optional("dot")).toThrowError(/"dot"/);
  });

  test("all() returns every match in document order and an empty array for unknown names", () => {
    expect(refs.all("dot").map((element) => element.textContent)).toEqual(["1", "2", "3"]);
    expect(refs.all("unknown")).toEqual([]);
  });
});
