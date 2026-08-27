import { bootstrap } from "@taipa/ui/client";
import { Counter } from "./counter.mjs";
import { LiveTime } from "./live-time.mjs";
import { SignupForm } from "./signup-form.mjs";

export { Counter, LiveTime, SignupForm };

bootstrap({
  registry: {
    Counter: {
      load: async () => ({ Counter }),
      exportName: "Counter",
    },
    LiveTime: {
      load: async () => ({ LiveTime }),
      exportName: "LiveTime",
    },
    SignupForm: {
      load: async () => ({ SignupForm }),
      exportName: "SignupForm",
    },
  },
  observe: true,
  onError(error, host) {
    host.setAttribute("data-taipa-failed", "");
    const status = host.querySelector("[data-taipa-fallback], .status");
    if (status !== null) {
      status.textContent = error instanceof Error ? error.message : String(error);
    }
  },
});

document.addEventListener("taipa:hydrated", (event) => {
  const host = event.target;
  if (!(host instanceof HTMLElement)) return;
  host.dataset.taipaReady = "";
  const status = document.querySelector(`[data-hydrate-status="${CSS.escape(host.id)}"]`);
  if (status instanceof HTMLElement) {
    status.dataset.ready = "";
    const policy = host.getAttribute("data-taipa-hydrate") ?? "unknown";
    status.textContent = `hydrated (${policy})`;
  }
});
