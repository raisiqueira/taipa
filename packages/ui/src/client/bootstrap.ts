import { renderToString, asComponentDefinition } from "../server/render";
import { ATTR_COMPONENT } from "../server/attributes";
import type { ComponentDefinition } from "../component";
import type { BootstrapHandle, BootstrapOptions, Component } from "../types";
import { defineIslandElement } from "./custom-element";
import { discoverIslands } from "./discovery";
import { attachComponent, readHostPayloads } from "./hydrate";
import { dispatchIslandEvent, unmount } from "./instance";
import { assertRequiredRefs, collectRefs } from "./refs";
import { loadCachedModule, resolveRegistryEntry } from "./registry";
import type { RuntimeHostRecord } from "./runtime-owner";
import { claimRuntimeOwner } from "./runtime-owner";
import { resolvePolicy, schedulePolicy } from "./scheduler";

interface BootstrapRecord {
  readonly options: BootstrapOptions;
  readonly claimedHosts: Set<HTMLElement>;
  readonly observers: MutationObserver[];
  destroyed: boolean;
}

class HydrationAlreadyDispatched {
  constructor(readonly error: unknown) {}
}

export function bootstrap(options: BootstrapOptions = {}): BootstrapHandle {
  const owner = claimRuntimeOwner();
  defineIslandElement();

  const record: BootstrapRecord = {
    options,
    claimedHosts: new Set(),
    observers: [],
    destroyed: false,
  };

  const handle: BootstrapHandle = {
    scan(root = options.root ?? document) {
      if (record.destroyed) {
        return;
      }
      scanRoot(record, owner, root);
    },
    destroy() {
      if (record.destroyed) {
        return;
      }
      record.destroyed = true;
      for (const observer of record.observers.splice(0)) {
        observer.disconnect();
      }
      for (const host of record.claimedHosts) {
        releaseHost(record, owner, host);
      }
    },
  };

  handle.scan(options.root ?? document);
  if (options.observe === true) {
    observeRoot(record, owner, options.root ?? document);
  }
  return handle;
}

function scanRoot(
  record: BootstrapRecord,
  owner: ReturnType<typeof claimRuntimeOwner>,
  root: ParentNode,
): void {
  for (const host of discoverIslands(root)) {
    claimAndSchedule(record, owner, host);
  }
}

function claimAndSchedule(
  record: BootstrapRecord,
  owner: ReturnType<typeof claimRuntimeOwner>,
  host: HTMLElement,
): void {
  let policy;
  try {
    policy = resolvePolicy(host);
  } catch (error) {
    emitBootstrapError(host, error, componentNameFor(host), "schedule", record.options);
    return;
  }
  if (policy === null) {
    return;
  }

  const hostRecord = owner.hostRecordFor(host);
  hostRecord.claims.add(record);
  record.claimedHosts.add(host);
  if (
    hostRecord.status === "active" ||
    hostRecord.status === "scheduled" ||
    hostRecord.status === "loading"
  ) {
    return;
  }

  hostRecord.generation += 1;
  const generation = hostRecord.generation;
  hostRecord.status = "scheduled";
  hostRecord.scheduledBy = record;
  hostRecord.task = schedulePolicy(host, policy, () => {
    void activate(record, owner, host, hostRecord, generation, policy.policy);
  });
}

async function activate(
  record: BootstrapRecord,
  owner: ReturnType<typeof claimRuntimeOwner>,
  host: HTMLElement,
  hostRecord: RuntimeHostRecord,
  generation: number,
  policy: string,
): Promise<void> {
  if (!canContinue(host, hostRecord, generation) || record.destroyed) {
    hostRecord.status = "idle";
    clearSchedule(hostRecord);
    return;
  }
  hostRecord.status = "loading";
  let componentName = componentNameFor(host);
  let attachStarted = false;
  try {
    const entry = resolveRegistryEntry(host, record.options);
    const moduleRecord = await loadCachedModule(owner, entry);
    if (!canContinue(host, hostRecord, generation) || record.destroyed) {
      hostRecord.status = "idle";
      clearSchedule(hostRecord);
      return;
    }
    const component = moduleRecord[entry.exportName];
    if (component === undefined) {
      throw new Error(
        `module for component "${componentName}" has no export "${entry.exportName}"`,
      );
    }
    const definition = asComponentDefinition(component as Component);
    componentName = definition.name;
    if (policy === "only") {
      await activateOnly(host, definition);
      hostRecord.status = "active";
      clearSchedule(hostRecord);
      return;
    }
    attachStarted = true;
    attachComponent(host, definition, undefined);
    hostRecord.status = "active";
    clearSchedule(hostRecord);
  } catch (error) {
    hostRecord.status = "errored";
    clearSchedule(hostRecord);
    if (error instanceof HydrationAlreadyDispatched) {
      record.options.onError?.(error.error, host);
    } else if (attachStarted) {
      record.options.onError?.(error, host);
    } else {
      emitBootstrapError(host, error, componentName, "resolve", record.options);
    }
  }
}

async function activateOnly(host: HTMLElement, definition: ComponentDefinition): Promise<void> {
  const payload = readHostPayloads(host, definition);
  const rendered = await renderToString(
    definition,
    (payload.props ?? {}) as never,
    payload.state === undefined ? undefined : { state: payload.state as never },
  );
  const template = document.createElement("template");
  template.innerHTML = rendered;

  // Preflight required refs before replacing the server-authored fallback.
  const offDomHost = document.createElement("taipa-island");
  offDomHost.append(template.content.cloneNode(true));
  const collected = collectRefs(offDomHost);
  assertRequiredRefs(collected, definition.requiredRefs, definition.name);

  host.replaceChildren(template.content);
  try {
    attachComponent(host, definition, {
      props: payload.props as never,
      state: payload.state as never,
    });
  } catch (error) {
    throw new HydrationAlreadyDispatched(error);
  }
}

function canContinue(
  host: HTMLElement,
  hostRecord: RuntimeHostRecord,
  generation: number,
): boolean {
  return (
    host.isConnected && hostRecord.generation === generation && hostRecord.task?.cancelled !== true
  );
}

function releaseHost(
  record: BootstrapRecord,
  owner: ReturnType<typeof claimRuntimeOwner>,
  host: HTMLElement,
): void {
  const hostRecord = owner.hostRecordFor(host);
  if (
    hostRecord.scheduledBy === record &&
    (hostRecord.status === "scheduled" || hostRecord.status === "loading")
  ) {
    hostRecord.task?.cancel();
    hostRecord.status = "idle";
    hostRecord.generation += 1;
    hostRecord.task = undefined;
    hostRecord.scheduledBy = undefined;
  }
  hostRecord.claims.delete(record);
  record.claimedHosts.delete(host);
  if (hostRecord.claims.size === 0) {
    if (hostRecord.status === "active") {
      unmount(host);
    }
    owner.deleteHostRecord(host);
  }
}

function clearSchedule(hostRecord: RuntimeHostRecord): void {
  hostRecord.task = undefined;
  hostRecord.scheduledBy = undefined;
}

function observeRoot(
  record: BootstrapRecord,
  owner: ReturnType<typeof claimRuntimeOwner>,
  root: ParentNode,
): void {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof HTMLElement || node instanceof DocumentFragment) {
          scanRoot(record, owner, node);
        }
      }
      for (const node of mutation.removedNodes) {
        if (node instanceof HTMLElement || node instanceof DocumentFragment) {
          releaseRemovedPendingHosts(record, owner, node);
        }
      }
    }
  });
  observer.observe(root as Node, { childList: true, subtree: true });
  record.observers.push(observer);
}

function releaseRemovedPendingHosts(
  record: BootstrapRecord,
  owner: ReturnType<typeof claimRuntimeOwner>,
  root: ParentNode,
): void {
  for (const host of discoverIslands(root)) {
    const hostRecord = owner.existingHostRecordFor(host);
    if (hostRecord === undefined || !hostRecord.claims.has(record)) {
      continue;
    }
    // Active instances are owned by the lifecycle observer: moves should keep
    // state, and true removals destroy after its microtask deferral. Pending
    // activations, however, must be cancelled so reinsertion can reschedule.
    if (hostRecord.status !== "active") {
      releaseHost(record, owner, host);
    }
  }
}

function emitBootstrapError(
  host: HTMLElement,
  error: unknown,
  component: string,
  phase: "schedule" | "resolve",
  options: BootstrapOptions,
): void {
  dispatchIslandEvent(host, "taipa:error", { error, component, phase });
  options.onError?.(error, host);
}

function componentNameFor(host: HTMLElement): string {
  return host.getAttribute(ATTR_COMPONENT) ?? "unknown";
}
