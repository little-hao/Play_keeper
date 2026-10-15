import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function safeName(value) {
  const name = String(value ?? "").trim().toLowerCase();
  return /^[a-z0-9_.-]{3,32}$/.test(name) ? name : "";
}

function passwordHash(password, salt) {
  return crypto.scryptSync(String(password), salt, 32).toString("hex");
}

function equalHex(actual, expected) {
  try {
    const left = Buffer.from(String(actual), "hex");
    const right = Buffer.from(String(expected), "hex");
    return left.length === right.length && crypto.timingSafeEqual(left, right);
  } catch { return false; }
}

function equalText(actual, expected) {
  const left = Buffer.from(String(actual ?? ""), "utf8");
  const right = Buffer.from(String(expected ?? ""), "utf8");
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export class AuthStore {
  constructor(file, adminToken) {
    this.file = file;
    this.adminToken = String(adminToken ?? "");
    this.data = { users: [], deviceOwners: {} };
    this.#load();
  }

  #load() {
    try {
      if (!this.file || !fs.existsSync(this.file)) return;
      const value = JSON.parse(fs.readFileSync(this.file, "utf8"));
      if (Array.isArray(value?.users)) this.data.users = value.users;
      if (value?.deviceOwners && typeof value.deviceOwners === "object") {
        this.data.deviceOwners = value.deviceOwners;
      }
    } catch { this.data = { users: [], deviceOwners: {} }; }
  }

  #save() {
    if (!this.file) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, `${JSON.stringify(this.data, null, 2)}\n`, { mode: 0o600 });
  }

  authenticate(username, password, legacyToken) {
    const name = safeName(username);
    if (!name && this.adminToken && equalText(legacyToken ?? password, this.adminToken)) {
      return { id: "legacy-admin", username: "admin", role: "admin", legacy: true };
    }
    const user = this.data.users.find((entry) => entry.username === name && !entry.disabled);
    if (!user || !password) return null;
    return equalHex(passwordHash(password, user.salt), user.passwordHash)
      ? { id: user.id, username: user.username, role: user.role || "user" } : null;
  }

  upsertUser(username, password, role = "user") {
    const name = safeName(username);
    if (!name) throw new Error("用户名需为3–32位字母、数字或 . _ -");
    if (typeof password !== "string" || password.length < 8 || password.length > 128) {
      throw new Error("密码需为8–128位");
    }
    if (!["admin", "user"].includes(role)) throw new Error("用户角色无效");
    let user = this.data.users.find((entry) => entry.username === name);
    if (!user) {
      user = { id: crypto.randomUUID(), username: name };
      this.data.users.push(user);
    }
    user.salt = crypto.randomBytes(16).toString("hex");
    user.passwordHash = passwordHash(password, user.salt);
    user.role = role;
    user.disabled = false;
    this.#save();
    return { id: user.id, username: user.username, role: user.role };
  }

  assignDevice(deviceId, username) {
    const name = safeName(username);
    const user = this.data.users.find((entry) => entry.username === name && !entry.disabled);
    if (!user) throw new Error("未找到可用用户");
    this.data.deviceOwners[deviceId] = user.id;
    this.#save();
    return user.id;
  }

  canAccess(user, deviceId) {
    if (user?.role === "admin") return true;
    return Boolean(user?.id) && this.data.deviceOwners[deviceId] === user.id;
  }

  publicSnapshot() {
    return {
      users: this.data.users.map(({ id, username, role, disabled }) =>
        ({ id, username, role, disabled: disabled === true })),
      deviceOwners: { ...this.data.deviceOwners }
    };
  }
}
