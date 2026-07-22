import type { FormErrors } from "../types.ts";
import { controlsForName } from "./values.ts";

const ERROR_ATTR = "data-taipa-error-for";
const STATUS_ATTR = "data-taipa-form-status";
let generatedId = 0;

export interface ErrorRenderer {
  readonly initialErrors: FormErrors;
  apply(errors: FormErrors, options?: { readonly announce?: boolean }): void;
  restore(): void;
}

export function normalizeErrors(errors: FormErrors | void): FormErrors {
  const normalized: Record<string, readonly string[]> = Object.create(null);
  if (errors === undefined) {
    return normalized;
  }
  for (const [name, messages] of Object.entries(errors)) {
    if (name === "__proto__" || name === "prototype" || name === "constructor") {
      throw new TypeError(`dangerous form error field name "${name}"`);
    }
    const normalizedMessages = messages.map(String).filter((message) => message.length > 0);
    if (normalizedMessages.length > 0) {
      normalized[name] = Object.freeze(normalizedMessages);
    }
  }
  return Object.freeze(normalized);
}

export function createErrorRenderer(form: HTMLFormElement): ErrorRenderer {
  const originalDescribedBy = new WeakMap<Element, string | null>();
  const originalInvalid = new WeakMap<Element, string | null>();
  for (const element of Array.from(form.elements)) {
    originalDescribedBy.set(element, element.getAttribute("aria-describedby"));
    originalInvalid.set(element, element.getAttribute("aria-invalid"));
  }
  const originalContainers = new Map<HTMLElement, ContainerSnapshot>();
  for (const container of errorContainers(form)) {
    originalContainers.set(container, snapshotContainer(container));
  }
  const generatedContainers = new Set<HTMLElement>();
  const status = form.querySelector<HTMLElement>(`[${STATUS_ATTR}]`);
  const originalStatusText = status?.textContent ?? null;
  const initialErrors = adoptServerErrors(form);

  return {
    initialErrors,
    apply(errors, options) {
      applyErrors(
        form,
        originalDescribedBy,
        generatedContainers,
        errors,
        options?.announce ?? true,
      );
    },
    restore() {
      for (const container of generatedContainers) {
        container.remove();
      }
      generatedContainers.clear();
      for (const [container, snapshot] of originalContainers) {
        restoreContainer(container, snapshot);
      }
      for (const element of Array.from(form.elements)) {
        restoreAttribute(element, "aria-describedby", originalDescribedBy.get(element));
        restoreAttribute(element, "aria-invalid", originalInvalid.get(element));
      }
      if (status !== null && originalStatusText !== null) {
        status.textContent = originalStatusText;
      }
    },
  };
}

interface ContainerSnapshot {
  readonly id: string | null;
  readonly role: string | null;
  readonly text: string;
}

function snapshotContainer(container: HTMLElement): ContainerSnapshot {
  return {
    id: container.getAttribute("id"),
    role: container.getAttribute("role"),
    text: container.textContent ?? "",
  };
}

function restoreContainer(container: HTMLElement, snapshot: ContainerSnapshot): void {
  restoreAttribute(container, "id", snapshot.id);
  restoreAttribute(container, "role", snapshot.role);
  container.textContent = snapshot.text;
}

function restoreAttribute(element: Element, name: string, value: string | null | undefined): void {
  if (value === null || value === undefined) {
    element.removeAttribute(name);
  } else {
    element.setAttribute(name, value);
  }
}

function adoptServerErrors(form: HTMLFormElement): FormErrors {
  const adopted: Record<string, readonly string[]> = Object.create(null);
  for (const container of errorContainers(form)) {
    const name = container.getAttribute(ERROR_ATTR);
    const message = container.textContent?.trim() ?? "";
    if (name !== null && message !== "") {
      adopted[name] = Object.freeze([message]);
    }
  }
  return Object.freeze(adopted);
}

function applyErrors(
  form: HTMLFormElement,
  originalDescribedBy: WeakMap<Element, string | null>,
  generatedContainers: Set<HTMLElement>,
  errors: FormErrors,
  announce: boolean,
): void {
  const fields = new Set([...Object.keys(errors), ...errorContainers(form).map(containerName)]);
  for (const name of fields) {
    const messages = errors[name] ?? [];
    const container = errorContainerFor(form, name, generatedContainers);
    if (messages.length > 0) {
      if (container.id === "") {
        container.id = `taipa-error-${++generatedId}`;
      }
      container.setAttribute("role", "alert");
      container.textContent = messages.join("\n");
    } else {
      container.textContent = "";
      container.removeAttribute("role");
    }
    for (const control of controlsForName(form, name)) {
      originalDescribedBy.set(
        control,
        originalDescribedBy.get(control) ?? control.getAttribute("aria-describedby"),
      );
      if (messages.length > 0) {
        control.setAttribute("aria-invalid", "true");
        control.setAttribute(
          "aria-describedby",
          mergeTokens(originalDescribedBy.get(control), container.id),
        );
      } else {
        control.removeAttribute("aria-invalid");
        const original = originalDescribedBy.get(control);
        if (original === null || original === undefined || original === "") {
          control.removeAttribute("aria-describedby");
        } else {
          control.setAttribute("aria-describedby", original);
        }
      }
    }
  }
  if (announce) {
    announceStatus(form, Object.keys(errors).length);
  }
}

function errorContainers(form: HTMLFormElement): HTMLElement[] {
  return Array.from(form.querySelectorAll<HTMLElement>(`[${ERROR_ATTR}]`));
}

function containerName(container: HTMLElement): string {
  return container.getAttribute(ERROR_ATTR) ?? "";
}

function errorContainerFor(
  form: HTMLFormElement,
  name: string,
  generatedContainers: Set<HTMLElement>,
): HTMLElement {
  const existing = errorContainers(form).find(
    (container) => container.getAttribute(ERROR_ATTR) === name,
  );
  if (existing !== undefined) {
    return existing;
  }
  const container = document.createElement("p");
  container.setAttribute(ERROR_ATTR, name);
  generatedContainers.add(container);
  form.append(container);
  return container;
}

function mergeTokens(original: string | null | undefined, token: string): string {
  return [...new Set([...(original?.split(/\s+/).filter(Boolean) ?? []), token])].join(" ");
}

function announceStatus(form: HTMLFormElement, count: number): void {
  const status = form.querySelector<HTMLElement>(`[${STATUS_ATTR}]`);
  if (status === null) {
    return;
  }
  status.textContent =
    count === 0 ? "" : `Please correct ${count} ${count === 1 ? "field" : "fields"}.`;
}
