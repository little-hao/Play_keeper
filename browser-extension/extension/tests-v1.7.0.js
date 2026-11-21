"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const core = require("./god-planner-core.js");

const root = __dirname;
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
assert.equal(manifest.version, "1.7.0");

const pets = [
  { name: "七阶", tier: 7, level: 40, cc: 5 },
  { name: "八阶低", tier: 8, level: 40, cc: 4 },
  { name: "八阶高", tier: 8, level: 1, cc: 6 },
  { name: "九阶", tier: 9, level: 40, cc: 5 },
];
assert.deepEqual(core.selectCandidates(pets, "rankup", { mainTier: 8, minTier: 7, maxTier: 9 }).map((pet) => pet.name), ["八阶低", "八阶高"]);
assert.equal(core.selectCandidates(pets, "rankup", { minTier: 8, maxTier: 9 }).length, 3);

const valid = core.validateSynthesisTransaction({
  mainPet: { name: "主宠", tier: 8, level: 40, cc: 5 },
  deputyPet: { name: "副宠", tier: 8, level: 40, cc: 4 },
  inventory: {}, config: { mode: "rankup", rankUpMinTier: 7, rankUpMaxTier: 9 },
});
assert.equal(valid.ok, true);
const wrongTier = core.validateSynthesisTransaction({
  mainPet: { name: "主宠", tier: 8, level: 40, cc: 5 },
  deputyPet: { name: "副宠", tier: 7, level: 40, cc: 4 },
  inventory: {}, config: { mode: "rankup", rankUpMinTier: 7, rankUpMaxTier: 9 },
});
assert.equal(wrongTier.ok, false);
assert.match(wrongTier.reason, /同阶/);

const transactions = fs.readFileSync(path.join(root, "play-keeper-god-transactions.js"), "utf8");
assert.match(transactions, /mode === "rankup" \? 0/);
assert.match(transactions, /rankup\/tier-verified/);
assert.match(transactions, /post-success-refresh-deferred/);
console.log("v1.7.0 rank-up mode checks passed");
