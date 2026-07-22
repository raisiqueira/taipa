/**
 * Client entry: direct-DOM hydration, client-side mount, explicit unmount,
 * and opt-in island bootstrapping (design 3.5). Importing this module is
 * side-effect free — no custom elements are defined and no globals are
 * touched until an API is called (AE9).
 */
export { bootstrap } from "./bootstrap.ts";
export { hydrate } from "./hydrate.ts";
export { mount } from "./mount.ts";
export { unmount } from "./instance.ts";
export type {
  BootstrapHandle,
  BootstrapOptions,
  ComponentInstance,
  ComponentLoader,
  ComponentRegistry,
  HydrateOptions,
  MountOptions,
  RegistryEntry,
} from "../types.ts";
