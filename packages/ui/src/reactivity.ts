/**
 * Reactivity surface (design 2.9).
 *
 * `signal`, `computed`, `effect`, and `effectScope` are direct re-exports of
 * the pinned alien-signals release — Taipa never wraps scheduling or
 * dependency tracking. `batch()` is the single allowed wrapper and balances
 * `startBatch()`/`endBatch()` with `try/finally` so an exception cannot leak
 * batch depth.
 */
import { endBatch, startBatch } from "alien-signals";

export { computed, effect, effectScope, signal } from "alien-signals";

export function batch<T>(run: () => T): T {
  startBatch();
  try {
    return run();
  } finally {
    endBatch();
  }
}
