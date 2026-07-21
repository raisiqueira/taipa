/**
 * Client entry: direct-DOM hydration, client-side mount, and explicit
 * unmount (design 3.5). Importing this module is side-effect free — no
 * custom elements are defined and no globals are touched until hydrate or
 * mount is called (AE9). Automatic island bootstrapping is layered on top
 * by a later unit.
 */
export { hydrate } from "./hydrate.ts";
export { mount } from "./mount.ts";
export { unmount } from "./instance.ts";
export type { ComponentInstance, HydrateOptions, MountOptions } from "../types.ts";
