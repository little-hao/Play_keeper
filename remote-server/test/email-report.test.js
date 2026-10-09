import assert from "node:assert/strict";
import test from "node:test";
import { buildCompletionReport, sendCompletionReport } from "../email-report.js";

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
