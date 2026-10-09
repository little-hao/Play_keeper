import crypto from "node:crypto";

export const EQUIPMENT_ITEMS = Object.freeze([
  "柔情方巾·改", "轻罗流萤衫·改", "逢羡履·改", "君我剑·改", "佳人之恋·改",
  "三生戒·改", "比翼·改", "相望镯·改", "尾生之泪·改", "龙神印记·庆"
]);

export const RESOURCE_ITEMS = Object.freeze([
  "曙光印记", "进化宝石", "强化丹A", "强化丹B", "天仙玉露"
]);

const REQUIRED_ROUTE = Object.freeze([
  "hao", "hao1", "hao2", "hao3", "hao4", "hao5", "hao6", "hao7", "hao"
]);
const INTERVENTION_MS = 60_000;

export function resolveEightAccountRoute(deviceSummaries) {
  return resolveAccountRoute(deviceSummaries, REQUIRED_ROUTE);
}

export function resolveResourceSweepRoute(deviceSummaries) {
  return resolveAccountRoute(deviceSummaries,
    ["hao1", "hao2", "hao3", "hao4", "hao5", "hao6", "hao7", "hao"]);
}

function resolveAccountRoute(deviceSummaries, labels) {
  const accounts = [];
  for (const device of deviceSummaries) {
    const reported = Array.isArray(device?.telemetry?.accounts) ? device.telemetry.accounts : [];
    for (const account of reported) {
      if (!Number.isInteger(account?.index) || typeof account?.label !== "string") continue;
      accounts.push({ deviceId: device.deviceId, accountIndex: account.index,
        accountLabel: account.label, online: true });
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
      route: [], items: [...EQUIPMENT_ITEMS],
      resourceItems: [...RESOURCE_ITEMS], price: 920, returnMap: "圣兽云殿",
      dungeonItems: ["绘画小屋", "伊苏王的神墓", "火龙王的宫殿", "史芬克斯密穴"],
      reportEmail: "konghao0920@gmail.com", error: "", errorAccount: "",
      interventionDeadlineAt: 0, emailStatus: "pending", inventoryByAccount: {}, history: [] };
  }

  snapshot() { return JSON.parse(JSON.stringify(this.state)); }

  start(route, options = {}) {
    if (["running", "intervention"].includes(this.state.status)) throw new Error("多用户挂机已在运行");
    this.#validateRoute(route);
    const price = options.price ?? 920;
    const items = options.items ?? EQUIPMENT_ITEMS;
    const resourceItems = options.resourceItems ?? RESOURCE_ITEMS;
    const dungeonItems = options.dungeonItems
      ?? ["绘画小屋", "伊苏王的神墓", "火龙王的宫殿", "史芬克斯密穴"];
    const returnMap = options.returnMap ?? "圣兽云殿";
    const reportEmail = options.reportEmail ?? "konghao0920@gmail.com";
    if (!Number.isInteger(price) || price < 1 || price > 9_999_999) throw new Error("交易单价无效");
    if (!Array.isArray(items) || items.length !== 10 || new Set(items).size !== 10
        || EQUIPMENT_ITEMS.some((item) => !items.includes(item))) {
      throw new Error("装备清单必须是指定的十件情改装备");
    }
    if (!Array.isArray(resourceItems) || resourceItems.length < 1 || resourceItems.length > 10) {
      throw new Error("道具组合需包含1–10项");
    }
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
    this.state = { ...this.#idleState(), status: "running", runId: crypto.randomUUID(),
      startedAt: now, updatedAt: now, phaseStartedAt: now, legIndex: 0,
      phase: "starting_leg", route: route.map((entry) => ({ ...entry })), items: [...items],
      resourceItems: [...new Set(resourceItems.map((item) => String(item).trim()).filter(Boolean))],
      dungeonItems: [...new Set(dungeonItems.map((item) => String(item).trim()).filter(Boolean))],
      price, returnMap: returnMap.trim(), reportEmail: reportEmail.trim() };
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
    const returnMap = String(options.returnMap ?? "圣兽云殿").trim();
    if (!Array.isArray(resourceItems) || resourceItems.length < 1 || resourceItems.length > 10) {
      throw new Error("道具组合需包含1–10项");
    }
    if (!returnMap || returnMap.length > 30) throw new Error("返回挂机副本无效");
    const now = this.now();
    this.state = { ...this.#idleState(), status: "running", mode: "resource_sweep",
      runId: crypto.randomUUID(), startedAt: now, updatedAt: now, phaseStartedAt: now,
      legIndex: 0, phase: "resource_auction_running",
      route: route.map((entry) => ({ ...entry })),
      resourceItems: [...new Set(resourceItems.map((item) => String(item).trim()).filter(Boolean))],
      price: 920, returnMap };
    this.#startResourceAuction(this.state.route[0]);
    return this.snapshot();
  }

  cancel(reason = "用户中断") {
    if (!["running", "intervention"].includes(this.state.status)) return this.snapshot();
    const leg = this.#currentLeg();
    for (const account of [leg?.seller, leg?.buyer]) {
      if (account) this.#command(account, "cancel_automation", { accountIndex: account.accountIndex });
    }
    Object.assign(this.state, { status: "cancelled", phase: "cancelled", error: reason,
      interventionDeadlineAt: 0, updatedAt: this.now() });
    return this.snapshot();
  }

  retry() {
    if (this.state.status !== "intervention") throw new Error("当前没有等待人工处理的错误");
    if (this.now() > this.state.interventionDeadlineAt) return this.tick();
    const phase = this.state.resumePhase;
    Object.assign(this.state, { status: "running", error: "", errorAccount: "",
      interventionDeadlineAt: 0, phaseStartedAt: this.now() });
    if (this.state.mode === "resource_sweep") {
      this.#startResourceAuction(this.state.route[this.state.legIndex]);
      return this.snapshot();
    }
    if (["seller_running", "buyer_running"].includes(phase)) {
      this.state.buyerStarted = false;
      this.#startCurrentLeg();
    } else if (phase === "resource_auction_running") {
      this.#startResourceAuction(this.#currentLeg().buyer);
    } else if (phase === "main_buy_running") {
      this.#startMainBuy(this.#currentLeg().buyer);
    } else {
      return this.#intervene("无法判断需要重试的阶段", "当前账号");
    }
    return this.snapshot();
  }

  tick() {
    if (this.state.status === "intervention" && this.now() >= this.state.interventionDeadlineAt) {
      Object.assign(this.state, { status: "error", phase: "error",
        error: `${this.state.error}；60秒人工介入时间已结束`, updatedAt: this.now() });
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
      return this.#intervene(`设备 ${deviceId} 已离线`, account.accountLabel);
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
    if (["seller_running", "buyer_running"].includes(this.state.phase)) {
      if (seller?.task === "equipment_sell" && seller.status === "error") {
        return this.#intervene(`${leg.seller.accountLabel} 上架失败：${seller.lastMessage || "未知错误"}`,
          leg.seller.accountLabel);
      }
      if (buyer?.status === "error") {
        return this.#intervene(`${leg.buyer.accountLabel} 执行失败：${buyer.lastMessage || "未知错误"}`,
          leg.buyer.accountLabel);
      }
      if (this.state.sellerReleased && seller?.status === "error") {
        return this.#intervene(`${leg.seller.accountLabel} 重新穿戴或返回挂机失败：${seller.lastMessage || "未知错误"}`,
          leg.seller.accountLabel);
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
      if (buyer) this.#releaseCrossDeviceSellerAfterTransfer(leg, buyer);
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

  #releaseCrossDeviceSellerAfterTransfer(leg, buyerAutomation) {
    if (this.state.sellerReleased) return;
    if (Number(buyerAutomation.equipmentTransferLastRunAt) < this.state.phaseStartedAt) return;
    this.state.sellerReleased = true;
    this.#command(leg.seller, "cancel_automation", { accountIndex: leg.seller.accountIndex });
    this.#command(leg.seller, "configure_return_hang", {
      accountIndex: leg.seller.accountIndex, map: this.state.returnMap });
    this.#command(leg.seller, "run_seller_cleanup", { accountIndex: leg.seller.accountIndex });
  }

  #captureInventory(account, automation) {
    const source = automation.inventoryCounts && typeof automation.inventoryCounts === "object"
      ? automation.inventoryCounts : {};
    const counts = {};
    for (const item of this.state.resourceItems) counts[item] = Number(source[item]) || 0;
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

  #configureResourcesAndReturn(account) {
    this.#command(account, "configure_auto_auction", { accountIndex: account.accountIndex,
      enabled: false, items: [...this.state.resourceItems], buyer: "hao",
      price: this.state.price, intervalHours: 24 });
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
    this.state.phaseStartedAt = this.now();
    const common = { items: [...this.state.items], price: this.state.price };
    this.#command(leg.seller, "configure_equipment_transfer", {
      accountIndex: leg.seller.accountIndex, ...common, buyer: leg.buyer.accountLabel });
    this.#command(leg.buyer, "configure_equipment_transfer", {
      accountIndex: leg.buyer.accountIndex, ...common, buyer: "" });
    this.#command(leg.buyer, "configure_inventory_monitor", {
      accountIndex: leg.buyer.accountIndex, items: [...this.state.resourceItems] });
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
      interventionDeadlineAt: this.now() + INTERVENTION_MS, updatedAt: this.now() });
    return this.snapshot();
  }

  #validateRoute(route) {
    const labels = Array.isArray(route) ? route.map((entry) => entry?.accountLabel) : [];
    if (REQUIRED_ROUTE.length !== labels.length
        || !REQUIRED_ROUTE.every((label, index) => labels[index] === label)) {
      throw new Error("账号路线无效");
    }
    route.forEach((entry, index) => {
      if (!entry || typeof entry.deviceId !== "string" || !Number.isInteger(entry.accountIndex)
          || entry.accountIndex < 0 || entry.accountIndex > 3) {
        throw new Error(`路线第${index + 1}个账号无效`);
      }
    });
  }
}
