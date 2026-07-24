import { describe, expect, test } from "vite-plus/test";
import { formDataFor, setValue } from "../../src/forms/values";

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

function values(form: HTMLFormElement, name: string): FormDataEntryValue[] {
  return formDataFor(form).getAll(name);
}

describe("formDataFor", () => {
  test("reads fresh FormData from native successful controls", () => {
    const form = formFrom(`<form>
      <input name="title" value="Draft">
      <textarea name="body">Hello</textarea>
      <input name="ignored" value="disabled" disabled>
      <input type="checkbox" name="flags" value="a" checked>
      <input type="checkbox" name="flags" value="b">
      <input type="radio" name="choice" value="x">
      <input type="radio" name="choice" value="y" checked>
      <select name="kind"><option value="one">One</option><option value="two" selected>Two</option></select>
      <select name="tags" multiple>
        <option value="red" selected>Red</option>
        <option value="blue" selected>Blue</option>
      </select>
    </form>`);

    expect(values(form, "title")).toEqual(["Draft"]);
    expect(values(form, "body")).toEqual(["Hello"]);
    expect(values(form, "ignored")).toEqual([]);
    expect(values(form, "flags")).toEqual(["a"]);
    expect(values(form, "choice")).toEqual(["y"]);
    expect(values(form, "kind")).toEqual(["two"]);
    expect(values(form, "tags")).toEqual(["red", "blue"]);

    form.remove();
  });

  test("includes the original submitter when the platform supports it", () => {
    const form = formFrom(`<form>
      <input name="title" value="Draft">
      <button name="intent" value="save">Save</button>
      <button name="intent" value="publish">Publish</button>
    </form>`);
    const publish = form.querySelector<HTMLButtonElement>('button[value="publish"]');

    expect(formDataFor(form, publish ?? undefined).getAll("intent")).toEqual(["publish"]);

    form.remove();
  });

  test("preserves File entries and leaves file inputs user-controlled", () => {
    const form = formFrom(`<form><input type="file" name="upload"></form>`);
    const input = form.elements.namedItem("upload");
    expect(input).toBeInstanceOf(HTMLInputElement);

    setValue(form, "upload", "attempted.txt");

    const entry = formDataFor(form).get("upload");
    expect(entry).toBeInstanceOf(File);
    expect((entry as File).name).toBe("");

    form.remove();
  });
});

describe("setValue", () => {
  test("updates text-like controls before rereading FormData", () => {
    const form = formFrom(`<form>
      <input name="title" value="Draft">
      <textarea name="body">Old</textarea>
      <select name="kind"><option value="one">One</option><option value="two">Two</option></select>
    </form>`);

    setValue(form, "title", "Published");
    setValue(form, "body", "New body");
    setValue(form, "kind", "two");

    expect(values(form, "title")).toEqual(["Published"]);
    expect(values(form, "body")).toEqual(["New body"]);
    expect(values(form, "kind")).toEqual(["two"]);

    form.remove();
  });

  test("updates checkbox, radio, and multi-select groups from string arrays", () => {
    const form = formFrom(`<form>
      <input type="checkbox" name="flags" value="a">
      <input type="checkbox" name="flags" value="b" checked>
      <input type="checkbox" name="flags" value="c">
      <input type="radio" name="choice" value="x" checked>
      <input type="radio" name="choice" value="y">
      <select name="tags" multiple>
        <option value="red">Red</option>
        <option value="blue" selected>Blue</option>
        <option value="green">Green</option>
      </select>
    </form>`);

    setValue(form, "flags", ["a", "c"]);
    setValue(form, "choice", "y");
    setValue(form, "tags", ["red", "green"]);

    expect(values(form, "flags")).toEqual(["a", "c"]);
    expect(values(form, "choice")).toEqual(["y"]);
    expect(values(form, "tags")).toEqual(["red", "green"]);

    form.remove();
  });

  test("matches field names exactly without selector interpolation", () => {
    const tricky = `__proto__][name="title`;
    const form = formFrom(`<form>
      <input name="title" value="safe">
      <input name='${tricky}' value="old">
    </form>`);

    setValue(form, tricky, "new");

    expect(values(form, "title")).toEqual(["safe"]);
    expect(values(form, tricky)).toEqual(["new"]);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();

    form.remove();
  });
});
