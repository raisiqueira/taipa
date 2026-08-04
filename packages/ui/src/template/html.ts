/**
 * The server-safe `html` tagged template.
 *
 * Interpolation is allowlist-based (see `./context.ts`): text content and
 * inert quoted attributes are escaped, URL-bearing attributes require branded
 * `SafeUrl` values, and executable or compound grammars throw before any
 * output is produced. The result is an opaque branded `SafeHtml`.
 *
 * `raw()` marks already-sanitized or fully trusted markup as safe. It is
 * intentionally alarming; never pass user-controlled input.
 */
import type { SafeHtml } from "../types";
import { classifyAttribute, createTemplateScanner, type InterpolationContext } from "./context";
import { escapeAttribute, escapeText } from "./escape";
import { isSafeUrl } from "./safe-url";

/**
 * Runtime brand key. See `./safe-url.ts` for why `Symbol.for` is used; plain
 * objects carrying similar fields are rejected because they lack this key.
 */
const SAFE_HTML_RUNTIME_BRAND = Symbol.for("taipa.ui/SafeHtml");

function brandSafeHtml(value: string): SafeHtml {
  return Object.freeze({
    value,
    __brand: "SafeHtml",
    [SAFE_HTML_RUNTIME_BRAND]: true,
  }) as unknown as SafeHtml;
}

export function isSafeHtml(input: unknown): input is SafeHtml {
  return (
    typeof input === "object" &&
    input !== null &&
    (input as Record<PropertyKey, unknown>)[SAFE_HTML_RUNTIME_BRAND] === true &&
    typeof (input as { value?: unknown }).value === "string"
  );
}

export function raw(trustedHtml: string): SafeHtml {
  if (typeof trustedHtml !== "string") {
    throw new TypeError(`raw() expects a string, received ${typeof trustedHtml}`);
  }
  return brandSafeHtml(trustedHtml);
}

export function repeat<T>(
  items: Iterable<T>,
  render: (item: T, index: number) => SafeHtml,
): SafeHtml {
  if (
    items === null ||
    typeof (items as { [Symbol.iterator]?: unknown })[Symbol.iterator] !== "function"
  ) {
    throw new TypeError("repeat() expects a synchronous iterable");
  }
  if (typeof render !== "function") {
    throw new TypeError("repeat() expects a render callback");
  }

  let output = "";
  let index = 0;
  for (const item of items) {
    const rendered = render(item, index);
    if (!isSafeHtml(rendered)) {
      throw new TypeError("repeat() callback must return SafeHtml from html() or raw()");
    }
    output += rendered.value;
    index += 1;
  }
  return brandSafeHtml(output);
}

function renderTextValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return escapeText(value);
  }
  if (typeof value === "number" || typeof value === "bigint" || typeof value === "boolean") {
    return escapeText(String(value));
  }
  if (Array.isArray(value)) {
    return value.map((item) => renderTextValue(item)).join("");
  }
  if (isSafeHtml(value)) {
    return value.value;
  }
  if (isSafeUrl(value)) {
    return escapeText(value.value);
  }
  throw new TypeError(
    `unsupported interpolation type in text content: ${describe(value)}; ` +
      "expected a string, number, boolean, nullish value, array, SafeHtml, or SafeUrl",
  );
}

function renderInertAttributeValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return escapeAttribute(value);
  }
  if (typeof value === "number" || typeof value === "bigint" || typeof value === "boolean") {
    return escapeAttribute(String(value));
  }
  if (Array.isArray(value)) {
    return value.map((item) => renderInertAttributeValue(item)).join("");
  }
  if (isSafeHtml(value)) {
    throw new TypeError("SafeHtml is only valid in child content positions, not in attributes");
  }
  if (isSafeUrl(value)) {
    throw new TypeError("SafeUrl is only valid in URL-bearing attributes, not inert attributes");
  }
  throw new TypeError(
    `unsupported interpolation type in an attribute: ${describe(value)}; ` +
      "expected a string, number, boolean, nullish value, or array",
  );
}

function renderUrlAttributeValue(name: string, value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (isSafeUrl(value)) {
    return escapeAttribute(value.value);
  }
  throw new TypeError(
    `URL-bearing attribute "${name}" requires a branded SafeUrl from safeUrl(); ` +
      "plain strings are rejected",
  );
}

function renderInterpolation(context: InterpolationContext, value: unknown): string {
  if (context.kind === "forbidden") {
    throw new Error(`html: ${context.reason}`);
  }
  if (context.kind === "text") {
    return renderTextValue(value);
  }
  const attributeClass = classifyAttribute(context.name);
  if (attributeClass === "rejected") {
    throw new Error(
      `html: attribute "${context.name}" is not an allowlisted interpolation context ` +
        "(event handlers, style, srcdoc, srcset, meta content, and other compound or " +
        "executable grammars are rejected)",
    );
  }
  if (attributeClass === "url") {
    return renderUrlAttributeValue(context.name, value);
  }
  return renderInertAttributeValue(value);
}

function describe(value: unknown): string {
  if (typeof value !== "object" || value === null) {
    return typeof value;
  }
  if (typeof (value as { __brand?: unknown }).__brand === "string") {
    return `a plain object with __brand "${(value as { __brand: string }).__brand}" (forged brands are rejected)`;
  }
  return Object.prototype.toString.call(value);
}

export function html(strings: TemplateStringsArray, ...values: readonly unknown[]): SafeHtml {
  const scanner = createTemplateScanner();
  let output = "";
  for (let index = 0; index < strings.length; index += 1) {
    const segment = strings[index] ?? "";
    scanner.advance(segment);
    output += segment;
    if (index < values.length) {
      output += renderInterpolation(scanner.interpolationContext(), values[index]);
    }
  }
  return brandSafeHtml(output);
}
