import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function oneLine(value, fallback = "--") {
  const text = String(value ?? "").replace(/[\r\n]+/g, " ").trim();
  return text || fallback;
}

function shanghaiTime(timestamp) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
  }).format(new Date(Number(timestamp) || Date.now()));
}

function userKey(username) {
  return crypto.createHash("sha256").update(String(username)).digest("hex").slice(0, 20);
}

function eventKey(plan) {
  const source = [plan.runId, plan.status, plan.phase, plan.legIndex,
    plan.errorAccount, plan.equipmentHolderLabel, plan.error].join("\u0000");
  return crypto.createHash("sha256").update(source).digest("hex").slice(0, 24);
}

export class PlanDiagnosticsStore {
  constructor(directory, logger = console) {
    this.directory = directory;
    this.logger = logger;
  }

  #file(username) {
    return path.join(this.directory, `multi-user-${userKey(username)}.md`);
  }

  append(plan) {
    const username = oneLine(plan?.ownerUsername, "");
    if (!username || !["intervention", "error"].includes(plan?.status) || !plan?.error) return false;
    try {
      fs.mkdirSync(this.directory, { recursive: true });
      const file = this.#file(username);
      const key = eventKey(plan);
      const marker = `<!-- event:${key} -->`;
      const existing = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
      if (existing.includes(marker)) return false;
      const route = Array.isArray(plan.route)
        ? plan.route.map((entry) => oneLine(entry?.accountLabel)).join(" → ") : "--";
      const leg = Number.isInteger(plan.legIndex) && plan.legIndex >= 0
        ? `${oneLine(plan.route?.[plan.legIndex]?.accountLabel)} → ${oneLine(plan.route?.[plan.legIndex + 1]?.accountLabel)}`
        : "--";
      const header = existing ? "" : `# ${username} 多用户挂机报错说明\n\n`
        + "本文件由 Play Keeper VPS 自动保留，用于后续定位和优化测试版本问题。\n\n";
      const entry = `${marker}\n## ${shanghaiTime(plan.updatedAt)}\n\n`
        + `- 运行编号：${oneLine(plan.runId)}\n`
        + `- 状态 / 阶段：${oneLine(plan.status)} / ${oneLine(plan.phase)}\n`
        + `- 完整循环：${route}\n`
        + `- 当前转移段：${leg}\n`
        + `- 报错账号：${oneLine(plan.errorAccount)}\n`
        + `- 装备所在账号：${oneLine(plan.equipmentHolderLabel)}\n`
        + `- 错误说明：${oneLine(plan.error)}\n\n`;
      fs.appendFileSync(file, header + entry, { encoding: "utf8", mode: 0o600 });
      return true;
    } catch (error) {
      this.logger.warn?.("Unable to save plan diagnostic", error.message);
      return false;
    }
  }

  read(username) {
    const name = oneLine(username, "用户");
    try {
      const file = this.#file(name);
      if (fs.existsSync(file)) return fs.readFileSync(file, "utf8");
    } catch (error) {
      this.logger.warn?.("Unable to read plan diagnostic", error.message);
    }
    return `# ${name} 多用户挂机报错说明\n\n目前尚未记录多用户挂机报错。\n`;
  }
}
