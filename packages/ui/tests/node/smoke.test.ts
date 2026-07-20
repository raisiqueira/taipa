import { expect, test } from "vite-plus/test";
import { probeFieldName } from "../../src/forms.ts";
import { component, html, signal } from "../../src/index.ts";
import { probeTarget as serverTarget, renderProbe } from "../../src/server.ts";

test("runs in the node environment", () => {
  expect(typeof process.versions.node).toBe("string");
  expect(typeof document).toBe("undefined");
});

test("the root universal surface works in node", () => {
  const counter = component("smoke", { contractVersion: "1" })
    .state("count", 0)
    .render(({ state }) => html`<output>${state.count()}</output>`);
  expect(counter.name).toBe("smoke");
  expect(html`<p>${"<escaped>"}</p>`.value).toBe("<p>&lt;escaped&gt;</p>");
  const count = signal(1);
  count(2);
  expect(count()).toBe(2);
});

test("server-safe subpaths are importable in node", () => {
  expect(serverTarget).toBe("@taipa/ui:server");
  expect(renderProbe("ok")).toContain('data-taipa-probe="server"');
  expect(probeFieldName("email")).toBe("taipa:email");
});
