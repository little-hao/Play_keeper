import assert from "node:assert/strict";
import test from "node:test";
import { DailyRoutinePlan } from "../daily-routine-plan.js";

const route = ["hao", "hao1"].map((accountLabel, accountIndex) =>
  ({ deviceId: "PK-TEST001", accountIndex, accountLabel }));

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
  for (const account of route) {
    plan.onTelemetry(account.deviceId, { accounts: [{ index: account.accountIndex,
      automation: { dailyRoutineRunId: started.runId, task: "daily_routine", status: "ok",
        message: "已返回圣诞小屋挂机" } }] });
  }
  assert.equal(plan.snapshot().auctionDecision, "no");
  assert.equal(plan.snapshot().status, "success");
});

test("hands successful routines to serialized auction only after every account completes", () => {
  let handed = 0;
  const plan = new DailyRoutinePlan({ emitAction() {}, onAuctionReady: () => { handed++; } });
  const started = plan.start(route, { dungeonItems: ["圣诞小屋"], returnMap: "圣诞小屋" }, {});
  plan.decideAuction(true);
  plan.onTelemetry(route[0].deviceId, { accounts: [{ index: 0,
    automation: { dailyRoutineRunId: started.runId, task: "daily_routine", status: "ok" } }] });
  assert.equal(handed, 0);
  plan.onTelemetry(route[1].deviceId, { accounts: [{ index: 1,
    automation: { dailyRoutineRunId: started.runId, task: "daily_routine", status: "ok" } }] });
  assert.equal(handed, 1);
});
