"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = __dirname;
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const manifest = JSON.parse(read("manifest.json"));
const transactions = read("play-keeper-god-transactions.js");
const background = read("background.js");

assert.equal(manifest.version, "1.6.0");
assert.match(transactions, /DIAGNOSTIC_SESSION_KEY/);
assert.match(transactions, /sessionStorage\.setItem/);
assert.match(transactions, /visibilitychange/);
assert.match(transactions, /background-stall-detected/);
assert.match(transactions, /activeElapsedMs/);
assert.match(transactions, /pendingVerification/);
assert.match(transactions, /result-fallback-to-attributes/);
assert.match(transactions, /evolution-page-resume-after-attribute-fallback/);
assert.match(transactions, /reusedExistingSelection/);
assert.match(background, /const EXTENSION_VERSION = "1\.6\.0"/);

console.log("v1.6.0 background watchdog and persistent diagnostics checks passed");

