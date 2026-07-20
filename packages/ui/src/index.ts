import { signal } from "alien-signals";

export const probeTarget = "@taipa/ui:root";

/**
 * U1 CDN-probe canary: proves the root subpath ships ESM and keeps
 * alien-signals as an external import. Replaced by the real runtime in U2+.
 */
export function createProbeCount(initial: number) {
  const count = signal(initial);
  return {
    get: () => count(),
    set: (value: number) => count(value),
  };
}
