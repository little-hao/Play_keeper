"use strict";

const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const root = __dirname;
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const tx = fs.readFileSync(path.join(root, "play-keeper-god-transactions.js"), "utf8");

assert.equal(manifest.version, "1.8.6");
assert.match(tx, /forcedOptionIndex = null/);
assert.match(tx, /synthesis\/pet-alternative-position-selected/);
assert.match(tx, /async function closeSynthesisPetPopup/);
assert.match(tx, /empty-deputy-options-main-fallback/);
assert.match(tx, /empty-deputy-options-recovered/);
assert.match(tx, /previousMainOptionIndex/);
assert.match(tx, /alternativeMainOptionIndex/);
assert.match(tx, /副宠列表为空，当前主宠候选可能不是实际主战/);
assert.match(tx, /const replacementTier = Number\(config\.rankUpMinTier\)/);
assert.match(tx, /rankUpRoundsCompleted/);
assert.match(tx, /const locked = selectedAsMain/);

const swapStart = tx.indexOf("async function swapCompletedRankMain(oldMain)");
const swapEnd = tx.indexOf("async function runAutoCycle", swapStart);
const swap = tx.slice(swapStart, swapEnd);
assert.match(swap, /Number\(a\.pet\.cc\) - Number\(b\.pet\.cc\)/);
assert.doesNotMatch(swap, /Number\(b\.pet\.level\) - Number\(a\.pet\.level\)/);

console.log("v1.8.6 empty deputy options recovery checks passed");
