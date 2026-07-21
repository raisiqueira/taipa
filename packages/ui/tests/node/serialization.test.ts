import { expect, test } from "vite-plus/test";
import { assertJsonSafe, toInertJson } from "../../src/server/json.ts";

// ---------------------------------------------------------------------------
// toInertJson: markup-significant characters can never break out of the
// <script type="application/json"> element (design 4.4 contract rule).
// ---------------------------------------------------------------------------

test("escapes angle brackets, ampersand, and the closing-script sequence", () => {
  const hostile = { xss: `</script><script>alert("x")</script> & <b>` };
  const json = toInertJson(hostile);
  expect(json).toBe(
    '{"xss":"\\u003c/script\\u003e\\u003cscript\\u003ealert(\\"x\\")\\u003c/script\\u003e \\u0026 \\u003cb\\u003e"}',
  );
  expect(json).not.toContain("</script");
  expect(json).not.toContain("<");
  expect(json).not.toContain(">");
  expect(json).not.toContain("&");
});

test("escapes U+2028 and U+2029 line separators", () => {
  const json = toInertJson({ line: "a\u2028b\u2029c" });
  expect(json).toBe('{"line":"a\\u2028b\\u2029c"}');
  expect(json).not.toContain("\u2028");
  expect(json).not.toContain("\u2029");
});

test("preserves non-ASCII characters literally", () => {
  const json = toInertJson({ name: "José 漢字 ✨" });
  expect(json).toBe('{"name":"José 漢字 ✨"}');
});

test("round-trips through JSON.parse to a deep-equal value", () => {
  const value = {
    text: `</script> & <>`,
    nested: { list: [1, "two", false, null, { deep: "x" }] },
    separators: "\u2028\u2029",
  };
  expect(JSON.parse(toInertJson(value))).toEqual(value);
});

// ---------------------------------------------------------------------------
// assertJsonSafe: accepts exactly the JSON domain
// ---------------------------------------------------------------------------

test("accepts primitives, plain objects, arrays, and null-prototype objects", () => {
  expect(() =>
    assertJsonSafe({
      string: "x",
      number: 3.5,
      boolean: true,
      null: null,
      array: [1, ["two"], { three: 3 }],
      plain: Object.assign(Object.create(null), { ok: 1 }),
      empty: {},
    }),
  ).not.toThrow();
  expect(() => assertJsonSafe("top-level string")).not.toThrow();
  expect(() => assertJsonSafe(null)).not.toThrow();
});

test("accepts diamond references and only rejects true cycles", () => {
  const shared = { value: 1 };
  expect(() => assertJsonSafe({ a: shared, b: shared })).not.toThrow();

  const cyclic: Record<string, unknown> = { name: "root" };
  cyclic.self = cyclic;
  expect(() => assertJsonSafe(cyclic)).toThrowError(TypeError);
  expect(() => assertJsonSafe(cyclic)).toThrow(/circular/i);
});

// ---------------------------------------------------------------------------
// assertJsonSafe: failures name the exact path (plan U3 scenario 4)
// ---------------------------------------------------------------------------

test("rejects undefined at the root, in objects, and in arrays with paths", () => {
  expect(() => assertJsonSafe(undefined)).toThrow(/^\$: .*undefined/);
  expect(() => assertJsonSafe({ user: { name: undefined } })).toThrow(/\$\.user\.name: /);
  expect(() => assertJsonSafe({ list: [1, undefined] })).toThrow(/\$\.list\[1\]: /);
});

test("rejects functions and symbols with their paths", () => {
  expect(() => assertJsonSafe({ onClick: () => {} })).toThrow(/\$\.onClick: .*function/);
  expect(() => assertJsonSafe({ id: Symbol("x") })).toThrow(/\$\.id: .*symbol/);
});

test("rejects non-finite numbers with their paths", () => {
  expect(() => assertJsonSafe({ score: Number.NaN })).toThrow(/\$\.score: .*non-finite/);
  expect(() => assertJsonSafe({ limits: [Number.POSITIVE_INFINITY] })).toThrow(
    /\$\.limits\[0\]: .*non-finite/,
  );
  expect(() => assertJsonSafe(Number.NEGATIVE_INFINITY)).toThrow(/^\$: .*non-finite/);
});

test("rejects class instances, dates, maps, and bigints with their paths", () => {
  class Widget {
    readonly kind = "widget";
  }
  expect(() => assertJsonSafe({ widget: new Widget() })).toThrow(/\$\.widget: .*Widget/);
  expect(() => assertJsonSafe({ at: new Date(0) })).toThrow(/\$\.at: .*Date/);
  expect(() => assertJsonSafe(new Map())).toThrow(/^\$: .*Map/);
  expect(() => assertJsonSafe({ big: 10n })).toThrow(/\$\.big: .*bigint/);
});

test("indirect cycles report the path where the cycle closes", () => {
  const inner: Record<string, unknown> = {};
  const outer = { level: { inner } };
  inner.back = outer;
  expect(() => assertJsonSafe(outer)).toThrow(/\$\.level\.inner\.back: .*circular/i);
});
