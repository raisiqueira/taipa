/**
 * Registry normalization.
 *
 * JavaScript registries are trusted application code and override page JSON.
 * The inert JSON registry is data: it is capped, duplicate-checked, sanitized
 * against prototype-pollution keys, and may only name approved specifier
 * schemes. `data-taipa-src` is inert unless the application explicitly
 * approves the exact specifier through resolveDomModule.
 */
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import type { ComponentLoader } from "../../src/types";
import { claimRuntimeOwner } from "../../src/client/runtime-owner";
import {
  assertApprovedSpecifier,
  loadCachedModule,
  resolveRegistryEntry,
} from "../../src/client/registry";

const elements: Element[] = [];

function host(attributes: string): HTMLElement {
  const template = document.createElement("template");
  template.innerHTML = `<taipa-island ${attributes}></taipa-island>`;
  const island = template.content.firstElementChild as HTMLElement;
  document.body.append(island);
  elements.push(island);
  return island;
}

function registry(json: string): HTMLScriptElement {
  const script = document.createElement("script");
  script.id = "taipa-registry";
  script.type = "application/json";
  script.textContent = json;
  document.head.append(script);
  elements.push(script);
  return script;
}

afterEach(() => {
  for (const element of elements.splice(0)) {
    element.remove();
  }
});

describe("resolveRegistryEntry", () => {
  test("JavaScript registry entries override JSON registry and data-taipa-src", () => {
    const jsLoader = vi.fn(async () => ({ default: "js" }));
    registry('{"Counter":{"src":"/json-counter.js","export":"Counter"}}');
    const entry = resolveRegistryEntry(
      host(`data-taipa-component="Counter" data-taipa-src="/dom-counter.js"`),
      {
        registry: { Counter: jsLoader },
        resolveDomModule: () => async () => ({ default: "dom" }),
      },
    );

    expect(entry.load).toBe(jsLoader);
    expect(entry.exportName).toBe("default");
    expect(entry.cacheKey).toBe(jsLoader);
  });

  test("RegistryEntry exportName is used unless the host carries data-taipa-export", () => {
    const load = vi.fn(async () => ({ Named: "component" }));
    expect(
      resolveRegistryEntry(host(`data-taipa-component="Thing"`), {
        registry: { Thing: { load, exportName: "Named" } },
      }).exportName,
    ).toBe("Named");

    expect(
      resolveRegistryEntry(host(`data-taipa-component="Thing" data-taipa-export="HostNamed"`), {
        registry: { Thing: { load, exportName: "Named" } },
      }).exportName,
    ).toBe("HostNamed");
  });

  test("JSON registry resolves source, export name, and exact src cache key", () => {
    registry('{"Counter":{"src":"/tests/browser/fixtures/counter.module.js","export":"Counter"}}');
    const entry = resolveRegistryEntry(host(`data-taipa-component="Counter"`), {});

    expect(entry.exportName).toBe("Counter");
    expect(entry.cacheKey).toBe("/tests/browser/fixtures/counter.module.js");
  });

  test("data-taipa-src is inert without an approving resolver", () => {
    expect(() =>
      resolveRegistryEntry(host(`data-taipa-component="Counter" data-taipa-src="/counter.js"`), {}),
    ).toThrowError(/no approved module source/i);
  });

  test("data-taipa-src uses the exact approved specifier and host export", () => {
    const load = vi.fn(async () => ({ Counter: "component" }));
    const seen: string[] = [];
    const entry = resolveRegistryEntry(
      host(
        `data-taipa-component="Counter" data-taipa-src="/counter.js" data-taipa-export="Counter"`,
      ),
      {
        resolveDomModule: (specifier) => {
          seen.push(specifier);
          return load;
        },
      },
    );

    expect(seen).toEqual(["/counter.js"]);
    expect(entry.load).toBe(load);
    expect(entry.exportName).toBe("Counter");
    expect(entry.cacheKey).toBe("/counter.js");
  });

  test("missing component names fail before resolving modules", () => {
    expect(() => resolveRegistryEntry(host(`data-taipa-hydrate="load"`), {})).toThrowError(
      /data-taipa-component/,
    );
  });
});

describe("JSON registry safety", () => {
  test("rejects malformed JSON", () => {
    registry("{not json");
    expect(() => resolveRegistryEntry(host(`data-taipa-component="Counter"`), {})).toThrowError(
      /malformed registry JSON/i,
    );
  });

  test("rejects duplicate top-level registry keys", () => {
    registry('{"Counter":{"src":"/a.js"},"Counter":{"src":"/b.js"}}');
    expect(() => resolveRegistryEntry(host(`data-taipa-component="Counter"`), {})).toThrowError(
      /duplicate registry key "Counter"/,
    );
  });

  test("rejects dangerous keys at every depth", () => {
    for (const sample of [
      '{"__proto__":{"src":"/a.js"}}',
      '{"Counter":{"src":"/a.js","constructor":1}}',
      '{"Counter":{"src":"/a.js","nested":{"prototype":1}}}',
    ]) {
      registry(sample);
      expect(() => resolveRegistryEntry(host(`data-taipa-component="Counter"`), {})).toThrowError(
        /dangerous|__proto__|constructor|prototype/i,
      );
      elements.splice(0).forEach((element) => element.remove());
    }
  });

  test("rejects registries larger than 256 KiB before resolution", () => {
    registry(`{"Counter":{"src":"/${"x".repeat(260 * 1024)}.js"}}`);
    expect(() => resolveRegistryEntry(host(`data-taipa-component="Counter"`), {})).toThrowError(
      /256\s*KiB|too large/i,
    );
  });

  test("rejects invalid entry shapes", () => {
    for (const sample of [
      '{"Counter":"/counter.js"}',
      '{"Counter":{"src":""}}',
      '{"Counter":{"src":42}}',
      '{"Counter":{"src":"/counter.js","export":42}}',
    ]) {
      registry(sample);
      expect(() => resolveRegistryEntry(host(`data-taipa-component="Counter"`), {})).toThrowError(
        /registry entry/i,
      );
      elements.splice(0).forEach((element) => element.remove());
    }
  });

  test("ignores legacy contract version fields", () => {
    for (const version of ['"1"', "42"]) {
      registry(`{"Counter":{"src":"/counter.js","contractVersion":${version}}}`);
      expect(resolveRegistryEntry(host(`data-taipa-component="Counter"`), {}).exportName).toBe(
        "default",
      );
      elements.splice(0).forEach((element) => element.remove());
    }
  });
});

describe("approved specifiers", () => {
  test("allows bare, relative, root-relative, and https specifiers without rewriting", () => {
    for (const specifier of [
      "counter",
      "@scope/counter",
      "./counter.js",
      "../counter.js",
      "/counter.js",
      "https://cdn.example/counter.js",
    ]) {
      expect(() => assertApprovedSpecifier(specifier)).not.toThrow();
    }
  });

  test("rejects unapproved URL schemes", () => {
    for (const specifier of [
      "javascript:alert(1)",
      "data:text/javascript,export{}",
      "http://example.com/x.js",
      "file:///tmp/x.js",
    ]) {
      expect(() => assertApprovedSpecifier(specifier)).toThrowError(/unapproved|scheme/i);
    }
  });
});

describe("document-scope loader cache", () => {
  test("deduplicates concurrent loads by cache key", async () => {
    const owner = claimRuntimeOwner();
    const module = { default: "component" };
    const load = vi.fn(async () => module);
    const entry = { load, exportName: "default", cacheKey: load };

    const [first, second] = await Promise.all([
      loadCachedModule(owner, entry),
      loadCachedModule(owner, entry),
    ]);

    expect(first).toBe(module);
    expect(second).toBe(module);
    expect(load).toHaveBeenCalledTimes(1);
  });

  test("evicts rejected loader promises so explicit rescan can retry", async () => {
    const owner = claimRuntimeOwner();
    const error = new Error("network");
    const success = { default: "component" };
    const load = vi.fn<ComponentLoader>(async () => {
      if (load.mock.calls.length === 1) {
        throw error;
      }
      return success;
    });
    const entry = { load, exportName: "default", cacheKey: "retry-key" };

    await expect(loadCachedModule(owner, entry)).rejects.toBe(error);
    await expect(loadCachedModule(owner, entry)).resolves.toBe(success);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
