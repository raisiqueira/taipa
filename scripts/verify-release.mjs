import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJsonPath = path.join(root, "packages/ui/package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));

assert(packageJson.name === "@taipa/ui", "release package must be @taipa/ui");
assert(packageJson.private !== true, "release package must not be private");
assert(packageJson.type === "module", "release package must remain ESM-only");
assert(packageJson.sideEffects === false, "release package must remain side-effect free");
assert(packageJson.publishConfig?.access === "public", "release package must publish publicly");

const refType = process.env.GITHUB_REF_TYPE;
const refName = process.env.GITHUB_REF_NAME;
if (refType === "tag") {
  assert(refName?.startsWith("v"), `release tag must start with v, got ${refName ?? "<unset>"}`);
  const tagVersion = refName.slice(1);
  assert(
    tagVersion === packageJson.version,
    `release tag ${refName} must match packages/ui version ${packageJson.version}`,
  );
}

const workflowFiles = [
  ".github/workflows/ci.yml",
  ".github/workflows/release.yml",
  ".github/workflows/codeql.yml",
];
for (const workflowFile of workflowFiles) {
  const content = readFileSync(path.join(root, workflowFile), "utf8");
  for (const line of content.split("\n")) {
    const match = line.match(/uses:\s*([^\s#]+)/);
    if (!match || match[1].startsWith("./")) continue;
    const ref = match[1].split("@")[1];
    assert(ref, `${workflowFile} action reference must include a ref: ${line.trim()}`);
    assert(
      /^[a-f0-9]{40}$/i.test(ref),
      `${workflowFile} action must be pinned to a full SHA: ${line.trim()}`,
    );
  }
}

const status = execFileSync("git", ["status", "--short"], { encoding: "utf8" }).trim();
if (process.env.TAIPA_RELEASE_ALLOW_DIRTY !== "1") {
  assert(status === "", `release tree must be clean after verification, found:\n${status}`);
}

console.log(`Release preflight passed for @taipa/ui@${packageJson.version}.`);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
