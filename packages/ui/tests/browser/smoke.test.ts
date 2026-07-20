import { expect, test } from "vite-plus/test";
import { mountProbe, probeTarget } from "../../src/client.ts";

test("runs in a real browser", () => {
  expect(typeof window).toBe("object");
  expect(typeof document).toBe("object");
});

test("client probe mounts and updates reactively", () => {
  const element = document.createElement("div");
  document.body.appendChild(element);

  const update = mountProbe(element, "hello");
  expect(probeTarget).toBe("@taipa/ui:client");
  expect(element.textContent).toBe("hello");

  update("world");
  expect(element.textContent).toBe("world");

  element.remove();
});
