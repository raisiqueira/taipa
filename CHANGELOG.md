# Changelog

All notable changes to `@taipa/ui` are documented here.

## Unreleased

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
