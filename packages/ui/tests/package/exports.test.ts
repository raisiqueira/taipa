import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vite-plus/test";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const packageJson = JSON.parse(readFileSync(path.join(packageRoot, "package.json"), "utf8")) as {
  exports: Record<string, string>;
  sideEffects: boolean;
  type: string;
};

test("package exposes the four public ESM subpaths", () => {
  expect(packageJson.type).toBe("module");
  expect(packageJson.sideEffects).toBe(false);
  expect(packageJson.exports).toEqual({
    ".": "./dist/index.mjs",
    "./client": "./dist/client.mjs",
    "./forms": "./dist/forms.mjs",
    "./server": "./dist/server.mjs",
    "./package.json": "./package.json",
  });
});

test("built export targets and declarations exist", () => {
  for (const entry of ["index", "client", "forms", "server"]) {
    expect(existsSync(path.join(packageRoot, "dist", `${entry}.mjs`))).toBe(true);
    expect(existsSync(path.join(packageRoot, "dist", `${entry}.d.mts`))).toBe(true);
  }
});

test("declarations do not point consumers at private source files", () => {
  for (const file of ["index.d.mts", "client.d.mts", "forms.d.mts", "server.d.mts"]) {
    const declaration = readFileSync(path.join(packageRoot, "dist", file), "utf8");
    expect(declaration).not.toContain("../src/");
    expect(declaration).not.toContain(".ts'");
    expect(declaration).not.toContain('.ts"');
  }
});
