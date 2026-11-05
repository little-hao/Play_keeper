import assert from "node:assert/strict";
import test from "node:test";
import { DailyRoutinePlan } from "../daily-routine-plan.js";

const route = ["hao", "hao1"].map((accountLabel, accountIndex) =>
  ({ deviceId: "PK-TEST001", accountIndex, accountLabel }));

function completeVerifiedAccount(plan, started, account, now = Date.now()) {
  const base = { index: account.accountIndex, automation: { dailyRoutineRunId: started.runId,
    dailyTaskPageLoaded: true, dailyTaskAcceptVerified: true, dailyTaskCandidateCount: 3,
    dailyTaskAcceptedCount: 3, completableScanVerified: true, completableFoundCount: 2,
    completableCompletedCount: 2, completableRemainingCount: 0 } };
  plan.onTelemetry(account.deviceId, { accounts: [{ ...base,
    automation: { ...base.automation, task: "daily_routine", status: "ok" } }] });
  plan.onTelemetry(account.deviceId, { accounts: [{ ...base,
    automation: { ...base.automation, task: "inventory_snapshot", status: "ok",
      inventoryLastRunAt: now + 1, inventoryCounts: { 进化宝石: 2 } } }] });
  plan.onTelemetry(account.deviceId, { accounts: [{ ...base,
    automation: { ...base.automation, task: "temple", status: "ok" } }] });
}

test("dispatches account routines concurrently with per-account return maps", () => {
  const actions = [];
  const plan = new DailyRoutinePlan({ emitAction: (action) => actions.push(action) });
  const result = plan.start(route, { dungeonItems: ["圣诞小屋"], returnMap: "圣兽云殿",
    returnMaps: { hao1: "绘画小屋" } }, { id: "owner", username: "hao" });
  assert.equal(result.status, "running");
  assert.equal(actions.length, 2);
  assert.deepEqual(actions.map((action) => action.command), ["run_daily_routine", "run_daily_routine"]);
  assert.equal(actions[0].parameters.returnMap, "圣兽云殿");
  assert.equal(actions[1].parameters.returnMap, "绘画小屋");
});

test("defaults to no auction after 30 seconds and completes after all accounts return to hang", () => {
  let clock = 1_000;
  const plan = new DailyRoutinePlan({ emitAction() {}, now: () => clock });
  const started = plan.start(route, { dungeonItems: ["圣诞小屋"], returnMap: "圣诞小屋" }, {});
  clock += 30_001;
  plan.tick();
  for (const account of route) completeVerifiedAccount(plan, started, account, clock);
  assert.equal(plan.snapshot().auctionDecision, "no");
  assert.equal(plan.snapshot().status, "success");
});

test("hands successful routines to serialized auction only after every account completes", () => {
  let handed = 0;
  const plan = new DailyRoutinePlan({ emitAction() {}, onAuctionReady: () => { handed++; } });
  const started = plan.start(route, { dungeonItems: ["圣诞小屋"], returnMap: "圣诞小屋" }, {});
  plan.decideAuction(true);
  completeVerifiedAccount(plan, started, route[0]);
  assert.equal(handed, 0);
  completeVerifiedAccount(plan, started, route[1]);
  assert.equal(handed, 1);
});

test("marks an APP ok result unverified when task evidence is missing", () => {
  const plan = new DailyRoutinePlan({ emitAction() {} });
  const started = plan.start([route[0]], { dungeonItems: ["圣诞小屋"] }, {});
  plan.onTelemetry(route[0].deviceId, { accounts: [{ index: 0, automation: {
    dailyRoutineRunId: started.runId, task: "daily_routine", status: "ok" } }] });
  assert.equal(plan.snapshot().accounts[0].status, "unverified");
  assert.equal(plan.snapshot().status, "error");
});
