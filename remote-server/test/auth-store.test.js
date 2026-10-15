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
