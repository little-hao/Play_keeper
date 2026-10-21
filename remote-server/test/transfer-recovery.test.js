import assert from "node:assert/strict";
import test from "node:test";
import { EquipmentTransferCoordinator } from "../equipment-transfer-coordinator.js";

function fixture(extra = {}) {
  let clock = 1000;
  const actions = [];
  const options = { ownerId: "owner", seller: { deviceId: "seller", accountIndex: 0, accountLabel: "hao" },
    buyer: { deviceId: "buyer", accountIndex: 0, accountLabel: "hao1" }, items: ["厄菲斯神剑"], price: 123 };
  const coordinator = new EquipmentTransferCoordinator({ now: () => clock,
    emitAction: a => actions.push(a), ...extra });
  coordinator.start(options);
  const report = (device, data) => coordinator.onTelemetry(device, { accounts: [{ index: 0,
    automation: { updatedAt: clock, ...data } }] });
  return { coordinator, actions, options, report, advance: ms => { clock += ms; } };
}

test("restoring active transfer pauses without replay and requires explicit cancellation", () => {
  const f = fixture();
  const actions = [];
  const restored = new EquipmentTransferCoordinator({ emitAction: a => actions.push(a) });
  restored.restore(f.coordinator.snapshot());
  assert.equal(restored.snapshot().status, "intervention");
  assert.equal(actions.length, 0);
  assert.throws(() => restored.start(f.options), /已有单次转移/);
  restored.cancel();
  assert.equal(actions.filter(a => a.command === "cancel_automation").length, 2);
  restored.start(f.options);
  assert.notEqual(restored.snapshot().runId, f.coordinator.snapshot().runId);
});

test("offline device stops both participants once and cannot resume from late telemetry", () => {
  const f = fixture();
  f.coordinator.onDeviceOffline("unrelated");
  assert.equal(f.coordinator.snapshot().status, "running");
  f.coordinator.onDeviceOffline("buyer");
  const count = f.actions.length;
  f.report("seller", { task: "equipment_sell", status: "running", equipmentListedInBatch: 5 });
  f.coordinator.onDeviceOffline("seller");
  assert.equal(f.actions.length, count);
  assert.equal(f.coordinator.snapshot().status, "intervention");
  assert.equal(f.actions.filter(a => a.command === "cancel_automation").length, 2);
});

test("dispatch failure stops follow-up commands instead of continuing the trade", () => {
  const sent = [];
  const f = fixture({ emitAction: a => { sent.push(a); if (a.command !== "cancel_automation") throw new Error("offline"); } });
  assert.equal(f.coordinator.snapshot().status, "intervention");
  assert.deepEqual(sent.map(a => a.command), ["configure_equipment_transfer", "cancel_automation", "cancel_automation"]);
});

test("old run rejection is ignored; current run rejection pauses", () => {
  const f = fixture();
  f.coordinator.onCommandResult({ ...f.actions[0], runId: "old" }, false, "late");
  assert.equal(f.coordinator.snapshot().status, "running");
  f.coordinator.onCommandResult(f.actions[0], false, "timeout");
  assert.equal(f.coordinator.snapshot().status, "intervention");
});

test("duplicate buyer receipts release the seller only once and ignore superseded seller rejection", () => {
  const f = fixture();
  f.report("seller", { task: "equipment_sell", status: "running", equipmentListedInBatch: 5 });
  f.advance(100);
  for (let i = 0; i < 3; i++) f.report("buyer", { equipmentTransferLastRunAt: 1100 });
  assert.equal(f.actions.filter(a => a.command === "run_seller_cleanup").length, 1);
  f.coordinator.onCommandResult(f.actions.find(a => a.command === "run_equipment_sell"), false, "late");
  assert.equal(f.coordinator.snapshot().status, "running");
});

test("manual verification blocks seller release and does not time out into automatic trading", () => {
  const f = fixture({ progressTimeoutMs: 100 });
  f.report("seller", { task: "equipment_sell", status: "running", equipmentListedInBatch: 1 });
  f.report("buyer", { equipmentVerificationToken: "pending", equipmentTransferLastRunAt: 1000 });
  f.advance(200);
  f.coordinator.tick();
  assert.equal(f.coordinator.snapshot().status, "running");
  assert.equal(f.coordinator.snapshot().sellerReleased, false);
  f.report("buyer", { equipmentVerificationToken: "", equipmentTransferLastRunAt: 1200 });
  assert.equal(f.coordinator.snapshot().sellerReleased, true);
});

test("no progress deadline pauses and does not retry transactions", () => {
  const f = fixture({ progressTimeoutMs: 100 });
  f.advance(101);
  f.coordinator.tick();
  assert.equal(f.coordinator.snapshot().status, "intervention");
  assert.equal(f.actions.filter(a => a.command === "run_equipment_sell").length, 1);
});

test("return-to-temple telemetry without remaining-equipment evidence is not completion", () => {
  const f = fixture();
  f.report("seller", { task: "equipment_sell", status: "running", equipmentListedInBatch: 1 });
  f.report("buyer", { equipmentTransferLastRunAt: 1000 });
  f.report("seller", { task: "temple", status: "ok", finalEquipLastRunAt: 999 });
  assert.equal(f.coordinator.snapshot().status, "running");
  f.report("seller", { task: "temple", status: "ok", finalEquipLastRunAt: 1000 });
  assert.equal(f.coordinator.snapshot().status, "success");
});
