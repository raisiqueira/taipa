import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite-cli";

const source = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: "@taipa/ui/client", replacement: source("../packages/ui/src/client/index.ts") },
      { find: "@taipa/ui/forms", replacement: source("../packages/ui/src/forms/index.ts") },
      { find: "@taipa/ui/server", replacement: source("../packages/ui/src/server/index.ts") },
      { find: "@taipa/ui", replacement: source("../packages/ui/src/index.ts") },
    ],
  },
});
