import { defineConfig } from "astro/config";
import icon from "astro-icon";
import tailwindcss from "@tailwindcss/vite";
import nimbus, { defineConfig as defineNimbusConfig } from "@cloudflare/nimbus-docs";
import { tableScroll } from "@cloudflare/nimbus-docs/markdown";

const source = (path: string) => new URL(`../packages/ui/src/${path}`, import.meta.url).pathname;

const nimbusConfig = defineNimbusConfig({
  site: "https://taipa-ui.dev",
  title: "Taipa UI",
  description: "Direct-DOM islands for server-authored HTML.",
  locale: "en",
  github: "https://github.com/raisiqueira/taipa",
  socialImageAlt: "Taipa UI documentation",
});

export default defineConfig({
  output: "static",
  vite: {
    resolve: {
      alias: [
        { find: "@taipa/ui/client", replacement: source("client/index.ts") },
        { find: "@taipa/ui/forms", replacement: source("forms/index.ts") },
        { find: "@taipa/ui/server", replacement: source("server/index.ts") },
        { find: "@taipa/ui", replacement: source("index.ts") },
      ],
    },
    plugins: [tailwindcss()],
  },
  prefetch: {
    prefetchAll: true,
    defaultStrategy: "hover",
  },
  integrations: [
    icon(),
    nimbus(nimbusConfig, {
      rules: {
        "nimbus/frontmatter-shape": "error",
        "nimbus/internal-link": "error",
      },
      markdown: {
        hastPlugins: [tableScroll()],
      },
    }),
  ],
});
