"use strict";

const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const core = require("./god-planner-core.js");

const root = __dirname;
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const plannerSource = fs.readFileSync(path.join(root, "play-keeper-god-planner.js"), "utf8");
const txSource = fs.readFileSync(path.join(root, "play-keeper-god-transactions.js"), "utf8");

assert.equal(manifest.version, "1.8.0");

const inventory = { exp500: 10, exp200: 10, bookLarge: 10, bookMedium: 10, bookSmall: 10 };
const pasturePlan = core.planPastureUpgrades({
  pasturePets: [
    { name: "七阶", tier: 7, level: 1, cc: 1 },
    { name: "八阶低", tier: 8, level: 1, cc: 2 },
    { name: "八阶高", tier: 8, level: 1, cc: 3 },
    { name: "九阶", tier: 9, level: 1, cc: 1 },
  ],
  inventory,
  minTier: 8,
  maxTier: 8,
  count: 1,
});
assert.deepEqual(pasturePlan.candidates.map((pet) => pet.name), ["八阶低", "八阶高"]);
assert.equal(pasturePlan.minTier, 8);
assert.equal(pasturePlan.maxTier, 8);

const rankConfig = { mode: "rankup", rankUpMinTier: 8, rankUpMaxTier: 9, useSupremeStone: false };
const makePet = (tier) => ({ name: `宠物${tier}`, tier, level: 40, cc: 5 });
assert.equal(core.validateSynthesisTransaction({ mainPet: makePet(7), deputyPet: makePet(7), inventory: {}, config: rankConfig }).ok, true);
assert.equal(core.validateSynthesisTransaction({ mainPet: makePet(8), deputyPet: makePet(8), inventory: {}, config: rankConfig }).ok, true);
assert.equal(core.validateSynthesisTransaction({ mainPet: makePet(9), deputyPet: makePet(9), inventory: {}, config: rankConfig }).ok, false);
assert.equal(core.validateSynthesisTransaction({ mainPet: makePet(7), deputyPet: makePet(8), inventory: {}, config: rankConfig }).ok, false);

for (const title of ["核心设置", "高级设置", "牧场副宠补级", "自动规划"]) assert.match(plannerSource, new RegExp(`<summary>${title}</summary>`));
for (const title of ["许可证", "导出事务诊断", "自动合宠循环"]) assert.match(txSource, new RegExp(`<summary>${title}</summary>`));
assert.match(txSource, /Number\(pet\.tier\) === Number\(config\.rankUpMinTier\)/);
assert.match(txSource, /afterTier >= Number\(runConfig\.rankUpMaxTier\)/);

console.log("v1.8.0 rank range, pasture tier filter and compact UI checks passed");
