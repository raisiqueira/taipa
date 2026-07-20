// CDN topology verification for the disposable 0.0.0-cdn-probe.* canary (U1
// test scenario 7). This is U1's closing gate: run it AFTER publishing the
// probe to npm and BEFORE starting U2. It proves that exact-version esm.sh
// URLs for the root and client subpaths keep a single, shared alien-signals
// mapping (import-map-ready), with no duplicated CDN signal graph.
//
// If this fails because the registry name is unavailable, a name conflict
// appears, or the CDN graph is duplicated, STOP — the plan requires resolving
// registry authority before U2.
//
// Full gate sequence (requires `npm login` with publish rights to @taipa):
//   1. vp run -r build                       # fresh dist
//   2. pnpm --filter @taipa/ui publish       # publishes 0.0.0-cdn-probe.* (pnpm rewrites catalog:)
//   3. pnpm verify:cdn                       # this script (network)
//   4. npm deprecate @taipa/ui@0.0.0-cdn-probe.0 "U1 CDN probe canary; superseded by supported alphas."
//
// Usage: pnpm verify:cdn [-- <version>]   (defaults to packages/ui version)
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(path.join(root, "packages/ui/package.json"), "utf8"));
const version = process.argv[2] ?? pkg.version;
const alienVersion = pkg.dependencies["alien-signals"]?.replace(/^[^\d]*/, "") ?? "3.2.1";

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
    `${failures} CDN check(s) failed. Per the plan: missing registry authority, a name conflict, or a duplicated CDN graph STOPS work before U2.`,
  );
  process.exit(1);
}
console.log(
  'CDN topology verified. Deprecate the probe on npm when done: npm deprecate @taipa/ui@<probe-version> "U1 CDN probe canary; superseded by supported alphas."',
);
