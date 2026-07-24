import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { createForm, standardSchema } from "../../src/forms/index";
import { issuesToFormErrors } from "../../src/forms/standard-schema";
import type { StandardSchemaIssue, StandardSchemaV1 } from "../../src/types";

const mounted: HTMLFormElement[] = [];

function form(markup: string): HTMLFormElement {
  const template = document.createElement("template");
  template.innerHTML = `<form action="/native" method="post">${markup}</form>`;
  const element = template.content.firstElementChild as HTMLFormElement;
  document.body.append(element);
  mounted.push(element);
  return element;
}

function readObject({ formData }: { readonly formData: FormData }): Record<string, unknown> {
  const values: Record<string, unknown> = Object.create(null);
  for (const [name, value] of formData) {
    if (values[name] === undefined) {
      values[name] = value;
    } else if (Array.isArray(values[name])) {
      values[name].push(value);
    } else {
      values[name] = [values[name], value];
    }
  }
  return values;
}

function schema(
  validate: StandardSchemaV1<unknown, unknown>["~standard"]["validate"],
): StandardSchemaV1<unknown, unknown> {
  return { "~standard": { version: 1, vendor: "test", validate } };
}

function callableSchema(
  validate: StandardSchemaV1<unknown, unknown>["~standard"]["validate"],
): StandardSchemaV1<unknown, unknown> {
  const callable = () => undefined;
  return Object.assign(callable, {
    "~standard": { version: 1 as const, vendor: "test", validate },
  });
}

function submit(target: HTMLFormElement, submitter?: HTMLElement): SubmitEvent {
  const event = new SubmitEvent("submit", { bubbles: true, cancelable: true, submitter });
  target.dispatchEvent(event);
  return event;
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

describe("Standard Schema issue mapping", () => {
  test("maps field, nested, array, object-segment, pathless, and repeated issues", () => {
    const issues: StandardSchemaIssue[] = [
      { message: "Title required", path: ["title"] },
      { message: "Email invalid", path: ["user", "email"] },
      { message: "Name required", path: ["items", 0, "name"] },
      { message: "Object segment", path: [{ key: "billing" }, { key: "zip" }] },
      { message: "Second title", path: ["title"] },
      { message: "Whole form" },
    ];

    expect(issuesToFormErrors(issues)).toEqual({
      title: ["Title required", "Second title"],
      "user.email": ["Email invalid"],
      "items.0.name": ["Name required"],
      "billing.zip": ["Object segment"],
      $form: ["Whole form"],
    });
  });

  test("keeps path mapping configurable and rejects dangerous mapped names", () => {
    expect(
      issuesToFormErrors([{ message: "Nested", path: ["user", "email"] }], {
        pathToName: (path) => path.map((part) => String(part)).join("[") + "]",
      }),
    ).toEqual({ "user[email]": ["Nested"] });

    expect(() => issuesToFormErrors([{ message: "pollution", path: ["__proto__"] }])).toThrow(
      /dangerous form error field name/,
    );
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });
});

describe("Standard Schema form adapter", () => {
  test("valid schema results allow native replay with the original submitter", async () => {
    const element = form(
      `<input name="title" value="hello"><button name="intent" value="save">Save</button>`,
    );
    const button = element.querySelector("button") as HTMLButtonElement;
    const seenValues: unknown[] = [];
    const requestSubmit = vi.fn((submitter?: HTMLElement | null) => {
      expect(submitter).toBe(button);
      submit(element, submitter ?? undefined);
    });
    element.requestSubmit = requestSubmit as HTMLFormElement["requestSubmit"];
    createForm(element, {
      read: readObject,
      validate: standardSchema(
        schema((value) => {
          seenValues.push(value);
          return { value };
        }),
      ),
    });

    const event = submit(element, button);
    await tick();

    expect(event.defaultPrevented).toBe(true);
    expect(seenValues).toEqual([{ title: "hello", intent: "save" }]);
    expect(requestSubmit).toHaveBeenCalledTimes(1);
  });

  test("schema issues render through existing text-only form errors", async () => {
    const element = form(`<input name="title" value=""><p data-taipa-error-for="title"></p>`);
    const controller = createForm(element, {
      read: readObject,
      validate: standardSchema(
        schema(() => ({
          issues: [{ message: '<img src=x onerror="alert(1)">', path: ["title"] }],
        })),
      ),
    });

    await expect(controller.validate()).resolves.toBe(false);

    const input = element.querySelector("input") as HTMLInputElement;
    const error = element.querySelector<HTMLElement>("[data-taipa-error-for='title']");
    expect(controller.errors()).toEqual({ title: ['<img src=x onerror="alert(1)">'] });
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(error?.textContent).toBe('<img src=x onerror="alert(1)">');
    expect(error?.querySelector("img")).toBeNull();
  });

  test("schema transforms do not replace the live DOM-derived values signal", async () => {
    const element = form(`<input name="age" value="42">`);
    const controller = createForm(element, {
      read: readObject,
      validate: standardSchema(schema(() => ({ value: { age: 42 } }))),
    });

    await expect(controller.validate()).resolves.toBe(true);

    expect(controller.values()).toEqual({ age: "42" });
  });

  test("callable schemas with a structural Standard Schema property are accepted", async () => {
    const element = form(`<input name="title" value="hello">`);
    const controller = createForm(element, {
      read: readObject,
      validate: standardSchema(callableSchema((value) => ({ value }))),
    });

    await expect(controller.validate()).resolves.toBe(true);

    expect(controller.errors()).toEqual({});
  });

  test("stale async schema results cannot overwrite newer validation", async () => {
    const element = form(`<input name="title" value="bad"><p data-taipa-error-for="title"></p>`);
    let releaseFirst: (() => void) | undefined;
    const controller = createForm(element, {
      read: readObject,
      validate: standardSchema(
        schema(
          (value) =>
            new Promise((resolve) => {
              if ((value as { title?: string }).title === "bad") {
                releaseFirst = () => resolve({ issues: [{ message: "Old", path: ["title"] }] });
                return;
              }
              resolve({ value });
            }),
        ),
      ),
    });

    const first = controller.validate();
    (element.elements.namedItem("title") as HTMLInputElement).value = "good";
    const second = controller.validate();
    releaseFirst?.();

    await expect(second).resolves.toBe(true);
    await expect(first).resolves.toBe(true);
    expect(controller.errors()).toEqual({});
    expect(element.querySelector("[data-taipa-error-for]")?.textContent).toBe("");
  });

  test("formnovalidate skips schema validation but still uses enhanced submit", async () => {
    const element = form(
      `<input required name="title" value=""><button formnovalidate name="intent" value="draft">Draft</button>`,
    );
    const button = element.querySelector("button") as HTMLButtonElement;
    const validate = vi.fn(() => ({ value: {} }));
    const enhanced = vi.fn();
    createForm(element, {
      read: readObject,
      validate: standardSchema(schema(validate)),
      submit: enhanced,
    });

    const event = submit(element, button);
    await tick();

    expect(event.defaultPrevented).toBe(true);
    expect(validate).not.toHaveBeenCalled();
    expect(enhanced).toHaveBeenCalledTimes(1);
  });

  test("schema throws become retryable form-level validation errors", async () => {
    const element = form(`<input name="title" value="bad"><p data-taipa-error-for="$form"></p>`);
    let fail = true;
    const controller = createForm(element, {
      read: readObject,
      validate: standardSchema(
        schema((value) => {
          if (fail) {
            throw new Error("offline");
          }
          return { value };
        }),
      ),
    });

    await expect(controller.validate()).resolves.toBe(false);
    expect(controller.errors()).toEqual({ $form: ["Validation failed. Please try again."] });
    expect(element.querySelector("[data-taipa-error-for='$form']")?.textContent).toBe(
      "Validation failed. Please try again.",
    );

    fail = false;
    await expect(controller.validate()).resolves.toBe(true);
    expect(controller.errors()).toEqual({});
  });

  test("schema promise rejections become retryable form-level validation errors", async () => {
    const element = form(`<input name="title" value="bad"><p data-taipa-error-for="$form"></p>`);
    let fail = true;
    const controller = createForm(element, {
      read: readObject,
      validate: standardSchema(
        schema((value) => {
          if (fail) {
            return Promise.reject(new Error("offline"));
          }
          return { value };
        }),
      ),
    });

    await expect(controller.validate()).resolves.toBe(false);
    expect(controller.errors()).toEqual({ $form: ["Validation failed. Please try again."] });

    fail = false;
    await expect(controller.validate()).resolves.toBe(true);
    expect(controller.errors()).toEqual({});
  });

  test("destroy during pending schema validation ignores the late result", async () => {
    const element = form(`<input name="title" value="bad"><p data-taipa-error-for="title"></p>`);
    let release: (() => void) | undefined;
    const controller = createForm(element, {
      read: readObject,
      validate: standardSchema(
        schema(
          () =>
            new Promise((resolve) => {
              release = () => resolve({ issues: [{ message: "late", path: ["title"] }] });
            }),
        ),
      ),
    });

    const pending = controller.validate();
    controller.destroy();
    release?.();
    await pending;

    expect(element.querySelector("[data-taipa-error-for='title']")?.textContent).toBe("");
  });
});
