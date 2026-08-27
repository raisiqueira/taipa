import { component, html } from "@taipa/ui";
import { createForm } from "@taipa/ui/forms";

export const SignupForm = component("SignupForm")
  .connected(({ refs }) => {
    const form = refs.optional("form");
    if (!(form instanceof HTMLFormElement)) return;

    const controller = createForm(form, {
      read({ formData }) {
        return {
          name: String(formData.get("name") ?? ""),
          email: String(formData.get("email") ?? ""),
        };
      },
      validate({ values }) {
        const errors = {};
        if (values.name.trim().length < 2) {
          errors.name = ["Enter at least two characters."];
        }
        if (!values.email.includes("@")) {
          errors.email = ["Enter a valid email address."];
        }
        return Object.keys(errors).length === 0 ? undefined : errors;
      },
    });

    return () => controller.destroy();
  })
  .render(
    () => html`
      <form class="form" data-taipa-ref="form" action="/signup" method="post">
        <label>
          Name
          <input name="name" required autocomplete="name" aria-describedby="name-error" />
        </label>
        <p id="name-error" class="field-error" data-taipa-error-for="name"></p>

        <label>
          Email
          <input
            name="email"
            type="email"
            required
            autocomplete="email"
            aria-describedby="email-error"
          />
        </label>
        <p id="email-error" class="field-error" data-taipa-error-for="email"></p>

        <p class="form-status" data-taipa-error-for="$form" data-taipa-form-status></p>
        <div class="actions">
          <button type="submit" data-taipa-disable-while-submitting>Join</button>
          <button type="submit" formnovalidate name="intent" value="draft">Save draft</button>
        </div>
      </form>
    `,
  );
