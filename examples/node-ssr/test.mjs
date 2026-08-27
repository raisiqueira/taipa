import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const exampleDirectory = fileURLToPath(new URL(".", import.meta.url));

test("serves static, interactive, policy, and form pages", async (context) => {
  const server = spawn(process.execPath, ["server.mjs"], {
    cwd: exampleDirectory,
    env: { ...process.env, PORT: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  context.after(() => server.kill());

  const origin = await serverOrigin(server);

  const defaultGreetingResponse = await fetch(`${origin}/`);
  assert.equal(defaultGreetingResponse.status, 200);
  const defaultGreetingPage = await defaultGreetingResponse.text();
  assert.match(defaultGreetingPage, /Hello, Taipa\./);
  assert.doesNotMatch(defaultGreetingPage, /data-taipa-hydrate=/);

  const greetingResponse = await fetch(`${origin}/?name=${encodeURIComponent("<Taipa>")}`);
  assert.equal(greetingResponse.status, 200);
  assert.match(await greetingResponse.text(), /Hello, &lt;Taipa&gt;\./);

  const counterResponse = await fetch(`${origin}/interactive`);
  assert.equal(counterResponse.status, 200);
  const counterPage = await counterResponse.text();
  assert.match(counterPage, /data-taipa-component="Counter"/);
  assert.match(counterPage, /data-taipa-hydrate="load"/);
  assert.match(counterPage, /<output data-taipa-ref="count"[^>]*>3<\/output>/);
  assert.match(counterPage, /<script type="module" src="\/assets\/client\.js"><\/script>/);

  const policiesResponse = await fetch(`${origin}/policies`);
  assert.equal(policiesResponse.status, 200);
  const policiesPage = await policiesResponse.text();
  assert.match(policiesPage, /id="static-island"[^>]*data-taipa-component="Greeting"/);
  assert.doesNotMatch(policiesPage, /id="static-island"[^>]*data-taipa-hydrate=/);
  assert.match(policiesPage, /id="load-island"[^>]*data-taipa-hydrate="load"/);
  assert.match(policiesPage, /id="idle-island"[^>]*data-taipa-hydrate="idle"/);
  assert.match(policiesPage, /data-taipa-idle-timeout="200"/);
  assert.match(policiesPage, /id="visible-island"[^>]*data-taipa-hydrate="visible"/);
  assert.match(policiesPage, /data-taipa-visible-root-margin="80px"/);
  assert.match(policiesPage, /id="only-island"[^>]*data-taipa-hydrate="only"/);
  assert.match(policiesPage, /data-taipa-fallback/);
  assert.match(policiesPage, /<output data-taipa-ref="count"[^>]*>1<\/output>/);
  assert.match(policiesPage, /<output data-taipa-ref="count"[^>]*>2<\/output>/);
  assert.match(policiesPage, /<output data-taipa-ref="count"[^>]*>4<\/output>/);

  const formResponse = await fetch(`${origin}/form`);
  assert.equal(formResponse.status, 200);
  const formPage = await formResponse.text();
  assert.match(formPage, /data-taipa-component="SignupForm"/);
  assert.match(formPage, /action="\/signup"/);
  assert.match(formPage, /formnovalidate/);

  const signupResponse = await fetch(`${origin}/signup`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ name: "Ada", email: "ada@example.com", intent: "draft" }),
  });
  assert.equal(signupResponse.status, 200);
  const signupPage = await signupResponse.text();
  assert.match(signupPage, /Draft saved by native POST/);
  assert.match(signupPage, /Hello, Ada\./);
  assert.match(signupPage, /ada@example.com/);

  const clientResponse = await fetch(`${origin}/assets/client.js`);
  assert.equal(clientResponse.status, 200);
  assert.match(clientResponse.headers.get("content-type") ?? "", /javascript/);
  assert.ok((await clientResponse.text()).length > 0);

  const browser = await chromium.launch();
  context.after(() => browser.close());
  const page = await browser.newPage();
  const browserErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => browserErrors.push(`page: ${error.message}`));

  await page.goto(`${origin}/interactive`);
  await waitForReady(page, "#counter");
  const count = page.locator('[data-taipa-ref="count"]');
  await expectText(count, "3");
  await page.getByRole("button", { name: "Increase count" }).click();
  await expectText(count, "4");
  await page.getByRole("button", { name: "Decrease count" }).click();
  await expectText(count, "3");

  await page.goto(`${origin}/policies`);
  await waitForReady(page, "#load-island");
  await waitForReady(page, "#idle-island");
  assert.equal(await page.locator("#visible-island[data-taipa-ready]").count(), 0);
  assert.equal(await page.locator("#static-island[data-taipa-ready]").count(), 0);
  await clickCount(page.locator("#load-island"), "1", "2");
  await clickCount(page.locator("#idle-island"), "2", "3");

  const onlyFallback = page.locator("#only-island [data-taipa-fallback]");
  const onlyTime = page.locator("#only-island time");
  await waitForLocator(onlyTime);
  assert.equal(await onlyFallback.count(), 0);
  assert.match((await onlyTime.textContent()) ?? "", /T/);

  await page.locator("#visible-island").scrollIntoViewIfNeeded();
  await waitForReady(page, "#visible-island");
  await clickCount(page.locator("#visible-island"), "4", "5");
  assert.equal(await page.locator("#static-island[data-taipa-ready]").count(), 0);

  await page.goto(`${origin}/form`);
  await waitForReady(page, "#signup");
  await page.getByLabel("Name").fill("A");
  await page.getByLabel("Email").fill("reader@example.com");
  await page.getByRole("button", { name: "Join" }).click();
  await expectText(page.locator("[data-taipa-error-for=name]"), "Enter at least two characters.");

  assert.deepEqual(browserErrors, []);
});

async function clickCount(host, from, to) {
  const count = host.locator('[data-taipa-ref="count"]');
  await expectText(count, from);
  await host.getByRole("button", { name: "Increase count" }).click();
  await expectText(count, to);
}

async function waitForReady(page, selector) {
  await waitForLocator(page.locator(`${selector}[data-taipa-ready]`));
}

async function waitForLocator(locator) {
  const deadline = Date.now() + 5_000;

  while (Date.now() < deadline) {
    if ((await locator.count()) > 0) return;
    await delay(50);
  }

  assert.ok((await locator.count()) > 0, "timed out waiting for locator");
}

async function expectText(locator, expected) {
  const deadline = Date.now() + 5_000;

  while (Date.now() < deadline) {
    if ((await locator.textContent())?.trim() === expected) return;
    await delay(50);
  }

  assert.equal((await locator.textContent())?.trim(), expected);
}

function serverOrigin(server) {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      reject(new Error(`Timed out waiting for the example server.\n${stderr}`));
    }, 10_000);

    server.stderr.setEncoding("utf8");
    server.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    server.stdout.setEncoding("utf8");
    server.stdout.on("data", (chunk) => {
      stdout += chunk;
      const match = stdout.match(/http:\/\/localhost:(\d+)/);
      if (match?.[1] !== undefined) {
        clearTimeout(timeout);
        resolve(`http://127.0.0.1:${match[1]}`);
      }
    });
    server.once("exit", (code, signal) => {
      clearTimeout(timeout);
      reject(new Error(`Example server exited (${code ?? signal}).\n${stderr}`));
    });
  });
}
