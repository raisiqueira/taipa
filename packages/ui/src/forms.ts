export const probeTarget = "@taipa/ui:forms";

/**
 * U1 CDN-probe canary: forms subpath placeholder. The real form contract
 * lands with the forms integration units.
 */
export function probeFieldName(name: string): string {
  return `taipa:${name}`;
}
