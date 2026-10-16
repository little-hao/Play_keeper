import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const DEFAULT_PASSWORD = "20261016";
const HAO_ACCOUNTS = Object.freeze(["hao", "hao1", "hao2", "hao3", "hao4", "hao5", "hao6", "hao7"]);
const FROST_ACCOUNTS = Object.freeze(["杂鱼小弟", "杂鱼小妹", "合宠糕手", "涅槃糕手"]);

function safeName(value) {
  const name = String(value ?? "").trim();
  return /^[\p{L}\p{N}_.-]{2,32}$/u.test(name) ? name : "";
}

function cleanAccountLabels(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map((value) => String(value ?? "").trim())
    .filter((value) => value.length >= 1 && value.length <= 30 && !/[\r\n\t→,，]/.test(value)))]
    .slice(0, 8);
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

function defaultSettings(accountLabels) {
  const labels = cleanAccountLabels(accountLabels);
  const mainAccount = labels[0] || "";
  return {
    accountLabels: labels, mainAccount,
    quickAuctionAccount: "", quickHangAccount: "", quickHangMap: "圣兽云殿",
    auctionBuyer: "", equipmentBuyer: "",
    planSchedule: { enabled: false, time: "04:00", timeZone: "Asia/Shanghai",
      lastRunDate: "", lastAttemptAt: 0, lastError: "",
      options: { routeLabels: mainAccount ? [...labels, mainAccount] : [], reportEmail: "" } }
  };
}

export class AuthStore {
  constructor(file, adminToken) {
    this.file = file;
    this.adminToken = String(adminToken ?? "");
    this.data = { users: [], deviceOwners: {} };
    this.#load();
    this.#ensureDefaults();
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

  #ensureDefaults() {
    let changed = false;
    const defaults = [
      { username: "hao", role: "admin", accountLabels: HAO_ACCOUNTS },
      { username: "霜冻前夜", role: "user", accountLabels: FROST_ACCOUNTS }
    ];
    for (const item of defaults) {
      if (this.data.users.some((entry) => entry.username === item.username)) continue;
      const salt = crypto.randomBytes(16).toString("hex");
      this.data.users.push({ id: crypto.randomUUID(), username: item.username,
        salt, passwordHash: passwordHash(DEFAULT_PASSWORD, salt), role: item.role,
        disabled: false, settings: defaultSettings(item.accountLabels) });
      changed = true;
    }
    for (const user of this.data.users) {
      if (!user.settings || typeof user.settings !== "object") {
        user.settings = defaultSettings(user.username === "hao" ? HAO_ACCOUNTS : []);
        changed = true;
      }
    }
    if (changed) this.#save();
  }

  #publicUser(user) {
    return { id: user.id, username: user.username, role: user.role || "user",
      settings: structuredClone(user.settings || defaultSettings([])) };
  }

  authenticate(username, password, legacyToken, deviceCredential = "") {
    const name = safeName(username);
    if (!name && this.adminToken && equalText(legacyToken ?? password, this.adminToken)) {
      return { id: "legacy-admin", username: "hao", role: "admin", legacy: true,
        settings: defaultSettings(HAO_ACCOUNTS) };
    }
    const user = this.data.users.find((entry) => entry.username === name && !entry.disabled);
    if (!user || !password
        || !equalHex(passwordHash(password, user.salt), user.passwordHash)) return null;
    const token = String(deviceCredential ?? "").trim();
    if (user.deviceTokenHash) {
      if (!token || !equalHex(passwordHash(token, user.deviceTokenSalt), user.deviceTokenHash)) return null;
    } else if (token) {
      if (token.length < 16 || token.length > 200) return null;
      user.deviceTokenSalt = crypto.randomBytes(16).toString("hex");
      user.deviceTokenHash = passwordHash(token, user.deviceTokenSalt);
      this.#save();
    }
    return this.#publicUser(user);
  }

  authenticateDeviceToken(token, legacyDeviceToken) {
    const value = String(token ?? "");
    for (const user of this.data.users) {
      if (!user.disabled && user.deviceTokenHash
          && equalHex(passwordHash(value, user.deviceTokenSalt), user.deviceTokenHash)) {
        return this.#publicUser(user);
      }
    }
    if (legacyDeviceToken && equalText(value, legacyDeviceToken)) {
      const hao = this.data.users.find((entry) => entry.username === "hao");
      return hao ? this.#publicUser(hao)
        : { id: "legacy-admin", username: "hao", role: "admin", settings: defaultSettings(HAO_ACCOUNTS) };
    }
    return null;
  }

  upsertUser(username, password, role = "user", deviceToken = "", accountLabels) {
    const name = safeName(username);
    if (!name) throw new Error("用户名需为2–32位中英文、数字或 . _ -");
    if (typeof password !== "string" || password.length < 8 || password.length > 128) {
      throw new Error("密码需为8–128位");
    }
    if (!["admin", "user"].includes(role)) throw new Error("用户角色无效");
    const token = String(deviceToken ?? "").trim();
    if (token && (token.length < 16 || token.length > 200)) throw new Error("device_token需为16–200位");
    let user = this.data.users.find((entry) => entry.username === name);
    if (!user) {
      user = { id: crypto.randomUUID(), username: name,
        settings: defaultSettings(cleanAccountLabels(accountLabels)) };
      this.data.users.push(user);
    }
    user.salt = crypto.randomBytes(16).toString("hex");
    user.passwordHash = passwordHash(password, user.salt);
    user.role = role;
    user.disabled = false;
    const labels = cleanAccountLabels(accountLabels);
    if (labels.length) user.settings = { ...defaultSettings(labels), ...user.settings,
      accountLabels: labels, mainAccount: labels[0] };
    if (token) {
      user.deviceTokenSalt = crypto.randomBytes(16).toString("hex");
      user.deviceTokenHash = passwordHash(token, user.deviceTokenSalt);
    }
    this.#save();
    return this.#publicUser(user);
  }

  assignDevice(deviceId, username) {
    const name = safeName(username);
    const user = this.data.users.find((entry) => entry.username === name && !entry.disabled);
    if (!user) throw new Error("未找到可用用户");
    this.data.deviceOwners[deviceId] = user.id;
    this.#save();
    return user.id;
  }

  claimDevice(deviceId, user) {
    if (user?.id && user.id !== "legacy-admin") {
      this.data.deviceOwners[deviceId] = user.id;
      this.#save();
    }
  }

  canAccess(user, deviceId) {
    if (user?.role === "admin") return true;
    return Boolean(user?.id) && this.data.deviceOwners[deviceId] === user.id;
  }

  getSettings(user) {
    if (user?.legacy) return structuredClone(user.settings || defaultSettings(HAO_ACCOUNTS));
    const record = this.data.users.find((entry) => entry.id === user?.id);
    return structuredClone(record?.settings || defaultSettings([]));
  }

  updateSettings(user, patch) {
    const record = this.data.users.find((entry) => entry.id === user?.id);
    if (!record) throw new Error("兼容管理员请使用 hao 账号登录后保存独立设置");
    record.settings = { ...(record.settings || defaultSettings([])), ...structuredClone(patch) };
    this.#save();
    return this.getSettings(this.#publicUser(record));
  }

  scheduledUsers() {
    return this.data.users.filter((entry) => !entry.disabled).map((entry) => this.#publicUser(entry));
  }

  publicSnapshot() {
    return { users: this.data.users.map(({ id, username, role, disabled, settings, deviceTokenHash }) =>
      ({ id, username, role, disabled: disabled === true,
        accountLabels: cleanAccountLabels(settings?.accountLabels),
        deviceTokenConfigured: Boolean(deviceTokenHash) })),
      deviceOwners: { ...this.data.deviceOwners } };
  }
}
