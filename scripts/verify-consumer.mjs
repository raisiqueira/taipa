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
execPnpm(["pack", "--pack-destination", work], {
  cwd: uiDir,
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
for (const key of ["component","html","raw","safeUrl","signal","computed","effect","effectScope","batch"]) {
  if (typeof m[key] !== "function") throw new Error("missing root export: " + key);
}
const c = m.component("probe", { contractVersion: "1" }).state("n", 0).render(() => m.html\`<p>x</p>\`);
if (c.name !== "probe" || c.contractVersion !== "1") throw new Error("component metadata broken");
if (m.html\`<p>\${"<e>"}</p>\`.value !== "<p>&lt;e&gt;</p>") throw new Error("html escaping broken");
const s = m.signal(1);
m.batch(() => { s(41); });
if (s() !== 41) throw new Error("alien-signals reactivity broken");
if (m.safeUrl("/x").value !== "/x") throw new Error("safeUrl broken");`,
  },
  {
    subpath: "@taipa/ui/server",
    assert: `const m = await import("@taipa/ui/server");
const ui = await import("@taipa/ui");
for (const key of ["renderToString","renderIsland"]) {
  if (typeof m[key] !== "function") throw new Error("missing server export: " + key);
}
const c = ui.component("Probe", { contractVersion: "1" })
  .state("n", ({ props }) => props.start)
  .render(({ state }) => ui.html\`<output>\${state.n()}</output>\`);
const inner = await m.renderToString(c, { start: 2 });
if (inner !== "<output>2</output>") throw new Error("renderToString broken: " + inner);
const island = await m.renderIsland(c, { start: 2 }, { hydrate: "load", state: { n: 5 } });
const expected = '<taipa-island data-taipa-component="Probe" data-taipa-hydrate="load" data-taipa-version="1"><output>5</output><script type="application/json" data-taipa-props>{"start":2}</script><script type="application/json" data-taipa-state>{"n":5}</script></taipa-island>';
if (island !== expected) throw new Error("renderIsland broken: " + island);
if ("window" in globalThis || "document" in globalThis) throw new Error("DOM global leaked");`,
  },
  {
    subpath: "@taipa/ui/forms",
    assert: `const m = await import("@taipa/ui/forms");
if (typeof m.createForm !== "function") throw new Error("missing forms export: createForm");
if (typeof m.standardSchema !== "function") throw new Error("missing forms export: standardSchema");
if (typeof m.issuesToFormErrors !== "function") throw new Error("missing forms export: issuesToFormErrors");
const errors = m.issuesToFormErrors([{ message: "Required", path: ["user", "email"] }]);
if (errors["user.email"]?.[0] !== "Required") throw new Error("standard schema issue mapping broken");
if ("window" in globalThis || "document" in globalThis || "customElements" in globalThis) throw new Error("DOM global leaked");`,
    afterInstall: () => {
      const declarations = readFileSync(
        path.join(consumerDir, "node_modules/@taipa/ui/dist/forms.d.mts"),
        "utf8",
      );
      for (const typeName of [
        "StandardSchemaAdapterOptions",
        "StandardSchemaIssue",
        "StandardSchemaV1",
      ]) {
        if (!declarations.includes(typeName)) {
          throw new Error(`missing forms declaration export: ${typeName}`);
        }
      }
    },
  },
  {
    subpath: "@taipa/ui/client",
    assert: `const m = await import("@taipa/ui/client");
if (typeof m.bootstrap !== "function" || typeof m.hydrate !== "function" || typeof m.mount !== "function" || typeof m.unmount !== "function") throw new Error("client surface incomplete");
if ("window" in globalThis || "document" in globalThis || "customElements" in globalThis) throw new Error("DOM global leaked");
if (globalThis[Symbol.for("taipa.ui/runtime")] !== undefined) throw new Error("runtime registry created at import");`,
  },
];

for (const { subpath, assert, afterInstall } of checks) {
  afterInstall?.();
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

function execPnpm(args, options) {
  const direct = spawnSync("pnpm", ["--version"], { encoding: "utf8", shell: isWindows });
  if (direct.status === 0) {
    return execFileSync("pnpm", args, { ...options, shell: isWindows });
  }

  return execFileSync("corepack", ["pnpm", ...args], { ...options, shell: isWindows });
}
