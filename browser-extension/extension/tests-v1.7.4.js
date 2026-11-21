const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const root = __dirname;
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const tx = fs.readFileSync(path.join(root, "play-keeper-god-transactions.js"), "utf8");

assert.equal(manifest.version, "1.7.4");
assert.match(tx, /mainCarriedIndex: null/);
assert.match(tx, /runtime\.mainCarriedIndex = selectedIndex/);
assert.match(tx, /synthesis\/pet-position-disambiguated/);
assert.match(tx, /sameName && sameLevel && samePortrait/);

console.log("v1.7.4 synthesis position disambiguation checks passed");
