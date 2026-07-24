import { expect, test } from "vite-plus/test";
import {
  computed as alienComputed,
  effect as alienEffect,
  effectScope as alienEffectScope,
  signal as alienSignal,
} from "alien-signals";
import { batch, computed, effect, effectScope, signal } from "../../src/reactivity";

test("reactive primitives are direct alien-signals re-exports", () => {
  // KTD8 / design 2.9: Taipa does not wrap the reactive graph. batch() is the
  // only wrapper, so the other four must be the very same functions.
  expect(signal).toBe(alienSignal);
  expect(computed).toBe(alienComputed);
  expect(effect).toBe(alienEffect);
  expect(effectScope).toBe(alienEffectScope);
});

test("signal reads and writes through the callable interface", () => {
  const count = signal(0);
  expect(count()).toBe(0);
  count(1);
  expect(count()).toBe(1);
});

test("computed tracks dependencies and stays in sync", () => {
  const count = signal(1);
  const doubled = computed(() => count() * 2);
  expect(doubled()).toBe(2);
  count(41);
  expect(doubled()).toBe(82);
});

test("effect reruns on dependency change and runs cleanup before rerun and on dispose", () => {
  const value = signal("a");
  const log: string[] = [];
  const dispose = effect(() => {
    const seen = value();
    log.push(`run:${seen}`);
    return () => {
      log.push(`cleanup:${seen}`);
    };
  });

  expect(log).toEqual(["run:a"]);
  value("b");
  expect(log).toEqual(["run:a", "cleanup:a", "run:b"]);
  dispose();
  expect(log).toEqual(["run:a", "cleanup:a", "run:b", "cleanup:b"]);
  value("c");
  expect(log).toEqual(["run:a", "cleanup:a", "run:b", "cleanup:b"]);
});

test("effectScope disposes inner effects and their cleanups", () => {
  const value = signal(0);
  const log: string[] = [];
  const stopScope = effectScope(() => {
    effect(() => {
      log.push(`run:${value()}`);
      return () => {
        log.push("cleanup");
      };
    });
  });

  expect(log).toEqual(["run:0"]);
  value(1);
  expect(log).toEqual(["run:0", "cleanup", "run:1"]);
  stopScope();
  expect(log).toEqual(["run:0", "cleanup", "run:1", "cleanup"]);
  value(2);
  expect(log).toEqual(["run:0", "cleanup", "run:1", "cleanup"]);
});

test("batch coalesces multiple writes into one effect run", () => {
  const a = signal(0);
  const b = signal(0);
  let runs = 0;
  effect(() => {
    a();
    b();
    runs += 1;
  });
  expect(runs).toBe(1);

  batch(() => {
    a(1);
    b(2);
  });
  expect(runs).toBe(2);
});

test("nested batches flush once, when the outermost batch ends", () => {
  const a = signal(0);
  let runs = 0;
  effect(() => {
    a();
    runs += 1;
  });

  batch(() => {
    a(1);
    batch(() => {
      a(2);
    });
    a(3);
  });
  expect(runs).toBe(2);
  expect(a()).toBe(3);
});

test("batch returns the callback result", () => {
  expect(batch(() => 42)).toBe(42);
});

test("an exception inside batch still balances batching (try/finally)", () => {
  const a = signal(0);
  let runs = 0;
  effect(() => {
    a();
    runs += 1;
  });
  expect(runs).toBe(1);

  expect(() =>
    batch(() => {
      a(1);
      throw new Error("boom");
    }),
  ).toThrow("boom");

  // If endBatch() had leaked, this write would stay batched forever and the
  // effect would not flush synchronously here.
  a(2);
  expect(runs).toBe(3);

  batch(() => {
    a(3);
  });
  expect(runs).toBe(4);
});
