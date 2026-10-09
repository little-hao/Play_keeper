import assert from "node:assert/strict";
import test from "node:test";
import { EightAccountPlan, EQUIPMENT_ITEMS, resolveEightAccountRoute, resolveQuickTestRoute } from "../eight-account-plan.js";

const d1 = "PK-DEVICE111111";
const d2 = "PK-DEVICE222222";

function route() {
  return [
    { deviceId: d2, accountIndex: 0, accountLabel: "hao" },
    { deviceId: d1, accountIndex: 0, accountLabel: "hao1" },
    { deviceId: d1, accountIndex: 1, accountLabel: "hao2" },
    { deviceId: d1, accountIndex: 2, accountLabel: "hao3" },
    { deviceId: d1, accountIndex: 3, accountLabel: "hao4" },
    { deviceId: d2, accountIndex: 2, accountLabel: "hao5" },
    { deviceId: d2, accountIndex: 3, accountLabel: "hao6" },
    { deviceId: d2, accountIndex: 1, accountLabel: "hao7" },
    { deviceId: d2, accountIndex: 0, accountLabel: "hao" }
  ];
}

function telemetry(accountIndex, automation) {
  return { accounts: [{ index: accountIndex, automation }] };
}

test("resolves the required route from the two live device account labels", () => {
  const summaries = [
    { deviceId: d1, telemetry: { accounts: [
      { index: 0, label: "hao1" }, { index: 1, label: "hao2" },
      { index: 2, label: "hao3" }, { index: 3, label: "hao4" }
    ] } },
    { deviceId: d2, telemetry: { accounts: [
      { index: 0, label: "hao" }, { index: 1, label: "hao7" },
      { index: 2, label: "hao5" }, { index: 3, label: "hao6" }
    ] } }
  ];
  const resolved = resolveEightAccountRoute(summaries);
  assert.deepEqual(resolved.map((entry) => entry.accountLabel),
    ["hao", "hao1", "hao2", "hao3", "hao4", "hao5", "hao6", "hao7", "hao"]);
  assert.deepEqual(resolveQuickTestRoute(summaries).map((entry) => entry.accountLabel),
    ["hao", "hao1", "hao7", "hao"]);
});

test("runs all eight relay legs and returns the equipment to hao", () => {
  const actions = [];
  let clock = 1_000;
  const plan = new EightAccountPlan({ emitAction: (action) => actions.push(action), now: () => ++clock });
  plan.start(route());
  assert.equal(actions[0].command, "configure_equipment_transfer");
  assert.deepEqual(actions[0].parameters.items, EQUIPMENT_ITEMS);

  for (let leg = 0; leg < 8; leg += 1) {
    const seller = route()[leg];
    const buyer = route()[leg + 1];
    plan.onTelemetry(seller.deviceId, telemetry(seller.accountIndex, {
      task: "equipment_sell", status: "running", equipmentListedInBatch: 5
    }));
    assert.equal(actions.at(-1).command, "run_equipment_buy");
    assert.equal(actions.at(-1).deviceId, buyer.deviceId);
    plan.onTelemetry(buyer.deviceId, telemetry(buyer.accountIndex, {
      task: "temple", status: "ok", updatedAt: 1_000_000,
      equipmentTransferLastRunAt: 1_000_000,
      dungeonLastRunAt: 1_000_000,
      inventoryLastRunAt: 1_000_000,
      inventoryStatus: "ok",
      inventoryCounts: { "曙光印记": 3, "进化宝石": 2 }
    }));
    if (buyer.accountLabel !== "hao") {
      assert.equal(actions.at(-1).command, "run_auto_auction");
      plan.onTelemetry(buyer.deviceId, telemetry(buyer.accountIndex, {
        task: "temple", status: "ok", updatedAt: 1_000_000,
        auctionLastRunAt: 1_000_000
      }));
    } else {
      assert.equal(actions.at(-1).command, "run_auction_buy");
      plan.onTelemetry(buyer.deviceId, telemetry(buyer.accountIndex, {
        task: "auction_buy", status: "running", updatedAt: 1_000_000
      }));
      plan.onTelemetry(buyer.deviceId, telemetry(buyer.accountIndex, {
        task: "temple", status: "ok", updatedAt: 1_000_000
      }));
    }
  }

  const result = plan.snapshot();
  assert.equal(result.status, "success");
  assert.equal(result.history.length, 8);
  assert.equal(result.history[0].seller, "hao");
  assert.equal(result.history.at(-1).buyer, "hao");
});

test("offers 30 seconds for manual intervention before an error stops the chain", () => {
  let clock = 10_000;
  const plan = new EightAccountPlan({ now: () => clock });
  plan.start(route());
  plan.onTelemetry(d1, telemetry(0, {
    task: "equipment_buy", status: "error", lastMessage: "十件装备复核失败"
  }));
  assert.equal(plan.snapshot().status, "intervention");
  assert.equal(plan.snapshot().errorAccount, "hao1");
  clock += 30_001;
  plan.tick();
  assert.equal(plan.snapshot().status, "error");
  assert.match(plan.snapshot().error, /30秒人工介入/);
});

test("rejects a route with an offline account", () => {
  assert.throws(() => resolveEightAccountRoute([
    { deviceId: d1, telemetry: { accounts: [{ index: 0, label: "hao1" }] } },
    { deviceId: d2, telemetry: { accounts: [{ index: 0, label: "hao" }] } }
  ]), /当前不在线/);
});
