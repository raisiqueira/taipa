// CDN topology verification for the disposable 0.0.0-cdn-probe.* canary. Run
// it after publishing the probe package and before relying on esm.sh delivery.
// It proves that exact-version esm.sh
// URLs for the root and client subpaths keep a single, shared alien-signals
// mapping (import-map-ready), with no duplicated CDN signal graph.
//
// If this fails because the registry name is unavailable, a name conflict
// appears, or the CDN graph is duplicated, resolve the registry or CDN topology
// issue before treating CDN delivery as supported.
//
// Full gate sequence (requires `npm login` with publish rights to @taipa):
//   1. vp run -r build                       # fresh dist
//   2. pnpm --filter @taipa/ui publish       # publishes 0.0.0-cdn-probe.* (pnpm rewrites catalog:)
//   3. pnpm verify:cdn                       # this script (network)
//   4. (cd "$(mktemp -d)" && npm deprecate @taipa/ui@<version> "CDN probe canary; superseded by supported alphas.")
//      ^ run from a neutral directory: the repo root's devEngines pin makes
//        npm refuse ANY command (EBADDEVENGINES) there, and pnpm deprecate
//        can lag registry propagation right after publish.
//
// Usage: pnpm verify:cdn [-- <version>]   (defaults to packages/ui version)
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(path.join(root, "packages/ui/package.json"), "utf8"));
const version = process.argv[2] ?? pkg.version;

// packages/ui declares alien-signals via the `catalog:` protocol, so resolve
// the exact version from the workspace catalog (the single source of truth)
// when the manifest carries no literal version.
let alienVersion = pkg.dependencies?.["alien-signals"]?.match(/\d+\.\d+\.\d+/)?.[0];
if (!alienVersion) {
  const workspaceYaml = readFileSync(path.join(root, "pnpm-workspace.yaml"), "utf8");
  alienVersion = workspaceYaml.match(/^\s*alien-signals:\s*(\d+\.\d+\.\d+)\s*$/m)?.[1];
}
if (!alienVersion) {
  console.error(
    "Could not resolve the alien-signals version from packages/ui or the pnpm catalog.",
  );
  process.exit(1);
}

const entries = [
  { name: "root", specifier: `@taipa/ui@${version}` },
  { name: "client", specifier: `@taipa/ui@${version}/client` },
];

let failures = 0;

function fail(message) {
  failures += 1;
  console.error(`FAIL  ${message}`);
}

async function fetchText(url) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`${url} -> HTTP ${response.status}`);
  }
  return { url: response.url, body: await response.text() };
}

// Resolve an esm.sh entry URL to the actual module body, following the
// re-export indirection esm.sh uses for entry points.
async function fetchModule(specifier, { external = false } = {}) {
  const entryUrl = `https://esm.sh/${specifier}${external ? "?external=alien-signals" : ""}`;
  const entry = await fetchText(entryUrl);
  const reexport = entry.body.match(/from\s*"(\/[^"]+)"/);
  if (!reexport) {
    return { entryUrl, moduleUrl: entry.url, body: entry.body };
  }
  const moduleUrl = new URL(reexport[1], "https://esm.sh").href;
  const moduleResponse = await fetchText(moduleUrl);
  return { entryUrl, moduleUrl: moduleResponse.url, body: moduleResponse.body };
}

console.log(`Verifying esm.sh topology for @taipa/ui@${version} (alien-signals@${alienVersion})\n`);

const sharedUrls = new Set();

for (const { name, specifier } of entries) {
  // Mode 1: ?external=alien-signals — the module must keep a bare
  // alien-signals import so a browser import map can own the shared graph.
  try {
    const external = await fetchModule(specifier, { external: true });
    if (/from\s*"alien-signals"|import\s*"alien-signals"/.test(external.body)) {
      console.log(
        `PASS  ${name}: ?external keeps bare "alien-signals" import (${external.moduleUrl})`,
      );
    } else {
      fail(
        `${name}: ?external=alien-signals module has no bare alien-signals import (${external.moduleUrl})`,
      );
    }
  } catch (error) {
    fail(`${name}: ${error.message}`);
  }

  // Mode 2: default rewrite — esm.sh must pin alien-signals to one exact
  // version URL shared by every subpath (no duplicated signal graph).
  try {
    const resolved = await fetchModule(specifier);
    const matches = [...resolved.body.matchAll(/\/alien-signals@([\d.]+[^/"']*)\//g)].map(
      (m) => m[1],
    );
    const unique = [...new Set(matches)];
    if (unique.length === 1) {
      sharedUrls.add(unique[0]);
      console.log(
        `PASS  ${name}: alien-signals pinned to single version ${unique[0]} (${resolved.moduleUrl})`,
      );
    } else {
      fail(
        `${name}: expected exactly one alien-signals version, found [${unique.join(", ") || "none"}] (${resolved.moduleUrl})`,
      );
    }
  } catch (error) {
    fail(`${name}: ${error.message}`);
  }
}

if (sharedUrls.size > 1) {
  fail(`root and client resolve different alien-signals versions: [${[...sharedUrls].join(", ")}]`);
}

console.log(`
Import map for the proven topology:
{
  "imports": {
    "alien-signals": "https://esm.sh/alien-signals@${alienVersion}",
    "@taipa/ui": "https://esm.sh/@taipa/ui@${version}?external=alien-signals",
    "@taipa/ui/client": "https://esm.sh/@taipa/ui@${version}/client?external=alien-signals"
  }
}
`);

if (failures > 0) {
  console.error(
    `${failures} CDN check(s) failed: resolve missing registry authority, name conflicts, or duplicated CDN graph issues before relying on CDN delivery.`,
  );
  process.exit(1);
}
console.log(`CDN topology verified. Deprecate the probe on npm when done (from a neutral directory — the repo root's devEngines pin makes npm refuse commands there):
(cd "$(mktemp -d)" && npm deprecate @taipa/ui@${version} "CDN probe canary; superseded by supported alphas.")`);
