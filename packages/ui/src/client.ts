import { effect, signal } from "alien-signals";

export const probeTarget = "@taipa/ui:client";

/**
 * U1 CDN-probe canary: mounts a reactive text node. DOM access stays inside
 * the function body so the module remains importable in server runtimes.
 */
export function mountProbe(element: Element, label: string) {
  const text = signal(label);
  effect(() => {
    element.textContent = text();
  });
  return (next: string) => text(next);
}
