"use strict";

const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const root = __dirname;
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const client = fs.readFileSync(path.join(root, "license-client.js"), "utf8");
const tx = fs.readFileSync(path.join(root, "play-keeper-god-transactions.js"), "utf8");

assert.equal(manifest.version, "1.8.7");
assert.match(client, /DEVICE_PROFILE_KEY/);
assert.match(client, /collectDeviceMetadata/);
assert.match(client, /getHighEntropyValues/);
assert.match(client, /browserName/);
assert.match(client, /extensionVersion/);
assert.match(client, /device: await collectDeviceMetadata\(\)/);
assert.match(tx, /license-device-name/);
assert.match(tx, /license-device-note/);
assert.match(tx, /persistDeviceProfile/);

console.log("v1.8.7 license device metadata checks passed");
