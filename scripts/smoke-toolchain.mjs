// Deliberate-failure smoke checks for the Vite+ toolchain (U1 test scenarios
// 2 and 3). Proves that `vp check` catches type errors, lint violations, and
// format violations without any standalone Oxc/ESLint/Prettier config, and
// that the committed baseline stays green.
//
// Usage: pnpm smoke:toolchain
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = path.join(root, "tests/toolchain/type-error.fixture.ts");
const original = readFileSync(fixture, "utf8");

const isWindows = process.platform === "win32";

function vpCheck(args = []) {
  const result = spawnSync("vp", ["check", ...args], {
    cwd: root,
    shell: isWindows,
    stdio: "pipe",
    encoding: "utf8",
  });
  return result.status ?? 1;
}

const results = [];

function record(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

try {
  // Baseline: committed fixture state must be green.
  record("baseline `vp check` is green", vpCheck() === 0);

  // 1. Type error: `vp check` (type-aware linting) must fail.
  writeFileSync(
    fixture,
    `${original}\nexport const deliberateTypeError: number = "not a number";\n`,
  );
  record("type error makes `vp check` fail", vpCheck() !== 0);

  writeFileSync(fixture, original);
  record("restoring the type error returns to green", vpCheck() === 0);

  // 2. Lint violation: `no-console` must fail the check.
  writeFileSync(
    fixture,
    `${original}\nexport function deliberateLintViolation(): void {\n  console.log("not allowed");\n}\n`,
  );
  record("lint violation (no-console) makes `vp check` fail", vpCheck() !== 0);

  writeFileSync(fixture, original);
  record("restoring the lint violation returns to green", vpCheck() === 0);

  // 3. Format violation: badly formatted code must fail, and `vp check --fix`
  //    must repair it without Prettier.
  writeFileSync(
    fixture,
    `export function toolchainFixture(input:number):number{\nreturn input*2\n}\n`,
  );
  record("format violation makes `vp check` fail", vpCheck() !== 0);
  const fixStatus = vpCheck(["--fix"]);
  record("`vp check --fix` repairs the format violation", fixStatus === 0 && vpCheck() === 0);
} finally {
  writeFileSync(fixture, original);
}

const finalStatus = vpCheck();
record("final state is green after restore", finalStatus === 0);

const failed = results.filter((r) => !r.ok);
if (failed.length > 0) {
  console.error(`\n${failed.length} smoke check(s) failed:`);
  for (const f of failed) console.error(`  - ${f.name}`);
  process.exit(1);
}
console.log(`\nAll ${results.length} toolchain smoke checks passed.`);
