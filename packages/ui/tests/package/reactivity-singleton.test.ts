import { signal as alienSignal } from "alien-signals";
import { expect, test } from "vite-plus/test";

const distEntry = (name: string) => `../../dist/${name}.mjs`;

test("packed root re-exports the external alien-signals instance", async () => {
  const root = await import(distEntry("index"));
  expect(root.signal).toBe(alienSignal);

  const state = root.signal(1);
  root.batch(() => {
    state(2);
  });
  expect(state()).toBe(2);
});

test("packed non-root entries do not bundle an independent reactivity graph", async () => {
  const rootBundle = await import(distEntry("index"));
  await import(distEntry("client"));
  await import(distEntry("server"));
  await import(distEntry("forms"));

  expect(rootBundle.signal).toBe(alienSignal);
});
