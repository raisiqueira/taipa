import { ISLAND_TAG } from "../server/attributes.ts";

export function defineIslandElement(): void {
  if (customElements.get(ISLAND_TAG) !== undefined) {
    return;
  }
  customElements.define(ISLAND_TAG, class TaipaIslandElement extends HTMLElement {});
}
