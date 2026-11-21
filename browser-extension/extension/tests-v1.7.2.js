"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = __dirname;
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const tx = fs.readFileSync(path.join(root, "play-keeper-god-transactions.js"), "utf8");

assert.equal(manifest.version, "1.7.2");
assert.match(tx, /const VERSION = "1\.7\.2"/);
assert.match(tx, /const attributeText = String\(document\.querySelector\("\.user-right"\)/);
assert.match(tx, /chosen = \{ \.\.\.chosen, carriedIndex: beforeCount/);
assert.match(tx, /saveAutoCheckpoint\("deputy-withdrawn", chosen/);
assert.match(tx, /identityMethod: Number\.isInteger/);
assert.match(tx, /recovered-by-appended-carried-index/);
assert.match(tx, /cards\.filter\(\(_card, index\) => index !== deputyIndex\)/);
console.log("v1.7.2 identical-pet transaction checks passed");
