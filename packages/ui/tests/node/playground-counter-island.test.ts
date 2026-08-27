/**
 * The playground Counter island is static HTML plus the Counter builder.
 * Every bind/on ref must appear in that island, or hydration preflight
 * leaves the island inert and the buttons look broken.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vite-plus/test";
import { Counter } from "../../../../playground/src/counter";

const playgroundIsland = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../../../playground/index.html"),
  "utf8",
);

describe("playground Counter island markup", () => {
  test("includes every required Counter ref so the island can hydrate", () => {
    const island = playgroundIsland.slice(
      playgroundIsland.indexOf("<taipa-island"),
      playgroundIsland.indexOf("</taipa-island>"),
    );
    expect(island.length).toBeGreaterThan(0);
    for (const name of Counter.requiredRefs) {
      expect(island, `missing data-taipa-ref="${name}"`).toContain(`data-taipa-ref="${name}"`);
    }
  });
});
