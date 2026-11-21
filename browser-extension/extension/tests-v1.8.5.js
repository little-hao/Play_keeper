"use strict";

const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const root = __dirname;
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const tx = fs.readFileSync(path.join(root, "play-keeper-god-transactions.js"), "utf8");

assert.equal(manifest.version, "1.8.5");
assert.match(tx, /const replacementTier = Number\(config\.rankUpMinTier\)/);
assert.doesNotMatch(tx, /const replacementTier = Number\(config\.rankUpMaxTier\) - 1/);
assert.match(tx, /rankUpRoundsStarted/);
assert.match(tx, /rankUpRoundsCompleted/);
assert.match(tx, /完整升阶轮次/);
assert.match(tx, /const locked = selectedAsMain/);
assert.match(tx, /if \(currentPageKind\(\) !== "pasture"\) await openPasture\(\)/);

const swapStart = tx.indexOf("async function swapCompletedRankMain(oldMain)");
const swapEnd = tx.indexOf("async function runAutoCycle", swapStart);
const swap = tx.slice(swapStart, swapEnd);
assert.match(swap, /Number\(a\.pet\.cc\) - Number\(b\.pet\.cc\)/);
assert.doesNotMatch(swap, /Number\(b\.pet\.level\) - Number\(a\.pet\.level\)/);

console.log("v1.8.5 complete rank-up round checks passed");
