// Local browser regression only. No VPS, credentials, or real device is contacted.
// Set PLAYWRIGHT_MODULE to a local playwright module path, or install playwright separately.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const root = fileURLToPath(new URL("../public/", import.meta.url));
const out = fileURLToPath(new URL("../../dist/rc7-ui-qa/", import.meta.url));
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || "msedge", headless: true });
try {
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.route("**/*", async route => {
      const url = new URL(route.request().url());
      const name = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
      if (url.hostname !== "local.test" || !["index.html", "styles.css", "app.js"].includes(name)) return route.abort();
      await route.fulfill({ body: await fs.readFile(path.join(root, name)),
        contentType: name.endsWith("js") ? "application/javascript" : name.endsWith("css") ? "text/css" : "text/html" });
    });
    await page.addInitScript(() => {
      window.sent = [];
      class MockSocket extends EventTarget {
        static OPEN = 1;
        readyState = 1;
        constructor() { super(); window.mockSocket = this; setTimeout(() => this.dispatchEvent(new Event("open")), 0); }
        send(text) {
          const message = JSON.parse(text);
          window.sent.push(message);
          if (message.type === "control.hello") this.receive({ type: "control.accepted", user: { username: "fixture", role: "user" } });
        }
        receive(message) { this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(message) })); }
        close() { this.readyState = 3; this.dispatchEvent(new Event("close")); }
      }
      window.WebSocket = MockSocket;
    });
    await page.goto("http://local.test/");
    await page.locator("#loginUser").fill("fixture");
    await page.locator("#adminToken").fill("test-password-only");
    await page.locator("#connectButton").click();
    await page.locator("#dashboard").waitFor({ state: "visible" });
    await page.evaluate(() => window.mockSocket.receive({ type: "devices.snapshot", devices: [{ deviceId: "PK-FIXTURE",
      telemetry: { device: { model: "Local test only" }, accounts: [{ index: 0, label: "杂鱼小弟", automation: {
        equipmentVerificationToken: "12345678-1234-4123-8123-123456789abc",
        equipmentVerificationItems: ["柔情方巾§恋§", "君我剑§恋§"], equipmentVerificationReason: "主宠标识不足",
        inventoryCounts: { "进化宝石": 2, "曙光印记": 3 }, inventoryStatus: "ok" } },
        { index: 1, label: "杂鱼小妹", automation: {
          inventoryCounts: { "进化宝石": 5, "强化丹A": 4 }, inventoryStatus: "ok" } }] } }] }));
    await page.locator("#equipmentChecks").waitFor({ state: "visible" });
    assert.match(await page.locator(".daily-inventory-total").textContent(), /2个账号/);
    assert.match(await page.locator(".daily-inventory-total").textContent(), /进化宝石 7/);
    assert.match(await page.locator(".daily-inventory-total").textContent(), /曙光印记 3/);
    assert.match(await page.locator(".daily-inventory-total").textContent(), /强化丹A 4/);
    page.once("dialog", dialog => dialog.dismiss());
    await page.locator("#equipmentChecks button").click();
    assert.equal(await page.evaluate(() => window.sent.some(m => m.command === "confirm_equipment_verification")), false);
    page.once("dialog", dialog => dialog.accept());
    await page.locator("#equipmentChecks button").click();
    const confirmation = await page.evaluate(() => window.sent.find(m => m.command === "confirm_equipment_verification"));
    assert.equal(confirmation.parameters.verificationToken, "12345678-1234-4123-8123-123456789abc");
    assert.equal(confirmation.deviceId, "PK-FIXTURE");
    await page.evaluate(() => window.mockSocket.receive({ type: "command.result", success: false, message: "确认已失效，请刷新状态" }));
    assert.match(await page.locator("#operationFeedback").textContent(), /确认已失效/);
    await page.evaluate(() => window.mockSocket.receive({ type: "equipment.transfer.update", payload: { status: "intervention", message: "设备离线，已暂停" } }));
    await page.locator("#singleTransferPanel").waitFor({ state: "visible" });
    assert.equal(await page.locator("#cancelSingleTransfer").isEnabled(), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: path.join(out, `console-${width}.png`), fullPage: true });
    await page.close();
    console.log(`PASS ${width}px: page load, manual confirmation/cancel, error feedback, transfer panel, no horizontal overflow`);
  }
} finally { await browser.close(); }
