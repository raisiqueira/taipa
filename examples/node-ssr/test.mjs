import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const exampleDirectory = fileURLToPath(new URL(".", import.meta.url));

test("serves static and interactive SSR pages", async (context) => {
  const server = spawn(process.execPath, ["server.mjs"], {
    cwd: exampleDirectory,
    env: { ...process.env, PORT: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  context.after(() => server.kill());

  const origin = await serverOrigin(server);

  const defaultGreetingResponse = await fetch(`${origin}/`);
  assert.equal(defaultGreetingResponse.status, 200);
  assert.match(await defaultGreetingResponse.text(), /Hello, Taipa\./);

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
  const count = page.locator('[data-taipa-ref="count"]');
  await expectText(count, "3");
  await page.getByRole("button", { name: "Increase count" }).click();
  await expectText(count, "4");
  await page.getByRole("button", { name: "Decrease count" }).click();
  await expectText(count, "3");
  assert.deepEqual(browserErrors, []);
});

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
