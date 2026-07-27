import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type UserConfig } from "vite-cli";

const source = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// The Tailwind plugin is typed against its own bundled Vite; cast to vite-cli's
// PluginOption so the two copies of Vite in this workspace line up.
const plugins = [tailwindcss()] as UserConfig["plugins"];

export default defineConfig({
  plugins,
  resolve: {
    alias: [
      { find: "@taipa/ui/client", replacement: source("../packages/ui/src/client/index.ts") },
      { find: "@taipa/ui/forms", replacement: source("../packages/ui/src/forms/index.ts") },
      { find: "@taipa/ui/server", replacement: source("../packages/ui/src/server/index.ts") },
      { find: "@taipa/ui", replacement: source("../packages/ui/src/index.ts") },
    ],
  },
  build: {
    rollupOptions: {
      input: {
        dashboard: source("./index.html"),
        harness: source("./harness.html"),
      },
    },
  },
});
