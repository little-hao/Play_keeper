import assert from "node:assert/strict";
import test from "node:test";
import { EquipmentTransferCoordinator } from "../equipment-transfer-coordinator.js";

test("starts the remote buyer and releases the seller after the equipment arrives", () => {
  const actions = [];
  const updates = [];
  let clock = 1_000;
  const seller = { deviceId: "PK-SELLER1", accountIndex: 2, accountLabel: "hao3" };
  const buyer = { deviceId: "PK-BUYER01", accountIndex: 1, accountLabel: "hao2" };
  const coordinator = new EquipmentTransferCoordinator({ now: () => clock,
    emitAction: (action) => actions.push(action), onUpdate: (state) => updates.push(state) });

  coordinator.start({ ownerId: "user-1", seller, buyer, items: ["厄菲斯神剑"],
    price: 920, returnMap: "圣兽云殿" });
  assert.deepEqual(actions.map((action) => action.command), [
    "configure_equipment_transfer", "configure_equipment_transfer"
  ]);
  coordinator.onCommandResult(actions[0], true, "ok");
  coordinator.onCommandResult(actions[1], true, "ok");
  assert.deepEqual(actions.map((action) => action.command), [
    "configure_equipment_transfer", "configure_equipment_transfer",
    "configure_return_hang", "run_equipment_sell"
  ]);

  coordinator.onTelemetry(seller.deviceId, { accounts: [{ index: 2, automation: {
    task: "equipment_sell", status: "running", equipmentListedInBatch: 1, updatedAt: 1_100
  } }] });
  assert.equal(actions.at(-1).command, "run_equipment_buy");
  assert.equal(actions.at(-1).accountLabel, "hao2");

  clock = 2_000;
  coordinator.onTelemetry(buyer.deviceId, { accounts: [{ index: 1, automation: {
    task: "equipment_buy", status: "running", equipmentTransferLastRunAt: 2_000, updatedAt: 2_000
  } }] });
  assert.deepEqual(actions.slice(-3).map((action) => action.command),
    ["cancel_automation", "configure_return_hang", "run_seller_cleanup"]);
  assert.equal(actions.at(-1).accountLabel, "hao3");

  coordinator.onTelemetry(seller.deviceId, { accounts: [{ index: 2, automation: {
    task: "temple", status: "ok", updatedAt: 3_000, finalEquipLastRunAt: 3_000
  } }] });
  assert.equal(coordinator.snapshot().status, "success");
  assert.match(coordinator.snapshot().message, /继续执行副本/);
  assert.ok(updates.length >= 4);
});

test("stops before listing when Android reports a different equipment set", () => {
  const actions = [];
  const seller = { deviceId: "seller", accountIndex: 0, accountLabel: "hao7" };
  const buyer = { deviceId: "buyer", accountIndex: 0, accountLabel: "hao" };
  const lover = ["柔情方巾·改", "轻罗流萤衫·改"];
  const coordinator = new EquipmentTransferCoordinator({ emitAction: action => actions.push(action) });
  coordinator.start({ ownerId: "user", seller, buyer, items: lover, price: 1031 });
  coordinator.onCommandResult(actions[0], true, "ok");
  coordinator.onTelemetry(seller.deviceId, { accounts: [{ index: 0, automation: {
    updatedAt: Date.now(), equipmentItems: ["厄菲斯神冠", "厄菲斯神铠"]
  } }] });
  assert.equal(coordinator.snapshot().status, "intervention");
  assert.match(coordinator.snapshot().message, /装备组合与网页选择不一致/);
  assert.equal(actions.some(action => action.command === "run_equipment_sell"), false);
});
