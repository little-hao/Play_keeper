import crypto from "node:crypto";

export const EQUIPMENT_ITEMS = Object.freeze([
  "厄菲斯神剑", "厄菲斯神铠", "厄菲斯神冠", "厄菲斯神靴", "厄菲斯神链",
  "厄菲斯神戒", "厄菲斯神翼", "厄菲斯神镯", "厄菲斯神玉", "厄菲斯神印"
]);

export const RESOURCE_ITEMS = Object.freeze([
  "曙光印记", "进化宝石", "强化丹A", "强化丹B", "天仙玉露"
]);

const REQUIRED_ROUTE = Object.freeze([
  "hao", "hao1", "hao2", "hao3", "hao4", "hao5", "hao6", "hao7", "hao"
]);

const MAIN_BUY_TIMEOUT_MS = 60_000;
export const DEFAULT_DISCONNECT_GRACE_MS = 120_000;
export const DEFAULT_PHASE_TIMEOUTS = Object.freeze({
  starting_leg: 120_000,
  seller_running: 240_000,
  buyer_running: 720_000,
  resource_auction_running: 240_000,
  standalone_main_running: 900_000,
  main_buy_running: 90_000
});

function normalizedTimeouts(value = {}) {
  const result = { ...DEFAULT_PHASE_TIMEOUTS };
  for (const [phase, fallback] of Object.entries(DEFAULT_PHASE_TIMEOUTS)) {
    const candidate = Number(value?.[phase]);
    result[phase] = Number.isFinite(candidate) && candidate >= 30_000 && candidate <= 3_600_000
      ? Math.round(candidate) : fallback;
  }
  return result;
}

function shanghaiDateKey(timestamp) {
  if (!Number.isFinite(Number(timestamp)) || Number(timestamp) <= 0) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(new Date(Number(timestamp)));
}

function completedToday(account, now) {
  return shanghaiDateKey(account?.automation?.dungeonLastRunAt) === shanghaiDateKey(now);
}

export function resolveEightAccountRoute(deviceSummaries) {
  return resolveAccountRoute(deviceSummaries, REQUIRED_ROUTE);
}

export function resolveResourceSweepRoute(deviceSummaries) {
  return resolveAccountRoute(deviceSummaries,
    ["hao1", "hao2", "hao3", "hao4", "hao5", "hao6", "hao7", "hao"]);
}

export function resolveAccountRoute(deviceSummaries, labels) {
  const accounts = [];
  for (const device of deviceSummaries) {
    const reported = Array.isArray(device?.telemetry?.accounts) ? device.telemetry.accounts : [];
    for (const account of reported) {
      if (!Number.isInteger(account?.index) || typeof account?.label !== "string") continue;
      accounts.push({ deviceId: device.deviceId, accountIndex: account.index,
        accountLabel: account.label, online: true,
        automation: account.automation && typeof account.automation === "object"
          ? { ...account.automation } : {} });
    }
  }
  return labels.map((label) => {
    const match = accounts.find((account) => account.accountLabel === label);
    if (!match) throw new Error(`账号 ${label} 当前不在线或未上报`);
    return { ...match };
  });
}

export class EightAccountPlan {
  constructor({ emitAction = () => {}, now = () => Date.now(), onComplete = () => {} } = {}) {
    this.emitAction = emitAction;
    this.now = now;
    this.onComplete = onComplete;
    this.state = this.#idleState();
  }

  #idleState() {
    return { status: "idle", runId: "", startedAt: 0, updatedAt: this.now(),
      phaseStartedAt: 0, legIndex: -1, phase: "idle", mode: "daily", resumePhase: "",
      buyerStarted: false, buyerWorkflowCompleted: false,
      sellerReleased: false, sellerCleaned: false, mainBuySeen: false,
      mainBuyTimedOut: false,
      sellerCleanupDueAt: 0, equipmentHolderLabel: "hao", mainAccountLabel: "hao",
      route: [], fullRoute: [], skippedDungeonAccounts: [], items: [...EQUIPMENT_ITEMS],
      resourceItems: [...RESOURCE_ITEMS], inventoryItems: [...RESOURCE_ITEMS],
      resourceReserveCount: 1, price: 920, resourcePrice: 920,
      returnMap: "圣兽云殿", returnMaps: {},
      disconnectGraceMs: DEFAULT_DISCONNECT_GRACE_MS, disconnectedDevices: {},
      phaseTimeouts: { ...DEFAULT_PHASE_TIMEOUTS }, lastProgressAt: 0,
      lastProgressSignature: "", currentStepId: "", stepSequence: 0,
      stepLedger: [], eventLedger: [], diagnosticRequested: false,
      diagnosticReason: "", gptSuggestion: null, recoveryPending: false,
      dungeonItems: ["绘画小屋", "伊苏王的神墓", "火龙王的宫殿", "史芬克斯密穴"],
      reportEmail: "", ownerUsername: "", error: "", errorAccount: "",
      interventionDeadlineAt: 0, emailStatus: "pending", inventoryByAccount: {},
      history: [], warnings: [] };
  }

  snapshot() { return JSON.parse(JSON.stringify(this.state)); }

  restore(savedState) {
    if (!savedState || typeof savedState !== "object" || Array.isArray(savedState)) {
      return this.snapshot();
    }
    const route = Array.isArray(savedState.route) ? savedState.route : [];
    const fullRoute = Array.isArray(savedState.fullRoute) && savedState.fullRoute.length > 0
      ? savedState.fullRoute : route;
    this.state = { ...this.#idleState(), ...savedState,
      route: route.map((entry) => ({ ...entry })),
      fullRoute: fullRoute.map((entry) => ({ ...entry })),
      skippedDungeonAccounts: Array.isArray(savedState.skippedDungeonAccounts)
        ? [...savedState.skippedDungeonAccounts] : [],
      items: Array.isArray(savedState.items) && savedState.items.length >= 1
        && savedState.items.length <= 10
        ? [...savedState.items] : [...EQUIPMENT_ITEMS],
      resourceItems: Array.isArray(savedState.resourceItems)
        ? [...savedState.resourceItems] : [...RESOURCE_ITEMS],
      inventoryItems: Array.isArray(savedState.inventoryItems)
        ? [...savedState.inventoryItems] : (Array.isArray(savedState.resourceItems)
          ? [...savedState.resourceItems] : [...RESOURCE_ITEMS]),
      dungeonItems: Array.isArray(savedState.dungeonItems)
        ? [...savedState.dungeonItems] : [...this.#idleState().dungeonItems],
      resourcePrice: Number.isInteger(savedState.resourcePrice)
        ? savedState.resourcePrice : (Number.isInteger(savedState.price) ? savedState.price : 920),
      returnMaps: savedState.returnMaps && typeof savedState.returnMaps === "object"
        && !Array.isArray(savedState.returnMaps) ? { ...savedState.returnMaps } : {},
      phaseTimeouts: normalizedTimeouts(savedState.phaseTimeouts),
      disconnectedDevices: savedState.disconnectedDevices
        && typeof savedState.disconnectedDevices === "object"
        ? { ...savedState.disconnectedDevices } : {},
      stepLedger: Array.isArray(savedState.stepLedger) ? savedState.stepLedger.slice(-200) : [],
      eventLedger: Array.isArray(savedState.eventLedger) ? savedState.eventLedger.slice(-300) : [],
      history: Array.isArray(savedState.history) ? [...savedState.history] : [],
      warnings: Array.isArray(savedState.warnings) ? [...savedState.warnings] : [],
      inventoryByAccount: savedState.inventoryByAccount
        && typeof savedState.inventoryByAccount === "object"
        ? { ...savedState.inventoryByAccount } : {} };
    if (this.state.status === "running") {
      this.state.recoveryPending = true;
      const offlineAt = this.now();
      for (const account of this.#currentAccounts()) {
        this.state.disconnectedDevices[account.deviceId] = {
          offlineAt, deadlineAt: offlineAt + this.state.disconnectGraceMs,
          accountLabel: account.accountLabel
        };
      }
      this.#event("vps_recovery_started", { outstandingSteps:
        this.state.stepLedger.filter((entry) => entry.status === "dispatched").length });
    }
    if (this.state.status === "intervention") this.state.interventionDeadlineAt = 0;
    this.state.updatedAt = this.now();
    return this.snapshot();
  }

  start(route, options = {}) {
    if (["running", "intervention"].includes(this.state.status)) throw new Error("多用户挂机已在运行");
    this.#validateRoute(route);
    if (route.length < 3) throw new Error("新计划至少需要主号、一个中转账号并返回主号");
    const price = options.equipmentPrice ?? options.price ?? 920;
    const resourcePrice = options.resourcePrice ?? 920;
    const items = options.items ?? EQUIPMENT_ITEMS;
    const resourceItems = options.resourceItems ?? RESOURCE_ITEMS;
    const inventoryItems = options.inventoryItems ?? resourceItems;
    const resourceReserveCount = options.resourceReserveCount ?? 1;
    const dungeonItems = options.dungeonItems
      ?? ["绘画小屋", "伊苏王的神墓", "火龙王的宫殿", "史芬克斯密穴"];
    const returnMap = options.returnMap ?? "圣兽云殿";
    const returnMaps = options.returnMaps && typeof options.returnMaps === "object"
      && !Array.isArray(options.returnMaps) ? options.returnMaps : {};
    const reportEmail = options.reportEmail ?? "";
    const disconnectGraceMs = Number(options.disconnectGraceMs ?? DEFAULT_DISCONNECT_GRACE_MS);
    const phaseTimeouts = normalizedTimeouts(options.phaseTimeouts);
    if (!Number.isInteger(price) || price < 1 || price > 9_999_999) throw new Error("交易单价无效");
    if (!Number.isInteger(resourcePrice) || resourcePrice < 1 || resourcePrice > 9_999_999) {
      throw new Error("道具交易单价无效");
    }
    if (!Array.isArray(items) || items.length < 1 || items.length > 10
        || new Set(items).size !== items.length
        || items.some((item) => typeof item !== "string" || !item.trim() || item.length > 30)) {
      throw new Error("装备清单必须包含1–10件不重复装备");
    }
    if (!Array.isArray(resourceItems) || resourceItems.length < 1 || resourceItems.length > 10) {
      throw new Error("道具组合需包含1–10项");
    }
    if (!Array.isArray(inventoryItems) || inventoryItems.length < 1 || inventoryItems.length > 20) {
      throw new Error("统一背包检查项目需包含1–20项");
    }
    if (![0, 1].includes(resourceReserveCount)) throw new Error("道具保留数量只能是0或1");
    if (!Array.isArray(dungeonItems) || dungeonItems.length < 1 || dungeonItems.length > 20) {
      throw new Error("副本组合需包含1–20项");
    }
    if (typeof returnMap !== "string" || !returnMap.trim() || returnMap.length > 30) {
      throw new Error("返回挂机副本无效");
    }
    const normalizedReturnMaps = {};
    for (const entry of route.slice(0, -1)) {
      const value = typeof returnMaps[entry.accountLabel] === "string"
        ? returnMaps[entry.accountLabel].trim() : returnMap.trim();
      if (!value || value.length > 30) throw new Error(`${entry.accountLabel} 返回挂机副本无效`);
      normalizedReturnMaps[entry.accountLabel] = value;
    }
    if (typeof reportEmail !== "string"
        || (reportEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(reportEmail.trim()))) {
      throw new Error("报告邮箱格式无效");
    }
    if (!Number.isFinite(disconnectGraceMs) || disconnectGraceMs < 30_000
        || disconnectGraceMs > 600_000) throw new Error("断线宽限期需为30–600秒");
    const now = this.now();
    const fullRoute = route.map((entry) => ({ ...entry,
      dungeonCompletedToday: completedToday(entry, now) }));
    // The equipment is only relayed through accounts that still need today's dungeon.
    // Always keep the confirmed holder at the start and the main account at the end so
    // the set returns to its configured owner after the remaining work is complete.
    const activeRoute = this.#remainingRoute(fullRoute, route[0].accountLabel, now);
    const skippedDungeonAccounts = fullRoute.slice(1, -1)
      .filter((entry) => entry.dungeonCompletedToday)
      .map((entry) => entry.accountLabel);
    this.state = { ...this.#idleState(), status: "running", runId: crypto.randomUUID(),
      startedAt: now, updatedAt: now, phaseStartedAt: now, legIndex: 0,
      phase: "starting_leg", route: activeRoute.map((entry) => ({ ...entry })), items: [...items],
      fullRoute: fullRoute.map((entry) => ({ ...entry })), skippedDungeonAccounts,
      mainAccountLabel: route[0].accountLabel,
      resourceItems: [...new Set(resourceItems.map((item) => String(item).trim()).filter(Boolean))],
      inventoryItems: [...new Set(inventoryItems.map((item) => String(item).trim()).filter(Boolean))],
      resourceReserveCount,
      dungeonItems: [...new Set(dungeonItems.map((item) => String(item).trim()).filter(Boolean))],
      price, resourcePrice, returnMap: returnMap.trim(), returnMaps: normalizedReturnMaps,
      disconnectGraceMs: Math.round(disconnectGraceMs), phaseTimeouts,
      lastProgressAt: now,
      reportEmail: reportEmail.trim(),
      ownerUsername: String(options.ownerUsername ?? "").trim() };
    if (this.state.route.length === 2) {
      if (completedToday(this.state.route[0], now)) this.#startMainBuy(this.state.route[0]);
      else this.#startStandaloneMain(this.state.route[0]);
      return this.snapshot();
    }
    this.#startCurrentLeg();
    return this.snapshot();
  }

  startResourceSweep(route, options = {}) {
    if (["running", "intervention"].includes(this.state.status)) throw new Error("已有多用户任务正在运行");
    if (!Array.isArray(route) || route.length < 2 || route.length > 9) {
      throw new Error("资源归集至少需要一个卖方账号和一个主号");
    }
    const resourceLabels = route.map((entry) => entry?.accountLabel);
    if (resourceLabels.some((label) => typeof label !== "string" || !label.trim())
        || new Set(resourceLabels).size !== resourceLabels.length) {
      throw new Error("资源归集账号不能为空或重复");
    }
    const resourceItems = options.resourceItems ?? RESOURCE_ITEMS;
    const resourceReserveCount = options.resourceReserveCount ?? 1;
    const resourcePrice = options.resourcePrice ?? 920;
    const returnMap = String(options.returnMap ?? "圣兽云殿").trim();
    const returnMaps = options.returnMaps && typeof options.returnMaps === "object"
      && !Array.isArray(options.returnMaps) ? options.returnMaps : {};
    if (!Array.isArray(resourceItems) || resourceItems.length < 1 || resourceItems.length > 10) {
      throw new Error("道具组合需包含1–10项");
    }
    if (![0, 1].includes(resourceReserveCount)) throw new Error("道具保留数量只能是0或1");
    if (!Number.isInteger(resourcePrice) || resourcePrice < 1 || resourcePrice > 9_999_999) {
      throw new Error("道具交易单价无效");
    }
    if (!returnMap || returnMap.length > 30) throw new Error("返回挂机副本无效");
    const normalizedReturnMaps = {};
    for (const entry of route) {
      const value = typeof returnMaps[entry.accountLabel] === "string"
        ? returnMaps[entry.accountLabel].trim() : returnMap;
      if (!value || value.length > 30) throw new Error(`${entry.accountLabel} 返回挂机副本无效`);
      normalizedReturnMaps[entry.accountLabel] = value;
    }
    const now = this.now();
    this.state = { ...this.#idleState(), status: "running", mode: "resource_sweep",
      runId: crypto.randomUUID(), startedAt: now, updatedAt: now, phaseStartedAt: now,
      legIndex: 0, phase: "resource_auction_running",
      route: route.map((entry) => ({ ...entry })),
      mainAccountLabel: route.at(-1).accountLabel,
      resourceItems: [...new Set(resourceItems.map((item) => String(item).trim()).filter(Boolean))],
      inventoryItems: [...new Set(resourceItems.map((item) => String(item).trim()).filter(Boolean))],
      resourceReserveCount, price: 920, resourcePrice, returnMap,
      disconnectGraceMs: Math.round(Number(options.disconnectGraceMs)
        || DEFAULT_DISCONNECT_GRACE_MS), phaseTimeouts: normalizedTimeouts(options.phaseTimeouts),
      lastProgressAt: now,
      returnMaps: normalizedReturnMaps,
      ownerUsername: String(options.ownerUsername ?? "").trim() };
    this.#startResourceAuction(this.state.route[0]);
    return this.snapshot();
  }

  cancel(reason = "用户中断") {
    if (!["running", "intervention"].includes(this.state.status)) return this.snapshot();
    const leg = this.#currentLeg();
    for (const account of [leg?.seller, leg?.buyer]) {
      if (account) this.#command(account, "cancel_automation", { accountIndex: account.accountIndex });
    }
    const resumePhase = this.state.status === "intervention"
      ? this.state.resumePhase : this.state.phase;
    Object.assign(this.state, { status: "cancelled", phase: "cancelled", resumePhase,
      error: reason,
      interventionDeadlineAt: 0, updatedAt: this.now() });
    return this.snapshot();
  }

  retry() {
    if (this.state.status !== "intervention") throw new Error("当前没有等待人工处理的错误");
    const phase = this.state.resumePhase;
    Object.assign(this.state, { status: "running", error: "", errorAccount: "",
      interventionDeadlineAt: 0, phaseStartedAt: this.now() });
    if (this.state.mode === "resource_sweep") {
      this.#startResourceAuction(this.state.route[this.state.legIndex]);
      return this.snapshot();
    }
    if (["seller_running", "buyer_running"].includes(phase)) {
      this.#resumeEquipmentLeg();
    } else if (phase === "resource_auction_running") {
      this.#startResourceAuction(this.#currentLeg().buyer);
    } else if (phase === "main_buy_running") {
      this.#startMainBuy(this.#currentLeg().buyer);
    } else if (phase === "standalone_main_running") {
      this.#startStandaloneMain(this.#currentLeg().buyer);
    } else {
      return this.#intervene("无法判断需要重试的阶段", "当前账号");
    }
    return this.snapshot();
  }

  resume(liveRoute, confirmedHolderLabel = "") {
    if (!["intervention", "error", "cancelled"].includes(this.state.status)) {
      throw new Error("当前计划不需要恢复");
    }
    const interruptedLeg = this.#currentLeg();
    const resumeBuyerInPlace = this.state.mode === "daily"
      && this.state.resumePhase === "buyer_running"
      && interruptedLeg?.buyer?.accountLabel === confirmedHolderLabel
      // Only skip the remaining exchange work after telemetry proved the complete
      // target set reached the buyer.  During a network outage the phase can already
      // be buyer_running while pieces are still split between both accounts.
      && this.state.equipmentHolderLabel === confirmedHolderLabel;
    this.#refreshRouteBindings(liveRoute);
    if (this.state.mode === "daily") {
      if (!confirmedHolderLabel) throw new Error("请先人工确认目标套装所在账号");
      const holderIndex = liveRoute.findIndex((entry, index) =>
        index < liveRoute.length - 1 && entry.accountLabel === confirmedHolderLabel);
      if (holderIndex < 0) throw new Error(`确认的套装账号 ${confirmedHolderLabel} 不在当前路线中`);
      this.state.equipmentHolderLabel = confirmedHolderLabel;
      if (!resumeBuyerInPlace) {
        const now = this.now();
        const fullRoute = liveRoute.map((entry) => ({ ...entry,
          dungeonCompletedToday: completedToday(entry, now) }));
        this.state.fullRoute = fullRoute.map((entry) => ({ ...entry }));
        this.state.route = this.#remainingRoute(fullRoute, confirmedHolderLabel, now);
        this.state.skippedDungeonAccounts = fullRoute.slice(holderIndex + 1, -1)
          .filter((entry) => entry.dungeonCompletedToday)
          .map((entry) => entry.accountLabel);
        this.state.legIndex = 0;
        this.state.phase = "seller_running";
        this.state.resumePhase = "seller_running";
        this.state.buyerStarted = false;
        this.state.buyerWorkflowCompleted = false;
        this.state.sellerReleased = false;
        this.state.sellerCleaned = false;
        this.state.sellerCleanupDueAt = 0;
        this.state.mainBuySeen = false;
      }
    }
    if (this.state.status !== "intervention") {
      const phase = this.state.resumePhase;
      if (!phase || ["idle", "complete", "cancelled", "error"].includes(phase)) {
        throw new Error("中断记录缺少可恢复阶段");
      }
      Object.assign(this.state, { status: "intervention", phase,
        error: `准备从${this.state.equipmentHolderLabel || "当前账号"}继续`,
        errorAccount: this.state.equipmentHolderLabel || "当前账号",
        interventionDeadlineAt: 0, updatedAt: this.now() });
    }
    if (this.state.mode === "daily" && this.state.route.length === 2
        && this.state.route[0].accountLabel === this.state.route[1].accountLabel) {
      Object.assign(this.state, { status: "running", error: "", errorAccount: "",
        interventionDeadlineAt: 0, phaseStartedAt: this.now() });
      if (completedToday(this.state.route[0], this.now())) this.#startMainBuy(this.state.route[0]);
      else this.#startStandaloneMain(this.state.route[0]);
      return this.snapshot();
    }
    if (this.state.mode === "daily" && !resumeBuyerInPlace
        && this.state.resumePhase === "seller_running") {
      Object.assign(this.state, { status: "running", error: "", errorAccount: "",
        interventionDeadlineAt: 0, phaseStartedAt: this.now() });
      this.#startCurrentLeg({ recoverPartialTransfer: true });
      return this.snapshot();
    }
    return this.retry();
  }

  tick() {
    if (this.state.status === "running") {
      for (const [deviceId, offline] of Object.entries(this.state.disconnectedDevices || {})) {
        if (this.now() < Number(offline?.deadlineAt || 0)) continue;
        const account = this.#currentAccounts().find((entry) => entry?.deviceId === deviceId);
        if (account) return this.#intervene(
          `设备 ${deviceId} 超过${Math.round(this.state.disconnectGraceMs / 1000)}秒未重连`,
          account.accountLabel);
        delete this.state.disconnectedDevices[deviceId];
      }
      const timeout = Number(this.state.phaseTimeouts?.[this.state.phase] || 0);
      const waitingForReconnect = Object.keys(this.state.disconnectedDevices || {}).length > 0;
      if (!waitingForReconnect && timeout > 0 && this.state.lastProgressAt > 0
          && this.now() - this.state.lastProgressAt >= timeout) {
        return this.#intervene(
          `阶段 ${this.state.phase} 已连续${Math.round(timeout / 1000)}秒无可验证进展`,
          this.#currentLeg()?.buyer?.accountLabel || this.state.equipmentHolderLabel || "当前账号");
      }
    }
    if (this.state.status === "running" && this.state.phase === "main_buy_running"
        && !this.state.mainBuyTimedOut
        && this.now() - this.state.phaseStartedAt >= MAIN_BUY_TIMEOUT_MS) {
      const account = this.state.mode === "resource_sweep"
        ? this.state.route[this.state.legIndex] : this.#currentLeg()?.buyer;
      if (account) {
        this.state.mainBuyTimedOut = true;
        this.state.mainBuySeen = true;
        this.state.updatedAt = this.now();
        this.#command(account, "cancel_automation", { accountIndex: account.accountIndex });
        this.#command(account, "configure_return_hang", {
          accountIndex: account.accountIndex, map: this.#returnMapFor(account) });
        this.#command(account, "run_temple_guard", { accountIndex: account.accountIndex });
      }
    }
    if (this.state.status === "running" && this.state.mode === "daily"
        && this.state.sellerCleanupDueAt > 0
        && this.now() >= this.state.sellerCleanupDueAt) {
      this.#releaseScheduledSeller();
    }
    return this.snapshot();
  }

  updateEmailStatus(status) {
    this.state.emailStatus = String(status || "unknown").slice(0, 120);
    this.state.updatedAt = this.now();
    return this.snapshot();
  }

  onDeviceOffline(deviceId) {
    if (this.state.status !== "running") return this.snapshot();
    const account = this.#currentAccounts().find((entry) => entry?.deviceId === deviceId);
    if (account) {
      const offlineAt = this.now();
      this.state.disconnectedDevices[deviceId] = {
        offlineAt, deadlineAt: offlineAt + this.state.disconnectGraceMs,
        accountLabel: account.accountLabel
      };
      this.#event("device_offline", { deviceId, accountLabel: account.accountLabel,
        deadlineAt: offlineAt + this.state.disconnectGraceMs });
      this.state.updatedAt = offlineAt;
    }
    return this.snapshot();
  }

  onDeviceOnline(deviceId) {
    if (!this.state.disconnectedDevices?.[deviceId]) return this.snapshot();
    const offlineAt = Number(this.state.disconnectedDevices[deviceId].offlineAt || 0);
    delete this.state.disconnectedDevices[deviceId];
    this.state.recoveryPending = Object.keys(this.state.disconnectedDevices).length > 0;
    this.#event("device_reconnected", { deviceId,
      outageMs: Math.max(0, this.now() - offlineAt) });
    this.state.lastProgressAt = this.now();
    this.state.updatedAt = this.now();
    return this.snapshot();
  }

  isDeviceInGrace(deviceId) {
    const entry = this.state.disconnectedDevices?.[deviceId];
    return Boolean(entry && this.now() < Number(entry.deadlineAt || 0));
  }

  onTelemetry(deviceId, telemetry) {
    if (this.state.status !== "running") return this.snapshot();
    this.onDeviceOnline(deviceId);
    const signature = this.#progressSignature(deviceId, telemetry);
    if (signature && signature !== this.state.lastProgressSignature) {
      this.state.lastProgressSignature = signature;
      this.state.lastProgressAt = this.now();
      this.#event("progress", { deviceId, phase: this.state.phase });
    }
    if (this.state.mode === "resource_sweep") {
      return this.#onResourceSweepTelemetry(deviceId, telemetry);
    }
    const leg = this.#currentLeg();
    if (!leg) return this.#intervene("计划交接序号无效", "系统");
    const seller = this.#automationFor(leg.seller, deviceId, telemetry);
    const buyer = this.#automationFor(leg.buyer, deviceId, telemetry);
    if (this.state.phase === "standalone_main_running" && buyer) {
      if (buyer.status === "error" && !this.state.mainBuyTimedOut) {
        return this.#handleAccountFailure(leg.buyer,
          `${this.state.mainAccountLabel} 副本执行失败：${buyer.lastMessage || "未知错误"}`);
      }
      if (this.#standaloneMainComplete(buyer)) {
        this.#captureInventory(leg.buyer, buyer);
        this.#startMainBuy(leg.buyer);
      }
      return this.snapshot();
    }
    if (["seller_running", "buyer_running"].includes(this.state.phase)) {
      if (buyer) {
        this.#scheduleSellerAfterTransfer(leg, buyer);
        if (this.state.sellerCleanupDueAt > 0
            && this.now() >= this.state.sellerCleanupDueAt) this.#releaseScheduledSeller();
      }
      if (!this.state.sellerReleased
          && seller?.task === "equipment_sell" && seller.status === "error") {
        return this.#handleAccountFailure(leg.seller,
          `${leg.seller.accountLabel} 上架失败：${seller.lastMessage || "未知错误"}`);
      }
      if (buyer?.status === "error") {
        return this.#handleAccountFailure(leg.buyer,
          `${leg.buyer.accountLabel} 执行失败：${buyer.lastMessage || "未知错误"}`);
      }
      if (this.state.sellerReleased && seller?.task === "seller_cleanup"
          && seller.status === "error") {
        return this.#handleAccountFailure(leg.seller,
          `${leg.seller.accountLabel} 重新穿戴或返回挂机失败：${seller.lastMessage || "未知错误"}`,
          { sellerCleanup: true });
      }
      if (this.state.sellerReleased && seller?.task === "temple" && seller.status === "ok"
          && this.#freshValue(leg.seller, seller, "updatedAt")
          && this.#freshValue(leg.seller, seller, "finalEquipLastRunAt")) {
        this.state.sellerCleaned = true;
      }
      if (!this.state.buyerStarted && seller?.task === "equipment_sell" && seller.status === "running"
          && Number(seller.equipmentListedInBatch) > 0) {
        this.state.buyerStarted = true;
        this.state.phase = "buyer_running";
        this.state.updatedAt = this.now();
        this.#command(leg.buyer, "run_equipment_buy", { accountIndex: leg.buyer.accountIndex });
      }
      if (buyer && this.state.buyerStarted && this.#buyerWorkflowComplete(buyer)) {
        this.state.buyerWorkflowCompleted = true;
        this.#captureInventory(leg.buyer, buyer);
        this.state.updatedAt = this.now();
      }
      // The buyer and seller can report from different devices. Keep both
      // completion facts so whichever report arrives last advances the plan.
      if (this.state.sellerCleaned && this.state.buyerWorkflowCompleted) {
        if (leg.buyer.accountLabel === this.state.mainAccountLabel) this.#startMainBuy(leg.buyer);
        else this.#startResourceAuction(leg.buyer);
      }
      return this.snapshot();
    }
    if (this.state.phase === "resource_auction_running" && buyer) {
      if (buyer.status === "error") {
        return this.#intervene(`${leg.buyer.accountLabel} 道具上架失败：${buyer.lastMessage || "未知错误"}`,
          leg.buyer.accountLabel);
      }
      const auctionDone = this.#freshValue(leg.buyer, buyer, "auctionLastRunAt");
      const returned = buyer.task === "temple" && buyer.status === "ok"
        && this.#freshValue(leg.buyer, buyer, "updatedAt");
      if (auctionDone && returned) this.#completeLeg();
      return this.snapshot();
    }
    if (this.state.phase === "main_buy_running" && buyer) {
      if (buyer.task === "auction_buy" && buyer.status === "running") this.state.mainBuySeen = true;
      if (buyer.status === "error" && !this.state.mainBuyTimedOut) {
        return this.#intervene(`${this.state.mainAccountLabel} 道具购买失败：${buyer.lastMessage || "未知错误"}`,
          this.state.mainAccountLabel);
      }
      const returned = this.state.mainBuySeen && buyer.task === "temple" && buyer.status === "ok"
        && this.#freshValue(leg.buyer, buyer, "updatedAt");
      if (returned) this.#completeLeg();
    }
    return this.snapshot();
  }

  #onResourceSweepTelemetry(deviceId, telemetry) {
    const account = this.state.route[this.state.legIndex];
    if (!account) return this.#intervene("资源归集账号序号无效", "系统");
    const automation = this.#automationFor(account, deviceId, telemetry);
    if (!automation) return this.snapshot();
    if (automation.status === "error"
        && !(this.state.phase === "main_buy_running" && this.state.mainBuyTimedOut)) {
      return this.#intervene(`${account.accountLabel} 资源归集失败：${automation.lastMessage || "未知错误"}`,
        account.accountLabel);
    }
    const returned = automation.task === "temple" && automation.status === "ok"
      && Number(automation.updatedAt) >= this.state.phaseStartedAt;
    if (account.accountLabel !== this.state.mainAccountLabel) {
      const auctionDone = Number(automation.auctionLastRunAt) >= this.state.phaseStartedAt;
      if (!auctionDone || !returned) return this.snapshot();
      this.state.history.push({ account: account.accountLabel, completedAt: this.now(), result: "success" });
      this.state.legIndex++;
      this.#startResourceAuction(this.state.route[this.state.legIndex]);
      return this.snapshot();
    }
    if (automation.task === "auction_buy" && automation.status === "running") {
      this.state.mainBuySeen = true;
    }
    if (this.state.mainBuySeen && returned) {
      for (const target of this.state.route) {
        this.#command(target, "configure_return_hang", {
          accountIndex: target.accountIndex, map: this.#returnMapFor(target) });
        this.#command(target, "run_temple_guard", { accountIndex: target.accountIndex });
      }
      this.state.history.push({ account: this.state.mainAccountLabel,
        completedAt: this.now(), result: this.state.mainBuyTimedOut
          ? "success_purchase_skipped" : "success" });
      Object.assign(this.state, { status: "success", phase: "complete", updatedAt: this.now() });
    }
    return this.snapshot();
  }

  #buyerWorkflowComplete(automation) {
    const buyer = this.#currentLeg()?.buyer;
    return !automation.equipmentVerificationToken
      && this.#freshValue(buyer, automation, "equipmentTransferLastRunAt")
      && this.#freshValue(buyer, automation, "dungeonLastRunAt")
      && this.#freshValue(buyer, automation, "finalEquipLastRunAt")
      && this.#freshValue(buyer, automation, "inventoryLastRunAt")
      && automation.inventoryStatus === "ok"
      && automation.task === "temple" && automation.status === "ok";
  }

  #standaloneMainComplete(automation) {
    const account = this.state.route[0];
    return this.#freshValue(account, automation, "dungeonLastRunAt")
      && this.#freshValue(account, automation, "finalEquipLastRunAt")
      && this.#freshValue(account, automation, "inventoryLastRunAt")
      && automation.inventoryStatus === "ok"
      && automation.task === "temple" && automation.status === "ok";
  }

  #scheduleSellerAfterTransfer(leg, buyerAutomation) {
    if (buyerAutomation.equipmentVerificationToken) return;
    if (this.state.sellerReleased || this.state.sellerCleanupDueAt > 0) return;
    if (!this.#freshValue(leg.buyer, buyerAutomation, "equipmentTransferLastRunAt")) return;
    this.state.equipmentHolderLabel = leg.buyer.accountLabel;
    // The buyer only records equipmentTransferLastRunAt after all target pieces
    // have been purchased and audited.  At that point the seller no longer needs
    // to poll the exchange, so release it immediately before stale page controls
    // can turn a completed transfer into a false listing error.
    this.state.sellerCleanupDueAt = this.now();
    this.state.updatedAt = this.now();
  }

  #releaseScheduledSeller() {
    const leg = this.#currentLeg();
    if (!leg || this.state.sellerReleased || this.state.sellerCleanupDueAt <= 0) return;
    this.state.sellerReleased = true;
    this.state.sellerCleanupDueAt = 0;
    this.state.updatedAt = this.now();
    this.#command(leg.seller, "cancel_automation", { accountIndex: leg.seller.accountIndex });
    this.#command(leg.seller, "configure_return_hang", {
      accountIndex: leg.seller.accountIndex, map: this.#returnMapFor(leg.seller) });
    this.#command(leg.seller, "run_seller_cleanup", { accountIndex: leg.seller.accountIndex });
  }

  #handleAccountFailure(account, message, { sellerCleanup = false } = {}) {
    if (account.accountLabel === this.state.equipmentHolderLabel) {
      return this.#intervene(`${message}；厄菲斯神套装可能在该账号，请人工确认`,
        account.accountLabel);
    }
    this.state.history.push({ account: account.accountLabel, completedAt: this.now(),
      result: "skipped_error", message });
    if (sellerCleanup) {
      this.state.sellerCleaned = true;
      this.state.updatedAt = this.now();
      return this.snapshot();
    }
    const leg = this.#currentLeg();
    if (leg && account.accountLabel === leg.buyer.accountLabel) {
      // The seller may still be polling its current listing batch. Stop that run before
      // reconfiguring it for the next buyer, otherwise Android correctly refuses to
      // start a second equipment_sell task while the first one is busy.
      this.#command(leg.seller, "cancel_automation", {
        accountIndex: leg.seller.accountIndex });
      this.state.route.splice(this.state.legIndex + 1, 1);
      this.state.buyerStarted = false;
      this.state.buyerWorkflowCompleted = false;
      this.state.sellerReleased = false;
      this.state.sellerCleaned = false;
      this.state.sellerCleanupDueAt = 0;
      this.state.mainBuySeen = false;
      this.state.mainBuyTimedOut = false;
      if (this.state.route.length <= this.state.legIndex + 1) {
        return this.#intervene("跳过异常账号后已无下一账号", account.accountLabel);
      }
      this.state.phase = "starting_leg";
      this.#startCurrentLeg();
      return this.snapshot();
    }
    return this.#intervene(message, account.accountLabel);
  }

  #resumeEquipmentLeg() {
    const leg = this.#currentLeg();
    if (!leg) return this.#intervene("恢复时未找到当前装备交接账号", "系统");
    if (this.state.equipmentHolderLabel !== leg.buyer.accountLabel) {
      this.state.buyerStarted = false;
      this.state.buyerWorkflowCompleted = false;
      this.#startCurrentLeg();
      return;
    }
    this.state.phase = "buyer_running";
    this.state.buyerStarted = true;
    this.state.buyerWorkflowCompleted = false;
    this.state.updatedAt = this.now();
    if (!this.state.sellerCleaned) {
      this.state.sellerReleased = true;
      this.#command(leg.seller, "cancel_automation", { accountIndex: leg.seller.accountIndex });
      this.#command(leg.seller, "configure_return_hang", {
        accountIndex: leg.seller.accountIndex, map: this.#returnMapFor(leg.seller) });
      this.#command(leg.seller, "run_seller_cleanup", { accountIndex: leg.seller.accountIndex });
    }
    this.#command(leg.buyer, "run_dungeon_sequence", { accountIndex: leg.buyer.accountIndex });
  }

  #refreshRouteBindings(liveRoute) {
    this.#validateRoute(liveRoute);
    const byLabel = new Map(liveRoute.map((entry) => [entry.accountLabel, entry]));
    this.state.route = this.state.route.map((entry) => {
      const live = byLabel.get(entry.accountLabel);
      if (!live) throw new Error(`账号 ${entry.accountLabel} 当前不在线`);
      return { ...entry, deviceId: live.deviceId, accountIndex: live.accountIndex,
        online: true, automation: { ...(live.automation || {}) } };
    });
    this.state.fullRoute = liveRoute.map((entry) => ({ ...entry }));
  }

  #remainingRoute(fullRoute, holderLabel, now) {
    const holderIndex = fullRoute.findIndex((entry, index) =>
      index < fullRoute.length - 1 && entry.accountLabel === holderLabel);
    if (holderIndex < 0) throw new Error(`确认的套装账号 ${holderLabel} 不在当前路线中`);
    const holder = { ...fullRoute[holderIndex], dungeonCompletedToday:
      completedToday(fullRoute[holderIndex], now) };
    const remaining = fullRoute.slice(holderIndex + 1, -1)
      .filter((entry) => !completedToday(entry, now))
      .map((entry) => ({ ...entry, dungeonCompletedToday: false }));
    const main = { ...fullRoute.at(-1), dungeonCompletedToday:
      completedToday(fullRoute.at(-1), now) };
    return [holder, ...remaining, main];
  }

  #captureInventory(account, automation) {
    const source = automation.inventoryCounts && typeof automation.inventoryCounts === "object"
      ? automation.inventoryCounts : {};
    const counts = {};
    for (const item of this.state.inventoryItems) counts[item] = Number(source[item]) || 0;
    this.state.inventoryByAccount[account.accountLabel] = counts;
  }

  #startResourceAuction(account) {
    Object.assign(this.state, { phase: "resource_auction_running", phaseStartedAt: this.now(),
      updatedAt: this.now() });
    this.#configureResourcesAndReturn(account);
    if (account.accountLabel === this.state.mainAccountLabel) {
      this.state.mainBuySeen = false;
      this.state.mainBuyTimedOut = false;
      this.state.phase = "main_buy_running";
      this.#command(account, "run_auction_buy", { accountIndex: account.accountIndex });
    } else {
      this.#command(account, "run_auto_auction", { accountIndex: account.accountIndex });
    }
  }

  #startMainBuy(account) {
    Object.assign(this.state, { phase: "main_buy_running", phaseStartedAt: this.now(),
      updatedAt: this.now(), mainBuySeen: false, mainBuyTimedOut: false });
    this.#configureResourcesAndReturn(account);
    this.#command(account, "run_auction_buy", { accountIndex: account.accountIndex });
  }

  #advanceCompletedWorkflows() {
    // The set is already confirmed on the buyer once buyerWorkflowCompleted is
    // true.  Seller cleanup is best-effort housekeeping and some WebViews do
    // not emit a fresh finalEquipLastRunAt when the seller has nothing left to
    // change.  Waiting for that optional timestamp used to strand the route
    // after the buyer returned to its configured hang map.
    if (!this.state.sellerReleased || !this.state.buyerWorkflowCompleted) return;
    const leg = this.#currentLeg();
    if (!leg) return;
    if (leg.buyer.accountLabel === this.state.mainAccountLabel) this.#startMainBuy(leg.buyer);
    else this.#startResourceAuction(leg.buyer);
  }

  #skipMainBuyAndReturn(account, reason) {
    this.state.mainBuyTimedOut = true;
    this.state.mainBuySeen = true;
    this.state.updatedAt = this.now();
    this.state.mainBuySkipReason = reason;
    this.#command(account, "cancel_automation", { accountIndex: account.accountIndex });
    this.#command(account, "configure_return_hang", {
      accountIndex: account.accountIndex, map: this.#returnMapFor(account) });
    this.#command(account, "run_temple_guard", { accountIndex: account.accountIndex });
  }

  #startStandaloneMain(account) {
    Object.assign(this.state, { phase: "standalone_main_running", phaseStartedAt: this.now(),
      updatedAt: this.now(), equipmentHolderLabel: account.accountLabel });
    this.#command(account, "configure_inventory_monitor", {
      accountIndex: account.accountIndex, items: [...this.state.inventoryItems] });
    this.#command(account, "configure_dungeon_sequence", {
      accountIndex: account.accountIndex, items: [...this.state.dungeonItems] });
    this.#command(account, "configure_return_hang", {
      accountIndex: account.accountIndex, map: this.#returnMapFor(account) });
    this.#command(account, "run_dungeon_sequence", { accountIndex: account.accountIndex });
  }

  #configureResourcesAndReturn(account) {
    this.#command(account, "configure_auto_auction", { accountIndex: account.accountIndex,
      enabled: false, items: [...this.state.resourceItems], buyer: this.state.mainAccountLabel,
      price: this.state.resourcePrice, reserveCount: this.state.resourceReserveCount,
      intervalHours: 24 });
    this.#command(account, "configure_return_hang", {
      accountIndex: account.accountIndex, map: this.#returnMapFor(account) });
  }

  #completeLeg() {
    const leg = this.#currentLeg();
    this.state.history.push({ legIndex: this.state.legIndex, seller: leg.seller.accountLabel,
      buyer: leg.buyer.accountLabel, completedAt: this.now(),
      result: this.state.mainBuyTimedOut ? "success_purchase_skipped" : "success" });
    if (this.state.legIndex >= this.state.route.length - 2) {
      Object.assign(this.state, { status: "success", phase: "complete", updatedAt: this.now() });
      Promise.resolve(this.onComplete(this.snapshot())).catch(() => {});
      return;
    }
    this.state.legIndex += 1;
    this.state.buyerStarted = false;
    this.state.buyerWorkflowCompleted = false;
    this.state.sellerReleased = false;
    this.state.sellerCleaned = false;
    this.state.sellerCleanupDueAt = 0;
    this.state.mainBuySeen = false;
    this.state.mainBuyTimedOut = false;
    this.state.phase = "starting_leg";
    this.#startCurrentLeg();
  }

  #automationFor(account, deviceId, telemetry) {
    if (account.deviceId !== deviceId) return null;
    const accounts = Array.isArray(telemetry?.accounts) ? telemetry.accounts : [];
    return accounts.find((entry) => entry?.index === account.accountIndex)?.automation ?? null;
  }

  #freshValue(account, automation, field) {
    const current = Number(automation?.[field]);
    const baseline = Number(account?.automation?.[field]);
    return Number.isFinite(current) && current > 0
      && current > (Number.isFinite(baseline) && baseline > 0 ? baseline : 0);
  }

  #currentLeg() {
    if (this.state.legIndex < 0 || this.state.legIndex >= this.state.route.length - 1) return null;
    return { seller: this.state.route[this.state.legIndex], buyer: this.state.route[this.state.legIndex + 1] };
  }

  #startCurrentLeg({ recoverPartialTransfer = false } = {}) {
    const leg = this.#currentLeg();
    if (!leg) return this.#intervene("计划交接序号无效", "系统");
    this.state.sellerReleased = false;
    this.state.buyerWorkflowCompleted = false;
    this.state.sellerCleanupDueAt = 0;
    this.state.phaseStartedAt = this.now();
    this.state.equipmentHolderLabel = leg.seller.accountLabel;
    const common = { items: [...this.state.items], price: this.state.price };
    this.#command(leg.seller, "configure_equipment_transfer", {
      accountIndex: leg.seller.accountIndex, ...common, buyer: leg.buyer.accountLabel });
    this.#command(leg.buyer, "configure_equipment_transfer", {
      accountIndex: leg.buyer.accountIndex, ...common, buyer: "" });
    this.#command(leg.buyer, "configure_inventory_monitor", {
      accountIndex: leg.buyer.accountIndex, items: [...this.state.inventoryItems] });
    this.#command(leg.buyer, "configure_dungeon_sequence", {
      accountIndex: leg.buyer.accountIndex, items: [...this.state.dungeonItems] });
    this.#command(leg.buyer, "configure_return_hang", {
      accountIndex: leg.buyer.accountIndex, map: this.#returnMapFor(leg.buyer) });
    this.#command(leg.seller, "run_equipment_sell", { accountIndex: leg.seller.accountIndex });
    if (recoverPartialTransfer) {
      this.state.buyerStarted = true;
      this.#command(leg.buyer, "run_equipment_buy", {
        accountIndex: leg.buyer.accountIndex,
        sellerAccountIndex: leg.seller.deviceId === leg.buyer.deviceId
          ? leg.seller.accountIndex : -1,
        recovery: true
      });
      this.state.phase = "buyer_running";
      this.state.resumePhase = "buyer_running";
    } else {
      this.state.phase = "seller_running";
    }
    this.state.updatedAt = this.now();
  }

  #command(account, command, parameters) {
    const stepId = `${this.state.runId}:${this.state.legIndex}:${++this.state.stepSequence}`;
    const step = { stepId, deviceId: account.deviceId, accountLabel: account.accountLabel,
      command, accountIndex: parameters?.accountIndex, legIndex: this.state.legIndex,
      phase: this.state.phase, parameters: JSON.parse(JSON.stringify(parameters || {})),
      status: "dispatched", createdAt: this.now(), updatedAt: this.now() };
    this.state.currentStepId = stepId;
    this.state.stepLedger.push(step);
    if (this.state.stepLedger.length > 200) this.state.stepLedger.splice(0,
      this.state.stepLedger.length - 200);
    this.#event("step_dispatched", { stepId, command, accountLabel: account.accountLabel });
    this.emitAction({ deviceId: account.deviceId, accountLabel: account.accountLabel,
      command, parameters, runId: this.state.runId, legIndex: this.state.legIndex,
      phase: this.state.phase, stepId });
  }

  #returnMapFor(account) {
    const label = account?.accountLabel;
    const configured = label && this.state.returnMaps
      ? this.state.returnMaps[label] : "";
    return typeof configured === "string" && configured.trim()
      ? configured.trim() : this.state.returnMap;
  }

  onCommandResult(action, success, message = "") {
    const step = action?.stepId
      ? this.state.stepLedger.find((entry) => entry.stepId === action.stepId) : null;
    if (step) Object.assign(step, { status: success ? "acknowledged" : "failed",
      success: Boolean(success), message: String(message || "").slice(0, 240), updatedAt: this.now() });
    if (action?.stepId) this.#event(success ? "step_acknowledged" : "step_failed",
      { stepId: action.stepId, command: action.command, message: String(message || "").slice(0, 160) });
    if (!action || action.runId !== this.state.runId || this.state.status !== "running") {
      return this.snapshot();
    }
    if (action.legIndex !== this.state.legIndex) return this.snapshot();
    if (!success) {
      const leg = this.#currentLeg();
      const postTransferCleanup = ["cancel_automation", "configure_return_hang",
        "run_seller_cleanup"].includes(action.command)
        && action.accountLabel === leg?.seller?.accountLabel
        && this.state.equipmentHolderLabel === leg?.buyer?.accountLabel;
      if (postTransferCleanup) {
        this.state.warnings.push({ account: action.accountLabel, createdAt: this.now(),
          result: "seller_cleanup_warning",
          message: `${action.command} 未完成：${String(message || "APP拒绝命令").slice(0, 120)}` });
        this.state.sellerCleaned = true;
        this.state.updatedAt = this.now();
        return this.snapshot();
      }
      if (this.state.phase === "main_buy_running" && action.command === "run_auction_buy") {
        const account = this.#currentLeg()?.buyer || this.state.route[this.state.legIndex];
        if (account) {
          this.#skipMainBuyAndReturn(account,
            `${action.accountLabel} 按设置价格 ${this.state.resourcePrice} 金币购买命令失败：${String(message || "APP拒绝命令").slice(0, 120)}`);
          return this.snapshot();
        }
      }
      return this.#intervene(
        `${action.accountLabel} 未能执行 ${action.command}：${String(message || "APP拒绝命令").slice(0, 120)}`,
        action.accountLabel);
    }
    return this.snapshot();
  }

  #intervene(message, accountLabel) {
    this.state.resumePhase = this.state.phase;
    Object.assign(this.state, { status: "intervention", error: message, errorAccount: accountLabel,
      interventionDeadlineAt: 0, diagnosticRequested: true,
      diagnosticReason: String(message || "").slice(0, 240), updatedAt: this.now() });
    this.#event("intervention", { accountLabel, message: String(message || "").slice(0, 240) });
    return this.snapshot();
  }

  applyGptSuggestion(suggestion) {
    this.state.gptSuggestion = suggestion && typeof suggestion === "object"
      ? JSON.parse(JSON.stringify(suggestion)) : null;
    this.state.diagnosticRequested = false;
    this.state.updatedAt = this.now();
    return this.snapshot();
  }

  outstandingActionsForDevice(deviceId) {
    if (this.state.status !== "running") return [];
    return this.state.stepLedger.filter((entry) => entry.deviceId === deviceId
      && entry.status === "dispatched").map((entry) => ({
      deviceId: entry.deviceId, accountLabel: entry.accountLabel, command: entry.command,
      parameters: JSON.parse(JSON.stringify(entry.parameters || {})),
      runId: this.state.runId, legIndex: entry.legIndex, phase: entry.phase,
      stepId: entry.stepId
    }));
  }

  #currentAccounts() {
    if (this.state.mode === "resource_sweep") {
      const entry = this.state.route[this.state.legIndex];
      return entry ? [entry] : [];
    }
    const leg = this.#currentLeg();
    return [leg?.seller, leg?.buyer].filter(Boolean);
  }

  #progressSignature(deviceId, telemetry) {
    const accounts = Array.isArray(telemetry?.accounts) ? telemetry.accounts : [];
    const relevant = this.#currentAccounts().filter((entry) => entry.deviceId === deviceId);
    const values = relevant.map((entry) => {
      const account = accounts.find((candidate) => candidate?.index === entry.accountIndex);
      const automation = account?.automation || {};
      return [entry.accountLabel, automation.task, automation.status, automation.lastMessage,
        automation.updatedAt, automation.equipmentListedInBatch,
        automation.equipmentTransferLastRunAt, automation.dungeonLastRunAt,
        automation.finalEquipLastRunAt, automation.auctionLastRunAt].join("|");
    });
    return values.length ? `${this.state.phase}:${values.join(";")}` : "";
  }

  #event(type, details = {}) {
    this.state.eventLedger.push({ eventId: crypto.randomUUID(), type,
      runId: this.state.runId, legIndex: this.state.legIndex, phase: this.state.phase,
      timestamp: this.now(), ...details });
    if (this.state.eventLedger.length > 300) this.state.eventLedger.splice(0,
      this.state.eventLedger.length - 300);
  }

  #validateRoute(route) {
    const labels = Array.isArray(route) ? route.map((entry) => entry?.accountLabel) : [];
    if (labels.length < 2 || labels.length > 9 || labels.at(-1) !== labels[0]
        || new Set(labels.slice(0, -1)).size !== labels.length - 1
        || labels.slice(0, -1).some((label) => typeof label !== "string"
          || !label.trim() || label.length > 30 || /[→,，\r\n\t]/.test(label))) {
      throw new Error("账号路线必须首尾相同，且参与账号不能为空或重复");
    }
    route.forEach((entry, index) => {
      if (!entry || typeof entry.deviceId !== "string" || !Number.isInteger(entry.accountIndex)
          || entry.accountIndex < 0 || entry.accountIndex > 3) {
        throw new Error(`路线第${index + 1}个账号无效`);
      }
    });
  }
}
