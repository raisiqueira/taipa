/**
 * Policy scheduling for island activation.
 *
 * Each hydration policy is a cancellable schedule, not a fire-and-forget
 * call: the scheduler rechecks cancellation and host connection before
 * firing, and bootstrap rechecks both again after module imports settle.
 * Without requestIdleCallback, idle degrades to after-load (or the next
 * macrotask when the document is already loaded); without
 * IntersectionObserver, visible degrades to load.
 */
import { ATTR_HYDRATE, ATTR_IDLE_TIMEOUT, ATTR_VISIBLE_ROOT_MARGIN } from "../server/attributes";

export type ActivePolicy = "load" | "idle" | "visible" | "only";

export interface ResolvedPolicy {
  readonly policy: ActivePolicy;
  readonly idleTimeout?: number;
  readonly visibleRootMargin?: string;
}

export interface ScheduledTask {
  cancel(): void;
  readonly cancelled: boolean;
}

const POLICIES: readonly ActivePolicy[] = ["load", "idle", "visible", "only"];
const DEFAULT_VISIBLE_ROOT_MARGIN = "200px 0px";

export function resolvePolicy(host: HTMLElement): ResolvedPolicy | null {
  const raw = host.getAttribute(ATTR_HYDRATE);
  if (raw === null) {
    // No hydrate attribute means never hydrate: the island is
    // static server-rendered HTML and bootstrap must leave it alone.
    return null;
  }
  const policy = POLICIES.find((candidate) => candidate === raw);
  if (policy === undefined) {
    throw new Error(`invalid hydration policy "${raw}" on <taipa-island>`);
  }
  const rawTimeout = host.getAttribute(ATTR_IDLE_TIMEOUT);
  let idleTimeout: number | undefined;
  if (rawTimeout !== null) {
    const parsed = Number(rawTimeout);
    if (rawTimeout.trim() === "" || !Number.isFinite(parsed) || parsed < 0) {
      throw new Error(`invalid ${ATTR_IDLE_TIMEOUT} "${rawTimeout}" on <taipa-island>`);
    }
    idleTimeout = parsed;
  }
  const rawMargin = host.getAttribute(ATTR_VISIBLE_ROOT_MARGIN);
  let visibleRootMargin: string | undefined;
  if (rawMargin !== null) {
    if (rawMargin.trim() === "") {
      throw new Error(`invalid ${ATTR_VISIBLE_ROOT_MARGIN} on <taipa-island>: value is blank`);
    }
    visibleRootMargin = rawMargin;
  }
  return {
    policy,
    ...(idleTimeout !== undefined ? { idleTimeout } : {}),
    ...(visibleRootMargin !== undefined ? { visibleRootMargin } : {}),
  };
}

export function schedulePolicy(
  host: HTMLElement,
  resolved: ResolvedPolicy,
  fire: () => void,
): ScheduledTask {
  let cancelled = false;
  const cancelFns: (() => void)[] = [];
  const attempt = (): void => {
    if (cancelled || !host.isConnected) {
      return;
    }
    fire();
  };
  switch (resolved.policy) {
    case "load":
    case "only": {
      queueMicrotask(attempt);
      break;
    }
    case "idle": {
      if (typeof requestIdleCallback === "function") {
        const handle = requestIdleCallback(
          () => attempt(),
          resolved.idleTimeout === undefined ? undefined : { timeout: resolved.idleTimeout },
        );
        cancelFns.push(() => cancelIdleCallback(handle));
      } else if (document.readyState === "loading") {
        const onLoad = (): void => {
          const timer = setTimeout(attempt, 0);
          cancelFns.push(() => clearTimeout(timer));
        };
        window.addEventListener("load", onLoad, { once: true });
        cancelFns.push(() => window.removeEventListener("load", onLoad));
      } else {
        const timer = setTimeout(attempt, 0);
        cancelFns.push(() => clearTimeout(timer));
      }
      break;
    }
    case "visible": {
      if (typeof IntersectionObserver === "function") {
        const observer = new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (entry.isIntersecting) {
                observer.disconnect();
                attempt();
                return;
              }
            }
          },
          { rootMargin: resolved.visibleRootMargin ?? DEFAULT_VISIBLE_ROOT_MARGIN },
        );
        observer.observe(host);
        cancelFns.push(() => observer.disconnect());
      } else {
        queueMicrotask(attempt);
      }
      break;
    }
  }
  return {
    get cancelled() {
      return cancelled;
    },
    cancel() {
      if (cancelled) {
        return;
      }
      cancelled = true;
      for (const cancelFn of cancelFns.splice(0)) {
        cancelFn();
      }
    },
  };
}
