/**
 * Branded safe URLs (R4, KTD19).
 *
 * URL-bearing template attributes accept only values produced by this
 * factory. The default policy permits relative URLs plus `http:`, `https:`,
 * `mailto:`, and `tel:`. Anything with a different scheme, and any value
 * containing ASCII whitespace or control characters (which smuggle schemes
 * past naive prefix checks), is rejected.
 */
import type { SafeUrl } from "../types";

export interface SafeUrlOptions {
  readonly protocols?: readonly string[];
  readonly allowRelative?: boolean;
}

const DEFAULT_PROTOCOLS: readonly string[] = ["http:", "https:", "mailto:", "tel:"];

const SCHEME_PATTERN = /^([a-zA-Z][a-zA-Z0-9+.-]*):/;
// oxlint-disable-next-line no-control-regex -- rejecting control characters is the point
const FORBIDDEN_CHARACTERS = /[\x00-\x20\x7f]/;

/**
 * Runtime brand key. `Symbol.for` is realm-global, so the check keeps working
 * when esm.sh package-boundary bundling duplicates this module across entry
 * points. Plain objects carrying similar fields cannot be passed accidentally:
 * they lack the symbol key, and stamping it deliberately is equivalent to
 * calling the factory.
 */
const SAFE_URL_RUNTIME_BRAND = Symbol.for("taipa.ui/SafeUrl");

export function safeUrl(value: string, options?: SafeUrlOptions): SafeUrl {
  if (typeof value !== "string") {
    throw new TypeError(`safeUrl() expects a string, received ${typeof value}`);
  }
  if (FORBIDDEN_CHARACTERS.test(value)) {
    throw new Error("safeUrl() rejects URLs containing whitespace or control characters");
  }

  const scheme = SCHEME_PATTERN.exec(value)?.[1]?.toLowerCase();
  if (scheme === undefined) {
    if (options?.allowRelative === false) {
      throw new Error(`safeUrl() rejects relative URLs when allowRelative is false: "${value}"`);
    }
  } else {
    const protocols = (options?.protocols ?? DEFAULT_PROTOCOLS).map((protocol) =>
      protocol.toLowerCase(),
    );
    if (!protocols.includes(`${scheme}:`)) {
      throw new Error(
        `safeUrl() rejects the protocol "${scheme}:"; allowed protocols: ${protocols.join(", ")}`,
      );
    }
  }

  return Object.freeze({
    value,
    __brand: "SafeUrl",
    [SAFE_URL_RUNTIME_BRAND]: true,
  }) as unknown as SafeUrl;
}

export function isSafeUrl(input: unknown): input is SafeUrl {
  return (
    typeof input === "object" &&
    input !== null &&
    (input as Record<PropertyKey, unknown>)[SAFE_URL_RUNTIME_BRAND] === true &&
    typeof (input as { value?: unknown }).value === "string"
  );
}
