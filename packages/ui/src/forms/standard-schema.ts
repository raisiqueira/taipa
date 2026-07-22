import type {
  FormErrors,
  FormValidationContext,
  StandardSchemaAdapterOptions,
  StandardSchemaIssue,
  StandardSchemaPathSegment,
  StandardSchemaV1,
} from "../types.ts";
import { normalizeErrors } from "./errors.ts";

const DEFAULT_FORM_ERROR_NAME = "$form";
const DEFAULT_ERROR_MESSAGE = "Validation failed. Please try again.";

export function standardSchema<T>(
  schema: StandardSchemaV1<Readonly<T>, unknown>,
  options: StandardSchemaAdapterOptions = {},
): (context: FormValidationContext<T>) => Promise<FormErrors | void> {
  return async ({ values }) => {
    try {
      assertStandardSchema(schema);
      const result = await schema["~standard"].validate(values);
      if ("issues" in result && result.issues !== undefined) {
        return issuesToFormErrors(result.issues, options);
      }
      return undefined;
    } catch (error) {
      return normalizeErrors({
        [options.formErrorName ?? DEFAULT_FORM_ERROR_NAME]: [errorMessage(error, options)],
      });
    }
  };
}

export function issuesToFormErrors(
  issues: readonly StandardSchemaIssue[],
  options: StandardSchemaAdapterOptions = {},
): FormErrors {
  const errors: Record<string, string[]> = Object.create(null);
  for (const issue of issues) {
    const name = issueName(issue, options);
    errors[name] ??= [];
    errors[name].push(issue.message);
  }
  return normalizeErrors(errors);
}

function issueName(issue: StandardSchemaIssue, options: StandardSchemaAdapterOptions): string {
  const formErrorName = options.formErrorName ?? DEFAULT_FORM_ERROR_NAME;
  if (issue.path === undefined || issue.path.length === 0) {
    return formErrorName;
  }
  const path = issue.path.map(pathKey);
  return options.pathToName?.(path) ?? path.map(String).join(".");
}

function pathKey(segment: StandardSchemaPathSegment): PropertyKey {
  if (typeof segment === "object" && segment !== null && "key" in segment) {
    return segment.key;
  }
  return segment;
}

function assertStandardSchema(schema: StandardSchemaV1<unknown, unknown>): void {
  if (
    (typeof schema !== "object" && typeof schema !== "function") ||
    schema === null ||
    typeof schema["~standard"] !== "object" ||
    schema["~standard"] === null ||
    schema["~standard"].version !== 1 ||
    typeof schema["~standard"].validate !== "function"
  ) {
    throw new TypeError("expected a Standard Schema V1 compatible schema");
  }
}

function errorMessage(error: unknown, options: StandardSchemaAdapterOptions): string {
  if (typeof options.errorMessage === "function") {
    return options.errorMessage(error);
  }
  return options.errorMessage ?? DEFAULT_ERROR_MESSAGE;
}
