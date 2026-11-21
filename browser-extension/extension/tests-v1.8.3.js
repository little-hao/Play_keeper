"use strict";

const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const root = __dirname;
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const tx = fs.readFileSync(path.join(root, "play-keeper-god-transactions.js"), "utf8");

assert.equal(manifest.version, "1.8.3");
assert.match(tx, /\.custom-modal,.sell-modal,.modal,.dialog,\[role=dialog\]/);
assert.match(tx, /\.custom-modal-btn\.confirm/);
assert.match(tx, /main-switch-modal-detected/);
assert.match(tx, /点击“主战”后未出现/);
assert.match(tx, /设置主战确认框在点击确认后仍未关闭/);
assert.match(tx, /设置主战确认框仍遮挡页面/);

console.log("v1.8.3 main switch modal checks passed");
