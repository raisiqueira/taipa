import { expect, test } from "vite-plus/test";
import { html, raw } from "../../src/template/html";
import { safeUrl } from "../../src/template/safe-url";

// ---------------------------------------------------------------------------
// Supported contexts escape, flatten, and drop nullish values.
// ---------------------------------------------------------------------------

test("text interpolation escapes HTML-significant characters", () => {
  const hostile = `<script>alert("x")</script> & "friends"`;
  expect(html`<p>${hostile}</p>`.value).toBe(
    "<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &quot;friends&quot;</p>",
  );
});

test("allowlisted inert quoted attributes escape quotes and markup", () => {
  expect(html`<p title="${'say "hi" & <bye>'}">x</p>`.value).toBe(
    '<p title="say &quot;hi&quot; &amp; &lt;bye&gt;">x</p>',
  );
});

test("single-quoted attribute interpolation escapes apostrophes", () => {
  // oxfmt normalizes quotes inside html`` literals, so build the
  // single-quoted template at runtime to keep the attrSq path covered.
  const strings = Object.assign(["<p title='", "'>x</p>"], {
    raw: ["<p title='", "'>x</p>"],
  }) as TemplateStringsArray;
  expect(html(strings, "it's <fine>").value).toBe("<p title='it&#39;s &lt;fine&gt;'>x</p>");
});

test("aria-* and data-* attributes are inert allowlisted contexts", () => {
  expect(html`<div aria-label="${'<"innocent">'}">x</div>`.value).toBe(
    '<div aria-label="&lt;&quot;innocent&quot;&gt;">x</div>',
  );
  expect(html`<div data-count="${42}">x</div>`.value).toBe('<div data-count="42">x</div>');
});

test("arrays flatten in text and inert attributes; nested arrays recurse", () => {
  expect(html`<p>${["a", "<b>", ["c", "d"]]}</p>`.value).toBe("<p>a&lt;b&gt;cd</p>");
  expect(html`<div class="${["is-", "active"]}">x</div>`.value).toBe(
    '<div class="is-active">x</div>',
  );
});

test("null and undefined render nothing in text and attributes", () => {
  expect(html`<p>a${null}b${undefined}c</p>`.value).toBe("<p>abc</p>");
  expect(html`<p title="${null}">x</p>`.value).toBe('<p title="">x</p>');
  expect(html`<p title="${undefined}">x</p>`.value).toBe('<p title="">x</p>');
});

test("numbers and booleans interpolate as escaped text", () => {
  expect(html`<p>${42} ${0} ${false}</p>`.value).toBe("<p>42 0 false</p>");
  expect(html`<div data-count="${0}">x</div>`.value).toBe('<div data-count="0">x</div>');
});

test("SafeUrl renders its escaped value in text content", () => {
  expect(html`<p>${safeUrl("https://example.com/?a=1&b=2")}</p>`.value).toBe(
    "<p>https://example.com/?a=1&amp;b=2</p>",
  );
});

// ---------------------------------------------------------------------------
// Unsupported, executable, or compound contexts throw before output.
// ---------------------------------------------------------------------------

test("dynamic tag names throw", () => {
  expect(() => html`<${"div"}>x</div>`).toThrow(/dynamic tag or attribute name/);
});

test("dynamic attribute names throw", () => {
  expect(() => html`<div ${"title"}="x">y</div>`).toThrow(/dynamic tag or attribute name/);
});

test("unquoted attribute interpolation throws", () => {
  expect(() => html`<div title=${"x"}>y</div>`).toThrow(/unquoted attribute "title"/);
  expect(() => html`<div class=${"x"}>y</div>`).toThrow(/unquoted attribute/);
});

test("event handler attributes throw even when quoted", () => {
  expect(() => html`<div onclick="${"alert(1)"}">y</div>`).toThrow(/onclick/);
  expect(() => html`<div onmouseover="${"alert(1)"}">y</div>`).toThrow(/onmouseover/);
});

test("style attribute interpolation throws", () => {
  expect(() => html`<div style="${"color:red"}">y</div>`).toThrow(/style/);
});

test("srcdoc and srcset interpolation throw", () => {
  expect(() => html`<iframe srcdoc="${"<p>x</p>"}"></iframe>`).toThrow(/srcdoc/);
  expect(() => html`<img srcset="${"a.png 1x"}" />`).toThrow(/srcset/);
});

test("meta refresh content interpolation throws", () => {
  expect(
    () => html`<meta http-equiv="refresh" content="${"0;url=https://evil.example"}" />`,
  ).toThrow(/content/);
});

test("interpolation inside raw-text elements throws", () => {
  expect(
    () =>
      html`<script>
        ${"alert(1)"};
      </script>`,
  ).toThrow(/raw-text/);
  expect(
    () =>
      html`<style>
        ${"body{}"}
      </style>`,
  ).toThrow(/raw-text/);
  expect(() => html`<textarea>${"text"}</textarea>`).toThrow(/raw-text/);
  expect(() => html`<title>${"text"}</title>`).toThrow(/raw-text/);
});

test("an unclosed raw-text element still forbids later interpolation", () => {
  expect(() => html`<script>const x = 1; ${"alert(1)"}`).toThrow(/raw-text/);
});

test("interpolation inside HTML comments throws", () => {
  expect(() => html`<!-- ${"x"} -->`).toThrow(/comment/);
});

test("SafeHtml nested in an attribute throws", () => {
  expect(() => html`<div title="${raw("<b>x</b>")}">y</div>`).toThrow(/SafeHtml/);
});

test("plain objects in text content throw", () => {
  expect(() => html`<p>${{ toString: () => "sneaky" }}</p>`).toThrow(/unsupported/);
});

test("SafeUrl in an inert attribute throws (URLs belong in URL attributes)", () => {
  expect(() => html`<div title="${safeUrl("https://example.com")}">y</div>`).toThrow(/SafeUrl/);
});

// ---------------------------------------------------------------------------
// URL-bearing attributes require SafeUrl.
// ---------------------------------------------------------------------------

test("plain strings in URL-bearing attributes fail with a safeUrl hint", () => {
  expect(() => html`<a href="${"https://example.com"}">x</a>`).toThrow(/safeUrl/);
  expect(() => html`<img src="${"/static/x.png"}" />`).toThrow(/safeUrl/);
  expect(() => html`<form action="${"/submit"}"></form>`).toThrow(/safeUrl/);
  expect(() => html`<button formaction="${"/submit"}">x</button>`).toThrow(/safeUrl/);
  expect(() => html`<video poster="${"/poster.png"}"></video>`).toThrow(/safeUrl/);
  expect(() => html`<blockquote cite="${"https://example.com"}"></blockquote>`).toThrow(/safeUrl/);
});

test("SafeUrl values pass in URL-bearing attributes and get attribute-escaped", () => {
  expect(html`<a href="${safeUrl("https://example.com/?a=1&b=2")}">x</a>`.value).toBe(
    '<a href="https://example.com/?a=1&amp;b=2">x</a>',
  );
  expect(html`<img src="${safeUrl("/static/x.png")}" />`.value).toBe('<img src="/static/x.png" />');
});

test("nullish values in URL-bearing attributes render empty", () => {
  expect(html`<a href="${null}">x</a>`.value).toBe('<a href="">x</a>');
});

// ---------------------------------------------------------------------------
// raw() preserves trusted content and cannot be forged.
// ---------------------------------------------------------------------------

test("raw() preserves trusted markup verbatim", () => {
  expect(raw("<b>trusted</b>").value).toBe("<b>trusted</b>");
  expect(html`<p>before ${raw("<b>trusted</b>")} after</p>`.value).toBe(
    "<p>before <b>trusted</b> after</p>",
  );
});

test("nested SafeHtml composes in child content positions", () => {
  const inner = html`<em>${"<safe>"}</em>`;
  expect(html`<div>${inner}</div>`.value).toBe("<div><em>&lt;safe&gt;</em></div>");
});

test("a plain object carrying SafeHtml-like fields is rejected", () => {
  const forgery = { value: "<b>forged</b>", __brand: "SafeHtml" };
  expect(() => html`<p>${forgery}</p>`).toThrow(/unsupported/);
  expect(() => html`<p>${[forgery]}</p>`).toThrow(/unsupported/);
});

test("a plain object carrying SafeUrl-like fields is rejected in URL attributes", () => {
  const forgery = { value: "https://example.com", __brand: "SafeUrl" };
  expect(() => html`<a href="${forgery}">x</a>`).toThrow(/safeUrl/);
});

test("raw() rejects non-string input", () => {
  expect(() => raw(42 as unknown as string)).toThrow(/string/);
});
