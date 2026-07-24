/**
 * JSON serialization for island props/state scripts (design 4.4).
 *
 * Two guarantees:
 *
 * - `toInertJson` output is inert inside `<script type="application/json">`:
 *   `<`, `>`, `&`, U+2028, and U+2029 are escaped as unicode sequences, so no
 *   payload can close the script element early or produce invalid JS when the
 *   script is ever evaluated as classic script. Escaping `<` also covers the
 *   `</script` sequence.
 * - `assertJsonSafe` rejects every value JSON cannot represent faithfully
 *   (undefined, functions, symbols, bigints, non-finite numbers, class
 *   instances, cycles) with an error naming the exact path, so a hostile or
 *   buggy payload fails at render time instead of silently degrading.
 */
import type { JsonValue } from "../types";

const INERT_ESCAPES: Record<string, string> = {
  "<": "\\u003c",
  ">": "\\u003e",
  "&": "\\u0026",
  "\u2028": "\\u2028",
  "\u2029": "\\u2029",
};

export function toInertJson(value: JsonValue): string {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (char) => INERT_ESCAPES[char] ?? char);
}

function formatPath(base: string, key: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(key) ? `${base}.${key}` : `${base}[${JSON.stringify(key)}]`;
}

function describeUnsupported(value: object): string {
  const name = value.constructor?.name;
  return typeof name === "string" && name !== ""
    ? `non-plain object (${name}) is not JSON-safe`
    : "non-plain object is not JSON-safe";
}

function walk(value: unknown, path: string, visiting: Set<object>): void {
  if (value === null) {
    return;
  }
  switch (typeof value) {
    case "string":
    case "boolean":
      return;
    case "number":
      if (!Number.isFinite(value)) {
        throw new TypeError(`${path}: non-finite number is not JSON-safe`);
      }
      return;
    case "undefined":
      throw new TypeError(`${path}: undefined is not JSON-safe`);
    case "function":
      throw new TypeError(`${path}: function is not JSON-safe`);
    case "symbol":
      throw new TypeError(`${path}: symbol is not JSON-safe`);
    case "bigint":
      throw new TypeError(`${path}: bigint is not JSON-safe`);
    case "object": {
      if (visiting.has(value)) {
        throw new TypeError(`${path}: circular reference is not JSON-safe`);
      }
      const prototype: unknown = Object.getPrototypeOf(value);
      const isPlain = prototype === null || prototype === Object.prototype;
      if (!Array.isArray(value) && !isPlain) {
        throw new TypeError(`${path}: ${describeUnsupported(value)}`);
      }
      visiting.add(value);
      try {
        if (Array.isArray(value)) {
          for (const [index, entry] of value.entries()) {
            walk(entry, `${path}[${index}]`, visiting);
          }
        } else {
          for (const [key, entry] of Object.entries(value)) {
            walk(entry, formatPath(path, key), visiting);
          }
        }
      } finally {
        // Unwind on the way out so diamond references (the same object in two
        // branches, which JSON duplicates happily) are not mistaken for cycles.
        visiting.delete(value);
      }
      return;
    }
  }
}

export function assertJsonSafe(value: unknown, path = "$"): void {
  walk(value, path, new Set());
}
