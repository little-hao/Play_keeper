"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = __dirname;
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const tx = fs.readFileSync(path.join(root, "play-keeper-god-transactions.js"), "utf8");
const planner = fs.readFileSync(path.join(root, "play-keeper-god-planner.js"), "utf8");

assert.equal(manifest.version, "1.7.1");
assert.match(planner, /const VERSION = "1\.7\.1"/);
assert.match(tx, /async function identifyCarriedPets/);
assert.match(tx, /async function swapRankTenMain/);
assert.match(tx, /rankup\/carried-identities/);
assert.match(tx, /rankup\/main-swapped/);
assert.match(tx, /携带数减少、牧场数增加和旧十阶宠物出现/);
assert.match(tx, /await swapRankTenMain\(observedMain\)/);
assert.match(tx, /设置主战宠物/);
assert.match(tx, /确认将 \$\{liveNext\.name\} 设为主战/);
console.log("v1.7.1 rank-up handoff checks passed");
