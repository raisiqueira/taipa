/**
 * Runtime ownership: one compatible taipa runtime owns a
 * page. Ownership lives in a globalThis record keyed by a well-known symbol
 * and carries protocol metadata; a second taipa copy with the same protocol
 * shares the registry, while an incompatible one is rejected without
 * takeover.
 *
 * The registry also watches each document with live instances for
 * disconnections. Cleanup is deferred one microtask so native DOM moves —
 * which pass through a disconnected state — reconnect without teardown.
 */
import type { ComponentInstance, ComponentLoader } from "../types";
import type { ScheduledTask } from "./scheduler";

export const RUNTIME_PROTOCOL = 1;
const OWNER_KEY = "taipa.ui/runtime";

interface WatchedDocument {
  readonly observer: MutationObserver;
  count: number;
}

export interface RuntimeRegistry {
  readonly protocol: number;
  readonly instances: WeakMap<HTMLElement, ComponentInstance>;
  readonly live: Set<ComponentInstance>;
  readonly watched: Map<Document, WatchedDocument>;
  readonly loaders: Map<unknown, Promise<Record<string, unknown>>>;
  readonly hosts: Map<HTMLElement, RuntimeHostRecord>;
}

export type RuntimeHostStatus = "idle" | "scheduled" | "loading" | "active" | "errored";

export interface RuntimeHostRecord {
  readonly claims: Set<unknown>;
  status: RuntimeHostStatus;
  generation: number;
  task?: ScheduledTask;
  scheduledBy?: unknown;
}

export interface RuntimeOwner {
  liveInstanceFor(host: HTMLElement): ComponentInstance | undefined;
  register(instance: ComponentInstance): void;
  unregister(instance: ComponentInstance): void;
  loadModule(cacheKey: unknown, load: ComponentLoader): Promise<Record<string, unknown>>;
  hostRecordFor(host: HTMLElement): RuntimeHostRecord;
  existingHostRecordFor(host: HTMLElement): RuntimeHostRecord | undefined;
  deleteHostRecord(host: HTMLElement): void;
}

function createRegistry(): RuntimeRegistry {
  return {
    protocol: RUNTIME_PROTOCOL,
    instances: new WeakMap(),
    live: new Set(),
    watched: new Map(),
    loaders: new Map(),
    hosts: new Map(),
  };
}

function isBaseCompatibleRegistry(value: unknown): value is Omit<
  RuntimeRegistry,
  "loaders" | "hosts"
> & {
  loaders?: unknown;
  hosts?: unknown;
} {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<RuntimeRegistry>;
  return (
    candidate.protocol === RUNTIME_PROTOCOL &&
    candidate.instances instanceof WeakMap &&
    candidate.live instanceof Set &&
    candidate.watched instanceof Map
  );
}

function ensureRegistryFields(
  registry: Omit<RuntimeRegistry, "loaders" | "hosts"> & { loaders?: unknown; hosts?: unknown },
): RuntimeRegistry {
  if (!(registry.loaders instanceof Map)) {
    Object.defineProperty(registry, "loaders", {
      configurable: true,
      enumerable: true,
      value: new Map(),
      writable: false,
    });
  }
  if (!(registry.hosts instanceof Map)) {
    Object.defineProperty(registry, "hosts", {
      configurable: true,
      enumerable: true,
      value: new Map(),
      writable: false,
    });
  }
  return registry as RuntimeRegistry;
}

function sweepDisconnected(registry: RuntimeRegistry): void {
  for (const instance of registry.live) {
    if (instance.host.isConnected) {
      continue;
    }
    registry.instances.delete(instance.host);
    registry.live.delete(instance);
    queueMicrotask(() => {
      if (!instance.host.isConnected) {
        instance.destroy();
      }
    });
  }
}

function watchDocument(registry: RuntimeRegistry, document: Document): void {
  const watched = registry.watched.get(document);
  if (watched !== undefined) {
    watched.count += 1;
    return;
  }
  const observer = new MutationObserver(() => {
    sweepDisconnected(registry);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  registry.watched.set(document, { observer, count: 1 });
}

function unwatchDocument(registry: RuntimeRegistry, document: Document): void {
  const watched = registry.watched.get(document);
  if (watched === undefined) {
    return;
  }
  watched.count -= 1;
  if (watched.count === 0) {
    watched.observer.disconnect();
    registry.watched.delete(document);
  }
}

function wrap(registry: RuntimeRegistry): RuntimeOwner {
  return {
    liveInstanceFor(host) {
      return registry.instances.get(host);
    },
    register(instance) {
      registry.instances.set(instance.host, instance);
      registry.live.add(instance);
      watchDocument(registry, instance.host.ownerDocument);
    },
    unregister(instance) {
      registry.instances.delete(instance.host);
      registry.live.delete(instance);
      unwatchDocument(registry, instance.host.ownerDocument);
    },
    loadModule(cacheKey, load) {
      const cached = registry.loaders.get(cacheKey);
      if (cached !== undefined) {
        return cached;
      }
      const promise = load().catch((error: unknown) => {
        registry.loaders.delete(cacheKey);
        throw error;
      });
      registry.loaders.set(cacheKey, promise);
      return promise;
    },
    hostRecordFor(host) {
      let record = registry.hosts.get(host);
      if (record === undefined) {
        record = { claims: new Set(), status: "idle", generation: 0 };
        registry.hosts.set(host, record);
      }
      return record;
    },
    existingHostRecordFor(host) {
      return registry.hosts.get(host);
    },
    deleteHostRecord(host) {
      registry.hosts.delete(host);
    },
  };
}

export function claimRuntimeOwner(): RuntimeOwner {
  const globalRecord = globalThis as Record<PropertyKey, unknown>;
  const existing: unknown = globalRecord[Symbol.for(OWNER_KEY)];
  if (existing !== undefined) {
    if (!isBaseCompatibleRegistry(existing)) {
      throw new Error(
        "an incompatible taipa runtime already owns this page; refusing to take over",
      );
    }
    return wrap(ensureRegistryFields(existing));
  }
  const registry = createRegistry();
  globalRecord[Symbol.for(OWNER_KEY)] = registry;
  return wrap(registry);
}
