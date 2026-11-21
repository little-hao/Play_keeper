"use strict";

const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const root = __dirname;
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const tx = fs.readFileSync(path.join(root, "play-keeper-god-transactions.js"), "utf8");

assert.equal(manifest.version, "1.8.2");
const swapStart = tx.indexOf("async function swapCompletedRankMain(oldMain)");
const swapEnd = tx.indexOf("async function runAutoCycle", swapStart);
assert.ok(swapStart >= 0 && swapEnd > swapStart);
const swap = tx.slice(swapStart, swapEnd);
assert.match(swap, /const replacementTier = Number\(config\.rankUpMaxTier\) - 1/);
assert.match(swap, /在牧场将 \$\{nextMain\.name\} 设置为主战/);
assert.match(swap, /oldPortraitMatches/);
assert.match(swap, /存放 \$\{oldMain\.tier\} 阶成品主宠/);
assert.doesNotMatch(swap, /identifyCarriedPets\(/);
assert.match(tx, /检测到锁定主宠已达到中止/);
assert.match(tx, /initialMain = await swapCompletedRankMain\(initialMain\)/);

console.log("v1.8.2 pasture main handoff checks passed");
