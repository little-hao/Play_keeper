import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
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
  const server = createRelayServer({ adminToken, deviceToken, logger: { warn() {}, error() {} } });
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

  const sellerStart = nextMessages(device2, "command.request", 3);
  const buyerConfig = nextMessages(device1, "command.request", 1);
  control.send(JSON.stringify({ type: "plan.start", plan: "eight_account_daily" }));
  const [sellerCommands, buyerCommands] = await Promise.all([sellerStart, buyerConfig]);
  assert.deepEqual(sellerCommands.map((message) => message.command),
    ["configure_equipment_transfer", "switch_account", "run_equipment_sell"]);
  assert.equal(sellerCommands[0].parameters.buyer, "hao1");
  assert.equal(sellerCommands[0].parameters.items.length, 10);
  assert.equal(buyerCommands[0].command, "configure_equipment_transfer");

  const buyerStart = nextMessages(device1, "command.request", 2);
  device2.send(JSON.stringify({
    type: "telemetry.update", payload: { accounts: [{
      index: 0, label: "hao", automation: {
        task: "equipment_sell", status: "running", equipmentListedInBatch: 5
      }
    }] }
  }));
  const buyerStartCommands = await buyerStart;
  assert.deepEqual(buyerStartCommands.map((message) => message.command),
    ["switch_account", "run_equipment_buy"]);
  assert.equal(buyerStartCommands[1].parameters.accountIndex, 0);
});
