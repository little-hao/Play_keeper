"use strict";

const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const root = __dirname;
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const tx = fs.readFileSync(path.join(root, "play-keeper-god-transactions.js"), "utf8");

const [, minor = 0, patch = 0] = manifest.version.split(".").map(Number);
assert.ok(minor > 8 || (minor === 8 && patch >= 10), "manifest version must retain the v1.8.10 fixes");
assert.match(tx, /function sameRecordedPetIdentity/);
assert.match(tx, /identical-pets-require-switch-after-empty-list/);
assert.match(tx, /forcedForIdenticalPets: true/);
assert.match(tx, /async function switchToAlternativeSynthesisMain/);
assert.match(tx, /function classifySynthesisOutcomeText/);
assert.match(tx, /合成失败\(\?!时\)/);
assert.match(tx, /async function clickAndObserveSynthesis/);
assert.match(tx, /synthesis\/outcome-observed/);
assert.match(tx, /synthesis\/outcome-timeout-state/);
assert.match(tx, /服务器拒绝本次合成/);

const recoveryStart = tx.indexOf("if (sameRecordedPetIdentity(state.mainPet, state.deputyPet))");
const recoveredAfterRebuild = tx.indexOf('phase: "after-page-rebuild"', recoveryStart);
assert.ok(recoveryStart > 0);
assert.ok(recoveredAfterRebuild > recoveryStart, "non-identical fallback must remain after identical-pet forced switch");

console.log("v1.8.10 identical-pet switch and synthesis outcome checks passed");
