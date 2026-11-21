"use strict";

const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const root = __dirname;
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const tx = fs.readFileSync(path.join(root, "play-keeper-god-transactions.js"), "utf8");

const [, minor = 0, patch = 0] = manifest.version.split(".").map(Number);
assert.ok(minor > 8 || (minor === 8 && patch >= 8), "manifest version must retain the v1.8.8 recovery");
assert.match(tx, /synthesis\/empty-popup-close-candidates/);
assert.match(tx, /不点击被遮罩的下拉触发框/);
assert.match(tx, /waitForSynthesisMainRerender/);
assert.match(tx, /phase: "reopen-same-page"/);
assert.match(tx, /empty-deputy-options-page-rebuild/);
assert.match(tx, /phase: "after-page-rebuild"/);
assert.match(tx, /phase: "after-alternative-main"/);

const prepareStart = tx.indexOf("async function prepareSynthesisSelectionsAttempt");
const prepareEnd = tx.indexOf("async function prepareSynthesisSelections", prepareStart + 1);
const prepare = tx.slice(prepareStart, prepareEnd);
assert.ok(prepare.indexOf('phase: "reopen-same-page"') < prepare.indexOf("rebuildSynthesisSelectionPage()"));
assert.ok(prepare.indexOf("rebuildSynthesisSelectionPage()") < prepare.indexOf("alternativeMainOptionIndex"));

console.log("v1.8.8 synthesis empty deputy recovery checks passed");
