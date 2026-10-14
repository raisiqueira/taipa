# Changelog

All notable changes to `@taipa/ui` are documented here.

## 0.3.0

- JSON registry (`#taipa-registry`) sources must now resolve to the page origin over `http:` or `https:`, the same way `import()` resolves them. Sources on other origins, including `https://` CDN URLs, no longer load; register those modules in the JavaScript registry passed to `bootstrap()` instead. Bare specifiers still resolve through the import map.
- JSON registry sources that contain control characters or whitespace are now rejected.
- `html` templates now follow the browser's parsing of `<!--` and `<script` inside a `<script>` element: an interpolation after a `</script>` that the browser does not treat as an end tag now throws.
- `html` templates now treat only ASCII whitespace (tab, line feed, form feed, carriage return, and space) as whitespace inside tags. A tag with a non-breaking space or another Unicode space before an interpolated attribute now throws instead of rendering.
- After a successful hydrate, unused `data-taipa-ref` names warn once in the console so a leftover or mistyped markup hook is visible as an app mistake.
- Expanded `examples/` into a kitchensink: no-build `mount()`, then Node SSR routes for every hydration policy and a native progressive form.

## 0.2.0

- When a `batch()` callback and its closing effect flush both throw, `batch()` now preserves the callback error as the primary failure.
- Reduced client runtime overhead by reusing binding contexts and no longer retaining transient roots scanned by long-lived bootstrap handles.
- `renderIsland()` now rejects props or state payload scripts above the existing 64 KiB client character limit and
  emits development-only size warnings before that limit.
- Added a complete documentation site for server rendering, hydration, forms, no-build delivery, public APIs, security boundaries, and benchmark evidence.
- Added type-safe component refs for builder registrations and callback-side ref access.
- Added package, consumer, and release preflight verification for the JavaScript alpha.

## 0.1.0

- Removed the component and island contract-version protocol. Components now use `component(name)`.
- Added `repeat(items, render)` for synchronous, SafeHtml-only initial repeated markup.
- Added direct `createForm()` validation guidance alongside Standard Schema adapters.

## 0.0.0-alpha.0

- Initial JavaScript alpha: universal component builder, safe templates and URLs, server rendering, direct-DOM hydration, island bootstrap, progressive forms, and Standard Schema-compatible validation.
