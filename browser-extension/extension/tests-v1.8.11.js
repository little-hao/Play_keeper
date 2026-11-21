"use strict";

const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const root = __dirname;
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const tx = fs.readFileSync(path.join(root, "play-keeper-god-transactions.js"), "utf8");

assert.equal(manifest.version, "1.8.11");
assert.match(tx, /function synthesisOutcomePriority/);
assert.match(tx, /function preferSynthesisOutcome/);
assert.match(tx, /result\.kind === "success" \|\| result\.kind === "failure"\) return 3/);
assert.doesNotMatch(tx, /请勿\|请选择/);
assert.doesNotMatch(tx, /无法\|请勿\|请选择/);

const priority = (result) => {
  if (!result) return 0;
  if (result.kind === "success" || result.kind === "failure") return 3;
  if (result.kind === "rejection") return 1;
  return 0;
};
const prefer = (current, candidate) => priority(candidate) > priority(current) ? candidate : current;
const success = { kind: "success", text: "合成成功！" };
const failure = { kind: "failure", text: "合成失败！" };
const placeholder = null;
const rejection = { kind: "rejection", text: "宠物无效" };

assert.equal(prefer(success, placeholder), success);
assert.equal(prefer(success, rejection), success);
assert.equal(prefer(rejection, success), success);
assert.equal(prefer(failure, rejection), failure);

console.log("v1.8.11 synthesis terminal outcome priority checks passed");
