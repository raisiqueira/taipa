import { expect, test } from "vite-plus/test";
import { component, html } from "../../src/index";
import { mount, unmount } from "../../src/client/index";

test("runs in a real browser", () => {
  expect(typeof window).toBe("object");
  expect(typeof document).toBe("object");
});

test("client entry mounts a component on a plain host", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const greeter = component("greeter", { contractVersion: "1" })
    .bind("out", ({ element }) => {
      element.textContent = "hello";
    })
    .render(() => html`<output data-taipa-ref="out"></output>`);

  const instance = await mount(host, greeter);
  expect(host.querySelector("output")?.textContent).toBe("hello");
  expect(instance.host).toBe(host);
  expect(unmount(host)).toBe(true);
  host.remove();
});
