import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { WebSocket } from "ws";
import { createRelayServer } from "../server.js";

const adminToken = "test-admin-token-123456789";
const deviceToken = "test-device-token-12345678";
const d1 = "PK-DEVICE111111";
const d2 = "PK-DEVICE222222";

async function connect(url) {
  const socket = new WebSocket(url);
  await once(socket, "open");
  return socket;
}

function nextMessages(socket, type, count, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const messages = [];
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${count} ${type}`)), timeout);
    function onMessage(buffer) {
      const message = JSON.parse(buffer.toString());
      if (message.type !== type) return;
      messages.push(message);
      if (messages.length < count) return;
      clearTimeout(timer);
      socket.off("message", onMessage);
      resolve(messages);
    }
    socket.on("message", onMessage);
  });
}

function helloDevice(socket, deviceId) {
  const accepted = nextMessages(socket, "device.accepted", 1);
  socket.send(JSON.stringify({
    type: "device.hello", deviceId, token: deviceToken, appVersion: "1.9.0"
  }));
  return accepted;
}

test("relay starts the cross-device first leg and starts buyer after exchange listing", async (context) => {
  const stateFile = path.join(os.tmpdir(), `play-keeper-state-${Date.now()}-${process.pid}.json`);
  const authDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "play-keeper-plan-auth-"));
  const server = createRelayServer({ adminToken, deviceToken, planStateFile: stateFile,
    authFile: path.join(authDirectory, "users.json"),
    logger: { warn() {}, error() {} } });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  const device1 = await connect(`ws://127.0.0.1:${port}/device`);
  const device2 = await connect(`ws://127.0.0.1:${port}/device`);
  const control = await connect(`ws://127.0.0.1:${port}/control`);
  context.after(async () => {
    device1.terminate();
    device2.terminate();
    control.terminate();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(stateFile, { force: true });
    fs.rmSync(authDirectory, { recursive: true, force: true });
  });

  await helloDevice(device1, d1);
  await helloDevice(device2, d2);
  const controlAccepted = nextMessages(control, "control.accepted", 1);
  control.send(JSON.stringify({ type: "control.hello", token: adminToken }));
  await controlAccepted;

  device1.send(JSON.stringify({
    type: "telemetry.update", payload: { accounts: [
      { index: 0, label: "hao1" }, { index: 1, label: "hao2" },
      { index: 2, label: "hao3" }, { index: 3, label: "hao4" }
    ] }
  }));
  device2.send(JSON.stringify({
    type: "telemetry.update", payload: { accounts: [
      { index: 0, label: "hao" }, { index: 1, label: "hao7" },
      { index: 2, label: "hao5" }, { index: 3, label: "hao6" }
    ] }
  }));

  const sellerStart = nextMessages(device2, "command.request", 2);
  const buyerConfig = nextMessages(device1, "command.request", 4);
  control.send(JSON.stringify({ type: "plan.start", plan: "eight_account_daily" }));
  const [sellerCommands, buyerCommands] = await Promise.all([sellerStart, buyerConfig]);
  assert.deepEqual(sellerCommands.map((message) => message.command),
    ["configure_equipment_transfer", "run_equipment_sell"]);
  assert.ok([...sellerCommands, ...buyerCommands].every((message) =>
    typeof message.stepId === "string" && message.stepId.length > 20));
  assert.equal(new Set([...sellerCommands, ...buyerCommands].map((message) => message.stepId)).size, 6);
  assert.equal(sellerCommands[0].parameters.buyer, "hao1");
  assert.equal(sellerCommands[0].parameters.items.length, 10);
  assert.deepEqual(buyerCommands.map((message) => message.command), [
    "configure_equipment_transfer", "configure_inventory_monitor",
    "configure_dungeon_sequence", "configure_return_hang"
  ]);

  const buyerStart = nextMessages(device1, "command.request", 1);
  device2.send(JSON.stringify({
    type: "telemetry.update", payload: { accounts: [{
      index: 0, label: "hao", automation: {
        task: "equipment_sell", status: "running", equipmentListedInBatch: 5
      }
    }] }
  }));
  const buyerStartCommands = await buyerStart;
  assert.deepEqual(buyerStartCommands.map((message) => message.command),
    ["run_equipment_buy"]);
  assert.equal(buyerStartCommands[0].parameters.accountIndex, 0);
});

test("saves a daily full-route schedule with configurable dungeons", async (context) => {
  const scheduleFile = path.join(os.tmpdir(), `play-keeper-schedule-${Date.now()}.json`);
  const authDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "play-keeper-schedule-auth-"));
  const server = createRelayServer({ adminToken, deviceToken,
    planScheduleFile: scheduleFile, authFile: path.join(authDirectory, "users.json"),
    logger: { warn() {}, error() {} } });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const control = await connect(`ws://127.0.0.1:${server.address().port}/control`);
  context.after(async () => {
    control.terminate();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(scheduleFile, { force: true });
    fs.rmSync(`${scheduleFile}.state`, { force: true });
    fs.rmSync(authDirectory, { recursive: true, force: true });
  });
  const accepted = nextMessages(control, "control.accepted", 1);
  control.send(JSON.stringify({ type: "control.hello", token: adminToken }));
  await accepted;
  const diagnostic = nextMessages(control, "plan.diagnostics", 1);
  control.send(JSON.stringify({ type: "plan.diagnostics.request" }));
  const [diagnosticMessage] = await diagnostic;
  assert.match(diagnosticMessage.filename, /多用户挂机报错说明/);
  assert.match(diagnosticMessage.content, /目前尚未记录多用户挂机报错/);
  const update = nextMessages(control, "plan.schedule", 1);
  const settingsUpdate = nextMessages(control, "user.settings", 1);
  control.send(JSON.stringify({ type: "plan.schedule.update", payload: {
    enabled: true, time: "03:30", options: {
      resourceItems: ["曙光印记", "进化宝石"],
      resourceReserveCount: 0,
      inventoryItems: ["进化宝石", "曙光印记", "黑暗徽章"],
      dungeonItems: ["绘画小屋", "史芬克斯密穴"],
      equipmentPrice: 1023, resourcePrice: 921,
      returnMap: "圣兽云殿", returnMaps: { hao: "圣兽云殿", hao7: "绘画小屋" },
      reportEmail: "konghao0920@gmail.com"
    }, workspace: { quickBuyPrice: 777 }
  } }));
  const [message] = await update;
  const [settingsMessage] = await settingsUpdate;
  assert.equal(message.payload.enabled, true);
  assert.equal(message.payload.time, "03:30");
  assert.equal(message.payload.options.resourceReserveCount, 0);
  assert.deepEqual(message.payload.options.inventoryItems,
    ["进化宝石", "曙光印记", "黑暗徽章"]);
  assert.deepEqual(message.payload.options.dungeonItems, ["绘画小屋", "史芬克斯密穴"]);
  assert.equal(message.payload.options.equipmentPrice, 1023);
  assert.equal(message.payload.options.resourcePrice, 921);
  assert.equal(message.payload.options.returnMaps.hao7, "绘画小屋");
  assert.equal(settingsMessage.payload.quickBuyPrice, 777);
});
