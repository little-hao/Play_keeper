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
const SELLER_CLEANUP_DELAY_MS = 30_000;

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
      buyerStarted: false, sellerReleased: false, sellerCleaned: false, mainBuySeen: false,
      sellerCleanupDueAt: 0, equipmentHolderLabel: "hao",
      route: [], items: [...EQUIPMENT_ITEMS],
      resourceItems: [...RESOURCE_ITEMS], inventoryItems: [...RESOURCE_ITEMS],
      resourceReserveCount: 1, price: 920, returnMap: "圣兽云殿",
      dungeonItems: ["绘画小屋", "伊苏王的神墓", "火龙王的宫殿", "史芬克斯密穴"],
      reportEmail: "konghao0920@gmail.com", error: "", errorAccount: "",
      interventionDeadlineAt: 0, emailStatus: "pending", inventoryByAccount: {}, history: [] };
  }

  snapshot() { return JSON.parse(JSON.stringify(this.state)); }

  restore(savedState) {
    if (!savedState || typeof savedState !== "object" || Array.isArray(savedState)) {
      return this.snapshot();
    }
    const route = Array.isArray(savedState.route) ? savedState.route : [];
    this.state = { ...this.#idleState(), ...savedState,
      route: route.map((entry) => ({ ...entry })),
      items: Array.isArray(savedState.items) && savedState.items.length === 10
        ? [...savedState.items] : [...EQUIPMENT_ITEMS],
      resourceItems: Array.isArray(savedState.resourceItems)
        ? [...savedState.resourceItems] : [...RESOURCE_ITEMS],
      inventoryItems: Array.isArray(savedState.inventoryItems)
        ? [...savedState.inventoryItems] : (Array.isArray(savedState.resourceItems)
          ? [...savedState.resourceItems] : [...RESOURCE_ITEMS]),
      dungeonItems: Array.isArray(savedState.dungeonItems)
        ? [...savedState.dungeonItems] : [...this.#idleState().dungeonItems],
      history: Array.isArray(savedState.history) ? [...savedState.history] : [],
      inventoryByAccount: savedState.inventoryByAccount
        && typeof savedState.inventoryByAccount === "object"
        ? { ...savedState.inventoryByAccount } : {} };
    if (this.state.status === "running") {
      this.state.resumePhase = this.state.phase;
      this.state.status = "intervention";
      this.state.error = `服务恢复后已暂停；请人工确认厄菲斯神套装所在账号`;
      this.state.errorAccount = this.state.equipmentHolderLabel || "当前账号";
    }
    if (this.state.status === "intervention") this.state.interventionDeadlineAt = 0;
    this.state.updatedAt = this.now();
    return this.snapshot();
  }

  start(route, options = {}) {
    if (["running", "intervention"].includes(this.state.status)) throw new Error("多用户挂机已在运行");
    this.#validateRoute(route);
    if (route.length < 3 || route[0].accountLabel !== "hao") {
      throw new Error("新计划必须从 hao 开始并最终返回 hao");
    }
    const price = options.price ?? 920;
    const items = options.items ?? EQUIPMENT_ITEMS;
    const resourceItems = options.resourceItems ?? RESOURCE_ITEMS;
    const inventoryItems = options.inventoryItems ?? resourceItems;
    const resourceReserveCount = options.resourceReserveCount ?? 1;
    const dungeonItems = options.dungeonItems
      ?? ["绘画小屋", "伊苏王的神墓", "火龙王的宫殿", "史芬克斯密穴"];
    const returnMap = options.returnMap ?? "圣兽云殿";
    const reportEmail = options.reportEmail ?? "konghao0920@gmail.com";
    if (!Number.isInteger(price) || price < 1 || price > 9_999_999) throw new Error("交易单价无效");
    if (!Array.isArray(items) || items.length !== 10 || new Set(items).size !== 10
        || items.some((item) => typeof item !== "string" || !item.trim() || item.length > 30)) {
      throw new Error("装备清单必须包含十件不重复装备");
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
    if (typeof reportEmail !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(reportEmail)) {
      throw new Error("报告邮箱格式无效");
    }
    const now = this.now();
    const skippedCompleted = route.slice(1, -1).filter((entry) => completedToday(entry, now));
    const activeRoute = [route[0],
      ...route.slice(1, -1).filter((entry) => !completedToday(entry, now)), route.at(-1)];
    this.state = { ...this.#idleState(), status: "running", runId: crypto.randomUUID(),
      startedAt: now, updatedAt: now, phaseStartedAt: now, legIndex: 0,
      phase: "starting_leg", route: activeRoute.map((entry) => ({ ...entry })), items: [...items],
      resourceItems: [...new Set(resourceItems.map((item) => String(item).trim()).filter(Boolean))],
      inventoryItems: [...new Set(inventoryItems.map((item) => String(item).trim()).filter(Boolean))],
      resourceReserveCount,
      dungeonItems: [...new Set(dungeonItems.map((item) => String(item).trim()).filter(Boolean))],
      price, returnMap: returnMap.trim(), reportEmail: reportEmail.trim() };
    this.state.history.push(...skippedCompleted.map((entry) => ({ account: entry.accountLabel,
      completedAt: now, result: "skipped_completed", message: "今日副本已完成" })));
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
    if (!Array.isArray(route) || route.length !== 8
        || route.map((entry) => entry.accountLabel).join(",")
          !== "hao1,hao2,hao3,hao4,hao5,hao6,hao7,hao") {
      throw new Error("资源归集需要 hao1–hao7 与 hao 全部在线");
    }
    const resourceItems = options.resourceItems ?? RESOURCE_ITEMS;
    const resourceReserveCount = options.resourceReserveCount ?? 1;
    const returnMap = String(options.returnMap ?? "圣兽云殿").trim();
    if (!Array.isArray(resourceItems) || resourceItems.length < 1 || resourceItems.length > 10) {
      throw new Error("道具组合需包含1–10项");
    }
    if (![0, 1].includes(resourceReserveCount)) throw new Error("道具保留数量只能是0或1");
    if (!returnMap || returnMap.length > 30) throw new Error("返回挂机副本无效");
    const now = this.now();
    this.state = { ...this.#idleState(), status: "running", mode: "resource_sweep",
      runId: crypto.randomUUID(), startedAt: now, updatedAt: now, phaseStartedAt: now,
      legIndex: 0, phase: "resource_auction_running",
      route: route.map((entry) => ({ ...entry })),
      resourceItems: [...new Set(resourceItems.map((item) => String(item).trim()).filter(Boolean))],
      inventoryItems: [...new Set(resourceItems.map((item) => String(item).trim()).filter(Boolean))],
      resourceReserveCount, price: 920, returnMap };
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
    this.#refreshRouteBindings(liveRoute);
    if (this.state.mode === "daily") {
      if (!confirmedHolderLabel) throw new Error("请先人工确认厄菲斯神套装所在账号");
      const holderIndex = liveRoute.findIndex((entry, index) =>
        index < liveRoute.length - 1 && entry.accountLabel === confirmedHolderLabel);
      if (holderIndex < 0) throw new Error(`确认的套装账号 ${confirmedHolderLabel} 不在当前路线中`);
      this.state.route = liveRoute.slice(holderIndex).map((entry) => ({ ...entry }));
      this.state.legIndex = 0;
      this.state.equipmentHolderLabel = confirmedHolderLabel;
      this.state.phase = "seller_running";
      this.state.resumePhase = "seller_running";
      this.state.buyerStarted = false;
      this.state.sellerReleased = false;
      this.state.sellerCleaned = false;
      this.state.sellerCleanupDueAt = 0;
      this.state.mainBuySeen = false;
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
    return this.retry();
  }

  tick() {
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
    const leg = this.#currentLeg();
    if (leg && (leg.seller.deviceId === deviceId || leg.buyer.deviceId === deviceId)) {
      const account = leg.seller.deviceId === deviceId ? leg.seller : leg.buyer;
      return this.#handleAccountFailure(account, `设备 ${deviceId} 已离线`);
    }
    return this.snapshot();
  }

  onTelemetry(deviceId, telemetry) {
    if (this.state.status !== "running") return this.snapshot();
    if (this.state.mode === "resource_sweep") {
      return this.#onResourceSweepTelemetry(deviceId, telemetry);
    }
    const leg = this.#currentLeg();
    if (!leg) return this.#intervene("计划交接序号无效", "系统");
    const seller = this.#automationFor(leg.seller, deviceId, telemetry);
    const buyer = this.#automationFor(leg.buyer, deviceId, telemetry);
    if (this.state.phase === "standalone_main_running" && buyer) {
      if (buyer.status === "error") {
        return this.#handleAccountFailure(leg.buyer,
          `hao 副本执行失败：${buyer.lastMessage || "未知错误"}`);
      }
      if (this.#standaloneMainComplete(buyer)) {
        this.#captureInventory(leg.buyer, buyer);
        this.#startMainBuy(leg.buyer);
      }
      return this.snapshot();
    }
    if (["seller_running", "buyer_running"].includes(this.state.phase)) {
      if (buyer) this.#scheduleSellerAfterTransfer(leg, buyer);
      if (seller?.task === "equipment_sell" && seller.status === "error") {
        return this.#handleAccountFailure(leg.seller,
          `${leg.seller.accountLabel} 上架失败：${seller.lastMessage || "未知错误"}`);
      }
      if (buyer?.status === "error") {
        return this.#handleAccountFailure(leg.buyer,
          `${leg.buyer.accountLabel} 执行失败：${buyer.lastMessage || "未知错误"}`);
      }
      if (this.state.sellerReleased && seller?.status === "error") {
        return this.#handleAccountFailure(leg.seller,
          `${leg.seller.accountLabel} 重新穿戴或返回挂机失败：${seller.lastMessage || "未知错误"}`,
          { sellerCleanup: true });
      }
      if (this.state.sellerReleased && seller?.task === "temple" && seller.status === "ok"
          && Number(seller.updatedAt) >= this.state.phaseStartedAt) {
        this.state.sellerCleaned = true;
      }
      if (!this.state.buyerStarted && seller?.task === "equipment_sell" && seller.status === "running"
          && Number(seller.equipmentListedInBatch) > 0) {
        this.state.buyerStarted = true;
        this.state.phase = "buyer_running";
        this.state.updatedAt = this.now();
        this.#command(leg.buyer, "switch_account", { accountIndex: leg.buyer.accountIndex });
        this.#command(leg.buyer, "run_equipment_buy", { accountIndex: leg.buyer.accountIndex });
      }
      if (buyer && this.state.sellerCleaned && this.#buyerWorkflowComplete(buyer)) {
        this.#captureInventory(leg.buyer, buyer);
        if (leg.buyer.accountLabel === "hao") this.#startMainBuy(leg.buyer);
        else this.#startResourceAuction(leg.buyer);
      }
      return this.snapshot();
    }
    if (this.state.phase === "resource_auction_running" && buyer) {
      if (buyer.status === "error") {
        return this.#intervene(`${leg.buyer.accountLabel} 道具上架失败：${buyer.lastMessage || "未知错误"}`,
          leg.buyer.accountLabel);
      }
      const auctionDone = Number(buyer.auctionLastRunAt) >= this.state.phaseStartedAt;
      const returned = buyer.task === "temple" && buyer.status === "ok"
        && Number(buyer.updatedAt) >= this.state.phaseStartedAt;
      if (auctionDone && returned) this.#completeLeg();
      return this.snapshot();
    }
    if (this.state.phase === "main_buy_running" && buyer) {
      if (buyer.task === "auction_buy" && buyer.status === "running") this.state.mainBuySeen = true;
      if (buyer.status === "error") {
        return this.#intervene(`hao 道具购买失败：${buyer.lastMessage || "未知错误"}`, "hao");
      }
      const returned = this.state.mainBuySeen && buyer.task === "temple" && buyer.status === "ok"
        && Number(buyer.updatedAt) >= this.state.phaseStartedAt;
      if (returned) this.#completeLeg();
    }
    return this.snapshot();
  }

  #onResourceSweepTelemetry(deviceId, telemetry) {
    const account = this.state.route[this.state.legIndex];
    if (!account) return this.#intervene("资源归集账号序号无效", "系统");
    const automation = this.#automationFor(account, deviceId, telemetry);
    if (!automation) return this.snapshot();
    if (automation.status === "error") {
      return this.#intervene(`${account.accountLabel} 资源归集失败：${automation.lastMessage || "未知错误"}`,
        account.accountLabel);
    }
    const returned = automation.task === "temple" && automation.status === "ok"
      && Number(automation.updatedAt) >= this.state.phaseStartedAt;
    if (account.accountLabel !== "hao") {
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
          accountIndex: target.accountIndex, map: this.state.returnMap });
        this.#command(target, "run_temple_guard", { accountIndex: target.accountIndex });
      }
      this.state.history.push({ account: "hao", completedAt: this.now(), result: "success" });
      Object.assign(this.state, { status: "success", phase: "complete", updatedAt: this.now() });
    }
    return this.snapshot();
  }

  #buyerWorkflowComplete(automation) {
    const afterStart = (value) => Number(value) >= this.state.phaseStartedAt;
    return afterStart(automation.equipmentTransferLastRunAt)
      && afterStart(automation.dungeonLastRunAt)
      && afterStart(automation.inventoryLastRunAt)
      && automation.inventoryStatus === "ok"
      && automation.task === "temple" && automation.status === "ok";
  }

  #standaloneMainComplete(automation) {
    const afterStart = (value) => Number(value) >= this.state.phaseStartedAt;
    return afterStart(automation.dungeonLastRunAt)
      && afterStart(automation.inventoryLastRunAt)
      && automation.inventoryStatus === "ok"
      && automation.task === "temple" && automation.status === "ok";
  }

  #scheduleSellerAfterTransfer(leg, buyerAutomation) {
    if (this.state.sellerReleased || this.state.sellerCleanupDueAt > 0) return;
    const transferredAt = Number(buyerAutomation.equipmentTransferLastRunAt);
    if (!Number.isFinite(transferredAt) || transferredAt < this.state.phaseStartedAt) return;
    this.state.equipmentHolderLabel = leg.buyer.accountLabel;
    this.state.sellerCleanupDueAt = this.now() + SELLER_CLEANUP_DELAY_MS;
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
      accountIndex: leg.seller.accountIndex, map: this.state.returnMap });
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
      this.state.sellerReleased = false;
      this.state.sellerCleaned = false;
      this.state.sellerCleanupDueAt = 0;
      this.state.mainBuySeen = false;
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
      this.#startCurrentLeg();
      return;
    }
    this.state.phase = "buyer_running";
    this.state.buyerStarted = true;
    this.state.updatedAt = this.now();
    if (!this.state.sellerCleaned) {
      this.state.sellerReleased = true;
      this.#command(leg.seller, "cancel_automation", { accountIndex: leg.seller.accountIndex });
      this.#command(leg.seller, "configure_return_hang", {
        accountIndex: leg.seller.accountIndex, map: this.state.returnMap });
      this.#command(leg.seller, "run_seller_cleanup", { accountIndex: leg.seller.accountIndex });
    }
    this.#command(leg.buyer, "switch_account", { accountIndex: leg.buyer.accountIndex });
    this.#command(leg.buyer, "run_equipment_buy", { accountIndex: leg.buyer.accountIndex });
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
    if (account.accountLabel === "hao") {
      this.state.mainBuySeen = false;
      this.state.phase = "main_buy_running";
      this.#command(account, "run_auction_buy", { accountIndex: account.accountIndex });
    } else {
      this.#command(account, "run_auto_auction", { accountIndex: account.accountIndex });
    }
  }

  #startMainBuy(account) {
    Object.assign(this.state, { phase: "main_buy_running", phaseStartedAt: this.now(),
      updatedAt: this.now(), mainBuySeen: false });
    this.#configureResourcesAndReturn(account);
    this.#command(account, "run_auction_buy", { accountIndex: account.accountIndex });
  }

  #startStandaloneMain(account) {
    Object.assign(this.state, { phase: "standalone_main_running", phaseStartedAt: this.now(),
      updatedAt: this.now(), equipmentHolderLabel: account.accountLabel });
    this.#command(account, "configure_inventory_monitor", {
      accountIndex: account.accountIndex, items: [...this.state.inventoryItems] });
    this.#command(account, "configure_dungeon_sequence", {
      accountIndex: account.accountIndex, items: [...this.state.dungeonItems] });
    this.#command(account, "configure_return_hang", {
      accountIndex: account.accountIndex, map: this.state.returnMap });
    this.#command(account, "switch_account", { accountIndex: account.accountIndex });
    this.#command(account, "run_dungeon_sequence", { accountIndex: account.accountIndex });
  }

  #configureResourcesAndReturn(account) {
    this.#command(account, "configure_auto_auction", { accountIndex: account.accountIndex,
      enabled: false, items: [...this.state.resourceItems], buyer: "hao",
      price: this.state.price, reserveCount: this.state.resourceReserveCount,
      intervalHours: 24 });
    this.#command(account, "configure_return_hang", {
      accountIndex: account.accountIndex, map: this.state.returnMap });
  }

  #completeLeg() {
    const leg = this.#currentLeg();
    this.state.history.push({ legIndex: this.state.legIndex, seller: leg.seller.accountLabel,
      buyer: leg.buyer.accountLabel, completedAt: this.now(), result: "success" });
    if (this.state.legIndex >= this.state.route.length - 2) {
      Object.assign(this.state, { status: "success", phase: "complete", updatedAt: this.now() });
      Promise.resolve(this.onComplete(this.snapshot())).catch(() => {});
      return;
    }
    this.state.legIndex += 1;
    this.state.buyerStarted = false;
    this.state.sellerReleased = false;
    this.state.sellerCleaned = false;
    this.state.sellerCleanupDueAt = 0;
    this.state.mainBuySeen = false;
    this.state.phase = "starting_leg";
    this.#startCurrentLeg();
  }

  #automationFor(account, deviceId, telemetry) {
    if (account.deviceId !== deviceId) return null;
    const accounts = Array.isArray(telemetry?.accounts) ? telemetry.accounts : [];
    return accounts.find((entry) => entry?.index === account.accountIndex)?.automation ?? null;
  }

  #currentLeg() {
    if (this.state.legIndex < 0 || this.state.legIndex >= this.state.route.length - 1) return null;
    return { seller: this.state.route[this.state.legIndex], buyer: this.state.route[this.state.legIndex + 1] };
  }

  #startCurrentLeg() {
    const leg = this.#currentLeg();
    if (!leg) return this.#intervene("计划交接序号无效", "系统");
    this.state.sellerReleased = false;
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
      accountIndex: leg.buyer.accountIndex, map: this.state.returnMap });
    this.#command(leg.seller, "switch_account", { accountIndex: leg.seller.accountIndex });
    this.#command(leg.seller, "run_equipment_sell", { accountIndex: leg.seller.accountIndex });
    this.state.phase = "seller_running";
    this.state.updatedAt = this.now();
  }

  #command(account, command, parameters) {
    this.emitAction({ deviceId: account.deviceId, accountLabel: account.accountLabel,
      command, parameters });
  }

  #intervene(message, accountLabel) {
    this.state.resumePhase = this.state.phase;
    Object.assign(this.state, { status: "intervention", error: message, errorAccount: accountLabel,
      interventionDeadlineAt: 0, updatedAt: this.now() });
    return this.snapshot();
  }

  #validateRoute(route) {
    const labels = Array.isArray(route) ? route.map((entry) => entry?.accountLabel) : [];
    if (labels.length < 2 || labels.length > 9 || labels.at(-1) !== "hao"
        || new Set(labels.slice(0, -1)).size !== labels.length - 1
        || labels.slice(0, -1).some((label) => !/^hao(?:[1-7])?$/.test(label))) {
      throw new Error("账号路线必须最终返回 hao，且参与账号不能重复");
    }
    route.forEach((entry, index) => {
      if (!entry || typeof entry.deviceId !== "string" || !Number.isInteger(entry.accountIndex)
          || entry.accountIndex < 0 || entry.accountIndex > 3) {
        throw new Error(`路线第${index + 1}个账号无效`);
      }
    });
  }
}
