export const probeTarget = "@taipa/ui:server";

/**
 * U1 CDN-probe canary: server-safe subpath placeholder. The real
 * server-rendering contract lands with the Django integration units.
 */
export function renderProbe(label: string): string {
  return `<span data-taipa-probe="server">${label}</span>`;
}
