import { ISLAND_TAG } from "../server/attributes";

export function defineIslandElement(): void {
  if (customElements.get(ISLAND_TAG) !== undefined) {
    return;
  }
  customElements.define(ISLAND_TAG, class TaipaIslandElement extends HTMLElement {});
}
