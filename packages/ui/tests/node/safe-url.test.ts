import { expect, test } from "vite-plus/test";
import { safeUrl } from "../../src/template/safe-url.ts";

// Scenario 3: approved relative and protocol URLs pass; hostile schemes fail.

test("relative URLs pass by default", () => {
  for (const value of [
    "/absolute/path",
    "relative/page.html",
    "#fragment",
    "?query=1",
    "//cdn.example.com/protocol-relative",
    "",
  ]) {
    expect(safeUrl(value).value).toBe(value);
  }
});

test("default protocols pass: http, https, mailto, tel", () => {
  expect(safeUrl("https://example.com").value).toBe("https://example.com");
  expect(safeUrl("http://example.com").value).toBe("http://example.com");
  expect(safeUrl("mailto:user@example.com").value).toBe("mailto:user@example.com");
  expect(safeUrl("tel:+15551234567").value).toBe("tel:+15551234567");
});

test("hostile schemes fail", () => {
  expect(() => safeUrl("javascript:alert(1)")).toThrow(/protocol/);
  expect(() => safeUrl("JaVaScRiPt:alert(1)")).toThrow(/protocol/);
  expect(() => safeUrl("data:text/html,<script>alert(1)</script>")).toThrow(/protocol/);
  expect(() => safeUrl("vbscript:msgbox(1)")).toThrow(/protocol/);
  expect(() => safeUrl("file:///etc/passwd")).toThrow(/protocol/);
});

test("whitespace and control-character smuggling fails", () => {
  expect(() => safeUrl("java\tscript:alert(1)")).toThrow();
  expect(() => safeUrl(" javascript:alert(1)")).toThrow();
  expect(() => safeUrl("javascript:alert(1) ")).toThrow();
  expect(() => safeUrl("java\nscript:alert(1)")).toThrow();
  expect(() => safeUrl("https://example.com/a b")).toThrow();
});

test("allowRelative: false rejects relative URLs but keeps approved protocols", () => {
  expect(() => safeUrl("/path", { allowRelative: false })).toThrow(/relative/);
  expect(() => safeUrl("#frag", { allowRelative: false })).toThrow(/relative/);
  expect(safeUrl("https://example.com", { allowRelative: false }).value).toBe(
    "https://example.com",
  );
});

test("custom protocol lists replace the defaults", () => {
  expect(safeUrl("webcal://example.com/cal.ics", { protocols: ["webcal:"] }).value).toBe(
    "webcal://example.com/cal.ics",
  );
  expect(() => safeUrl("http://example.com", { protocols: ["webcal:"] })).toThrow(/protocol/);
  expect(() => safeUrl("https://example.com", { protocols: ["https:"] })).not.toThrow();
  expect(() => safeUrl("http://example.com", { protocols: ["https:"] })).toThrow(/protocol/);
});

test("protocol matching is case-insensitive", () => {
  expect(safeUrl("HTTPS://example.com").value).toBe("HTTPS://example.com");
  expect(safeUrl("MailTo:user@example.com").value).toBe("MailTo:user@example.com");
});

test("non-string input fails", () => {
  expect(() => safeUrl(42 as unknown as string)).toThrow(/string/);
  expect(() => safeUrl(null as unknown as string)).toThrow(/string/);
});

test("SafeUrl values are frozen and expose their value", () => {
  const url = safeUrl("https://example.com");
  expect(Object.isFrozen(url)).toBe(true);
  expect(url.value).toBe("https://example.com");
});
