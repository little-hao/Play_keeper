"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = __dirname;
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const manifest = JSON.parse(read("manifest.json"));
const planner = read("play-keeper-god-planner.js");
const transactions = read("play-keeper-god-transactions.js");
const background = read("background.js");

assert.equal(manifest.version, "1.5.9");
assert.ok(manifest.permissions.includes("tabs"));
assert.match(planner, /allowBackgroundAttempt:\s*false/);
assert.match(planner, /evolutionVerifyBatchSize:\s*5/);
assert.match(transactions, /clickAndObserveEvolution/);
assert.match(transactions, /进化中/);
assert.match(transactions, /已进化十次/);
assert.match(transactions, /level\/transitional-render-detected/);
assert.match(transactions, /level\/transitional-render-recovered/);
assert.match(transactions, /const cooldownMs = 5000/);
assert.match(background, /chrome\.windows\.update/);

console.log("v1.5.9 evolution state and background progress recovery checks passed");
