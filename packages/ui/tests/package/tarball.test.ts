import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vite-plus/test";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const isWindows = process.platform === "win32";

function packFiles(): readonly string[] {
  const work = mkdtempSync(path.join(tmpdir(), "taipa-ui-pack-test-"));
  try {
    execFileSync("pnpm", ["pack", "--pack-destination", work], {
      cwd: packageRoot,
      shell: isWindows,
      stdio: "pipe",
    });
    const tarball = readdirSync(work).find((file) => file.endsWith(".tgz"));
    if (!tarball) {
      throw new Error("pnpm pack did not produce a tarball");
    }
    return execFileSync("tar", ["-tzf", path.join(work, tarball)], { encoding: "utf8" })
      .trim()
      .split("\n")
      .sort();
  } finally {
    rmSync(work, { force: true, recursive: true });
  }
}

test("tarball contains runtime files, declarations, metadata, license, and docs only", () => {
  const files = packFiles();

  expect(files).toContain("package/package.json");
  expect(files).toContain("package/README.md");
  expect(files).toContain("package/LICENSE");
  for (const entry of ["index", "client", "server", "forms"]) {
    expect(files).toContain(`package/dist/${entry}.mjs`);
    expect(files).toContain(`package/dist/${entry}.d.mts`);
  }

  expect(files.every((file) => !file.startsWith("package/src/"))).toBe(true);
  expect(files.every((file) => !file.includes("/tests/"))).toBe(true);
  expect(files.every((file) => !file.endsWith(".ts"))).toBe(true);
  expect(files.every((file) => !file.endsWith(".cjs"))).toBe(true);
});

test("packed runtime stays ESM-only and keeps alien-signals external", () => {
  const index = readFileSync(path.join(packageRoot, "dist/index.mjs"), "utf8");
  const server = readFileSync(path.join(packageRoot, "dist/server.mjs"), "utf8");
  const forms = readFileSync(path.join(packageRoot, "dist/forms.mjs"), "utf8");

  expect(index).toContain('from "alien-signals"');
  expect(index).not.toContain("require(");
  expect(server).not.toMatch(/\b(window|document)\b/);
  expect(forms).not.toContain("data-taipa-hydrate");
});
