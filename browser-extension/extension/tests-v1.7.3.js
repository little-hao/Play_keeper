const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const root = __dirname;
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const tx = fs.readFileSync(path.join(root, "play-keeper-god-transactions.js"), "utf8");

assert.equal(manifest.version, "1.7.3");
assert.match(tx, /activeIdentityMatches/);
assert.match(tx, /const selectedIndex = cards\.indexOf\(card\)/);
assert.match(tx, /const sameSlot = selectedIndex >= 0/);
assert.match(tx, /activeMatches\.length === 1/);

console.log("v1.7.3 identical carried-pet identity checks passed");
