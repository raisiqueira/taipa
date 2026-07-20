import { expect, test } from "vite-plus/test";
import { probeFieldName } from "../src/forms.ts";
import { createProbeCount, probeTarget } from "../src/index.ts";
import { probeTarget as serverTarget, renderProbe } from "../src/server.ts";

test("runs in the node environment", () => {
  expect(typeof process.versions.node).toBe("string");
  expect(typeof document).toBe("undefined");
});

test("root probe exposes a reactive signal", () => {
  const count = createProbeCount(1);
  expect(probeTarget).toBe("@taipa/ui:root");
  expect(count.get()).toBe(1);
  count.set(2);
  expect(count.get()).toBe(2);
});

test("server-safe subpaths are importable in node", () => {
  expect(serverTarget).toBe("@taipa/ui:server");
  expect(renderProbe("ok")).toContain('data-taipa-probe="server"');
  expect(probeFieldName("email")).toBe("taipa:email");
});
