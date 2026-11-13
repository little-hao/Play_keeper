"use strict";
const assert = require("node:assert/strict");
const core = require("./god-planner-core.js");

assert.equal(core.tierToNumber("十阶"), 10);
assert.equal(core.tierToNumber("九阶"), 9);
assert.equal(core.TOTAL_EXP_LEVEL1_TO_40, 5633436);
assert.equal(core.TOTAL_EXP_LEVEL1_TO_40_W, 563.3436);
assert.equal(core.parseExperienceValue("500万"), 5000000);
assert.equal(core.parseExperienceValue("563.3万"), 5633000);
assert.equal(core.parseExperienceValue("563.3W"), 5633000);
assert.equal(core.parseExperienceValue("5,633,436"), 5633436);

const fresh = core.parseMainPetText(`hao\n宝贝：仙宫玉兔\n等级：1\n当前经验：0\n升级经验：100\n五行：土\n阶级：四阶\n成长：2.3`);
assert.equal(fresh.name, "仙宫玉兔");
assert.equal(fresh.level, 1);
assert.equal(fresh.displayLevel, 1);
assert.equal(fresh.effectiveLevel, 0);
assert.equal(fresh.currentExp, 0);
assert.equal(fresh.upgradeExp, 100);
assert.equal(fresh.tier, 4);
assert.equal(fresh.cc, 2.3);

const withVip = core.parseMainPetText(`hao\nVIP等级：0\n宝贝：仙宫玉兔\n等级：1\n当前经验：0\n升级经验：100\n五行：土\n阶级：四阶\n成长：2.3`);
assert.equal(withVip.level, 1);
assert.equal(withVip.effectiveLevel, 0);

const progressOnly = core.parsePetProgressText(`hao\nVIP等级：0\n宝贝：仙宫玉兔\n等级：1\n当前经验：0\n升级经验：100\n五行：土\n成长：2.3\n进化次数：0`);
assert.equal(progressOnly.name, "仙宫玉兔");
assert.equal(progressOnly.level, 1);
assert.equal(progressOnly.effectiveLevel, 0);
assert.equal(progressOnly.currentExp, 0);
assert.equal(progressOnly.upgradeExp, 100);
assert.equal(progressOnly.tier, null);
assert.equal(progressOnly.evolutionCount, 0);

// 当前 sgplay.cc 实机属性页文本：字段可能分布在多个 DOM 元素，且宝贝名称在标签下一行。
const liveAttributeText = `hao
VIP等级：0
宝贝：
仙宫玉兔
等级：1
生命：624
当前经验：0
魔法：78
升级经验：100
五行：土
成长：2.3
进化次数：0`;
const liveAttributeProgress = core.parsePetProgressText(liveAttributeText);
assert.equal(liveAttributeProgress.name, "仙宫玉兔");
assert.equal(liveAttributeProgress.level, 1);
assert.equal(liveAttributeProgress.currentExp, 0);
assert.equal(liveAttributeProgress.upgradeExp, 100);
assert.equal(liveAttributeProgress.element, "土");
assert.equal(liveAttributeProgress.cc, 2.3);
assert.equal(liveAttributeProgress.evolutionCount, 0);
const liveAttributePet = core.parseMainPetText(liveAttributeText);
assert.equal(liveAttributePet.tier, null);
assert.equal(liveAttributePet.evolutionCount, 0);

// 即使 DOM textContent 把标签拼接在一起，也必须能读取经验字段，并排除 VIP等级。
const compactAttributeText = "haoVIP等级：0宝贝：仙宫玉兔等级：1当前经验：0升级经验：100五行：土成长：2.3";
const compactProgress = core.parsePetProgressText(compactAttributeText);
assert.equal(compactProgress.level, 1);
assert.equal(compactProgress.currentExp, 0);
assert.equal(compactProgress.upgradeExp, 100);

// 实测页面采用累计经验口径：Lv39 显示当前经验 500万、升级经验 563.3万。
const after500W = core.estimateLevelProgressFromTotalExp(500 * core.EXP_PER_W);
assert.equal(after500W.ok, true);
assert.equal(after500W.level, 39);
assert.equal(after500W.currentExp, 5000000);
assert.equal(after500W.upgradeExp, 5633436);
assert.equal(after500W.remainingExp, 633436);
assert.equal(after500W.remainingW, 64);
assert.equal(after500W.remainingWExact, 63.3436);

const liveLv39 = core.parsePetProgressText(`hao\n宝贝：仙宫玉兔\n等级：39\n当前经验：500万\n升级经验：563.3万\n五行：土\n阶级：四阶\n成长：2.3`);
assert.equal(liveLv39.currentExp, 5000000);
assert.equal(liveLv39.upgradeExp, 5633000);
const liveLv39Remaining = core.remainingExpToLevel40(liveLv39);
assert.equal(liveLv39Remaining.ok, true);
assert.equal(liveLv39Remaining.remainingExp, 633436);
assert.equal(liveLv39Remaining.remainingWExact, 63.3436);
const lv39Tx = core.planLevel40Transaction({
  pet: liveLv39,
  inventory: { bookLarge: 3, bookSmall: 1 },
  targetW: 563.3,
});
assert.equal(lv39Tx.ok, true);
assert.equal(lv39Tx.targetW, 63.3436);
assert.equal(lv39Tx.totalW, 65);
assert.deepEqual(lv39Tx.uses.map((item) => [item.id, item.count]), [["bookLarge", 3], ["bookSmall", 1]]);

const after565W = core.estimateLevelProgressFromTotalExp(565 * core.EXP_PER_W);
assert.equal(after565W.ok, true);
assert.equal(after565W.level, 40);
assert.equal(after565W.overflowExp, 16564);

const freshRemaining = core.remainingExpToLevel40(fresh);
assert.equal(freshRemaining.ok, true);
assert.equal(freshRemaining.remainingExp, 5633436);

const lv1TotalThreshold = core.remainingExpToLevel40({ level: 1, displayLevel: 1, currentExp: 0, upgradeExp: 5633000 });
assert.equal(lv1TotalThreshold.ok, true);
assert.equal(lv1TotalThreshold.remainingExp, 5633436);
assert.equal(freshRemaining.remainingW, 564);
assert.equal(freshRemaining.remainingWExact, 563.3436);

const midCurrent = core.CUMULATIVE_EXP_TO_NEXT[19] + 12345;
const midUpgrade = core.CUMULATIVE_EXP_TO_NEXT[20];
const mid = core.parseMainPetText(`宝贝：测试宠\n等级：20\n当前经验：${midCurrent}\n升级经验：${midUpgrade}\n五行：水\n阶级：八阶\n成长：9.8`);
const midRemaining = core.remainingExpToLevel40(mid);
assert.equal(midRemaining.ok, true);
assert.equal(midRemaining.remainingToNext, midUpgrade - midCurrent);
assert.equal(midRemaining.remainingExp, core.TOTAL_EXP_LEVEL1_TO_40 - midCurrent);
assert.ok(midRemaining.remainingExp > 0 && midRemaining.remainingExp < freshRemaining.remainingExp);

const curveMismatch = core.remainingExpToLevel40({ level: 20, displayLevel: 20, currentExp: midCurrent, upgradeExp: 99999 });
assert.equal(curveMismatch.ok, false);
assert.ok(curveMismatch.reason.includes("不一致"));

const pet = core.parsePastureRow("火蝎(四阶 火) Lv40 2.7");
assert.equal(pet.name, "火蝎");
assert.equal(pet.tier, 4);
assert.equal(pet.level, 40);
assert.equal(pet.cc, 2.7);

const exp = core.planExperience({ exp500: 1, exp200: 0, bookLarge: 3, bookMedium: 0, bookSmall: 1 }, 563.3);
assert.equal(exp.ok, true);
assert.equal(exp.totalW, 565);
assert.equal(exp.targetW, 563.3);
assert.equal(exp.overshootW, 1.7);
assert.equal(exp.itemCount, 5);

const levelTx = core.planLevel40Transaction({
  pet: fresh,
  inventory: { exp500: 1, bookLarge: 3, bookSmall: 1 },
  targetW: 563.3,
});
assert.equal(levelTx.ok, true);
assert.equal(levelTx.targetW, 563.3436);
assert.equal(levelTx.totalW, 565);
assert.equal(levelTx.effectiveLevel, 0);

const midTx = core.planLevel40Transaction({
  pet: mid,
  inventory: { exp500: 1, exp200: 2, bookLarge: 20, bookMedium: 20, bookSmall: 20 },
  targetW: 563.3,
});
assert.equal(midTx.ok, true);
assert.ok(midTx.targetW < 563.3);

const full = core.selectCandidates([
  { name: "a", tier: 8, level: 40, cc: 1 },
  { name: "b", tier: 10, level: 40, cc: 1 },
], "full");
assert.equal(full.length, 1);
assert.equal(full[0].name, "a");

const partial = core.selectCandidates([
  { name: "a", tier: 8, level: 40, cc: 1 },
  { name: "b", tier: 10, level: 40, cc: 1 },
], "partial");
assert.equal(partial.length, 1);
assert.equal(partial[0].name, "b");

const formulaCandidates = core.selectCandidates([
  { name: "a", tier: 4, level: 40, cc: 2.3 },
  { name: "b", tier: 9, level: 40, cc: 25 },
  { name: "c", tier: 10, level: 40, cc: 14.4 },
], "formula");
assert.equal(formulaCandidates.length, 3);

const evolveOk = core.validateEvolutionTransaction({ pet: { level: 40, tier: 9, evolutionCount: 9 } });
assert.equal(evolveOk.ok, true);
assert.equal(evolveOk.expectedEvolutionCount, 10);
assert.equal(core.validateEvolutionTransaction({ pet: { level: 39, tier: 9, evolutionCount: 2 } }).ok, false);
assert.equal(core.validateEvolutionTransaction({ pet: { level: 40, tier: 4, evolutionCount: 10 } }).ok, false);
assert.equal(core.validateEvolutionTransaction({ pet: { level: 40, tier: 10 } }).ok, false);
assert.ok(core.validateEvolutionTransaction({ pet: { level: 40, tier: 9, evolutionCount: null } }).reason.includes("尚未记录进化次数"));

const exactPet = core.selectUniquePetOption([
  { id: 1, name: "鬼精灵欧姆", level: 40, growth: 25, portraitKey: "80" },
  { id: 2, name: "仙宫玉兔", level: 40, growth: 2.3, portraitKey: "21" },
], { name: "鬼精灵欧姆", level: 40, cc: 25, portraitKey: "80" });
assert.equal(exactPet.ok, true);
assert.equal(exactPet.option.id, 1);
const growthDriftPet = core.selectUniquePetOption([
  { id: 3, name: "鬼精灵欧姆", level: 40, growth: 27.8 },
  { id: 4, name: "碧蟾", level: 40, growth: 2.3 },
], { name: "鬼精灵欧姆", level: 40, cc: 27.4 });
assert.equal(growthDriftPet.ok, true);
assert.equal(growthDriftPet.growthChanged, true);
assert.equal(growthDriftPet.observedGrowth, 27.8);
const ambiguousPet = core.selectUniquePetOption([
  { id: 1, name: "仙宫玉兔", level: 40, growth: 2.3 },
  { id: 2, name: "仙宫玉兔", level: 40, growth: 2.3 },
], { name: "仙宫玉兔", level: 40, cc: 2.3 });
assert.equal(ambiguousPet.ok, false);
assert.ok(ambiguousPet.reason.includes("2 个"));

const boundGrowthStone = core.selectPreferredMaterial([
  { id: 1, name: "★★★成长魂石【绑定】", quantity: 226 },
  { id: 2, name: "★★★成长魂石", quantity: 255 },
], ["★★★成长魂石【绑定】", "★★★成长魂石"]);
assert.equal(boundGrowthStone.ok, true);
assert.equal(boundGrowthStone.option.id, 1);
const missingSupreme = core.selectPreferredMaterial([
  { name: "天神之石【绑定】", quantity: 75 },
], ["至尊神石【绑定】", "至尊神石"]);
assert.equal(missingSupreme.ok, false);

const synthNoDeputy = core.validateSynthesisTransaction({
  mainPet: { name: "主", level: 40, tier: 10, cc: 61 },
  inventory: { supremeStone: 1 },
  config: { mode: "full", useSupremeStone: false, fullQualificationCc: 60 },
});
assert.equal(synthNoDeputy.ok, false);
assert.ok(synthNoDeputy.reason.includes("副宠"));

const synthDeputyLow = core.validateSynthesisTransaction({
  mainPet: { name: "主", level: 40, tier: 10, cc: 61 },
  deputyPet: { name: "副", level: 39, tier: 8, cc: 3 },
  inventory: { supremeStone: 1 },
  config: { mode: "full", useSupremeStone: false, fullQualificationCc: 60 },
});
assert.equal(synthDeputyLow.ok, false);
assert.ok(synthDeputyLow.reason.includes("副宠仅 Lv39"));

const synthFullOk = core.validateSynthesisTransaction({
  mainPet: { name: "主", level: 40, tier: 10, cc: 61 },
  deputyPet: { name: "副", level: 40, tier: 8, cc: 3 },
  inventory: { supremeStone: 1 },
  config: { mode: "full", useSupremeStone: true, fullQualificationCc: 60 },
});
assert.equal(synthFullOk.ok, true);

const synthFullMainWrongTier = core.validateSynthesisTransaction({
  mainPet: { name: "主", level: 40, tier: 9, cc: 25 },
  deputyPet: { name: "副", level: 40, tier: 4, cc: 2.3 },
  inventory: { supremeStone: 0 },
  config: { mode: "full", useSupremeStone: false, fullQualificationCc: 60 },
});
assert.equal(synthFullMainWrongTier.ok, false);
assert.ok(synthFullMainWrongTier.reason.includes("满神合成要求主宠为十阶"));

const synthFormulaAnyTier = core.validateSynthesisTransaction({
  mainPet: { name: "已锁定公式主宠", level: 40, tier: 4, cc: 2.3 },
  deputyPet: { name: "用户副宠", level: 40, tier: 9, cc: 5.9 },
  inventory: { supremeStone: 0 },
  config: { mode: "formula", useSupremeStone: false, fullQualificationCc: 60 },
});
assert.equal(synthFormulaAnyTier.ok, true);
assert.equal(synthFormulaAnyTier.mode, "formula");
assert.ok(synthFormulaAnyTier.deputyTierRule.includes("不限制"));

const synthFormulaMainLow = core.validateSynthesisTransaction({
  mainPet: { name: "低等级", level: 39, tier: 1, cc: 2 },
  deputyPet: { name: "副", level: 40, tier: 1, cc: 2 },
  inventory: { supremeStone: 0 },
  config: { mode: "formula", useSupremeStone: false },
});
assert.equal(synthFormulaMainLow.ok, false);
assert.ok(synthFormulaMainLow.reason.includes("主宠仅 Lv39"));

const synthFullWrongTier = core.validateSynthesisTransaction({
  mainPet: { name: "主", level: 40, tier: 10, cc: 61 },
  deputyPet: { name: "副", level: 40, tier: 10, cc: 3 },
  inventory: { supremeStone: 1 },
  config: { mode: "full", useSupremeStone: false, fullQualificationCc: 60 },
});
assert.equal(synthFullWrongTier.ok, false);
assert.ok(synthFullWrongTier.reason.includes("八阶及以下"));

const synthPartialOk = core.validateSynthesisTransaction({
  mainPet: { name: "主", level: 40, tier: 10, cc: 40 },
  deputyPet: { name: "副", level: 40, tier: 10, cc: 3 },
  inventory: { supremeStone: 0 },
  config: { mode: "partial", useSupremeStone: false, fullQualificationCc: 60 },
});
assert.equal(synthPartialOk.ok, true);

const plan = core.buildPlan({
  mainPet: { name: "主宠", level: 40, tier: 10, tierText: "十阶", cc: 58, element: "水" },
  deputyPet: { name: "副宠", level: 40, tier: 8, tierText: "八阶", cc: 2, element: "火" },
  pasturePets: [{ name: "副宠", tier: 8, level: 40, cc: 2 }],
  inventory: { strengthA: 2, strengthB: 3, supremeStone: 1, exp500: 1, bookLarge: 3, bookSmall: 1 },
  config: { mode: "full", targetCc: 57.6, fullQualificationCc: 60, level1To40ExpW: 563.3, useSupremeStone: false },
});
assert.equal(plan.candidates.length, 1);
assert.equal(plan.deputyPet.name, "副宠");
assert.ok(plan.warnings.some((item) => item.includes("参数冲突提醒")));

const formulaPlanWithoutMain = core.buildPlan({
  mainPet: null,
  deputyPet: { name: "副宠", level: 40, tier: 4, cc: 25 },
  pasturePets: [{ name: "副宠", tier: 4, level: 40, cc: 25 }],
  inventory: { strengthA: 1, strengthB: 0, supremeStone: 0 },
  config: { mode: "formula" },
});
assert.ok(formulaPlanWithoutMain.blockers.includes("尚未扫描到主宠资料"));

const pastureUpgradePlan = core.planPastureUpgrades({
  pasturePets: [
    { name: "八阶", tier: 8, level: 1, cc: 3, pastureIndex: 0 },
    { name: "四阶高CC", tier: 4, level: 1, cc: 3, pastureIndex: 1 },
    { name: "四阶低CC", tier: 4, level: 1, cc: 2, pastureIndex: 2 },
    { name: "九阶排除", tier: 9, level: 1, cc: 1, pastureIndex: 3 },
  ],
  inventory: { exp500: 2, bookLarge: 6, bookSmall: 2 },
  maxTier: 8,
  count: 2,
  targetW: 563.3,
});
assert.equal(pastureUpgradePlan.capacity, 2);
assert.equal(pastureUpgradePlan.selectedPlans.length, 2);
assert.equal(pastureUpgradePlan.selectedPlans[0].pet.name, "四阶低CC");
assert.equal(pastureUpgradePlan.selectedPlans[1].pet.name, "四阶高CC");
assert.ok(!pastureUpgradePlan.candidates.some((pet) => pet.name === "九阶排除"));

const resumedPasturePlan = core.planPastureUpgrades({
  pasturePets: [{ name: "断点宠", tier: 5, level: 39, cc: 2.8, pastureIndex: 0 }],
  inventory: { exp500: 2, bookLarge: 5, bookMedium: 1, bookSmall: 1 },
  maxTier: 8,
  count: 1,
  targetW: 563.3,
});
assert.equal(resumedPasturePlan.selectedPlans.length, 1);
assert.ok(resumedPasturePlan.selectedPlans[0].targetW < 81);
assert.ok(!resumedPasturePlan.selectedPlans[0].exp.uses.some((use) => use.id === "exp500" || use.id === "exp200"));

const replannedAfter500 = core.planExperience({ bookSmall: 13 }, 63.3);
assert.equal(replannedAfter500.ok, true);
assert.equal(replannedAfter500.totalW, 65);
assert.equal(replannedAfter500.uses[0].count, 13);

console.log("god-planner v1.5.1 tests passed");
