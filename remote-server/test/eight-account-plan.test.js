import assert from "node:assert/strict";
import test from "node:test";
import { EightAccountPlan, EQUIPMENT_ITEMS, resolveEightAccountRoute } from "../eight-account-plan.js";

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
});

test("accepts a user-selected closed equipment route and custom ten-piece set", () => {
  const actions = [];
  const customRoute = [route()[0], route()[1], route()[2], route()[4], route().at(-1)];
  const loverSet = ["柔情方巾·改", "轻罗流萤衫·改", "逢羡履·改", "君我剑·改", "佳人之恋·改",
    "三生戒·改", "比翼·改", "相望镯·改", "尾生之泪·改", "龙神印记·庆"];
  const plan = new EightAccountPlan({ emitAction: (action) => actions.push(action), now: () => 1_000 });
  const snapshot = plan.start(customRoute, { items: loverSet });
  assert.deepEqual(snapshot.route.map((entry) => entry.accountLabel),
    ["hao", "hao1", "hao2", "hao4", "hao"]);
  assert.deepEqual(actions[0].parameters.items, loverSet);
});

test("uses separate equipment and resource prices with per-account return maps", () => {
  const actions = [];
  const shortRoute = [route()[0], route()[7], route().at(-1)];
  const plan = new EightAccountPlan({ emitAction: action => actions.push(action), now: () => 1_000 });
  const snapshot = plan.start(shortRoute, { equipmentPrice: 123, resourcePrice: 456,
    returnMap: "圣兽云殿", returnMaps: { hao: "圣兽云殿", hao7: "绘画小屋" } });

  assert.equal(snapshot.price, 123);
  assert.equal(snapshot.resourcePrice, 456);
  assert.deepEqual(snapshot.returnMaps, { hao: "圣兽云殿", hao7: "绘画小屋" });
  assert.equal(actions.find(action => action.command === "configure_equipment_transfer")
    .parameters.price, 123);
  assert.equal(actions.find(action => action.command === "configure_return_hang"
    && action.accountLabel === "hao7").parameters.map, "绘画小屋");
});

test("runs all eight relay legs and returns the equipment to hao", () => {
  const actions = [];
  let clock = 1_000;
  const plan = new EightAccountPlan({ emitAction: (action) => actions.push(action), now: () => clock });
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
      finalEquipLastRunAt: 1_000_000,
      inventoryLastRunAt: 1_000_000,
      inventoryStatus: "ok",
      inventoryCounts: { "曙光印记": 3, "进化宝石": 2 }
    }));
    plan.onTelemetry(seller.deviceId, telemetry(seller.accountIndex, {
      task: "temple", status: "ok", updatedAt: 1_000_000,
      finalEquipLastRunAt: 1_000_000
    }));
    plan.onTelemetry(buyer.deviceId, telemetry(buyer.accountIndex, {
      task: "temple", status: "ok", updatedAt: 1_000_000,
      equipmentTransferLastRunAt: 1_000_000,
      dungeonLastRunAt: 1_000_000,
      finalEquipLastRunAt: 1_000_000,
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

test("continues a custom relay after buyer dungeon even without a fresh seller cleanup timestamp", () => {
  const actions = [];
  const customRoute = [route()[0], route()[3], route()[4], route()[7], route().at(-1)];
  const plan = new EightAccountPlan({ emitAction: action => actions.push(action), now: () => 1_000 });
  plan.start(customRoute);

  const seller = customRoute[0];
  const buyer = customRoute[1];
  plan.onTelemetry(seller.deviceId, telemetry(seller.accountIndex, {
    task: "equipment_sell", status: "running", equipmentListedInBatch: 5
  }));
  plan.onTelemetry(buyer.deviceId, telemetry(buyer.accountIndex, {
    task: "temple", status: "ok", updatedAt: 2_000,
    equipmentTransferLastRunAt: 2_000, dungeonLastRunAt: 2_000,
    finalEquipLastRunAt: 2_000, inventoryLastRunAt: 2_000,
    inventoryStatus: "ok", inventoryCounts: { "进化宝石": 1 }
  }));

  assert.equal(plan.snapshot().phase, "resource_auction_running");
  assert.equal(actions.at(-1).command, "run_auto_auction");
  assert.equal(actions.at(-1).accountLabel, "hao3");

  plan.onTelemetry(buyer.deviceId, telemetry(buyer.accountIndex, {
    task: "temple", status: "ok", updatedAt: 3_000, auctionLastRunAt: 3_000
  }));
  assert.equal(plan.snapshot().legIndex, 1);
  assert.equal(plan.snapshot().phase, "seller_running");
  assert.equal(actions.at(-1).command, "run_equipment_sell");
  assert.equal(actions.at(-1).accountLabel, "hao3");
  assert.equal(actions.findLast(action => action.command === "configure_equipment_transfer"
    && action.accountLabel === "hao3").parameters.buyer, "hao4");
});

test("a failed old-seller cleanup is a warning after the equipment reached the buyer", () => {
  const actions = [];
  const customRoute = [route()[0], route()[3], route()[4], route()[7], route().at(-1)];
  const plan = new EightAccountPlan({ emitAction: action => actions.push(action), now: () => 1_000 });
  plan.start(customRoute);
  const seller = customRoute[0];
  const buyer = customRoute[1];
  plan.onTelemetry(seller.deviceId, telemetry(seller.accountIndex, {
    task: "equipment_sell", status: "running", equipmentListedInBatch: 5
  }));
  plan.onTelemetry(buyer.deviceId, telemetry(buyer.accountIndex, {
    task: "temple", status: "ok", updatedAt: 2_000,
    equipmentTransferLastRunAt: 2_000, dungeonLastRunAt: 2_000,
    finalEquipLastRunAt: 2_000, inventoryLastRunAt: 2_000,
    inventoryStatus: "ok"
  }));
  const cleanup = actions.find(action => action.command === "run_seller_cleanup");
  assert.equal(actions.filter(action => action.command === "run_auto_auction").length, 1);
  plan.onCommandResult(cleanup, false, "未产生新的穿戴时间戳");

  assert.equal(plan.snapshot().status, "running");
  assert.equal(plan.snapshot().history.length, 0);
  assert.equal(plan.snapshot().warnings.at(-1).result, "seller_cleanup_warning");
  assert.equal(actions.filter(action => action.command === "run_auto_auction").length, 1);
});

test("skips an abnormal buyer when the equipment is still on the seller", () => {
  const actions = [];
  const plan = new EightAccountPlan({ emitAction: (action) => actions.push(action), now: () => 10_000 });
  plan.start(route());
  plan.onTelemetry(d1, telemetry(0, {
    task: "equipment_buy", status: "error", lastMessage: "购买页面异常"
  }));
  assert.equal(plan.snapshot().status, "running");
  assert.equal(plan.snapshot().history.at(-1).result, "skipped_error");
  assert.equal(plan.snapshot().history.at(-1).account, "hao1");
  assert.equal(actions.at(-1).command, "run_equipment_sell");
  assert.equal(actions.filter((action) => action.command === "configure_equipment_transfer"
    && action.accountLabel === "hao").at(-1).parameters.buyer, "hao2");
});

test("waits indefinitely for manual intervention when the equipment is on the abnormal account", () => {
  let clock = 10_000;
  const plan = new EightAccountPlan({ now: () => clock });
  plan.start(route());
  plan.onTelemetry(d1, telemetry(0, {
    task: "equipment_buy", status: "running", equipmentTransferLastRunAt: 20_000
  }));
  plan.onTelemetry(d1, telemetry(0, {
    task: "equipment_buy", status: "error", lastMessage: "十件装备复核失败"
  }));
  assert.equal(plan.snapshot().status, "intervention");
  assert.equal(plan.snapshot().errorAccount, "hao1");
  assert.equal(plan.snapshot().equipmentHolderLabel, "hao1");
  assert.equal(plan.snapshot().interventionDeadlineAt, 0);
  clock += 24 * 60 * 60 * 1_000;
  plan.tick();
  assert.equal(plan.snapshot().status, "intervention");
  assert.match(plan.snapshot().error, /厄菲斯神套装可能在该账号/);
});

test("restores an interrupted run and resumes from the account holding the equipment", () => {
  const actions = [];
  let clock = 10_000;
  const first = new EightAccountPlan({ now: () => clock });
  first.start(route());
  first.onTelemetry(d2, telemetry(0, {
    task: "equipment_sell", status: "running", equipmentListedInBatch: 5
  }));
  first.onTelemetry(d1, telemetry(0, {
    task: "equipment_buy", status: "running", equipmentTransferLastRunAt: 20_000
  }));
  first.onTelemetry(d1, telemetry(0, {
    task: "equipment_buy", status: "error", lastMessage: "复核失败"
  }));

  const restored = new EightAccountPlan({ emitAction: (action) => actions.push(action),
    now: () => ++clock });
  restored.restore(first.snapshot());
  assert.equal(restored.snapshot().status, "intervention");
  assert.equal(restored.snapshot().equipmentHolderLabel, "hao1");
  restored.resume(route(), "hao1");
  assert.equal(restored.snapshot().status, "running");
  assert.equal(restored.snapshot().phase, "buyer_running");
  assert.equal(restored.snapshot().route[0].accountLabel, "hao");
  assert.equal(actions.at(-1).command, "run_dungeon_sequence");
  assert.equal(actions.at(-1).accountLabel, "hao1");
  assert.equal(actions.some((action) => action.command === "switch_account"), false);
  assert.equal(restored.snapshot().equipmentHolderLabel, "hao1");
});

test("requires manual confirmation of the equipment holder before resuming", () => {
  const plan = new EightAccountPlan({ now: () => 10_000 });
  plan.start(route());
  plan.cancel("人工中断");
  assert.throws(() => plan.resume(route()), /人工确认目标套装所在账号/);
});

test("restarts the remaining relay route from a manually selected equipment holder", () => {
  const actions = [];
  const plan = new EightAccountPlan({ emitAction: (action) => actions.push(action), now: () => 10_000 });
  plan.start(route());
  plan.cancel("人工中断");
  actions.length = 0;

  const snapshot = plan.resume(route(), "hao3");

  assert.equal(snapshot.status, "running");
  assert.equal(snapshot.equipmentHolderLabel, "hao3");
  assert.deepEqual(snapshot.route.map((entry) => entry.accountLabel),
    ["hao3", "hao4", "hao5", "hao6", "hao7", "hao"]);
  assert.deepEqual(snapshot.fullRoute.map((entry) => entry.accountLabel),
    ["hao", "hao1", "hao2", "hao3", "hao4", "hao5", "hao6", "hao7", "hao"]);
  assert.equal(snapshot.legIndex, 0);
  assert.equal(snapshot.phase, "buyer_running");
  assert.equal(actions.at(-1).command, "run_equipment_buy");
  assert.equal(actions.at(-1).accountLabel, "hao4");
  assert.equal(actions.at(-1).parameters.recovery, true);
  assert.equal(actions[0].parameters.buyer, "hao4");
});

test("partial transfer recovery links same-device seller and buyer", () => {
  const actions = [];
  const liveRoute = route().map((entry, index) => ({ ...entry,
    deviceId: index <= 1 ? d1 : entry.deviceId,
    accountIndex: index === 1 ? 1 : entry.accountIndex }));
  const plan = new EightAccountPlan({ emitAction: action => actions.push(action),
    now: () => 10_000 });
  plan.start(liveRoute);
  plan.cancel("网络中断");
  actions.length = 0;

  const snapshot = plan.resume(liveRoute, "hao");

  assert.equal(snapshot.phase, "buyer_running");
  assert.deepEqual(actions.slice(-2).map(action => action.command),
    ["run_equipment_sell", "run_equipment_buy"]);
  assert.equal(actions.at(-1).parameters.sellerAccountIndex, 0);
  assert.equal(actions.at(-1).parameters.recovery, true);
});

test("buyer-running interruption restarts both sides when the holder is still the seller", () => {
  const actions = [];
  const liveRoute = route().map((entry, index) => ({ ...entry,
    deviceId: index <= 1 ? d1 : entry.deviceId,
    accountIndex: index === 1 ? 1 : entry.accountIndex }));
  const plan = new EightAccountPlan({ emitAction: action => actions.push(action),
    now: () => 10_000 });
  plan.start(liveRoute);
  const seller = liveRoute[0];
  plan.onTelemetry(seller.deviceId, telemetry(seller.accountIndex, {
    task: "equipment_sell", status: "running", equipmentListedInBatch: 5
  }));
  assert.equal(plan.snapshot().phase, "buyer_running");
  assert.equal(plan.snapshot().equipmentHolderLabel, "hao");
  plan.cancel("买方掉线");
  actions.length = 0;

  const snapshot = plan.resume(liveRoute, "hao");

  assert.equal(snapshot.phase, "buyer_running");
  assert.deepEqual(actions.slice(-2).map(action => action.command),
    ["run_equipment_sell", "run_equipment_buy"]);
  assert.equal(actions.at(-1).parameters.sellerAccountIndex, 0);
  assert.equal(actions.at(-1).parameters.recovery, true);
});

test("moves to intervention when the APP rejects a plan command", () => {
  const actions = [];
  const plan = new EightAccountPlan({ emitAction: (action) => actions.push(action),
    now: () => 10_000 });
  plan.start(route());
  const runSeller = actions.find((action) => action.command === "run_equipment_sell");
  plan.onCommandResult(runSeller, false, "账号仍在执行上一阶段");
  assert.equal(plan.snapshot().status, "intervention");
  assert.equal(plan.snapshot().errorAccount, "hao");
  assert.match(plan.snapshot().error, /拒绝|上一阶段/);
});

test("repeated manual resume survives restart and completes the remaining full route", () => {
  const actions = [];
  const initial = new EightAccountPlan({ now: () => 1000 });
  initial.start(route());
  initial.cancel();
  initial.resume(route(), "hao3");
  initial.cancel();
  const plan = new EightAccountPlan({ now: () => 2000, emitAction: a => actions.push(a) });
  plan.restore(JSON.parse(JSON.stringify(initial.snapshot())));
  plan.resume(route(), "hao3");
  assert.equal(plan.snapshot().legIndex, 0);
  assert.deepEqual(plan.snapshot().route.map(a => a.accountLabel),
    ["hao3", "hao4", "hao5", "hao6", "hao7", "hao"]);
  assert.deepEqual(plan.snapshot().fullRoute.map(a => a.accountLabel), route().map(a => a.accountLabel));
  const done = { task: "temple", status: "ok", updatedAt: 10000,
    equipmentTransferLastRunAt: 10000, dungeonLastRunAt: 10000,
    finalEquipLastRunAt: 10000, inventoryLastRunAt: 10000, inventoryStatus: "ok" };
  for (let i = 3; i < 8; i++) {
    const seller = route()[i], buyer = route()[i + 1];
    const report = (account, data) => plan.onTelemetry(account.deviceId, telemetry(account.accountIndex, data));
    report(seller, { task: "equipment_sell", status: "running", equipmentListedInBatch: 5 });
    report(buyer, done);
    report(seller, done);
    report(buyer, done);
    if (buyer.accountLabel === "hao") {
      report(buyer, { task: "auction_buy", status: "running", updatedAt: 10000 });
      report(buyer, done);
    } else report(buyer, { ...done, auctionLastRunAt: 10000 });
  }
  assert.equal(plan.snapshot().status, "success");
  assert.equal(plan.snapshot().history.at(-1).buyer, "hao");
  assert.deepEqual(actions.filter(a => a.command === "run_equipment_sell").map(a => a.accountLabel),
    ["hao3", "hao4", "hao5", "hao6", "hao7"]);
});

test("pending manual equipment verification cannot release the daily plan seller", () => {
  const actions = [];
  const plan = new EightAccountPlan({ now: () => 1000, emitAction: a => actions.push(a) });
  plan.start(route());
  plan.onTelemetry(d1, telemetry(0, { equipmentVerificationToken: "pending",
    equipmentTransferLastRunAt: 2000, status: "awaiting_confirmation" }));
  assert.equal(plan.snapshot().sellerReleased, false);
  assert.equal(actions.some(a => a.command === "run_seller_cleanup"), false);
});

test("restores a running saved state into idempotent reconnect reconciliation", () => {
  const first = new EightAccountPlan({ now: () => 10_000 });
  first.start(route());
  const restored = new EightAccountPlan({ now: () => 20_000 });
  restored.restore(first.snapshot());
  assert.equal(restored.snapshot().status, "running");
  assert.equal(restored.snapshot().recoveryPending, true);
  assert.equal(restored.snapshot().equipmentHolderLabel, "hao");
  assert.ok(Object.keys(restored.snapshot().disconnectedDevices).length >= 1);
  assert.ok(restored.outstandingActionsForDevice(d2).every(action => action.stepId));
});

test("assigns unique step IDs and records command acknowledgements", () => {
  const actions = [];
  const plan = new EightAccountPlan({ emitAction: action => actions.push(action), now: () => 1_000 });
  plan.start([route()[0], route()[7], route().at(-1)]);
  assert.equal(new Set(actions.map(action => action.stepId)).size, actions.length);
  assert.ok(actions.every(action => action.stepId.startsWith(plan.snapshot().runId)));
  plan.onCommandResult(actions[0], true, "accepted");
  assert.equal(plan.snapshot().stepLedger.find(step => step.stepId === actions[0].stepId).status,
    "acknowledged");
});

test("waits through a disconnect grace period and resumes without intervention", () => {
  let clock = 1_000;
  const plan = new EightAccountPlan({ now: () => clock });
  plan.start([route()[0], route()[7], route().at(-1)], { disconnectGraceMs: 60_000 });
  plan.onDeviceOffline(d2);
  assert.equal(plan.snapshot().status, "running");
  clock += 59_000;
  plan.tick();
  assert.equal(plan.snapshot().status, "running");
  plan.onDeviceOnline(d2);
  assert.equal(Object.keys(plan.snapshot().disconnectedDevices).length, 0);
  clock += 61_000;
  plan.tick();
  assert.equal(plan.snapshot().status, "running");
});

test("stops with a diagnostic request after grace or configured phase timeout", () => {
  let clock = 1_000;
  const disconnected = new EightAccountPlan({ now: () => clock });
  disconnected.start([route()[0], route()[7], route().at(-1)], { disconnectGraceMs: 30_000 });
  disconnected.onDeviceOffline(d2);
  clock += 30_001;
  disconnected.tick();
  assert.equal(disconnected.snapshot().status, "intervention");
  assert.equal(disconnected.snapshot().diagnosticRequested, true);

  clock = 1_000;
  const stalled = new EightAccountPlan({ now: () => clock });
  stalled.start([route()[0], route()[7], route().at(-1)], {
    phaseTimeouts: { seller_running: 30_000 }
  });
  clock += 30_001;
  stalled.tick();
  assert.equal(stalled.snapshot().status, "intervention");
  assert.match(stalled.snapshot().error, /无可验证进展/);
});

test("releases every seller immediately after equipment arrives", () => {
  const actions = [];
  let clock = 1_000;
  const plan = new EightAccountPlan({ emitAction: (action) => actions.push(action), now: () => clock });
  plan.start(route());
  plan.onTelemetry(d2, telemetry(0, {
    task: "equipment_sell", status: "running", equipmentListedInBatch: 5
  }));
  plan.onTelemetry(d1, telemetry(0, {
    task: "equipment_buy", status: "running", equipmentTransferLastRunAt: 2_000
  }));
  const release = actions.slice(-3).map((action) => action.command);
  assert.deepEqual(release,
    ["cancel_automation", "configure_return_hang", "run_seller_cleanup"]);
  assert.equal(actions.at(-1).accountLabel, "hao");

  actions.length = 0;
  const sameDeviceRoute = route().map((entry, index) => ({ ...entry, deviceId: d1,
    accountIndex: index === 1 ? 1 : entry.accountIndex }));
  clock = 1_000;
  const sameDevicePlan = new EightAccountPlan({ emitAction: (action) => actions.push(action), now: () => clock });
  sameDevicePlan.start(sameDeviceRoute);
  sameDevicePlan.onTelemetry(d1, { accounts: [
    { index: 0, automation: { task: "equipment_sell", status: "running", equipmentListedInBatch: 5 } }
  ] });
  sameDevicePlan.onTelemetry(d1, { accounts: [
    { index: 1, automation: { task: "equipment_buy", status: "running", equipmentTransferLastRunAt: 2_000 } }
  ] });
  assert.deepEqual(actions.slice(-3).map((action) => action.command),
    ["cancel_automation", "configure_return_hang", "run_seller_cleanup"]);
});

test("ignores a stale seller listing error after the remote buyer has the equipment", () => {
  const actions = [];
  let clock = 1_000;
  const plan = new EightAccountPlan({ emitAction: (action) => actions.push(action),
    now: () => clock });
  plan.start(route());
  plan.onTelemetry(d2, telemetry(0, {
    task: "equipment_sell", status: "running", equipmentListedInBatch: 5
  }));
  clock = 2_000;
  plan.onTelemetry(d1, telemetry(0, {
    task: "equipment_buy", status: "running", equipmentTransferLastRunAt: 2_000
  }));
  assert.equal(plan.snapshot().equipmentHolderLabel, "hao1");
  assert.equal(plan.snapshot().sellerReleased, true);
  plan.onTelemetry(d2, telemetry(0, {
    task: "equipment_sell", status: "error",
    lastMessage: "厄菲斯神链：选中装备后未找到卖出按钮"
  }));
  assert.equal(plan.snapshot().status, "running");
  assert.equal(plan.snapshot().equipmentHolderLabel, "hao1");
  assert.equal(plan.snapshot().error, "");
});

test("advances a completed leg when device timestamps lag behind the VPS clock", () => {
  const actions = [];
  const serverNow = Date.parse("2026-10-22T10:00:00+08:00");
  const deviceNow = serverNow - 5 * 60_000;
  const plannedRoute = route();
  for (const account of plannedRoute) {
    account.automation = { updatedAt: 1_000, equipmentTransferLastRunAt: 1_000,
      dungeonLastRunAt: serverNow - 24 * 60 * 60_000, finalEquipLastRunAt: 1_000,
      inventoryLastRunAt: 1_000, auctionLastRunAt: 1_000 };
  }
  const plan = new EightAccountPlan({ emitAction: (action) => actions.push(action),
    now: () => serverNow });
  plan.start(plannedRoute);
  const seller = plannedRoute[0];
  const buyer = plannedRoute[1];
  plan.onTelemetry(seller.deviceId, telemetry(seller.accountIndex, {
    task: "equipment_sell", status: "running", equipmentListedInBatch: 5
  }));
  const completed = { task: "temple", status: "ok", updatedAt: deviceNow,
    equipmentTransferLastRunAt: deviceNow, dungeonLastRunAt: deviceNow,
    finalEquipLastRunAt: deviceNow, inventoryLastRunAt: deviceNow,
    inventoryStatus: "ok" };
  plan.onTelemetry(buyer.deviceId, telemetry(buyer.accountIndex, completed));
  plan.onTelemetry(seller.deviceId, telemetry(seller.accountIndex, {
    task: "temple", status: "ok", updatedAt: deviceNow, finalEquipLastRunAt: deviceNow
  }));
  plan.onTelemetry(buyer.deviceId, telemetry(buyer.accountIndex, {
    ...completed, auctionLastRunAt: deviceNow
  }));
  assert.equal(plan.snapshot().legIndex, 1);
  assert.equal(actions.at(-1).command, "run_equipment_sell");
  assert.equal(actions.at(-1).accountLabel, "hao1");
});

test("skips accounts whose dungeon already completed today", () => {
  const actions = [];
  const today = Date.parse("2026-10-11T10:00:00+08:00");
  const plannedRoute = route();
  plannedRoute[1].automation = { dungeonLastRunAt: today - 60_000 };
  const plan = new EightAccountPlan({ emitAction: (action) => actions.push(action), now: () => today });
  plan.start(plannedRoute);
  const snapshot = plan.snapshot();
  assert.deepEqual(snapshot.route.map((entry) => entry.accountLabel),
    ["hao", "hao2", "hao3", "hao4", "hao5", "hao6", "hao7", "hao"]);
  assert.deepEqual(snapshot.fullRoute.map((entry) => entry.accountLabel),
    ["hao", "hao1", "hao2", "hao3", "hao4", "hao5", "hao6", "hao7", "hao"]);
  assert.deepEqual(snapshot.skippedDungeonAccounts, ["hao1"]);
  assert.equal(actions[0].parameters.buyer, "hao2");
});

test("runs only the main account when every small-account dungeon is complete", () => {
  const actions = [];
  const today = Date.parse("2026-10-11T10:00:00+08:00");
  const plannedRoute = route();
  for (let index = 1; index < plannedRoute.length - 1; index += 1) {
    plannedRoute[index].automation = { dungeonLastRunAt: today - 60_000 };
  }
  const plan = new EightAccountPlan({ emitAction: (action) => actions.push(action), now: () => today });
  plan.start(plannedRoute);
  assert.equal(plan.snapshot().phase, "standalone_main_running");
  assert.deepEqual(plan.snapshot().route.map((entry) => entry.accountLabel), ["hao", "hao"]);
  assert.deepEqual(plan.snapshot().skippedDungeonAccounts,
    ["hao1", "hao2", "hao3", "hao4", "hao5", "hao6", "hao7"]);
  assert.equal(actions.at(-1).command, "run_dungeon_sequence");
});

test("reduces hao through hao5 completion to hao, hao6, hao7, hao", () => {
  const actions = [];
  const today = Date.parse("2026-10-22T02:40:00+08:00");
  const plannedRoute = route();
  for (let index = 1; index <= 5; index += 1) {
    plannedRoute[index].automation = { dungeonLastRunAt: today - 60_000 };
  }
  const plan = new EightAccountPlan({ emitAction: (action) => actions.push(action), now: () => today });
  const snapshot = plan.start(plannedRoute);
  assert.deepEqual(snapshot.route.map((entry) => entry.accountLabel),
    ["hao", "hao6", "hao7", "hao"]);
  assert.deepEqual(snapshot.skippedDungeonAccounts,
    ["hao1", "hao2", "hao3", "hao4", "hao5"]);
  assert.equal(actions[0].parameters.buyer, "hao6");
});

test("manual resume skips completed accounts after the confirmed holder", () => {
  const actions = [];
  const today = Date.parse("2026-10-22T02:40:00+08:00");
  const plan = new EightAccountPlan({ emitAction: (action) => actions.push(action), now: () => today });
  plan.start(route());
  plan.cancel();
  const liveRoute = route();
  liveRoute[4].automation = { dungeonLastRunAt: today - 60_000 };
  liveRoute[5].automation = { dungeonLastRunAt: today - 60_000 };
  actions.length = 0;
  const snapshot = plan.resume(liveRoute, "hao3");
  assert.deepEqual(snapshot.route.map((entry) => entry.accountLabel),
    ["hao3", "hao6", "hao7", "hao"]);
  assert.deepEqual(snapshot.skippedDungeonAccounts, ["hao4", "hao5"]);
  assert.equal(actions[0].parameters.buyer, "hao6");
});

test("auctions resources from all small accounts, buys on hao, then hangs all accounts", () => {
  const actions = [];
  let clock = 1_000;
  const plan = new EightAccountPlan({ emitAction: (action) => actions.push(action),
    now: () => ++clock });
  const sweepRoute = route().slice(1);
  plan.startResourceSweep(sweepRoute, { resourceReserveCount: 0 });
  assert.equal(actions.find((action) => action.command === "configure_auto_auction")
    .parameters.reserveCount, 0);
  for (const account of sweepRoute.slice(0, 7)) {
    assert.equal(actions.at(-1).command, "run_auto_auction");
    plan.onTelemetry(account.deviceId, telemetry(account.accountIndex, {
      task: "temple", status: "ok", updatedAt: 1_000_000,
      auctionLastRunAt: 1_000_000
    }));
  }
  const main = sweepRoute.at(-1);
  assert.equal(actions.at(-1).command, "run_auction_buy");
  plan.onTelemetry(main.deviceId, telemetry(main.accountIndex, {
    task: "auction_buy", status: "running", updatedAt: 1_000_000
  }));
  plan.onTelemetry(main.deviceId, telemetry(main.accountIndex, {
    task: "temple", status: "ok", updatedAt: 1_000_000
  }));
  assert.equal(plan.snapshot().status, "success");
  assert.equal(plan.snapshot().history.length, 8);
  assert.equal(actions.filter((action) => action.command === "run_temple_guard").length, 8);
});

test("rejects a route with an offline account", () => {
  assert.throws(() => resolveEightAccountRoute([
    { deviceId: d1, telemetry: { accounts: [{ index: 0, label: "hao1" }] } },
    { deviceId: d2, telemetry: { accounts: [{ index: 0, label: "hao" }] } }
  ]), /当前不在线/);
});

test("accepts a Chinese four-account route, nine-piece set, and blank report email", () => {
  const labels = ["杂鱼小弟", "杂鱼小妹", "合宠糕手", "涅槃糕手", "杂鱼小弟"];
  const frostRoute = labels.map((accountLabel, index) => ({
    deviceId: "PK-FROST000001", accountIndex: index % 4, accountLabel, automation: {}
  }));
  const loverRomance = ["柔情方巾§恋§", "轻罗流萤衫§恋§", "逢羡履§恋§", "君我剑§恋§",
    "佳人之恋§恋§", "三生戒§恋§", "比翼§恋§", "相望镯§恋§", "尾生之泪§恋§"];
  const actions = [];
  const plan = new EightAccountPlan({ emitAction: (action) => actions.push(action), now: () => 30_000 });
  const snapshot = plan.start(frostRoute, { items: loverRomance, reportEmail: "" });
  assert.equal(snapshot.mainAccountLabel, "杂鱼小弟");
  assert.equal(snapshot.reportEmail, "");
  assert.deepEqual(snapshot.items, loverRomance);
  assert.equal(actions[0].parameters.buyer, "杂鱼小妹");
});

test("starts main resource purchase without waiting for remote seller cleanup", () => {
  const actions = [];
  let clock = 1_000;
  const shortRoute = [route()[0], route()[2], route().at(-1)];
  const plan = new EightAccountPlan({ emitAction: action => actions.push(action), now: () => clock });
  const complete = () => ({ task: "temple", status: "ok", updatedAt: clock,
    equipmentTransferLastRunAt: clock, dungeonLastRunAt: clock,
    finalEquipLastRunAt: clock, inventoryLastRunAt: clock,
    inventoryStatus: "ok", inventoryCounts: { "进化宝石": 7 } });
  plan.start(shortRoute);

  // First leg: hao -> hao2, then hao2 auctions its resources.
  plan.onTelemetry(d2, telemetry(0, { task: "equipment_sell", status: "running",
    equipmentListedInBatch: 5 }));
  clock = 2_000;
  plan.onTelemetry(d1, telemetry(1, complete()));
  plan.onTelemetry(d2, telemetry(0, { task: "temple", status: "ok", updatedAt: clock,
    finalEquipLastRunAt: clock }));
  assert.equal(actions.at(-1).command, "run_auto_auction");
  plan.onTelemetry(d1, telemetry(1, { task: "temple", status: "ok", updatedAt: clock,
    auctionLastRunAt: clock }));

  // Final leg: hao finishes first; hao2 cleanup is allowed to report later.
  assert.equal(actions.at(-1).command, "run_equipment_sell");
  plan.onTelemetry(d1, telemetry(1, { task: "equipment_sell", status: "running",
    equipmentListedInBatch: 5 }));
  clock = 3_000;
  plan.onTelemetry(d2, telemetry(0, complete()));
  assert.equal(plan.snapshot().buyerWorkflowCompleted, true);
  assert.equal(actions.at(-1).command, "run_auction_buy");
  assert.equal(actions.at(-1).accountLabel, "hao");
  clock = 4_000;
  plan.onTelemetry(d1, telemetry(1, { task: "temple", status: "ok", updatedAt: clock,
    finalEquipLastRunAt: clock }));

  assert.equal(actions.at(-1).command, "run_auction_buy");
  assert.equal(actions.at(-1).accountLabel, "hao");
  assert.equal(actions.filter(action => action.command === "run_auction_buy").length, 1);
});

test("skips the final main-account item purchase after sixty seconds and returns to hang", () => {
  const actions = [];
  let clock = 1_000;
  const shortRoute = [route()[0], route()[7], route().at(-1)];
  const plan = new EightAccountPlan({ emitAction: action => actions.push(action), now: () => clock });
  const complete = () => ({ task: "temple", status: "ok", updatedAt: clock,
    equipmentTransferLastRunAt: clock, dungeonLastRunAt: clock,
    finalEquipLastRunAt: clock, inventoryLastRunAt: clock, inventoryStatus: "ok" });
  plan.start(shortRoute, { returnMaps: { hao: "圣兽云殿", hao7: "绘画小屋" } });

  plan.onTelemetry(d2, telemetry(0, { task: "equipment_sell", status: "running",
    equipmentListedInBatch: 5 }));
  clock = 2_000;
  plan.onTelemetry(d2, telemetry(1, complete()));
  plan.onTelemetry(d2, telemetry(0, { task: "temple", status: "ok", updatedAt: clock,
    finalEquipLastRunAt: clock }));
  plan.onTelemetry(d2, telemetry(1, { task: "temple", status: "ok", updatedAt: clock,
    auctionLastRunAt: clock }));

  plan.onTelemetry(d2, telemetry(1, { task: "equipment_sell", status: "running",
    equipmentListedInBatch: 5 }));
  clock = 3_000;
  plan.onTelemetry(d2, telemetry(0, complete()));
  plan.onTelemetry(d2, telemetry(1, { task: "temple", status: "ok", updatedAt: clock,
    finalEquipLastRunAt: clock }));
  assert.equal(actions.at(-1).command, "run_auction_buy");

  clock += 60_001;
  plan.tick();
  assert.deepEqual(actions.slice(-3).map(action => action.command),
    ["cancel_automation", "configure_return_hang", "run_temple_guard"]);
  assert.equal(actions.at(-2).parameters.map, "圣兽云殿");
  assert.equal(plan.snapshot().mainBuyTimedOut, true);
  plan.onTelemetry(d2, telemetry(0, { task: "temple", status: "ok", updatedAt: clock + 1 }));

  assert.equal(plan.snapshot().status, "success");
  assert.equal(plan.snapshot().history.length, 2);
  assert.equal(plan.snapshot().history.at(-1).result, "success_purchase_skipped");
});

test("uses the configured item price and returns hao to its map when purchase fails", () => {
  const actions = [];
  let clock = 1_000;
  const shortRoute = [route()[0], route()[7], route().at(-1)];
  const plan = new EightAccountPlan({ emitAction: action => actions.push(action), now: () => clock });
  const complete = () => ({ task: "temple", status: "ok", updatedAt: clock,
    equipmentTransferLastRunAt: clock, dungeonLastRunAt: clock,
    finalEquipLastRunAt: clock, inventoryLastRunAt: clock, inventoryStatus: "ok" });
  plan.start(shortRoute, { resourcePrice: 1350,
    returnMaps: { hao: "伊苏王的神墓", hao7: "绘画小屋" } });
  plan.onTelemetry(d2, telemetry(0, { task: "equipment_sell", status: "running",
    equipmentListedInBatch: 5 }));
  clock = 2_000;
  plan.onTelemetry(d2, telemetry(1, complete()));
  plan.onTelemetry(d2, telemetry(0, { task: "temple", status: "ok", updatedAt: clock,
    finalEquipLastRunAt: clock }));
  plan.onTelemetry(d2, telemetry(1, { task: "temple", status: "ok", updatedAt: clock,
    auctionLastRunAt: clock }));
  plan.onTelemetry(d2, telemetry(1, { task: "equipment_sell", status: "running",
    equipmentListedInBatch: 5 }));
  clock = 3_000;
  plan.onTelemetry(d2, telemetry(0, complete()));
  plan.onTelemetry(d2, telemetry(1, { task: "temple", status: "ok", updatedAt: clock,
    finalEquipLastRunAt: clock }));
  const buy = actions.at(-1);
  assert.equal(buy.command, "run_auction_buy");
  assert.equal(actions.findLast(action => action.command === "configure_auto_auction")
    .parameters.price, 1350);

  plan.onCommandResult(buy, false, "没有匹配价格的道具");
  assert.deepEqual(actions.slice(-3).map(action => action.command),
    ["cancel_automation", "configure_return_hang", "run_temple_guard"]);
  assert.equal(actions.at(-2).parameters.map, "伊苏王的神墓");
  assert.equal(plan.snapshot().status, "running");
  assert.equal(plan.snapshot().mainBuyTimedOut, true);
});

test("brief device reconnect resumes the same relay leg and ignores old command results", () => {
  const actions = [];
  let clock = 10_000;
  const shortRoute = [route()[0], route()[2], route().at(-1)];
  const plan = new EightAccountPlan({ emitAction: action => actions.push(action), now: () => clock });
  plan.start(shortRoute);
  const staleSell = actions.find(action => action.command === "run_equipment_sell");

  let snapshot = plan.onDeviceOffline(d1);
  assert.equal(snapshot.status, "reconnecting");
  assert.equal(snapshot.legIndex, 0);
  clock += 20_000;
  actions.length = 0;
  snapshot = plan.onDeviceOnline(d1);
  assert.equal(snapshot.status, "running");
  assert.equal(snapshot.legIndex, 0);
  assert.equal(snapshot.phase, "buyer_running");
  assert.deepEqual(actions.slice(-2).map(action => action.command),
    ["run_equipment_sell", "run_equipment_buy"]);

  snapshot = plan.onCommandResult(staleSell, false, "旧连接超时回执");
  assert.equal(snapshot.status, "running");
});
