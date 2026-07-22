/**
 * Module registry normalization (design 4.3, KTD9/KTD18).
 *
 * Registries are data, not execution authority. JavaScript registries are
 * already trusted application code and win over inert page JSON; DOM-authored
 * `data-taipa-src` remains inert unless the application approves that exact
 * specifier through resolveDomModule.
 */
import { ATTR_COMPONENT, ATTR_EXPORT, ATTR_SRC } from "../server/attributes.ts";
import type {
  BootstrapOptions,
  ComponentLoader,
  ComponentRegistry,
  RegistryEntry,
} from "../types.ts";
import type { RuntimeOwner } from "./runtime-owner.ts";

const REGISTRY_ID = "taipa-registry";
const MAX_REGISTRY_CHARS = 256 * 1024;
const DANGEROUS_KEYS = new Set(["__proto__", "prototype", "constructor"]);

interface JsonRegistryEntry {
  readonly src: string;
  readonly exportName?: string;
}

export interface NormalizedRegistryEntry {
  readonly load: ComponentLoader;
  readonly exportName: string;
  readonly cacheKey: unknown;
}

export function loadCachedModule(
  owner: RuntimeOwner,
  entry: NormalizedRegistryEntry,
): Promise<Record<string, unknown>> {
  return owner.loadModule(entry.cacheKey, entry.load);
}

export function resolveRegistryEntry(
  host: HTMLElement,
  options: Pick<BootstrapOptions, "registry" | "resolveDomModule">,
): NormalizedRegistryEntry {
  const componentName = host.getAttribute(ATTR_COMPONENT);
  if (componentName === null || componentName.trim() === "") {
    throw new Error(`<taipa-island> is missing required ${ATTR_COMPONENT}`);
  }
  const hostExport = host.getAttribute(ATTR_EXPORT) ?? undefined;
  const jsEntry = resolveJavaScriptRegistryEntry(options.registry, componentName, hostExport);
  if (jsEntry !== undefined) {
    return jsEntry;
  }
  const jsonEntry = parseJsonRegistry(host.ownerDocument).get(componentName);
  if (jsonEntry !== undefined) {
    return {
      load: () => import(/* @vite-ignore */ jsonEntry.src) as Promise<Record<string, unknown>>,
      exportName: hostExport ?? jsonEntry.exportName ?? "default",
      cacheKey: jsonEntry.src,
    };
  }
  const domSpecifier = host.getAttribute(ATTR_SRC);
  if (domSpecifier !== null && domSpecifier.trim() !== "") {
    const load = options.resolveDomModule?.(domSpecifier, host) ?? null;
    if (load !== null) {
      return {
        load,
        exportName: hostExport ?? "default",
        cacheKey: domSpecifier,
      };
    }
  }
  throw new Error(`no approved module source for component "${componentName}"`);
}

function resolveJavaScriptRegistryEntry(
  registry: ComponentRegistry | undefined,
  componentName: string,
  hostExport: string | undefined,
): NormalizedRegistryEntry | undefined {
  const entry = registry?.[componentName];
  if (entry === undefined) {
    return undefined;
  }
  if (typeof entry === "function") {
    return { load: entry, exportName: hostExport ?? "default", cacheKey: entry };
  }
  if (!isRegistryEntry(entry)) {
    throw new TypeError(
      `registry entry for component "${componentName}" must be a loader or entry`,
    );
  }
  return {
    load: entry.load,
    exportName: hostExport ?? entry.exportName ?? "default",
    cacheKey: entry.load,
  };
}

function isRegistryEntry(value: unknown): value is RegistryEntry {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Partial<RegistryEntry>).load === "function" &&
    ((value as Partial<RegistryEntry>).exportName === undefined ||
      typeof (value as Partial<RegistryEntry>).exportName === "string")
  );
}

function parseJsonRegistry(document: Document): Map<string, JsonRegistryEntry> {
  const script = document.getElementById(REGISTRY_ID);
  if (!(script instanceof HTMLScriptElement) || script.type !== "application/json") {
    return new Map();
  }
  const source = script.textContent ?? "";
  if (source.length > MAX_REGISTRY_CHARS) {
    throw new Error(`taipa registry JSON is too large; maximum size is 256 KiB`);
  }
  assertNoDuplicateTopLevelKeys(source);
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    throw new Error(
      `malformed registry JSON: ${error instanceof Error ? error.message : String(error)}`,
      {
        cause: error,
      },
    );
  }
  assertSafeRegistryValue(parsed, "registry");
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new TypeError("registry JSON must be an object");
  }
  const map = new Map<string, JsonRegistryEntry>();
  for (const [name, entry] of Object.entries(parsed)) {
    if (DANGEROUS_KEYS.has(name)) {
      throw new TypeError(`registry contains dangerous key "${name}"`);
    }
    map.set(name, normalizeJsonRegistryEntry(name, entry));
  }
  return map;
}

function normalizeJsonRegistryEntry(name: string, entry: unknown): JsonRegistryEntry {
  if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
    throw new TypeError(`registry entry for component "${name}" must be an object`);
  }
  const record = entry as Record<string, unknown>;
  if (typeof record.src !== "string" || record.src.trim() === "") {
    throw new TypeError(`registry entry for component "${name}" must include a non-empty src`);
  }
  if (record.export !== undefined && typeof record.export !== "string") {
    throw new TypeError(`registry entry for component "${name}" has an invalid export name`);
  }
  if (record.contractVersion !== undefined && typeof record.contractVersion !== "string") {
    throw new TypeError(`registry entry for component "${name}" has an invalid contractVersion`);
  }
  assertApprovedSpecifier(record.src);
  return {
    src: record.src,
    ...(typeof record.export === "string" ? { exportName: record.export } : {}),
  };
}

export function assertApprovedSpecifier(specifier: string): void {
  const scheme = specifier.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase();
  if (scheme === undefined || scheme === "https") {
    return;
  }
  throw new Error(`unapproved registry source scheme "${scheme}:" for "${specifier}"`);
}

function assertSafeRegistryValue(value: unknown, path: string): void {
  if (typeof value !== "object" || value === null) {
    return;
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      assertSafeRegistryValue(value[index], `${path}[${index}]`);
    }
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (DANGEROUS_KEYS.has(key)) {
      throw new TypeError(`${path}.${key}: dangerous registry key "${key}" is not allowed`);
    }
    assertSafeRegistryValue(child, `${path}.${key}`);
  }
}

function assertNoDuplicateTopLevelKeys(source: string): void {
  const seen = new Set<string>();
  let depth = 0;
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    if (char === '"') {
      const { raw, end } = readJsonString(source, index);
      if (depth === 1) {
        let cursor = end + 1;
        while (cursor < source.length && /\s/.test(source[cursor] ?? "")) {
          cursor += 1;
        }
        if (source[cursor] === ":") {
          const key = JSON.parse(`"${raw}"`) as string;
          if (seen.has(key)) {
            throw new Error(`duplicate registry key "${key}"`);
          }
          seen.add(key);
        }
      }
      index = end + 1;
      continue;
    }
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
    }
    index += 1;
  }
}

function readJsonString(source: string, start: number): { raw: string; end: number } {
  let raw = "";
  for (let index = start + 1; index < source.length; index += 1) {
    const char = source[index];
    if (char === "\\") {
      raw += char;
      index += 1;
      raw += source[index] ?? "";
      continue;
    }
    if (char === '"') {
      return { raw, end: index };
    }
    raw += char;
  }
  return { raw, end: source.length - 1 };
}
