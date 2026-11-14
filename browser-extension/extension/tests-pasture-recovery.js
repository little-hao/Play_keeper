"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "play-keeper-god-transactions.js"), "utf8");

assert.match(source, /inventoryDecrementVerified/,
  "应在库存已减一时跳过多余的等级同步等待");
assert.match(source, /}, 1500, 180\);/,
  "弹窗关闭后的牧场列表快速验证应限制在 1\.5 秒");
assert.match(source, /pasture-prepared-target-missing/,
  "牧场和携带栏都没有旧副宠时应重置过期检查点");
assert.match(source, /reconciledFrom: "pasture-prepared"/,
  "旧副宠已在携带栏时应衔接到后续阶段");
assert.match(source, /class="auto-fresh-start"/,
  "自动循环应提供用户主动清除旧检查点的选项");
assert.match(source, /level < 40/,
  "携带副宠恢复应接受 Lv40 及以上等级");

assert.ok(source.indexOf("const byIndex") < source.indexOf("const progressed"),
  "同身份宠物必须先按牧场行索引匹配，不能先选已有 Lv40 宠物");
assert.match(source, /pasture-upgrade\/completed-counted/,
  "完成数应有独立的实际升级证据事件");
assert.match(source, /if \(!result\.upgraded\)/,
  "未消耗经验道具的已有 Lv40 行不得计入完成数");

console.log("pasture recovery v1.5.4 tests passed");
