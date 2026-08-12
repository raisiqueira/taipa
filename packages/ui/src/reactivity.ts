/**
 * Reactivity surface.
 *
 * `signal`, `computed`, `effect`, and `effectScope` are direct re-exports of
 * the pinned alien-signals release — Taipa never wraps scheduling or
 * dependency tracking. `batch()` is the single allowed wrapper. It always
 * balances `startBatch()`/`endBatch()` and preserves the callback's error when
 * both the callback and the resulting effect flush fail.
 */
import { endBatch, startBatch } from "alien-signals";

export { computed, effect, effectScope, signal } from "alien-signals";

export function batch<T>(run: () => T): T {
  startBatch();
  let result: T;

  try {
    result = run();
  } catch (error) {
    try {
      endBatch();
    } catch {
      // The callback's failure is the primary error for this operation.
    }
    throw error;
  }

  endBatch();
  return result;
}
