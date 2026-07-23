import "./style.css";
import type { BenchmarkApp } from "./types.ts";

const apps = {
  ilha: () => import("./apps/ilha.ts"),
  "lit-html": () => import("./apps/lit-html.ts"),
  react: () => import("./apps/react.ts"),
  taipa: () => import("./apps/taipa.ts"),
  vanillajs: () => import("./apps/vanillajs.ts"),
  vue: () => import("./apps/vue.ts"),
} satisfies Record<string, () => Promise<{ default: BenchmarkApp }>>;

export type FrameworkId = keyof typeof apps;

const framework = new URLSearchParams(window.location.search).get("framework") ?? "taipa";
const root = document.querySelector<HTMLElement>("#main");

if (root === null) {
  throw new Error("Benchmark root #main is missing");
}

if (!isFramework(framework)) {
  root.textContent = `Unknown framework: ${framework}`;
  throw new Error(`Unknown framework: ${framework}`);
}

const { default: app } = await apps[framework]();
await app.mount(root);
document.documentElement.dataset.framework = framework;

function isFramework(value: string): value is FrameworkId {
  return value in apps;
}
