import { defineConfig } from "vite-plus";

// Root Vite+ configuration: the single source of truth for the shared
// format/lint/check/run/staged policy across the workspace. Package-local
// vite.config.ts files only carry package-specific test and pack settings.
export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  fmt: {
    ignorePatterns: ["**/dist/**", "integrations/**", "tests/consumers/**"],
  },
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    plugins: ["import"],
    ignorePatterns: ["**/dist/**", "integrations/**", "tests/consumers/**"],
    rules: {
      "import/extensions": [
        "error",
        "ignorePackages",
        {
          checkTypeImports: true,
          pattern: { cts: "never", mts: "never", ts: "never", tsx: "never" },
        },
      ],
      "vite-plus/prefer-vite-plus-imports": "error",
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
    options: { typeAware: true, typeCheck: true },
    overrides: [
      {
        files: ["scripts/**/*.mjs"],
        env: { node: true },
        rules: { "no-console": "off" },
      },
    ],
  },
  run: {
    cache: true,
  },
});
