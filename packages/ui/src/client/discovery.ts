import { ISLAND_TAG } from "../server/attributes";

export function discoverIslands(root: ParentNode): HTMLElement[] {
  const hosts: HTMLElement[] = [];
  if (root instanceof HTMLElement && root.tagName === ISLAND_TAG.toUpperCase()) {
    hosts.push(root);
  }
  for (const element of root.querySelectorAll(ISLAND_TAG)) {
    if (element instanceof HTMLElement) {
      hosts.push(element);
    }
  }
  return hosts;
}
