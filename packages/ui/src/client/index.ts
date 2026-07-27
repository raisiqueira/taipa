/**
 * Client entry: direct-DOM hydration, client-side mount, explicit unmount,
 * and opt-in island bootstrapping. Importing this module is
 * side-effect free — no custom elements are defined and no globals are
 * touched until an API is called.
 */
export { bootstrap } from "./bootstrap";
export { hydrate } from "./hydrate";
export { mount } from "./mount";
export { unmount } from "./instance";
export type {
  BootstrapHandle,
  BootstrapOptions,
  ComponentInstance,
  ComponentLoader,
  ComponentRegistry,
  HydrateOptions,
  MountOptions,
  RegistryEntry,
} from "../types";
