import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { AuthStore } from "../auth-store.js";

test("multi-user credentials and device ownership are persisted and isolated", (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "play-keeper-auth-"));
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, "users.json");
  const store = new AuthStore(file, "legacy-admin-token-123456");
  assert.equal(store.authenticate("hao", "20261016", "").role, "admin");
  const frost = store.authenticate("霜冻前夜", "20261016", "");
  assert.deepEqual(frost.settings.accountLabels,
    ["杂鱼小弟", "杂鱼小妹", "合宠糕手", "涅槃糕手"]);
  assert.equal(frost.settings.planSchedule.options.reportEmail, "");
  const user = store.upsertUser("owner1", "correct-horse-123", "user");
  assert.equal(store.authenticate("owner1", "wrong", ""), null);
  assert.equal(store.authenticate("owner1", "correct-horse-123", "").id, user.id);
  store.assignDevice("PK-ABCDEF123456", "owner1");
  assert.equal(store.canAccess(user, "PK-ABCDEF123456"), true);
  assert.equal(store.canAccess(user, "PK-OTHER123456"), false);
  const restored = new AuthStore(file, "legacy-admin-token-123456");
  assert.equal(restored.authenticate("owner1", "correct-horse-123", "").username, "owner1");
  assert.equal(restored.authenticate("", "", "legacy-admin-token-123456").role, "admin");
});

test("a device token can be bound to a user login combination", (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "play-keeper-token-"));
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const store = new AuthStore(path.join(directory, "users.json"), "legacy-token-123456");
  const token = "frost-device-token-20261016";
  assert.equal(store.authenticate("霜冻前夜", "20261016", "", token).username, "霜冻前夜");
  assert.equal(store.authenticateDeviceToken(token, "legacy-device").username, "霜冻前夜");
  assert.equal(store.authenticate("霜冻前夜", "20261016", "", "wrong-device-token"), null);
});
