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
assert.match(source, /checkpoint-pasture-index-restored/,
  "检查点恢复应优先使用已保存的牧场行索引");
assert.match(source, /identicalPetCount/,
  "索引恢复应兼容任意数量完全相同的牧场宠物");
assert.match(source, /samePasturePet\(indexed\.pet, target\)/,
  "按索引恢复时仍必须核验宠物完整身份");
assert.match(source, /level\/inventory-replanned/,
  "规划道具行消失时应完整重扫库存并重新规划");
assert.match(source, /Number\(consumed\.afterCount \|\| 0\)/,
  "经验道具消耗后应采用页面实际剩余数量");
assert.match(source, /AutomationStopRequestedError/,
  "用户停止应与页面加载错误分开处理");
assert.match(source, /currentPageKind\(\) === "pet-attributes"/,
  "宠物资料页判断不能仅依赖牧场也会使用的通用布局类名");

console.log("pasture recovery v1.5.5 tests passed");
