import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, normalize } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const dist = new URL("../dist/", import.meta.url);
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
  const relative = pathname.endsWith("/") ? `${pathname}index.html` : pathname;
  const file = new URL(normalize(relative).replace(/^\/+/, ""), dist);

  if (!file.pathname.startsWith(dist.pathname)) {
    response.writeHead(403).end();
    return;
  }

  try {
    const details = await stat(file);
    const target = details.isDirectory() ? new URL("index.html", file) : file;
    const body = await readFile(target);
    response.writeHead(200, { "content-type": contentType(extname(target.pathname)) });
    response.end(body);
  } catch {
    response.writeHead(404).end();
  }
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();

if (address === null || typeof address === "string") {
  throw new Error("Could not start the docs test server.");
}

const baseUrl = `http://127.0.0.1:${address.port}`;
let browser;

try {
  browser = await chromium.launch();
  const page = await browser.newPage();
  await testCounter(page);
  await testForm(page);
  await expectStaticFallback();
  await testStaticForm(browser);
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}

async function testCounter(page) {
  await page.goto(`${baseUrl}/basic/client-component/`);
  await page.locator("[data-docs-counter-demo]").waitFor();
  const count = page.locator("[data-docs-counter-demo] output");
  await page.getByRole("button", { name: "Increase count" }).press("Enter");
  await expectText(count, "1");
  await page.getByRole("button", { name: "Decrease count" }).click();
  await expectText(count, "0");
}

async function testForm(page) {
  await page.goto(`${baseUrl}/forms/`);
  const form = page.locator("[data-docs-form-demo] form");
  await form.waitFor();
  const button = form.getByRole("button", { name: "Try enhanced submit" });

  await button.click();
  await expectInvalid(form.getByLabel("Name"));
  await expectEmpty(page.locator("[data-taipa-error-for=name]"));

  await form.getByLabel("Name").fill("Ada Lovelace");
  await form.getByLabel("Email").fill("not-an-email");
  await button.click();
  await expectInvalid(form.getByLabel("Email"));
  await expectEmpty(page.locator("[data-taipa-error-for=name]"));

  await form.getByLabel("Name").fill("A");
  await form.getByLabel("Email").fill("reader@example.com");
  await button.click();
  await page.locator("[data-taipa-error-for=name]").waitFor();
  await expectText(page.locator("[data-taipa-error-for=name]"), "at least");
  await expectAttribute(form.getByLabel("Name"), "aria-invalid", "true");

  await form.getByLabel("Name").fill("Ada Lovelace");
  const url = page.url();
  await button.click();
  await expectDisabled(button, true);
  await expectText(page.locator("[data-docs-form-success]"), "simulating");
  await expectText(page.locator("[data-docs-form-success]"), "submitted locally");
  await expectDisabled(button, false);
  await expectAttribute(form.getByLabel("Name"), "aria-invalid", null);

  if (page.url() !== url) {
    throw new Error("The simulated form submission navigated away from the guide.");
  }
}

async function testStaticForm(browser) {
  const context = await browser.newContext({ javaScriptEnabled: false });

  try {
    const page = await context.newPage();
    await page.goto(`${baseUrl}/forms/`);
    const form = page.locator("[data-docs-form-demo] form");
    await form.waitFor();
    await expectDisabled(form.getByRole("button", { name: "Try enhanced submit" }), true);
  } finally {
    await context.close();
  }
}

async function expectStaticFallback() {
  const html = await readFile(new URL("forms/index.html", dist), "utf8");

  if (!html.includes("This interactive demo requires JavaScript and will not submit data.")) {
    throw new Error("Expected the static form fallback message in the built guide.");
  }
}

async function expectText(locator, text) {
  await locator.waitFor({ state: "visible" });
  const deadline = Date.now() + 5000;

  while (Date.now() < deadline) {
    const value = await locator.textContent();
    if (value?.toLowerCase().includes(text.toLowerCase())) return;
    await delay(50);
  }

  const value = await locator.textContent();
  throw new Error(`Expected demo text to include "${text}", received "${value ?? ""}".`);
}

async function expectEmpty(locator) {
  const value = await locator.textContent();

  if (value?.trim()) {
    throw new Error(`Expected demo text to be empty, received "${value}".`);
  }
}

async function expectInvalid(locator) {
  const invalid = await locator.evaluate((element) => !element.checkValidity());

  if (!invalid) {
    throw new Error("Expected native browser validation to block the demo submission.");
  }
}

async function expectAttribute(locator, name, expected) {
  const value = await locator.getAttribute(name);

  if (value !== expected) {
    throw new Error(`Expected ${name} to be "${expected}", received "${value}".`);
  }
}

async function expectDisabled(locator, expected) {
  const disabled = await locator.isDisabled();

  if (disabled !== expected) {
    throw new Error(`Expected submit control disabled=${expected}, received ${disabled}.`);
  }
}

function contentType(extension) {
  return (
    {
      ".css": "text/css",
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript",
      ".json": "application/json",
      ".svg": "image/svg+xml",
    }[extension] ?? "application/octet-stream"
  );
}
