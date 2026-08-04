/**
 * Shared benchmark fixtures.
 *
 * Everything here is built once, at module load, so the measured task bodies
 * only contain the work under test. The data shapes mirror the server-rendering
 * scenarios Taipa is designed for: a table of rows, a hostile user-supplied
 * string, and a props payload that has to be serialized into an inert script.
 */
import { component, html, safeUrl } from "@taipa/ui";

/** Row count for the "table" scenarios. Large enough to dominate fixed costs. */
export const ROW_COUNT = 500;

export const rows = Array.from({ length: ROW_COUNT }, (_, index) => ({
  id: index + 1,
  label: `Item ${index + 1}`,
  href: `/items/${index + 1}?ref=bench&page=1`,
  tags: ["alpha", "beta", "gamma"],
}));

/** Untrusted input that exercises every branch of the escaping tables. */
export const hostileText = `<script>alert("x")</script> & 'friends' <b>&amp;</b> ${"a".repeat(64)}`;

export const inertAttributeValue = `say "hi" & <bye> ${"z".repeat(32)}`;

export const trustedMarkup = `<span class="badge">pre-sanitized</span>`;

export const productUrl = safeUrl("https://example.com/catalog?a=1&b=2#top");

/** A realistic hydration payload: nested objects, arrays, and long strings. */
export const largeProps = {
  title: "Quarterly report",
  query: "status:open",
  locale: "pt-BR",
  filters: {
    status: ["open", "pending", "closed"],
    range: { from: "2026-01-01", to: "2026-03-31" },
    flags: { archived: false, starred: true, limit: 250 },
  },
  items: rows.slice(0, 50).map((row) => ({
    id: row.id,
    label: row.label,
    tags: row.tags,
  })),
};

/** The smallest interesting island: one state signal bound to one ref. */
export const Counter = component("Counter")
  .state("count", ({ props }) => props.initial)
  .state("step", 1)
  .derived("doubled", ({ state }) => state.count() * 2)
  .render(
    ({ state, derived }) => html`
      <output data-taipa-ref="count">${state.count()}</output>
      <span data-taipa-ref="doubled">${derived.doubled()}</span>
    `,
  );

/** A wide component: many states, deriveds, and escaped interpolations. */
export const Dashboard = component("Dashboard")
  .state("query", ({ props }) => props.query)
  .state("page", 1)
  .state("pageSize", 25)
  .state("selected", 0)
  .derived("offset", ({ state }) => (state.page() - 1) * state.pageSize())
  .derived("summary", ({ state, derived }) => `${state.query()}@${derived.offset()}`)
  .render(
    ({ props, state, derived }) => html`
      <section data-taipa-ref="root" data-page="${state.page()}">
        <h2 data-taipa-ref="title">${props.title}</h2>
        <p data-taipa-ref="summary" title="${derived.summary()}">${derived.summary()}</p>
        <output data-taipa-ref="selected">${state.selected()}</output>
      </section>
    `,
  );

/** The table scenario: one nested SafeHtml fragment per row. */
export const Table = component("Table")
  .state("rowCount", ({ props }) => props.rows.length)
  .render(
    ({ props }) => html`
      <table data-taipa-ref="table">
        <tbody>
          ${props.rows.map(
            (row) => html`
              <tr data-id="${row.id}">
                <td>${row.id}</td>
                <td class="${row.tags.join(" ")}">${row.label}</td>
              </tr>
            `,
          )}
        </tbody>
      </table>
    `,
  );
