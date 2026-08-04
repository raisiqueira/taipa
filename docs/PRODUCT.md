# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Server-first JavaScript developers building applications that begin as server-rendered HTML and need small, explicit interactive islands without adopting a client-rendered application model.

## Product Purpose

Taipa UI lets developers render safe initial HTML on JavaScript servers, then attach direct-DOM behavior only where needed. It makes progressive enhancement practical for interactive islands and native forms while keeping the server fallback meaningful.

## Positioning

Taipa UI combines server-authored HTML with progressive enhancement: initial markup remains authoritative, browser code hydrates retained nodes, and native browser behavior remains available when JavaScript is absent or intentionally unused.

## Operating Context

Developers define components once, render them on a JavaScript server, and register approved browser modules for hydration. Native forms can add client validation and optional submission behavior while retaining successful controls, submitters, files, constraint validation, reset behavior, and server fallback.

## Capabilities and Constraints

- ESM-first package with root, client, server, and forms entry points.
- Direct-DOM hydration and explicit island activation policies.
- Safe templates, server rendering, progressive forms, and Standard Schema-compatible validation helpers.
- No virtual DOM, reconciliation pass, or client-owned replacement of initial server markup.
- The package is alpha software; public APIs may tighten before a stable release.
- Django protocol and adapter documentation remain deferred until their implementation and conformance work are complete.

## Brand Commitments

Taipa UI is a technical framework for developers. Its public communication should be precise about server ownership, direct DOM behavior, and alpha limits rather than implying a completed cross-server ecosystem.

## Evidence on Hand

- Runnable playground at `playground/`.
- Browser, package, server-rendering, consumer, and release verification lanes in the repository.
- Local benchmark runner and recorded environment-specific results under `benchmarks/`.
- No customer testimonials, production case studies, or Django conformance evidence should be fabricated or implied.

## Product Principles

- Server HTML is the starting artifact, not a temporary shell.
- Add behavior explicitly and preserve browser-native fallback.
- Keep runtime ownership and module resolution constrained and inspectable.
- Prefer a small, ESM-first surface over framework-wide client rendering.
- Treat alpha claims as evidence-backed and bounded.

## Accessibility & Inclusion

Progressive enhancement must preserve native controls, browser validation, submitter semantics, and server fallback. Documentation should remain readable, keyboard-navigable, and clear about behavior without JavaScript.
