// Clean-consumer verification for the packed @taipa/ui tarball (U1 test
// scenario 6). Packs the library, installs it into a throwaway consumer with
// plain npm, and imports every subpath with the `node` currently on PATH.
// CI runs this script on a Node 22.12 / Node 24 matrix.
//
// Prerequisites: `vp run -r build` must have produced packages/ui/dist.
// Usage: pnpm verify:consumer
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const uiDir = path.join(root, "packages/ui");
const isWindows = process.platform === "win32";

for (const file of ["index.mjs", "client.mjs", "server.mjs", "forms.mjs"]) {
  if (!existsSync(path.join(uiDir, "dist", file))) {
    console.error(`packages/ui/dist/${file} is missing. Run \`vp run -r build\` first.`);
    process.exit(1);
  }
}

const work = mkdtempSync(path.join(tmpdir(), "taipa-consumer-"));

const pkg = JSON.parse(readFileSync(path.join(uiDir, "package.json"), "utf8"));

console.log(`Packing @taipa/ui@${pkg.version} with node ${process.version} ...`);
// pnpm pack (not npm pack): pnpm rewrites the pnpm-only `catalog:` protocol
// in dependencies to the resolved version, so consumers get a portable
// package.json.
execFileSync("pnpm", ["pack", "--pack-destination", work], {
  cwd: uiDir,
  shell: isWindows,
  stdio: "pipe",
});
const tarballs = readdirSync(work).filter((f) => f.endsWith(".tgz"));
if (tarballs.length !== 1) {
  console.error(`Expected exactly one tarball in ${work}, found: ${tarballs.join(", ") || "none"}`);
  process.exit(1);
}
const tarball = path.join(work, tarballs[0]);

const consumerDir = path.join(work, "consumer");
mkdirSync(consumerDir, { recursive: true });
writeFileSync(
  path.join(consumerDir, "package.json"),
  JSON.stringify(
    {
      name: "taipa-consumer-smoke",
      private: true,
      type: "module",
      dependencies: { "@taipa/ui": `file:${tarball}` },
    },
    null,
    2,
  ),
);

execFileSync("npm", ["install", "--no-audit", "--no-fund", "--loglevel=error"], {
  cwd: consumerDir,
  shell: isWindows,
  stdio: "inherit",
});

const checks = [
  {
    subpath: "@taipa/ui",
    assert: `const m = await import("@taipa/ui");
if (m.probeTarget !== "@taipa/ui:root") throw new Error("bad root marker");
const c = m.createProbeCount(1);
c.set(41);
if (c.get() !== 41) throw new Error("alien-signals reactivity broken");`,
  },
  {
    subpath: "@taipa/ui/server",
    assert: `const m = await import("@taipa/ui/server");
if (m.probeTarget !== "@taipa/ui:server") throw new Error("bad server marker");
if (!m.renderProbe("ok").includes("data-taipa-probe")) throw new Error("renderProbe broken");`,
  },
  {
    subpath: "@taipa/ui/forms",
    assert: `const m = await import("@taipa/ui/forms");
if (m.probeTarget !== "@taipa/ui:forms") throw new Error("bad forms marker");
if (m.probeFieldName("email") !== "taipa:email") throw new Error("probeFieldName broken");`,
  },
  {
    subpath: "@taipa/ui/client",
    assert: `const m = await import("@taipa/ui/client");
if (m.probeTarget !== "@taipa/ui:client") throw new Error("bad client marker");
if (typeof m.mountProbe !== "function") throw new Error("mountProbe missing");`,
  },
];

for (const { subpath, assert } of checks) {
  const result = spawnSync("node", ["--input-type=module", "-e", assert], {
    cwd: consumerDir,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    console.error(`FAIL  import ${subpath} (node ${process.version})`);
    console.error(result.stderr);
    process.exit(1);
  }
  console.log(`PASS  import ${subpath} (node ${process.version})`);
}

console.log(`\nAll ${checks.length} subpath imports verified on node ${process.version}.`);
