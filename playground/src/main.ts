import { bootstrap, mount } from "@taipa/ui/client";
import { createForm, standardSchema } from "@taipa/ui/forms";
import type { StandardSchemaV1 } from "@taipa/ui/forms";
import { Counter } from "./counter.ts";
import "./style.css";

interface SignupValues {
  readonly title: string;
  readonly email: string;
}

const signupSchema: StandardSchemaV1<Readonly<SignupValues>> = {
  "~standard": {
    version: 1,
    vendor: "taipa-playground",
    validate(value) {
      const issues: Array<{ readonly message: string; readonly path: readonly string[] }> = [];
      if (value.title.trim().length < 5) {
        issues.push({ message: "Use at least 5 characters.", path: ["title"] });
      }
      if (!value.email.includes("@")) {
        issues.push({ message: "Use a valid email address.", path: ["email"] });
      }
      return issues.length === 0 ? { value } : { issues };
    },
  },
};

bootstrap({
  registry: {
    Counter: { load: async () => ({ Counter }), exportName: "Counter" },
  },
});

const clientCounter = document.querySelector<HTMLElement>("#client-counter");
if (clientCounter !== null) {
  void mount(clientCounter, Counter, { state: { count: 0 }, replace: true });
}

const form = document.querySelector<HTMLFormElement>("form");
if (form !== null) {
  createForm<SignupValues>(form, {
    read({ formData }) {
      return {
        title: stringValue(formData.get("title")),
        email: stringValue(formData.get("email")),
      };
    },
    validate: standardSchema(signupSchema),
    submit(context) {
      context.setErrors({
        $form: ["Valid locally. Wire this handler to your backend when ready."],
      });
    },
  });
}

function stringValue(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}
