import { expect, test } from "vite-plus/test";
import badgeStatic from "../../../conformance/fixtures/islands/badge-static.json" with { type: "json" };
import chartVisible from "../../../conformance/fixtures/islands/chart-visible.json" with { type: "json" };
import counterLoad from "../../../conformance/fixtures/islands/counter-load.json" with { type: "json" };

// The fixtures are the cross-runtime contract (Django emits the same bytes),
// so they must survive a real HTML parser with the JSON payloads inert.
const fixtures = [counterLoad, chartVisible, badgeStatic];

test("fixture islands parse as HTML and their JSON scripts stay inert", () => {
  for (const fixture of fixtures) {
    const doc = new DOMParser().parseFromString(fixture.expect, "text/html");
    const host = doc.querySelector("taipa-island");
    expect(host, fixture.description).not.toBeNull();

    const hydratable = "hydrate" in fixture.options;
    const propsScript = host?.querySelector("script[data-taipa-props]") ?? null;
    const stateScript = host?.querySelector("script[data-taipa-state]") ?? null;
    if (hydratable) {
      expect(JSON.parse(propsScript?.textContent ?? ""), fixture.description).toEqual(
        fixture.props,
      );
    } else {
      expect(propsScript, fixture.description).toBeNull();
    }
    expect(stateScript?.textContent ? JSON.parse(stateScript.textContent) : null).toEqual(
      fixture.state,
    );

    for (const script of host?.querySelectorAll("script") ?? []) {
      expect(script.type).toBe("application/json");
    }
  }
});
