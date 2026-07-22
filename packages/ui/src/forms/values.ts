export function formDataFor(form: HTMLFormElement, submitter?: HTMLElement | null): FormData {
  if (submitter === undefined || submitter === null) {
    return new FormData(form);
  }
  try {
    return new FormData(form, submitter as HTMLButtonElement | HTMLInputElement);
  } catch {
    const formData = new FormData(form);
    appendSubmitterFallback(formData, submitter);
    return formData;
  }
}

export function controlsForName(form: HTMLFormElement, name: string): readonly Element[] {
  return Array.from(form.elements).filter(
    (element) => element instanceof Element && "name" in element && element.name === name,
  );
}

export function setValue(
  form: HTMLFormElement,
  name: string,
  value: string | File | readonly string[],
): void {
  const values = Array.isArray(value)
    ? value.map((item) => item)
    : [value instanceof File ? value.name : value];
  for (const control of controlsForName(form, name)) {
    if (control instanceof HTMLInputElement) {
      setInputValue(control, values);
    } else if (control instanceof HTMLTextAreaElement) {
      control.value = values[0] ?? "";
    } else if (control instanceof HTMLSelectElement) {
      setSelectValue(control, values);
    }
  }
}

function setInputValue(input: HTMLInputElement, values: readonly string[]): void {
  if (input.type === "file") {
    return;
  }
  if (input.type === "checkbox" || input.type === "radio") {
    input.checked = values.includes(input.value);
    return;
  }
  input.value = values[0] ?? "";
}

function setSelectValue(select: HTMLSelectElement, values: readonly string[]): void {
  for (const option of select.options) {
    option.selected = values.includes(option.value);
  }
}

function appendSubmitterFallback(formData: FormData, submitter: HTMLElement): void {
  if (
    !(submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement) ||
    submitter.disabled ||
    submitter.name === ""
  ) {
    return;
  }
  if (submitter instanceof HTMLInputElement && submitter.type === "image") {
    formData.append(`${submitter.name}.x`, "0");
    formData.append(`${submitter.name}.y`, "0");
    return;
  }
  formData.append(submitter.name, submitter.value);
}
