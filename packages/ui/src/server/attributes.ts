/**
 * Island host attribute names and deterministic serialization.
 *
 * Attribute order is fixed by `renderIsland` (id, component, module
 * resolution, policy, scheduling) so conformance fixtures and the
 * Django adapter can compare markup byte-for-byte. The order is a fixture
 * convention, not a public byte-stability promise.
 */
import { escapeAttribute } from "../template/escape";

export const ISLAND_TAG = "taipa-island";
export const ATTR_COMPONENT = "data-taipa-component";
export const ATTR_SRC = "data-taipa-src";
export const ATTR_EXPORT = "data-taipa-export";
export const ATTR_HYDRATE = "data-taipa-hydrate";
export const ATTR_IDLE_TIMEOUT = "data-taipa-idle-timeout";
export const ATTR_VISIBLE_ROOT_MARGIN = "data-taipa-visible-root-margin";
export const ATTR_PROPS_SCRIPT = "data-taipa-props";
export const ATTR_STATE_SCRIPT = "data-taipa-state";
export const FALLBACK_MARKER = "data-taipa-fallback";

export type Attribute = readonly [name: string, value: string];

export function serializeAttributes(attributes: readonly Attribute[]): string {
  return attributes.map(([name, value]) => `${name}="${escapeAttribute(value)}"`).join(" ");
}

export function jsonScript(markerAttribute: string, inertJson: string): string {
  return `<script type="application/json" ${markerAttribute}>${inertJson}</script>`;
}
