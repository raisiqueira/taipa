/**
 * Taipa UI's `html` tagged template: context scanning, escaping, and SafeHtml nesting.
 *
 * Every server render funnels through this module, so it is the hottest code in
 * the package. The tasks below separate the fixed scanning cost (static markup)
 * from the per-value escaping cost and from nested-fragment composition.
 */
import { html, raw, safeUrl } from "@taipa/ui";
import { hostileText, inertAttributeValue, productUrl, rows, trustedMarkup } from "./fixtures.mjs";

export function register(bench) {
  bench
    .add("html: static markup, no interpolation", () => {
      return html`
        <article class="card">
          <h3>Static heading</h3>
          <p>No interpolation happens here, only template scanning.</p>
        </article>
      `;
    })
    .add("html: text interpolation, nothing to escape", () => {
      return html`<p>${"a plain label"}${42}${true}</p>`;
    })
    .add("html: text interpolation, hostile input escaped", () => {
      return html`<p>${hostileText}</p>`;
    })
    .add("html: inert quoted attributes escaped", () => {
      return html`
        <div id="${"card-1"}" class="${"is-active"}" title="${inertAttributeValue}">
          <span data-count="${7}" aria-label="${inertAttributeValue}">x</span>
        </div>
      `;
    })
    .add("html: url attribute requires SafeUrl", () => {
      return html`<a href="${productUrl}">catalog</a>`;
    })
    .add("html: flatten nested arrays in text position", () => {
      return html`<p>${["a", "<b>", ["c", ["d", "e"]]]}</p>`;
    })
    .add(`html: compose ${rows.length} nested SafeHtml fragments`, () => {
      const cells = rows.map((row) => html`<li data-id="${row.id}">${row.label}</li>`);
      return html`<ul>
        ${cells}
      </ul>`;
    })
    .add("safeUrl: validate an absolute url", () => {
      return safeUrl("https://example.com/catalog?a=1&b=2#top");
    })
    .add("raw: brand pre-sanitized markup", () => {
      return raw(trustedMarkup);
    });
}
