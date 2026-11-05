import crypto from "node:crypto";

const TERMINAL = new Set(["ok", "error", "cancelled"]);

export class DailyRoutinePlan {
  constructor({ emitAction, onUpdate, onAuctionReady, now = () => Date.now() } = {}) {
    this.emitAction = emitAction;
    this.onUpdate = onUpdate;
    this.onAuctionReady = onAuctionReady;
    this.now = now;
    this.state = this.#empty();
  }

  #empty() {
    return { status: "idle", runId: "", ownerId: "", ownerUsername: "",
      startedAt: 0, updatedAt: 0, auctionDecision: "pending", auctionDecisionDeadlineAt: 0,
      auctionHandoff: false, options: {}, accounts: [], message: "未运行" };
  }

  snapshot() { return structuredClone(this.state); }
  isActive() { return ["running", "awaiting_auction"].includes(this.state.status); }

  start(route, options = {}, owner = {}) {
    if (this.isActive()) throw new Error("各账号每日任务正在运行");
    if (!Array.isArray(route) || route.length < 1) throw new Error("未找到可运行的账号");
    const now = this.now();
    const runId = `daily-${now}-${crypto.randomBytes(4).toString("hex")}`;
    this.state = { status: "running", runId, ownerId: owner.id || "",
      ownerUsername: owner.username || "", startedAt: now, updatedAt: now,
      auctionDecision: "pending", auctionDecisionDeadlineAt: now + 30_000,
      auctionHandoff: false, options: structuredClone(options), message: "账号每日任务并行执行中",
      accounts: route.map((account) => ({ ...account, status: "queued", task: "daily_routine",
        message: "等待 APP 接收", updatedAt: now })) };
    this.#publish();
    for (const account of this.state.accounts) {
      const returnMap = String(options.returnMaps?.[account.accountLabel]
        || options.returnMap || "圣诞小屋").trim();
      const action = { deviceId: account.deviceId, accountIndex: account.accountIndex,
        accountLabel: account.accountLabel, command: "run_daily_routine",
        stepId: `${runId}:${account.deviceId}:${account.accountIndex}`,
        parameters: { accountIndex: account.accountIndex, runId,
          items: options.dungeonItems, skill: options.skill || "auto", returnMap } };
      try {
        this.emitAction(action);
        account.status = "running";
        account.message = `已下发；完成后返回${returnMap}挂机`;
      } catch (error) {
        account.status = "error";
        account.message = String(error?.message || error);
      }
    }
    this.#settle();
    return this.snapshot();
  }

  onCommandResult(action, success, message = "") {
    if (action?.parameters?.runId !== this.state.runId) return this.snapshot();
    const account = this.state.accounts.find((entry) => entry.deviceId === action.deviceId
      && entry.accountIndex === action.accountIndex);
    if (account && !success) {
      account.status = "error";
      account.message = message || "APP 拒绝执行";
      account.updatedAt = this.now();
      this.#settle();
    }
    return this.snapshot();
  }

  onTelemetry(deviceId, telemetry) {
    for (const account of this.state.accounts.filter((entry) => entry.deviceId === deviceId)) {
      const reported = (telemetry?.accounts || []).find((entry) => entry.index === account.accountIndex);
      const automation = reported?.automation;
      if (!automation || automation.dailyRoutineRunId !== this.state.runId) continue;
      account.task = automation.task || account.task;
      account.message = automation.lastMessage || automation.message || account.message;
      account.updatedAt = Number(automation.updatedAt) || this.now();
      if (automation.task === "daily_routine" && TERMINAL.has(automation.status)) {
        account.status = automation.status;
      } else if (automation.status === "running") account.status = "running";
    }
    this.#settle();
    return this.snapshot();
  }

  decideAuction(enabled) {
    if (!this.isActive()) throw new Error("当前没有可选择拍卖的每日任务");
    this.state.auctionDecision = enabled ? "yes" : "no";
    this.state.updatedAt = this.now();
    this.#settle();
    return this.snapshot();
  }

  tick() {
    if (this.state.auctionDecision === "pending"
        && this.now() >= this.state.auctionDecisionDeadlineAt) {
      this.state.auctionDecision = "no";
      this.state.message = "30 秒内未选择拍卖，已按默认不拍卖继续";
      this.#settle();
    }
    return this.snapshot();
  }

  cancel() {
    if (!this.isActive()) return this.snapshot();
    for (const account of this.state.accounts.filter((entry) => !TERMINAL.has(entry.status))) {
      try { this.emitAction({ deviceId: account.deviceId, accountIndex: account.accountIndex,
        accountLabel: account.accountLabel, command: "cancel_automation",
        stepId: `${this.state.runId}:cancel:${account.deviceId}:${account.accountIndex}`,
        parameters: { accountIndex: account.accountIndex } }); } catch { /* offline */ }
      account.status = "cancelled";
      account.message = "已请求中断";
    }
    this.state.status = "cancelled";
    this.state.message = "各账号每日任务已中断";
    this.#publish();
    return this.snapshot();
  }

  #settle() {
    this.tickGuard = true;
    const allDone = this.state.accounts.length > 0
      && this.state.accounts.every((entry) => TERMINAL.has(entry.status));
    if (allDone) {
      const failed = this.state.accounts.filter((entry) => entry.status !== "ok");
      if (failed.length) {
        this.state.status = "error";
        this.state.message = `${failed.length} 个账号未成功，已停止后续拍卖`;
      } else if (this.state.auctionDecision === "yes" && !this.state.auctionHandoff) {
        this.state.status = "awaiting_auction";
        this.state.message = "每日任务完成，正在移交串行拍卖";
        this.state.auctionHandoff = true;
        try { this.onAuctionReady?.(this.snapshot()); }
        catch (error) { this.state.status = "error"; this.state.message = String(error?.message || error); }
      } else if (this.state.auctionDecision === "no") {
        this.state.status = "success";
        this.state.message = "全部账号每日任务及返回指定副本挂机已完成（未拍卖）";
      }
    }
    this.state.updatedAt = this.now();
    this.#publish();
  }

  markAuctionHandoff() {
    this.state.status = "success";
    this.state.message = "全部账号每日任务已完成，拍卖已移交串行流程";
    this.#publish();
  }

  #publish() { this.onUpdate?.(this.snapshot()); }
}
