import { fileURLToPath } from "node:url";

export default {
  build: {
    lib: {
      entry: fileURLToPath(new URL("./client.mjs", import.meta.url)),
      fileName: "client",
      formats: ["es"],
    },
    outDir: "dist/assets",
    emptyOutDir: true,
  },
};
