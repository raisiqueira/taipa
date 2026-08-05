/**
 * Dynamic fragments: bootstrap observation discovers islands inserted after
 * startup, but pending schedules must be cancellable when hosts leave the
 * observed tree before activation.
 */
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { component, html } from "../../src/index";
import { bootstrap } from "../../src/client/bootstrap";
import { unmount } from "../../src/client/instance";

const elements: Element[] = [];
const handles: { destroy(): void }[] = [];

function wait(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function payload(value: number): string {
  return `<script type="application/json" data-taipa-props>{"value":${value}}</script>`;
}

function island(value: number): HTMLElement {
  const template = document.createElement("template");
  template.innerHTML = `<taipa-island data-taipa-component="Counter" data-taipa-hydrate="load"><output data-taipa-ref="label"></output>${payload(value)}</taipa-island>`;
  return template.content.firstElementChild as HTMLElement;
}

function counter() {
  return component<{ value: number }>("Counter")
    .bind("label", ({ props, element }) => {
      element.textContent = String(props.value);
    })
    .render(({ props }) => html`<output>${props.value}</output>`);
}

function track<T extends { destroy(): void }>(handle: T): T {
  handles.push(handle);
  return handle;
}

afterEach(() => {
  for (const handle of handles.splice(0)) {
    handle.destroy();
  }
  for (const element of elements.splice(0)) {
    element.remove();
  }
});

describe("dynamic fragment discovery", () => {
  test("observe discovers inserted fragments once, including nested islands independently", async () => {
    const root = document.createElement("section");
    document.body.append(root);
    elements.push(root);
    const load = vi.fn(async () => ({ default: counter() }));
    const handle = track(bootstrap({ root, registry: { Counter: load }, observe: true }));

    const template = document.createElement("template");
    template.innerHTML = `<taipa-island data-taipa-component="Counter" data-taipa-hydrate="load"><output data-taipa-ref="label"></output>${payload(1)}<div><taipa-island data-taipa-component="Counter" data-taipa-hydrate="load"><output data-taipa-ref="label"></output>${payload(2)}</taipa-island></div></taipa-island>`;
    root.append(template.content);

    // Explicit rescan of the same root must not duplicate the pending work.
    handle.scan(root);
    await wait();
    await wait();

    const hosts = [...root.querySelectorAll("taipa-island")];
    expect(hosts).toHaveLength(2);
    expect(load).toHaveBeenCalledTimes(1);
    expect(hosts[0]?.querySelector("output")?.textContent).toBe("1");
    expect(hosts[1]?.querySelector("output")?.textContent).toBe("2");
  });

  test("remove before load activation cancels the schedule; reinsertion reschedules", async () => {
    const root = document.createElement("section");
    document.body.append(root);
    elements.push(root);
    const host = island(7);
    const load = vi.fn(async () => ({ default: counter() }));
    track(bootstrap({ root, registry: { Counter: load }, observe: true }));

    root.append(host);
    host.remove();
    await wait();
    await wait();

    expect(load).not.toHaveBeenCalled();
    expect(host.querySelector("output")?.textContent).toBe("");

    root.append(host);
    await wait();
    await wait();

    expect(load).toHaveBeenCalledTimes(1);
    expect(host.querySelector("output")?.textContent).toBe("7");
  });

  test("removing a loading host prevents activation after the import settles", async () => {
    const root = document.createElement("section");
    document.body.append(root);
    elements.push(root);
    const host = island(9);
    root.append(host);
    let resolveModule: (module: Record<string, unknown>) => void = () => {};
    const load = vi.fn(
      () =>
        new Promise<Record<string, unknown>>((resolve) => {
          resolveModule = resolve;
        }),
    );
    track(bootstrap({ root, registry: { Counter: load }, observe: true }));
    await wait();

    expect(load).toHaveBeenCalledTimes(1);
    host.remove();
    resolveModule({ default: counter() });
    await wait();
    await wait();

    expect(host.querySelector("output")?.textContent).toBe("");
    expect(unmount(host)).toBe(false);
  });
});
