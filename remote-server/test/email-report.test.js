import assert from "node:assert/strict";
import test from "node:test";
import { buildCompletionReport, buildDailyRoutineReport,
  sendCompletionReport } from "../email-report.js";

test("builds a per-account and aggregate completion report", () => {
  const report = buildCompletionReport({ updatedAt: Date.now(), inventoryByAccount: {
    hao1: { "曙光印记": 3, "进化宝石": 2 },
    hao2: { "曙光印记": 4, "进化宝石": 1 }
  } });
  assert.match(report.subject, /2账号/);
  assert.match(report.text, /hao1/);
  assert.equal(report.totals["曙光印记"], 7);
  assert.equal(report.totals["进化宝石"], 3);
});

test("does not attempt email when SMTP is not configured", async () => {
  const result = await sendCompletionReport({ reportEmail: "konghao0920@gmail.com" }, {});
  assert.match(result.status, /未配置SMTP/);
});

test("daily routine email includes account evidence and user inventory totals", () => {
  const report = buildDailyRoutineReport({ runId: "daily-test", status: "success",
    updatedAt: Date.now(), accounts: [
      { accountLabel: "hao", status: "ok", evidence: { dailyTaskAcceptVerified: true,
        completableFoundCount: 2, completableCompletedCount: 2, completableRemainingCount: 0 },
      inventoryCounts: { "进化宝石": 3 } },
      { accountLabel: "hao1", status: "ok", evidence: { dailyTaskAcceptVerified: true,
        completableFoundCount: 0, completableCompletedCount: 0, completableRemainingCount: 0 },
      inventoryCounts: { "进化宝石": 4 } }
    ] });
  assert.match(report.text, /hao1/);
  assert.match(report.text, /本用户全部账号背包合计/);
  assert.equal(report.totals["进化宝石"], 7);
});
