import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import { WebSocket } from "ws";
import { createRelayServer } from "../server.js";

const adminToken = "test-admin-token-123456789";
const deviceToken = "test-device-token-12345678";

function connect(url) {
  const socket = new WebSocket(url);
  return once(socket, "open").then(() => socket);
}

function nextJson(socket, expectedType, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${expectedType}`)), timeout);
    function onMessage(buffer) {
      const message = JSON.parse(buffer.toString());
      if (message.type !== expectedType) return;
      clearTimeout(timer);
      socket.off("message", onMessage);
      resolve(message);
    }
    socket.on("message", onMessage);
  });
}

test("device telemetry and browser command complete a round trip", async (context) => {
  const server = createRelayServer({ adminToken, deviceToken, logger: { warn() {}, error() {} } });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;

  const device = await connect(`ws://127.0.0.1:${port}/device`);
  const control = await connect(`ws://127.0.0.1:${port}/control`);
  context.after(async () => {
    device.terminate();
    control.terminate();
    await new Promise((resolve) => server.close(resolve));
  });

  const deviceAccepted = nextJson(device, "device.accepted");
  device.send(JSON.stringify({
    type: "device.hello", deviceId: "PK-ABCDEF123456", token: deviceToken, appVersion: "1.2.0"
  }));
  await deviceAccepted;

  const controlAccepted = nextJson(control, "control.accepted");
  const snapshotPromise = nextJson(control, "devices.snapshot");
  control.send(JSON.stringify({ type: "control.hello", token: adminToken }));
  await controlAccepted;
  const snapshot = await snapshotPromise;
  assert.equal(snapshot.devices[0].deviceId, "PK-ABCDEF123456");

  const telemetryPromise = nextJson(control, "telemetry.update");
  device.send(JSON.stringify({
    type: "telemetry.update", timestamp: Date.now(), payload: { battery: { levelPercent: 88 } }
  }));
  const telemetry = await telemetryPromise;
  assert.equal(telemetry.payload.battery.levelPercent, 88);

  const requestPromise = nextJson(device, "command.request");
  control.send(JSON.stringify({
    type: "command.send",
    deviceId: "PK-ABCDEF123456",
    command: "switch_account",
    parameters: { accountIndex: 2 }
  }));
  const request = await requestPromise;
  assert.equal(request.command, "switch_account");
  assert.equal(request.parameters.accountIndex, 2);

  const resultPromise = nextJson(control, "command.result");
  device.send(JSON.stringify({
    type: "command.result", commandId: request.commandId, success: true, message: "账号已切换"
  }));
  const result = await resultPromise;
  assert.equal(result.success, true);
  assert.equal(result.commandId, request.commandId);

  const startPromise = nextJson(device, "command.request");
  control.send(JSON.stringify({
    type: "command.send",
    deviceId: "PK-ABCDEF123456",
    command: "preview_start",
    parameters: { accountIndex: 2, maxWidth: 720, fps: 1 }
  }));
  const start = await startPromise;
  assert.equal(start.command, "preview_start");

  const previewPromise = nextJson(control, "preview.frame");
  device.send(JSON.stringify({
    type: "preview.frame",
    timestamp: Date.now(),
    payload: {
      accountIndex: 2,
      accountLabel: "测试用户",
      sequence: 7,
      width: 720,
      height: 400,
      mime: "image/jpeg",
      blackOverlay: true,
      imageBase64: Buffer.from("fake-jpeg").toString("base64")
    }
  }));
  const preview = await previewPromise;
  assert.equal(preview.payload.accountLabel, "测试用户");
  assert.equal(preview.payload.sequence, 7);

  const interactionPromise = nextJson(control, "interaction.select");
  device.send(JSON.stringify({
    type: "interaction.select",
    timestamp: Date.now(),
    payload: {
      accountIndex: 2,
      accountLabel: "测试用户",
      elementToken: "pk_test_123",
      title: "地图",
      selectedIndex: 1,
      options: [
        { index: 0, label: "新手基地", selected: false, disabled: false },
        { index: 1, label: "圣兽云殿", selected: true, disabled: false }
      ]
    }
  }));
  const interaction = await interactionPromise;
  assert.equal(interaction.payload.title, "地图");
  assert.equal(interaction.payload.options[1].label, "圣兽云殿");

  const selectionPromise = nextJson(device, "command.request");
  control.send(JSON.stringify({
    type: "command.send",
    deviceId: "PK-ABCDEF123456",
    command: "select_option",
    parameters: { accountIndex: 2, elementToken: "pk_test_123", optionIndex: 0 }
  }));
  const selection = await selectionPromise;
  assert.equal(selection.command, "select_option");
  assert.equal(selection.parameters.optionIndex, 0);

  const tapPromise = nextJson(device, "command.request");
  control.send(JSON.stringify({
    type: "command.send",
    deviceId: "PK-ABCDEF123456",
    command: "pointer_tap",
    parameters: { accountIndex: 2, x: 0.25, y: 0.75, frameSequence: 7 }
  }));
  const tap = await tapPromise;
  assert.equal(tap.command, "pointer_tap");
  assert.equal(tap.parameters.x, 0.25);

  const automationPromise = nextJson(device, "command.request");
  control.send(JSON.stringify({
    type: "command.send",
    deviceId: "PK-ABCDEF123456",
    command: "configure_auto_auction",
    parameters: {
      accountIndex: 2,
      enabled: true,
      items: ["进化宝石", "曙光印记"],
      buyer: "hao",
      intervalHours: 12
    }
  }));
  const automation = await automationPromise;
  assert.equal(automation.command, "configure_auto_auction");
  assert.deepEqual(automation.parameters.items, ["进化宝石", "曙光印记"]);

  const storeSellPromise = nextJson(device, "command.request");
  control.send(JSON.stringify({
    type: "command.send",
    deviceId: "PK-ABCDEF123456",
    command: "configure_store_sell",
    parameters: { accountIndex: 2, enabled: true, items: ["金币券"], intervalHours: 12 }
  }));
  const storeSell = await storeSellPromise;
  assert.equal(storeSell.command, "configure_store_sell");
  assert.deepEqual(storeSell.parameters.items, ["金币券"]);

  const equipmentPromise = nextJson(device, "command.request");
  control.send(JSON.stringify({
    type: "command.send",
    deviceId: "PK-ABCDEF123456",
    command: "configure_equipment_transfer",
    parameters: {
      accountIndex: 2,
      items: ["柔情方巾·改", "轻罗流萤衫·改", "逢羡履·改", "君我剑·改", "佳人之恋·改",
        "三生戒·改", "比翼·改", "相望镯·改", "尾生之泪·改", "龙神印记·庆"],
      price: 920,
      buyer: "buyer@id"
    }
  }));
  const equipment = await equipmentPromise;
  assert.equal(equipment.command, "configure_equipment_transfer");
  assert.equal(equipment.parameters.price, 920);
  assert.equal(equipment.parameters.buyer, "buyer@id");
  assert.equal(equipment.parameters.items.length, 10);

  const automaticStopPromise = nextJson(device, "command.request");
  control.close();
  const automaticStop = await automaticStopPromise;
  assert.equal(automaticStop.command, "preview_stop");
});

test("invalid tokens and invalid commands are rejected", async (context) => {
  const server = createRelayServer({ adminToken, deviceToken, logger: { warn() {}, error() {} } });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;

  const rejected = await connect(`ws://127.0.0.1:${port}/control`);
  const rejectionPromise = nextJson(rejected, "control.rejected");
  rejected.send(JSON.stringify({ type: "control.hello", token: "wrong" }));
  await rejectionPromise;

  const control = await connect(`ws://127.0.0.1:${port}/control`);
  context.after(async () => {
    rejected.terminate();
    control.terminate();
    await new Promise((resolve) => server.close(resolve));
  });
  const accepted = nextJson(control, "control.accepted");
  const snapshotPromise = nextJson(control, "devices.snapshot");
  control.send(JSON.stringify({ type: "control.hello", token: adminToken }));
  await accepted;
  await snapshotPromise;
  const whitelistErrorPromise = nextJson(control, "command.error");
  control.send(JSON.stringify({
    type: "command.send", deviceId: "missing", command: "configure_store_sell",
    parameters: { accountIndex: 0, enabled: true, items: ["进化宝石"], intervalHours: 12 }
  }));
  const whitelistError = await whitelistErrorPromise;
  assert.match(whitelistError.message, /无效/);

  const errorPromise = nextJson(control, "command.error");
  control.send(JSON.stringify({
    type: "command.send", deviceId: "missing", command: "switch_account",
    parameters: { accountIndex: 99 }
  }));
  const error = await errorPromise;
  assert.match(error.message, /无效/);
});

test("health endpoint and iPhone dashboard are served", async (context) => {
  const server = createRelayServer({ adminToken, deviceToken, logger: { warn() {}, error() {} } });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  context.after(() => new Promise((resolve) => server.close(resolve)));

  const health = await fetch(`http://127.0.0.1:${port}/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), {
    ok: true, service: "play-keeper-relay", version: "1.4.0-workflow-test"
  });

  const dashboard = await fetch(`http://127.0.0.1:${port}/`);
  assert.equal(dashboard.status, 200);
  const dashboardHtml = await dashboard.text();
  assert.match(dashboardHtml, /Play Keeper 远程控制/);
  assert.match(dashboardHtml, /立即拍卖/);
  assert.match(dashboardHtml, /立即卖金币券/);
  assert.match(dashboard.headers.get("content-security-policy"), /object-src 'none'/);
});
