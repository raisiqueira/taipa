import { computed, signal } from "alien-signals";
import type { CreateFormOptions, FormController, FormErrors } from "../types";
import { createErrorRenderer, normalizeErrors } from "./errors";
import { disableSubmittingControls } from "./submission";
import { formDataFor, setValue as setControlValue } from "./values";

export function createForm<T>(
  form: HTMLFormElement,
  options: CreateFormOptions<T>,
): FormController<T> {
  let destroyed = false;
  let validationGeneration = 0;
  let validationAbort: AbortController | undefined;
  let submissionGeneration = 0;
  let submissionAbort: AbortController | undefined;
  let restoreSubmittingControls: (() => void) | undefined;
  let nativeSubmitBypass = false;
  const errorRenderer = createErrorRenderer(form);
  const values = signal(readValues(form, options));
  const errors = signal(errorRenderer.initialErrors);
  const dirty = signal(false);
  const touched = signal<ReadonlySet<string>>(new Set());
  const validating = signal(false);
  const submitting = signal(false);
  const valid = computed(() => Object.keys(errors()).length === 0);

  const abort = new AbortController();
  form.addEventListener("input", handleInput, { signal: abort.signal });
  form.addEventListener("change", handleInput, { signal: abort.signal });
  form.addEventListener("focusout", handleBlur, { signal: abort.signal });
  form.addEventListener("reset", handleReset, { signal: abort.signal });
  form.addEventListener("submit", handleSubmit, { signal: abort.signal });

  function refreshValues(submitter?: HTMLElement | null): void {
    values(readValues(form, options, submitter));
  }

  function handleInput(event: Event): void {
    refreshValues();
    dirty(true);
    const name = fieldName(event.target);
    if (name !== undefined) {
      touched(new Set([...touched(), name]));
      if (options.mode === "input") {
        void validate([name]);
      }
    }
  }

  function handleBlur(event: Event): void {
    const name = fieldName(event.target);
    if (name === undefined) {
      return;
    }
    touched(new Set([...touched(), name]));
    if (options.mode === "blur") {
      void validate([name]);
    }
  }

  function handleReset(): void {
    queueMicrotask(resetStateAfterNativeReset);
  }

  function handleSubmit(event: SubmitEvent): void {
    if (nativeSubmitBypass) {
      nativeSubmitBypass = false;
      return;
    }
    const submitter = submitterFrom(event);
    const skipValidation = bypassesValidation(submitter);
    if (options.submit !== undefined) {
      event.preventDefault();
      if (skipValidation) {
        void submitEnhanced(submitter);
        return;
      }
      if (!form.noValidate && !form.reportValidity()) {
        return;
      }
      void validate(undefined, submitter).then((isValid) => {
        if (!destroyed && isValid) {
          void submitEnhanced(submitter);
        }
      });
      return;
    }
    if (skipValidation) {
      return;
    }
    event.preventDefault();
    if (!form.noValidate && !form.reportValidity()) {
      return;
    }
    void validate(undefined, submitter).then((isValid) => {
      if (!destroyed && isValid) {
        replayNativeSubmit(submitter);
      }
    });
  }

  async function validate(
    fieldNames?: readonly string[],
    submitter?: HTMLElement | null,
  ): Promise<boolean> {
    if (destroyed) {
      return valid();
    }
    refreshValues(submitter);
    validationAbort?.abort();
    const generation = ++validationGeneration;
    const controller = new AbortController();
    validationAbort = controller;
    validating(true);
    try {
      const result = await options.validate?.({
        form,
        values: values(),
        formData: formDataFor(form, submitter),
        signal: controller.signal,
      });
      if (generation !== validationGeneration || controller.signal.aborted) {
        return valid();
      }
      setNormalizedErrors(mergeFieldErrors(errors(), normalizeErrors(result), fieldNames));
      return valid();
    } finally {
      if (generation === validationGeneration) {
        validating(false);
      }
    }
  }

  function replayNativeSubmit(submitter?: HTMLElement | null): void {
    nativeSubmitBypass = true;
    try {
      form.requestSubmit(submitter ?? undefined);
    } finally {
      queueMicrotask(() => {
        nativeSubmitBypass = false;
      });
    }
  }

  async function submitEnhanced(submitter?: HTMLElement | null): Promise<void> {
    if (destroyed || options.submit === undefined) {
      return;
    }
    submissionAbort?.abort();
    restoreSubmittingControls?.();
    restoreSubmittingControls = undefined;
    const generation = ++submissionGeneration;
    const controller = new AbortController();
    submissionAbort = controller;
    const formData = formDataFor(form, submitter);
    const nextValues = Object.freeze(options.read({ form, formData }));
    values(nextValues);
    const restoreControls = disableSubmittingControls(form);
    restoreSubmittingControls = restoreControls;
    submitting(true);
    try {
      await options.submit({
        form,
        values: nextValues,
        formData,
        signal: controller.signal,
        setErrors(nextErrors) {
          if (generation === submissionGeneration && !controller.signal.aborted && !destroyed) {
            setNormalizedErrors(normalizeErrors(nextErrors));
          }
        },
      });
    } catch {
      // Enhanced submission is retryable: failures clear the submitting state
      // but never replay the native POST path.
    } finally {
      if (generation === submissionGeneration) {
        restoreControls();
        restoreSubmittingControls = undefined;
        submitting(false);
      }
    }
  }

  function setErrors(nextErrors: FormErrors): void {
    setNormalizedErrors(normalizeErrors(nextErrors));
  }

  function setNormalizedErrors(nextErrors: FormErrors): void {
    errors(nextErrors);
    errorRenderer.apply(nextErrors);
  }

  return {
    values,
    errors,
    dirty,
    touched,
    validating,
    submitting,
    valid,
    validate,
    setErrors,
    setValue(name, value) {
      setControlValue(form, name, value);
      refreshValues();
      dirty(true);
    },
    reset() {
      form.reset();
      resetStateAfterNativeReset();
    },
    destroy() {
      if (destroyed) {
        return;
      }
      destroyed = true;
      validationAbort?.abort();
      submissionAbort?.abort();
      restoreSubmittingControls?.();
      restoreSubmittingControls = undefined;
      errorRenderer.restore();
      abort.abort();
    },
  };

  function resetStateAfterNativeReset(): void {
    if (destroyed) {
      return;
    }
    refreshValues();
    dirty(false);
    touched(new Set());
    setNormalizedErrors(normalizeErrors(undefined));
  }
}

function submitterFrom(event: SubmitEvent): HTMLElement | null {
  if (event.submitter instanceof HTMLElement) {
    return event.submitter;
  }
  if (!(event.currentTarget instanceof HTMLFormElement)) {
    return null;
  }
  const activeElement = document.activeElement;
  return activeElement instanceof HTMLElement && event.currentTarget.contains(activeElement)
    ? activeElement
    : null;
}

function bypassesValidation(submitter: HTMLElement | null): boolean {
  return (
    (submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement) &&
    submitter.formNoValidate
  );
}

function readValues<T>(
  form: HTMLFormElement,
  options: CreateFormOptions<T>,
  submitter?: HTMLElement | null,
): Readonly<T> {
  return Object.freeze(options.read({ form, formData: formDataFor(form, submitter) }));
}

function fieldName(target: EventTarget | null): string | undefined {
  return target instanceof Element && "name" in target && typeof target.name === "string"
    ? target.name
    : undefined;
}

function mergeFieldErrors(
  current: FormErrors,
  next: FormErrors,
  fieldNames?: readonly string[],
): FormErrors {
  if (fieldNames === undefined) {
    return next;
  }
  const merged: Record<string, readonly string[]> = Object.create(null);
  for (const [name, messages] of Object.entries(current)) {
    merged[name] = messages;
  }
  for (const name of fieldNames) {
    delete merged[name];
    if (next[name] !== undefined) {
      merged[name] = next[name];
    }
  }
  return Object.freeze(merged);
}
