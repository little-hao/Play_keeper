"use strict";

const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const root = __dirname;
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const planner = fs.readFileSync(path.join(root, "play-keeper-god-planner.js"), "utf8");
const tx = fs.readFileSync(path.join(root, "play-keeper-god-transactions.js"), "utf8");

assert.equal(manifest.version, "1.8.4");
assert.match(planner, /function clearDeputyPet\(reason/);
assert.match(planner, /clearDeputyPet,/);
assert.match(tx, /planner\.clearDeputyPet\("终止阶主战交接完成"\)/);
assert.match(tx, /carriedCards\.length > 1/);
assert.match(tx, /\.slice\(1\)/);
assert.match(tx, /unique-non-main-card/);
assert.match(tx, /automation\/stale-deputy-snapshot-ignored/);
assert.match(tx, /only-main-carried/);
assert.match(tx, /\.custom-modal-btn\.confirm/);
assert.match(tx, /main-switch-modal-detected/);
assert.match(tx, /设置主战确认框在点击确认后仍未关闭/);

console.log("v1.8.4 cross-cycle deputy snapshot checks passed");
