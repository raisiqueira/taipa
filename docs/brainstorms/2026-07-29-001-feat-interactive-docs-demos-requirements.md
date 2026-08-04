---
date: 2026-07-29
topic: interactive-docs-demos
---

# Interactive Documentation Demos

## Summary

Add guided, live examples to the client-component and Forms documentation. The learning path starts
with a mounted interactive counter, then lets readers validate and submit a native-first form without
leaving the page.

---

## Problem Frame

The current guides explain the component and form APIs through static examples. Developers can read
the source, but cannot immediately connect the API to the browser behavior it produces. The first
steps in the learning path should make mounting, state changes, validation, and submission outcomes
observable before a developer creates a separate application.

---

## Actors

- A1. Server-first JavaScript developer: learns Taipa from the documentation and wants to see its
  direct-DOM behavior before adopting it.
- A2. Documentation maintainer: keeps demos aligned with the supported public behavior.

---

## Key Flows

- F1. Mount a client component
  - **Trigger:** A1 reaches the basic client-component guide.
  - **Actors:** A1
  - **Steps:** A1 changes the counter state through its controls, observes the displayed value update,
    then continues to the server-islands guide.
  - **Outcome:** A1 understands that client-side mounting creates live behavior without a virtual DOM.
  - **Covered by:** R1, R2

- F2. Validate and submit a form
  - **Trigger:** A1 reaches the Forms guide.
  - **Actors:** A1
  - **Steps:** A1 enters invalid and valid values, observes field feedback, submits the valid form, and
    sees an in-page completion state.
  - **Outcome:** A1 understands the native-first validation and enhanced-submission experience without
    navigating away from the guide.
  - **Covered by:** R3, R4, R5

---

## Requirements

**Guided component learning**

- R1. The basic client-component guide must include a live counter that readers can operate in place.
- R2. The counter must visibly demonstrate mounted state and direct interaction, then direct readers to
  the server-islands lesson as the next step in the learning path.

**Guided forms learning**

- R3. The Forms guide must include a live native-first form with observable invalid-field feedback and
  a visible submission state.
- R4. A valid submission must complete in place with a simulated enhanced-submission outcome; it must
  not navigate or require a real service.
- R5. The demo must preserve the guide's core teaching: browser controls remain native, validation
  happens from current form values, and server-side validation remains authoritative in production.

**Documentation quality**

- R6. The demos must remain usable with keyboard interaction and communicate state without relying on
  color alone.
- R7. The demos must use supported Taipa behavior so documentation stays representative of the public
  API.

---

## Acceptance Examples

- AE1. **Covers R1, R2.** Given a reader on the basic guide, when they activate the counter controls,
  the displayed count changes in place and the next lesson is clear.
- AE2. **Covers R3, R6.** Given an incomplete form, when a reader attempts submission, the relevant
  fields show accessible feedback and the reader remains on the guide.
- AE3. **Covers R4, R5.** Given valid form values, when a reader submits, the form shows an in-page
  completion outcome without making a network request or navigating away.

---

## Success Criteria

- A developer can experience the first client and form behaviors before copying either example into an
  application.
- The demos strengthen the client-to-server learning path without becoming a code editor or external
  sandbox.
- The interactive behavior is accessible and matches the documented public API.

---

## Scope Boundaries

- No editable browser code playground or external sandbox.
- No real network submission, persistence, or authentication flow.
- No interactive native-replay submission path; that behavior remains documented as a production
  option.
- No replacement of the existing static code examples.

---

## Key Decisions

- Documentation-native demos: interaction stays in the reading flow rather than depending on a separate
  deployment or external service.
- Simulated enhanced submission: readers can observe a successful completion state without losing their
  place in the guide.
- Guided progression: the counter is the first interactive step and server islands remain the next
  conceptual step.

---

## Dependencies / Assumptions

- The static documentation site can bundle supported Taipa client and Forms behavior.
- Demo success and failure states are instructional only and do not represent a production backend.
