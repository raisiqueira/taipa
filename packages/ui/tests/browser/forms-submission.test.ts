import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import type { FormErrors } from "../../src/types.ts";
import { createForm } from "../../src/forms/controller.ts";

const mounted: HTMLFormElement[] = [];

function form(markup: string): HTMLFormElement {
  const template = document.createElement("template");
  template.innerHTML = `<form action="/native" method="post">${markup}</form>`;
  const element = template.content.firstElementChild as HTMLFormElement;
  document.body.append(element);
  mounted.push(element);
  return element;
}

function readObject({
  formData,
}: {
  readonly formData: FormData;
}): Record<string, FormDataEntryValue | FormDataEntryValue[]> {
  const entries: Record<string, FormDataEntryValue | FormDataEntryValue[]> = Object.create(null);
  for (const [name, value] of formData) {
    if (entries[name] === undefined) {
      entries[name] = value;
    } else if (Array.isArray(entries[name])) {
      entries[name].push(value);
    } else {
      entries[name] = [entries[name], value];
    }
  }
  return entries;
}

function submit(target: HTMLFormElement, submitter?: HTMLElement): SubmitEvent {
  const event = new SubmitEvent("submit", {
    bubbles: true,
    cancelable: true,
    submitter,
  });
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

describe("native submission path", () => {
  test("validates once, then replays the original submitter through requestSubmit", async () => {
    const element = form(
      `<input name="title" value="hello"><button name="intent" value="save">Save</button>`,
    );
    const button = element.querySelector("button") as HTMLButtonElement;
    const validations: FormDataEntryValue[] = [];
    const replayDefaults: boolean[] = [];
    const requestSubmit = vi.fn((submitter?: HTMLElement | null) => {
      expect(submitter).toBe(button);
      const replay = submit(element, submitter ?? undefined);
      replayDefaults.push(replay.defaultPrevented);
    });
    element.requestSubmit = requestSubmit as HTMLFormElement["requestSubmit"];

    createForm(element, {
      read: readObject,
      validate: ({ formData }) => {
        validations.push(formData.get("intent") ?? "missing");
      },
    });

    const first = submit(element, button);
    expect(first.defaultPrevented).toBe(true);
    await tick();

    expect(validations).toEqual(["save"]);
    expect(requestSubmit).toHaveBeenCalledTimes(1);
    expect(replayDefaults).toEqual([false]);
  });

  test("invalid application validation prevents native replay", async () => {
    const element = form(
      `<input name="title" value=""><button>Send</button><div data-taipa-error-for="title"></div>`,
    );
    const button = element.querySelector("button") as HTMLButtonElement;
    const requestSubmit = vi.fn();
    element.requestSubmit = requestSubmit as HTMLFormElement["requestSubmit"];

    createForm(element, {
      read: readObject,
      validate: (): FormErrors => ({ title: ["Required"] }),
    });

    const event = submit(element, button);
    expect(event.defaultPrevented).toBe(true);
    await tick();

    expect(requestSubmit).not.toHaveBeenCalled();
    expect(element.querySelector("[data-taipa-error-for='title']")?.textContent).toBe("Required");
  });

  test("native constraint failure stops before application validation", async () => {
    const element = form(`<input required name="title" value=""><button>Send</button>`);
    const button = element.querySelector("button") as HTMLButtonElement;
    const validate = vi.fn();
    const requestSubmit = vi.fn();
    const reportValidity = vi.spyOn(element, "reportValidity").mockReturnValue(false);
    element.requestSubmit = requestSubmit as HTMLFormElement["requestSubmit"];

    createForm(element, { read: readObject, validate });

    const event = submit(element, button);
    expect(event.defaultPrevented).toBe(true);
    await tick();

    expect(reportValidity).toHaveBeenCalledTimes(1);
    expect(validate).not.toHaveBeenCalled();
    expect(requestSubmit).not.toHaveBeenCalled();
  });

  test("formnovalidate bypasses native and Taipa validation for that attempt", async () => {
    const element = form(
      `<input required name="title" value=""><button formnovalidate>Draft</button>`,
    );
    const button = element.querySelector("button") as HTMLButtonElement;
    const validate = vi.fn();
    const reportValidity = vi.spyOn(element, "reportValidity");

    createForm(element, { read: readObject, validate });

    const event = submit(element, button);
    await tick();

    expect(event.defaultPrevented).toBe(false);
    expect(reportValidity).not.toHaveBeenCalled();
    expect(validate).not.toHaveBeenCalled();
  });

  test("destroy removes the submit interception", async () => {
    const element = form(`<input name="title" value="hello"><button>Send</button>`);
    const button = element.querySelector("button") as HTMLButtonElement;
    const validate = vi.fn();
    const controller = createForm(element, { read: readObject, validate });

    controller.destroy();

    const event = submit(element, button);
    await tick();

    expect(event.defaultPrevented).toBe(false);
    expect(validate).not.toHaveBeenCalled();
  });
});

describe("enhanced submission path", () => {
  test("prevents native submit and calls submit with FormData, file, and original submitter", async () => {
    const element = form(
      `<input type="hidden" name="csrfmiddlewaretoken" value="token"><input name="title" value="hello"><input type="file" name="avatar"><button name="intent" value="save" data-taipa-disable-while-submitting>Save</button><button name="intent" value="preview">Preview</button>`,
    );
    const file = new File(["avatar"], "avatar.txt", { type: "text/plain" });
    const fileInput = element.querySelector("input[type='file']") as HTMLInputElement;
    const transfer = new DataTransfer();
    transfer.items.add(file);
    fileInput.files = transfer.files;
    const save = element.querySelector("button[value='save']") as HTMLButtonElement;
    const preview = element.querySelector("button[value='preview']") as HTMLButtonElement;
    let releaseSubmit: (() => void) | undefined;
    const submitCalls: FormData[] = [];

    const controller = createForm(element, {
      read: readObject,
      submit: ({ formData }) => {
        submitCalls.push(formData);
        return new Promise<void>((resolve) => {
          releaseSubmit = resolve;
        });
      },
    });

    const event = submit(element, save);
    await tick();

    expect(event.defaultPrevented).toBe(true);
    expect(submitCalls).toHaveLength(1);
    expect(submitCalls[0]?.get("csrfmiddlewaretoken")).toBe("token");
    expect(submitCalls[0]?.get("title")).toBe("hello");
    expect(submitCalls[0]?.get("intent")).toBe("save");
    expect((submitCalls[0]?.get("avatar") as File | null)?.name).toBe("avatar.txt");
    expect(controller.submitting()).toBe(true);
    expect(save.disabled).toBe(true);
    expect(preview.disabled).toBe(false);

    releaseSubmit?.();
    await tick();

    expect(controller.submitting()).toBe(false);
    expect(save.disabled).toBe(false);
  });

  test("formnovalidate bypasses validation but still uses the enhanced submit handler", async () => {
    const element = form(
      `<input required name="title" value=""><button formnovalidate name="intent" value="draft">Draft</button>`,
    );
    const button = element.querySelector("button") as HTMLButtonElement;
    const validate = vi.fn();
    const enhanced = vi.fn();
    const reportValidity = vi.spyOn(element, "reportValidity");

    createForm(element, { read: readObject, validate, submit: enhanced });

    const event = submit(element, button);
    await tick();

    expect(event.defaultPrevented).toBe(true);
    expect(reportValidity).not.toHaveBeenCalled();
    expect(validate).not.toHaveBeenCalled();
    expect(enhanced).toHaveBeenCalledTimes(1);
    expect(enhanced.mock.calls[0]?.[0].formData.get("intent")).toBe("draft");
  });

  test("submit handlers can set text-only server errors without replaying native POST", async () => {
    const element = form(
      `<input name="title" value="hello"><button>Send</button><div data-taipa-error-for="title"></div>`,
    );
    const button = element.querySelector("button") as HTMLButtonElement;
    const requestSubmit = vi.fn();
    element.requestSubmit = requestSubmit as HTMLFormElement["requestSubmit"];

    createForm(element, {
      read: readObject,
      submit: (context) => {
        context.setErrors({ title: ["<strong>Server says no</strong>"] });
      },
    });

    const event = submit(element, button);
    await tick();

    expect(event.defaultPrevented).toBe(true);
    expect(requestSubmit).not.toHaveBeenCalled();
    const error = element.querySelector("[data-taipa-error-for='title']");
    expect(error?.textContent).toBe("<strong>Server says no</strong>");
    expect(error?.innerHTML).not.toContain("<strong>");
  });

  test("stale submit completions and setErrors calls cannot overwrite newer results", async () => {
    const element = form(
      `<input name="title" value="hello"><button>Send</button><div data-taipa-error-for="title"></div>`,
    );
    const button = element.querySelector("button") as HTMLButtonElement;
    const setErrorsCalls: Array<(errors: FormErrors) => void> = [];
    const releases: Array<() => void> = [];

    createForm(element, {
      read: readObject,
      submit: (context) => {
        setErrorsCalls.push((errors) => context.setErrors(errors));
        return new Promise<void>((resolve) => releases.push(resolve));
      },
    });

    submit(element, button);
    await tick();
    submit(element, button);
    await tick();

    expect(setErrorsCalls).toHaveLength(2);
    setErrorsCalls[0]?.({ title: ["first"] });
    releases[0]?.();
    await tick();
    setErrorsCalls[1]?.({ title: ["second"] });
    releases[1]?.();
    await tick();

    expect(element.querySelector("[data-taipa-error-for='title']")?.textContent).toBe("second");
  });

  test("rejected enhanced submissions are retryable", async () => {
    const element = form(`<input name="title" value="hello"><button>Send</button>`);
    const button = element.querySelector("button") as HTMLButtonElement;
    const submitHandler = vi
      .fn()
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(undefined);
    const controller = createForm(element, { read: readObject, submit: submitHandler });

    submit(element, button);
    await tick();
    await tick();
    expect(controller.submitting()).toBe(false);

    submit(element, button);
    await tick();

    expect(submitHandler).toHaveBeenCalledTimes(2);
    expect(controller.submitting()).toBe(false);
  });
});
