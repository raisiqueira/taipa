import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const uiDir = path.join(root, "packages/ui");
const isWindows = process.platform === "win32";
const requiredDistFiles = [
  "index.mjs",
  "index.d.mts",
  "client.mjs",
  "client.d.mts",
  "server.mjs",
  "server.d.mts",
  "forms.mjs",
  "forms.d.mts",
];

for (const file of requiredDistFiles) {
  if (!existsSync(path.join(uiDir, "dist", file))) {
    console.error(`packages/ui/dist/${file} is missing. Run \`vp run -r build\` first.`);
    process.exit(1);
  }
}

const work = mkdtempSync(path.join(tmpdir(), "taipa-package-"));

try {
  execFileSync("pnpm", ["pack", "--pack-destination", work], {
    cwd: uiDir,
    shell: isWindows,
    stdio: "pipe",
  });

  const tarballs = readdirSync(work).filter((file) => file.endsWith(".tgz"));
  if (tarballs.length !== 1) {
    throw new Error(`Expected one tarball, found ${tarballs.length}`);
  }
  const tarball = path.join(work, tarballs[0]);

  const unpacked = path.join(work, "unpacked");
  execFileSync("tar", ["-xzf", tarball, "-C", work], { stdio: "pipe" });
  renameSync(path.join(work, "package"), unpacked);

  const files = execFileSync("tar", ["-tzf", tarball], { encoding: "utf8" }).trim().split("\n");
  const expected = ["package/package.json", "package/README.md", "package/LICENSE"];
  for (const file of expected) assert(files.includes(file), `missing ${file} from tarball`);
  for (const file of requiredDistFiles)
    assert(files.includes(`package/dist/${file}`), `missing dist/${file}`);
  assert(
    files.every((file) => !file.startsWith("package/src/")),
    "tarball contains source files",
  );
  assert(
    files.every((file) => !file.includes("/tests/")),
    "tarball contains tests",
  );
  assert(
    files.every((file) => !file.endsWith(".ts")),
    "tarball contains TypeScript sources",
  );

  const packageJson = JSON.parse(readFileSync(path.join(unpacked, "package.json"), "utf8"));
  assert(packageJson.type === "module", "package must remain ESM-only");
  assert(packageJson.sideEffects === false, "package must remain side-effect free");
  assert(
    packageJson.dependencies?.["alien-signals"],
    "alien-signals must remain a runtime dependency",
  );
  for (const [subpath, target] of Object.entries(packageJson.exports)) {
    if (subpath === "./package.json") continue;
    assert(
      existsSync(path.join(unpacked, target)),
      `export target missing: ${subpath} -> ${target}`,
    );
  }

  const index = readFileSync(path.join(unpacked, "dist/index.mjs"), "utf8");
  const server = readFileSync(path.join(unpacked, "dist/server.mjs"), "utf8");
  const forms = readFileSync(path.join(unpacked, "dist/forms.mjs"), "utf8");
  assert(index.includes('from "alien-signals"'), "root entry must keep alien-signals external");
  assert(!server.match(/\b(window|document)\b/), "server entry must not reference DOM globals");
  assert(
    !forms.includes("data-taipa-hydrate"),
    "forms entry should not pull island scheduler code",
  );

  runNodeConsumer(tarball);
  runViteBrowserConsumer(tarball);
  runDenoSmokeIfAvailable();

  console.log(`Package verification passed for ${path.basename(tarball)}.`);
} finally {
  rmSync(work, { force: true, recursive: true });
}

function runNodeConsumer(tarball) {
  const consumerDir = path.join(work, "node-consumer");
  mkdirSync(consumerDir, { recursive: true });
  writeFileSync(
    path.join(consumerDir, "package.json"),
    JSON.stringify({
      private: true,
      type: "module",
      dependencies: { "@taipa/ui": `file:${tarball}` },
    }),
  );
  execFileSync("npm", ["install", "--no-audit", "--no-fund", "--loglevel=error"], {
    cwd: consumerDir,
    shell: isWindows,
    stdio: "pipe",
  });
  const result = spawnSync(
    "node",
    [
      "--input-type=module",
      "-e",
      `const root = await import("@taipa/ui");
const server = await import("@taipa/ui/server");
const forms = await import("@taipa/ui/forms");
const client = await import("@taipa/ui/client");
if (typeof root.component !== "function") throw new Error("missing root component");
if (typeof server.renderIsland !== "function") throw new Error("missing renderIsland");
if (typeof forms.standardSchema !== "function") throw new Error("missing standardSchema");
if (typeof client.bootstrap !== "function") throw new Error("missing bootstrap");`,
    ],
    { cwd: consumerDir, encoding: "utf8" },
  );
  assert(result.status === 0, result.stderr || "node consumer failed");
}

function runViteBrowserConsumer(tarball) {
  const consumerDir = path.join(work, "vite-consumer");
  mkdirSync(path.join(consumerDir, "src"), { recursive: true });
  writeFileSync(
    path.join(consumerDir, "package.json"),
    JSON.stringify(
      {
        private: true,
        type: "module",
        scripts: { build: "tsc --noEmit && vite build" },
        dependencies: { "@taipa/ui": `file:${tarball}` },
        devDependencies: { typescript: "latest", vite: "latest" },
      },
      null,
      2,
    ),
  );
  writeFileSync(
    path.join(consumerDir, "index.html"),
    '<div id="app"></div><script type="module" src="/src/main.ts"></script>',
  );
  writeFileSync(
    path.join(consumerDir, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2023",
          lib: ["ES2023", "DOM", "DOM.Iterable"],
          module: "ESNext",
          moduleResolution: "Bundler",
          strict: true,
          noEmit: true,
          skipLibCheck: true,
        },
        include: ["src/**/*.ts"],
      },
      null,
      2,
    ),
  );
  writeFileSync(
    path.join(consumerDir, "src/main.ts"),
    `import { component, html } from "@taipa/ui";
import { mount } from "@taipa/ui/client";
import { createForm, issuesToFormErrors } from "@taipa/ui/forms";

const Counter = component("Counter", { contractVersion: "1" })
  .state("count", 0)
  .bind("count", ({ element, state }) => {
    element.textContent = String(state.count());
  })
  .on("increment@click", ({ state }) => {
    state.count(state.count() + 1);
  })
  .render(({ state }) => html\`
    <button data-taipa-ref="increment">Increment</button>
    <output data-taipa-ref="count">\${state.count()}</output>
  \`);

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("missing app root");
void mount(app, Counter, { replace: true });

const form = document.createElement("form");
form.innerHTML = '<input name="title" value="demo" />';
document.body.append(form);
createForm(form, { read: ({ formData }) => ({ title: String(formData.get("title") ?? "") }) });

if (issuesToFormErrors([{ message: "Required", path: ["title"] }]).title?.[0] !== "Required") {
  throw new Error("forms mapping failed");
}
`,
  );
  execFileSync("npm", ["install", "--no-audit", "--no-fund", "--loglevel=error"], {
    cwd: consumerDir,
    shell: isWindows,
    stdio: "pipe",
  });
  execFileSync("npm", ["run", "build", "--", "--logLevel", "error"], {
    cwd: consumerDir,
    shell: isWindows,
    stdio: "pipe",
  });
}

function runDenoSmokeIfAvailable() {
  const denoVersion = spawnSync("deno", ["--version"], { encoding: "utf8" });
  if (denoVersion.status !== 0) {
    console.warn("Skipping Deno smoke: deno is not available on PATH.");
    return;
  }
  const denoDir = path.join(work, "deno-consumer");
  mkdirSync(denoDir, { recursive: true });
  const unpacked = path.join(work, "unpacked");
  const fileUrl = (file) => pathToFileURL(path.join(unpacked, "dist", file)).href;
  writeFileSync(
    path.join(denoDir, "deno.json"),
    JSON.stringify(
      {
        imports: {
          "@taipa/ui": fileUrl("index.mjs"),
          "@taipa/ui/server": fileUrl("server.mjs"),
          "alien-signals": "npm:alien-signals@3.2.1",
        },
      },
      null,
      2,
    ),
  );
  writeFileSync(
    path.join(denoDir, "main.ts"),
    `import { component, html } from "@taipa/ui";\n` +
      `import { renderToString } from "@taipa/ui/server";\n` +
      `const Probe = component("Probe", { contractVersion: "1" }).render(() => html\`<p>ok</p>\`);\n` +
      `if (await renderToString(Probe, {}) !== "<p>ok</p>") throw new Error("bad render");\n`,
  );
  const result = spawnSync("deno", ["run", "--allow-read", path.join(denoDir, "main.ts")], {
    encoding: "utf8",
  });
  assert(result.status === 0, result.stderr || "deno smoke failed");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
