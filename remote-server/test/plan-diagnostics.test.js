import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { PlanDiagnosticsStore } from "../plan-diagnostics.js";

test("persists one diagnostic entry per user and deduplicates repeated updates", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "play-keeper-diagnostics-"));
  const store = new PlanDiagnosticsStore(directory);
  const plan = { ownerUsername: "霜冻前夜", status: "intervention", runId: "run-1",
    updatedAt: Date.now(), phase: "equipment_selling", legIndex: 0,
    route: [{ accountLabel: "杂鱼小弟" }, { accountLabel: "杂鱼小妹" }],
    errorAccount: "杂鱼小弟", equipmentHolderLabel: "杂鱼小弟", error: "测试错误" };
  assert.equal(store.append(plan), true);
  assert.equal(store.append(plan), false);
  assert.equal(store.append({ ...plan, phase: "seller_running" }), false);
  const document = store.read("霜冻前夜");
  assert.match(document, /霜冻前夜 多用户挂机报错说明/);
  assert.equal(document.match(/测试错误/g)?.length, 1);
  assert.doesNotMatch(store.read("hao"), /测试错误/);
  assert.equal(store.writeBundle(plan, { devices: [{ deviceId: "PK-1" }],
    screenshot: { accountIndex: 0, mime: "image/jpeg", imageBase64: "AA==" },
    gptSuggestion: { summary: "只读建议", suggestionOnly: true } }), true);
  const bundle = JSON.parse(store.readBundle("霜冻前夜"));
  assert.equal(bundle.format, "play-keeper-stall-diagnostic/v1");
  assert.equal(bundle.plan.gptSuggestion.summary, "只读建议");
  assert.match(bundle.notice, /未触发/);
  fs.rmSync(directory, { recursive: true, force: true });
});
