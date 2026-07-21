/**
 * Runtime ownership (design 2.4, AE3): one compatible taipa runtime owns a
 * page. Ownership lives in a globalThis record keyed by a well-known symbol
 * and carries protocol metadata; a second taipa copy with the same protocol
 * shares the registry, while an incompatible one is rejected without
 * takeover.
 *
 * The registry also watches each document with live instances for
 * disconnections. Cleanup is deferred one microtask so native DOM moves —
 * which pass through a disconnected state — reconnect without teardown.
 */
import type { ComponentInstance } from "../types.ts";

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
}

export interface RuntimeOwner {
  liveInstanceFor(host: HTMLElement): ComponentInstance | undefined;
  register(instance: ComponentInstance): void;
  unregister(instance: ComponentInstance): void;
}

function createRegistry(): RuntimeRegistry {
  return {
    protocol: RUNTIME_PROTOCOL,
    instances: new WeakMap(),
    live: new Set(),
    watched: new Map(),
  };
}

function isCompatibleRegistry(value: unknown): value is RuntimeRegistry {
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
  };
}

export function claimRuntimeOwner(): RuntimeOwner {
  const globalRecord = globalThis as Record<PropertyKey, unknown>;
  const existing: unknown = globalRecord[Symbol.for(OWNER_KEY)];
  if (existing !== undefined) {
    if (!isCompatibleRegistry(existing)) {
      throw new Error(
        "an incompatible taipa runtime already owns this page; refusing to take over",
      );
    }
    return wrap(existing);
  }
  const registry = createRegistry();
  globalRecord[Symbol.for(OWNER_KEY)] = registry;
  return wrap(registry);
}
