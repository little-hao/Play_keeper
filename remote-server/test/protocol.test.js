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
    type: "device.hello", deviceId: "PK-ABCDEF123456", token: deviceToken, appVersion: "0.4.0"
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
  assert.deepEqual(await health.json(), { ok: true, service: "play-keeper-relay" });

  const dashboard = await fetch(`http://127.0.0.1:${port}/`);
  assert.equal(dashboard.status, 200);
  assert.match(await dashboard.text(), /Play Keeper 远程控制/);
  assert.match(dashboard.headers.get("content-security-policy"), /object-src 'none'/);
});
