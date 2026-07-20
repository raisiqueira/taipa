/**
 * Tagged-template context scanner (KTD19).
 *
 * The scanner advances over each static template segment and reports the
 * context in which the following interpolation lands. Interpolation is
 * allowlist-based:
 *
 * - **Text content** — escaped; nested `SafeHtml`, arrays, and nullish values
 *   are handled by `html()`.
 * - **Inert quoted attributes** — escaped. Allowlist:
 *   - exact: `id`, `class`, `title`, `alt`, `placeholder`, `value`, `role`,
 *     `type`, `name`, `for`, `slot`
 *   - prefixes: `aria-*`, `data-*`
 * - **URL-bearing attributes** — value must be a branded `SafeUrl`. Allowlist:
 *   `href`, `src`, `action`, `formaction`, `poster`, `cite`, `background`,
 *   `data` (on `<object>`), `longdesc`, `xlink:href`.
 *
 * Everything else is rejected before any output is produced: event handlers
 * (`on*`), `style`, `srcdoc`, `srcset`, meta-refresh `content`, raw-text
 * element content (`script`, `style`, `textarea`, `title`), unquoted
 * attributes, dynamic tag or attribute names, and HTML comments.
 */

export type InterpolationContext =
  | { readonly kind: "text" }
  | { readonly kind: "attribute"; readonly name: string; readonly tagName: string }
  | { readonly kind: "forbidden"; readonly reason: string };

export type AttributeClass = "inert" | "url" | "rejected";

const RAW_TEXT_ELEMENTS = new Set(["script", "style", "textarea", "title"]);

const INERT_ATTRIBUTES = new Set([
  "id",
  "class",
  "title",
  "alt",
  "placeholder",
  "value",
  "role",
  "type",
  "name",
  "for",
  "slot",
]);

const URL_ATTRIBUTES = new Set([
  "href",
  "src",
  "action",
  "formaction",
  "poster",
  "cite",
  "background",
  "data",
  "longdesc",
  "xlink:href",
]);

export function classifyAttribute(name: string): AttributeClass {
  const lowered = name.toLowerCase();
  if (URL_ATTRIBUTES.has(lowered)) {
    return "url";
  }
  if (INERT_ATTRIBUTES.has(lowered) || lowered.startsWith("aria-") || lowered.startsWith("data-")) {
    return "inert";
  }
  return "rejected";
}

type Mode = "text" | "tag" | "attrDq" | "attrSq" | "attrUq" | "comment";

const ASCII_LETTER = /[a-zA-Z]/;
const TAG_NAME_CHAR = /[a-zA-Z0-9-]/;
const WHITESPACE = /\s/;

/**
 * A small state machine over the static parts of one template literal. The
 * same instance must see every static segment in order so context is tracked
 * across interpolation boundaries.
 */
export function createTemplateScanner(): {
  advance(segment: string): void;
  interpolationContext(): InterpolationContext;
} {
  let mode: Mode = "text";
  /** Open raw-text element while in text mode, e.g. inside `<script>`. */
  let rawtextTag: string | null = null;
  /** Start tag currently being scanned that opens raw text once `>` lands. */
  let pendingRawtext: string | null = null;
  /** Name of the tag currently being scanned (tag/attribute modes). */
  let tagName = "";
  /** Attribute name being scanned, or the name just seen before `=`. */
  let attrName = "";
  /** Whether `=` followed the current attribute name (unquoted detection). */
  let attrAfterEquals = false;

  function isTagNameDelimiter(char: string | undefined): boolean {
    return char === undefined || WHITESPACE.test(char) || char === "/" || char === ">";
  }

  function advance(segment: string): void {
    let i = 0;
    const length = segment.length;

    while (i < length) {
      if (mode === "text") {
        if (rawtextTag !== null) {
          // Raw text ends only at a matching closing tag; everything else is
          // opaque character data, including `<` not followed by `/name`.
          const close = segment.indexOf("</", i);
          if (close === -1) {
            return;
          }
          let j = close + 2;
          let name = "";
          while (j < length && TAG_NAME_CHAR.test(segment[j] ?? "")) {
            name += segment[j]?.toLowerCase();
            j += 1;
          }
          if (name === rawtextTag && isTagNameDelimiter(segment[j])) {
            rawtextTag = null;
            mode = "tag";
            i = j;
          } else {
            i = close + 2;
          }
          continue;
        }

        const lt = segment.indexOf("<", i);
        if (lt === -1) {
          return;
        }
        const next = segment[lt + 1];
        if (segment.startsWith("!--", lt + 1)) {
          mode = "comment";
          i = lt + 4;
          continue;
        }
        if (next === "/") {
          // Closing tag: read the name, then skip to `>` in tag mode.
          let j = lt + 2;
          while (j < length && TAG_NAME_CHAR.test(segment[j] ?? "")) {
            j += 1;
          }
          tagName = segment.slice(lt + 2, j).toLowerCase();
          mode = "tag";
          i = j;
          continue;
        }
        if (next === "!" || next === "?") {
          // Doctype, declaration, or bogus comment: skip to `>`.
          const gt = segment.indexOf(">", lt + 2);
          if (gt === -1) {
            return;
          }
          i = gt + 1;
          continue;
        }
        if (next !== undefined && ASCII_LETTER.test(next)) {
          let j = lt + 1;
          while (j < length && TAG_NAME_CHAR.test(segment[j] ?? "")) {
            j += 1;
          }
          tagName = segment.slice(lt + 1, j).toLowerCase();
          pendingRawtext = RAW_TEXT_ELEMENTS.has(tagName) ? tagName : null;
          mode = "tag";
          i = j;
          continue;
        }
        // Stray `<` is literal text — unless it ends the segment, in which
        // case the interpolation follows it directly and can only be an
        // attempt at a dynamic tag or attribute name.
        if (lt === length - 1) {
          tagName = "";
          pendingRawtext = null;
          mode = "tag";
          return;
        }
        i = lt + 1;
        continue;
      }

      if (mode === "comment") {
        const end = segment.indexOf("-->", i);
        if (end === -1) {
          return;
        }
        mode = "text";
        i = end + 3;
        continue;
      }

      if (mode === "tag") {
        const char = segment[i];
        if (WHITESPACE.test(char ?? "")) {
          i += 1;
          continue;
        }
        if (char === ">") {
          mode = "text";
          attrName = "";
          attrAfterEquals = false;
          if (pendingRawtext !== null) {
            rawtextTag = pendingRawtext;
            pendingRawtext = null;
          }
          i += 1;
          continue;
        }
        if (char === "/") {
          // Self-closing marker; HTML ignores it and still applies raw text.
          i += 1;
          continue;
        }
        // Attribute name.
        let j = i;
        while (
          j < length &&
          !WHITESPACE.test(segment[j] ?? "") &&
          segment[j] !== "=" &&
          segment[j] !== "/" &&
          segment[j] !== ">"
        ) {
          j += 1;
        }
        attrName = segment.slice(i, j).toLowerCase();
        attrAfterEquals = false;
        i = j;
        // Look ahead past whitespace for `=`.
        let k = i;
        while (k < length && WHITESPACE.test(segment[k] ?? "")) {
          k += 1;
        }
        if (segment[k] === "=") {
          attrAfterEquals = true;
          k += 1;
          while (k < length && WHITESPACE.test(segment[k] ?? "")) {
            k += 1;
          }
          const quote = segment[k];
          if (quote === '"') {
            mode = "attrDq";
            i = k + 1;
            continue;
          }
          if (quote === "'") {
            mode = "attrSq";
            i = k + 1;
            continue;
          }
          if (quote !== undefined) {
            mode = "attrUq";
            i = k;
            continue;
          }
          // Segment ends right after `=`: interpolation lands unquoted.
          i = k;
          continue;
        }
        // Boolean attribute; stay in tag mode.
        i = k;
        continue;
      }

      if (mode === "attrDq" || mode === "attrSq") {
        const quote = mode === "attrDq" ? '"' : "'";
        const end = segment.indexOf(quote, i);
        if (end === -1) {
          return;
        }
        mode = "tag";
        attrName = "";
        attrAfterEquals = false;
        i = end + 1;
        continue;
      }

      // mode === "attrUq"
      let j = i;
      while (j < length && !WHITESPACE.test(segment[j] ?? "") && segment[j] !== ">") {
        j += 1;
      }
      if (j === length) {
        return;
      }
      if (segment[j] === ">") {
        mode = "text";
        attrName = "";
        attrAfterEquals = false;
        if (pendingRawtext !== null) {
          rawtextTag = pendingRawtext;
          pendingRawtext = null;
        }
      } else {
        mode = "tag";
        attrName = "";
        attrAfterEquals = false;
      }
      i = j + (segment[j] === ">" ? 1 : 0);
    }
  }

  function interpolationContext(): InterpolationContext {
    if (mode === "comment") {
      return { kind: "forbidden", reason: "interpolation inside an HTML comment is not supported" };
    }
    if (mode === "text") {
      if (rawtextTag !== null) {
        return {
          kind: "forbidden",
          reason: `interpolation inside raw-text element <${rawtextTag}> is not supported`,
        };
      }
      return { kind: "text" };
    }
    if (mode === "tag") {
      if (attrAfterEquals) {
        return {
          kind: "forbidden",
          reason: `unquoted attribute "${attrName}" must be quoted before interpolating`,
        };
      }
      return {
        kind: "forbidden",
        reason: "dynamic tag or attribute name interpolation is not supported",
      };
    }
    if (mode === "attrUq") {
      return {
        kind: "forbidden",
        reason: `unquoted attribute "${attrName}" must be quoted before interpolating`,
      };
    }
    return { kind: "attribute", name: attrName, tagName };
  }

  return { advance, interpolationContext };
}
