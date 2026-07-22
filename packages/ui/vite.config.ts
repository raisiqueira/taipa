import { defineConfig } from "vite-plus";
import { playwright } from "vite-plus/test/browser-playwright";

// Package-local configuration: pack shape and test projects only. The shared
// fmt/lint/check/run policy lives in the root vite.config.ts.
export default defineConfig({
  pack: {
    entry: {
      index: "src/index.ts",
      client: "src/client/index.ts",
      server: "src/server/index.ts",
      forms: "src/forms/index.ts",
    },
    dts: {
      tsgo: true,
    },
    exports: true,
  },
  test: {
    projects: [
      {
        test: {
          name: "node",
          include: ["tests/node/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        test: {
          name: "package",
          include: ["tests/package/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        test: {
          name: "browser",
          include: ["tests/browser/**/*.test.ts"],
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
