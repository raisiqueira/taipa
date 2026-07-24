import { signal as alienSignal } from "alien-signals";
import { expect, test } from "vite-plus/test";

test("packed root re-exports the external alien-signals instance", async () => {
  const root = await import("../../dist/index.mjs");
  expect(root.signal).toBe(alienSignal);

  const state = root.signal(1);
  root.batch(() => {
    state(2);
  });
  expect(state()).toBe(2);
});

test("packed non-root entries do not bundle an independent reactivity graph", async () => {
  const rootBundle = await import("../../dist/index.mjs");
  await import("../../dist/client.mjs");
  await import("../../dist/server.mjs");
  await import("../../dist/forms.mjs");

  expect(rootBundle.signal).toBe(alienSignal);
});
