import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { createForm } from "../../src/forms/controller.ts";
import type { FormErrors } from "../../src/types.ts";

const mounted: HTMLFormElement[] = [];

function form(markup: string): HTMLFormElement {
  const template = document.createElement("template");
  template.innerHTML = `<form>${markup}</form>`;
  const element = template.content.firstElementChild as HTMLFormElement;
  document.body.append(element);
  mounted.push(element);
  return element;
}

function readObject({
  formData,
}: {
  readonly formData: FormData;
}): Record<string, FormDataEntryValue> {
  return Object.fromEntries(formData) as Record<string, FormDataEntryValue>;
}

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

afterEach(() => {
  for (const element of mounted.splice(0)) {
    element.remove();
  }
  vi.restoreAllMocks();
});

describe("destroy and reset", () => {
  test("destroy restores generated error DOM and Taipa-owned ARIA only", () => {
    const element = form(
      `<label id="hint">Title</label><input name="title" value="draft" aria-describedby="hint"><button disabled data-taipa-disable-while-submitting>Save</button><p data-taipa-form-status>Ready</p>`,
    );
    const input = element.querySelector("input") as HTMLInputElement;
    const button = element.querySelector("button") as HTMLButtonElement;
    const status = element.querySelector("[data-taipa-form-status]") as HTMLElement;
    const controller = createForm(element, { read: readObject });

    input.value = "user edit";
    controller.setErrors({ title: ["Required"] });
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")?.split(/\s+/)).toContain("hint");
    expect(element.querySelector("[data-taipa-error-for='title']")?.textContent).toBe("Required");
    expect(status.textContent).toBe("Please correct 1 field.");

    controller.destroy();

    expect(input.value).toBe("user edit");
    expect(button.disabled).toBe(true);
    expect(input.getAttribute("aria-invalid")).toBeNull();
    expect(input.getAttribute("aria-describedby")).toBe("hint");
    expect(element.querySelector("[data-taipa-error-for='title']")).toBeNull();
    expect(status.textContent).toBe("Ready");
  });

  test("destroy restores server-authored invalid state after Taipa changes it", () => {
    const element = form(
      `<input name="title" value="draft" aria-invalid="true" aria-describedby="server-error hint"><span id="hint">hint</span><p id="server-error" data-taipa-error-for="title" role="alert">Server error</p>`,
    );
    const input = element.querySelector("input") as HTMLInputElement;
    const container = element.querySelector("[data-taipa-error-for='title']") as HTMLElement;
    const controller = createForm(element, { read: readObject });

    controller.setErrors({});
    expect(input.getAttribute("aria-invalid")).toBeNull();
    expect(container.textContent).toBe("");

    controller.destroy();

    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBe("server-error hint");
    expect(container.textContent).toBe("Server error");
    expect(container.getAttribute("role")).toBe("alert");
  });

  test("destroy aborts pending validation and enhanced submission without stale UI writes", async () => {
    const element = form(
      `<input name="title" value="draft"><button data-taipa-disable-while-submitting name="intent" value="save">Save</button><p data-taipa-form-status></p>`,
    );
    const button = element.querySelector("button") as HTMLButtonElement;
    let resolveValidation: ((errors: FormErrors) => void) | undefined;
    let resolveSubmit: (() => void) | undefined;
    let submitSetErrors: ((errors: FormErrors) => void) | undefined;
    const controller = createForm(element, {
      read: readObject,
      validate: () =>
        new Promise<FormErrors>((resolve) => {
          resolveValidation = resolve;
        }),
      submit: (context) => {
        submitSetErrors = (errors) => context.setErrors(errors);
        expect(context.signal.aborted).toBe(false);
        return new Promise<void>((resolve) => {
          resolveSubmit = resolve;
        });
      },
    });

    void controller.validate();
    element.dispatchEvent(
      new SubmitEvent("submit", { bubbles: true, cancelable: true, submitter: button }),
    );
    await tick();
    expect(button.disabled).toBe(false);

    controller.destroy();
    resolveValidation?.({ title: ["late validation"] });
    submitSetErrors?.({ title: ["late submit"] });
    resolveSubmit?.();
    await tick();

    expect(button.disabled).toBe(false);
    expect(element.querySelector("[data-taipa-error-for='title']")).toBeNull();
  });

  test("reset refreshes values, clears dirty/touched/errors, and handles native reset events", async () => {
    const element = form(`<input name="title" value="original"><p data-taipa-form-status></p>`);
    const input = element.querySelector("input") as HTMLInputElement;
    const controller = createForm(element, { read: readObject });

    input.value = "changed";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    controller.setErrors({ title: ["bad"] });
    expect(controller.dirty()).toBe(true);
    expect(controller.touched().has("title")).toBe(true);
    expect(controller.errors().title).toEqual(["bad"]);

    controller.reset();
    expect(controller.values()).toEqual({ title: "original" });
    expect(controller.dirty()).toBe(false);
    expect(controller.touched().size).toBe(0);
    expect(controller.errors()).toEqual({});

    input.value = "changed again";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    element.reset();
    await tick();
    expect(controller.values()).toEqual({ title: "original" });
    expect(controller.dirty()).toBe(false);
  });

  test("destroyed controllers do not leave duplicate delegated listeners after re-enhancement", async () => {
    const element = form(`<input name="title" value="a">`);
    const input = element.querySelector("input") as HTMLInputElement;
    const validate = vi.fn();

    createForm(element, { read: readObject, validate, mode: "input" }).destroy();
    createForm(element, { read: readObject, validate, mode: "input" });

    input.value = "b";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await tick();

    expect(validate).toHaveBeenCalledTimes(1);
  });
});
