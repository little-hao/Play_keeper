"use strict";

const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const root = __dirname;
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const tx = fs.readFileSync(path.join(root, "play-keeper-god-transactions.js"), "utf8");

const [, minor = 0, patch = 0] = manifest.version.split(".").map(Number);
assert.ok(minor > 8 || (minor === 8 && patch >= 9), "manifest version must retain the v1.8.9 fixes");
assert.match(tx, /function hasForcedPetOptionIndex\(value\)/);
assert.match(tx, /value !== null && value !== undefined && Number\.isInteger\(value\) && value >= 0/);
assert.doesNotMatch(tx, /Number\.isInteger\(Number\(forcedOptionIndex\)\)/);
assert.match(tx, /waitForSynthesisPetOptions/);
assert.match(tx, /const maxWaitMs = 5000/);
assert.match(tx, /const minimumOverlayAgeMs = 1500/);
assert.match(tx, /const stableEmptyMs = 1000/);
assert.match(tx, /synthesis\/pet-options-stable-empty/);
assert.match(tx, /synthesis\/pet-options-wait-timeout/);

const hasForcedPetOptionIndex = (value) => (
  value !== null && value !== undefined && Number.isInteger(value) && value >= 0
);
assert.equal(hasForcedPetOptionIndex(null), false);
assert.equal(hasForcedPetOptionIndex(undefined), false);
assert.equal(hasForcedPetOptionIndex("0"), false);
assert.equal(hasForcedPetOptionIndex(-1), false);
assert.equal(hasForcedPetOptionIndex(0), true);
assert.equal(hasForcedPetOptionIndex(1), true);

console.log("v1.8.9 synthesis selection and timing checks passed");
