"use strict";

const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const root = __dirname;
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const planner = fs.readFileSync(path.join(root, "play-keeper-god-planner.js"), "utf8");
const tx = fs.readFileSync(path.join(root, "play-keeper-god-transactions.js"), "utf8");

assert.equal(manifest.version, "1.8.1");
assert.match(planner, /function storeMainPet\(pet\)/);
assert.match(planner, /主宠快照缺少名称、等级或阶数/);
assert.match(planner, /storeMainPet,/);
assert.match(tx, /async function readRankUpMainAfterSynthesis\(beforeTier\)/);
assert.match(tx, /name="带领的宠物"/);
assert.match(tx, /rankup\/tier-read-from-overview/);
assert.match(tx, /const observedMain = await readRankUpMainAfterSynthesis\(beforeTier\)/);
assert.match(tx, /停止，避免用空阶数筛选牧场/);

console.log("v1.8.1 post-synthesis tier verification checks passed");
