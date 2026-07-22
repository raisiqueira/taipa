import { describe, expect, test, vi } from "vite-plus/test";
import { createForm } from "../../src/forms/controller.ts";
import type { FormErrors } from "../../src/types.ts";

function formFrom(html: string): HTMLFormElement {
  const template = document.createElement("template");
  template.innerHTML = html;
  const form = template.content.firstElementChild;
  if (!(form instanceof HTMLFormElement)) {
    throw new TypeError("fixture must start with a form");
  }
  document.body.append(form);
  return form;
}

function readTitle({ formData }: { readonly formData: FormData }): { title: string } {
  const title = formData.get("title");
  return { title: typeof title === "string" ? title : "" };
}

describe("validation", () => {
  test("validate() normalizes errors and applies Taipa-owned ARIA state", async () => {
    const form = formFrom(`<form>
      <input name="title" value="" aria-describedby="hint">
      <p id="hint">Required for publishing.</p>
      <p id="title-error" data-taipa-error-for="title"></p>
      <p data-taipa-form-status></p>
    </form>`);
    const controller = createForm(form, {
      read: readTitle,
      validate: ({ values }) =>
        values.title === "" ? { title: ["Title is required"] } : undefined,
    });

    await expect(controller.validate()).resolves.toBe(false);

    const input = form.elements.namedItem("title") as HTMLInputElement;
    const error = form.querySelector<HTMLElement>("[data-taipa-error-for]");
    expect(controller.errors()).toEqual({ title: ["Title is required"] });
    expect(controller.valid()).toBe(false);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")?.split(/\s+/)).toEqual(["hint", "title-error"]);
    expect(error?.textContent).toBe("Title is required");
    expect(error?.getAttribute("role")).toBe("alert");
    expect(form.querySelector("[data-taipa-form-status]")?.textContent).toBe(
      "Please correct 1 field.",
    );

    input.value = "Ready";
    await expect(controller.validate()).resolves.toBe(true);
    expect(controller.errors()).toEqual({});
    expect(controller.valid()).toBe(true);
    expect(input.hasAttribute("aria-invalid")).toBe(false);
    expect(input.getAttribute("aria-describedby")).toBe("hint");
    expect(error?.textContent).toBe("");
    form.remove();
  });

  test("writes hostile validator strings as text only", async () => {
    const form = formFrom(`<form>
      <input name="title" value="">
      <p data-taipa-error-for="title"></p>
    </form>`);
    const controller = createForm(form, {
      read: readTitle,
      validate: () => ({ title: ['<img src=x onerror="alert(1)">'] }),
    });

    await controller.validate();

    const error = form.querySelector<HTMLElement>("[data-taipa-error-for]");
    expect(error?.textContent).toBe('<img src=x onerror="alert(1)">');
    expect(error?.querySelector("img")).toBeNull();
    form.remove();
  });

  test("input and blur modes validate through delegated events", async () => {
    const inputForm = formFrom(`<form><input name="title" value=""></form>`);
    const inputValidate = vi.fn(({ values }: { readonly values: { title: string } }) =>
      values.title === "" ? { title: ["Required"] } : undefined,
    );
    createForm(inputForm, { read: readTitle, validate: inputValidate, mode: "input" });

    const input = inputForm.elements.namedItem("title") as HTMLInputElement;
    input.value = "a";
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await Promise.resolve();
    expect(inputValidate).toHaveBeenCalledTimes(1);

    const blurForm = formFrom(`<form><input name="title" value=""></form>`);
    const blurValidate = vi.fn(() => undefined);
    createForm(blurForm, { read: readTitle, validate: blurValidate, mode: "blur" });
    const blurInput = blurForm.elements.namedItem("title") as HTMLInputElement;
    blurInput.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    await Promise.resolve();
    expect(blurValidate).toHaveBeenCalledTimes(1);

    inputForm.remove();
    blurForm.remove();
  });

  test("stale async validation results cannot overwrite newer results", async () => {
    const form = formFrom(`<form>
      <input name="title" value="bad">
      <p data-taipa-error-for="title"></p>
    </form>`);
    let releaseFirst: (() => void) | undefined;
    const controller = createForm(form, {
      read: readTitle,
      validate: ({ values, signal }) =>
        new Promise<FormErrors | void>((resolve) => {
          if (values.title === "bad") {
            releaseFirst = () => resolve(signal.aborted ? undefined : { title: ["Old"] });
            return;
          }
          resolve(undefined);
        }),
    });

    const first = controller.validate();
    (form.elements.namedItem("title") as HTMLInputElement).value = "good";
    const second = controller.validate();
    releaseFirst?.();

    await expect(second).resolves.toBe(true);
    await expect(first).resolves.toBe(true);
    expect(controller.errors()).toEqual({});
    expect(form.querySelector("[data-taipa-error-for]")?.textContent).toBe("");
    form.remove();
  });

  test("adopts server-rendered invalid state without an initial status announcement", () => {
    const form = formFrom(`<form>
      <input name="title" value="" aria-invalid="true" aria-describedby="server-error">
      <p id="server-error" data-taipa-error-for="title">Server says no.</p>
      <p data-taipa-form-status></p>
    </form>`);

    const controller = createForm(form, { read: readTitle });

    expect(controller.errors()).toEqual({ title: ["Server says no."] });
    expect(controller.valid()).toBe(false);
    expect(form.querySelector("[data-taipa-form-status]")?.textContent).toBe("");
    form.remove();
  });
});
