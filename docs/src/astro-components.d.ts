declare module "*.astro";

// `vp check` runs before Astro generates `.astro/types.d.ts` in CI.
declare module "astro:content" {
  export function defineCollection<T>(definition: T): T;
}

interface ImportMetaEnv {
  readonly DEV: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
