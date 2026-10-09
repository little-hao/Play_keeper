import crypto from "node:crypto";

export const EQUIPMENT_ITEMS = Object.freeze([
  "柔情方巾·改", "轻罗流萤衫·改", "逢羡履·改", "君我剑·改", "佳人之恋·改",
  "三生戒·改", "比翼·改", "相望镯·改", "尾生之泪·改", "龙神印记·庆"
]);

const REQUIRED_ROUTE = Object.freeze([
  "hao", "hao1", "hao2", "hao3", "hao4", "hao5", "hao6", "hao7", "hao"
]);

export function resolveEightAccountRoute(deviceSummaries) {
  const accounts = [];
  for (const device of deviceSummaries) {
    const telemetryAccounts = Array.isArray(device?.telemetry?.accounts)
      ? device.telemetry.accounts : [];
    for (const account of telemetryAccounts) {
      if (!Number.isInteger(account?.index) || typeof account?.label !== "string") continue;
      accounts.push({
        deviceId: device.deviceId,
        accountIndex: account.index,
        accountLabel: account.label,
        online: true
      });
    }
  }
  return REQUIRED_ROUTE.map((label) => {
    const match = accounts.find((account) => account.accountLabel === label);
    if (!match) throw new Error(`账号 ${label} 当前不在线或未上报`);
    return { ...match };
  });
}

export class EightAccountPlan {
  constructor({ emitAction = () => {}, now = () => Date.now() } = {}) {
    this.emitAction = emitAction;
    this.now = now;
    this.state = this.#idleState();
  }

  #idleState() {
    return {
      status: "idle",
      runId: "",
      startedAt: 0,
      updatedAt: this.now(),
      legIndex: -1,
      phase: "idle",
      buyerStarted: false,
      route: [],
      items: [...EQUIPMENT_ITEMS],
      price: 920,
      error: "",
      history: []
    };
  }

  snapshot() {
    return JSON.parse(JSON.stringify(this.state));
  }

  start(route, { price = 920, items = EQUIPMENT_ITEMS } = {}) {
    if (this.state.status === "running") throw new Error("八账号计划已在运行");
    this.#validateRoute(route);
    if (!Number.isInteger(price) || price < 1 || price > 9_999_999) {
      throw new Error("装备单价无效");
    }
    if (!Array.isArray(items) || items.length !== 10
        || new Set(items).size !== 10
        || EQUIPMENT_ITEMS.some((item) => !items.includes(item))) {
      throw new Error("装备清单必须是指定的十件情改装备");
    }
    const now = this.now();
    this.state = {
      status: "running",
      runId: crypto.randomUUID(),
      startedAt: now,
      updatedAt: now,
      legIndex: 0,
      phase: "starting_leg",
      buyerStarted: false,
      route: route.map((entry) => ({ ...entry })),
      items: [...items],
      price,
      error: "",
      history: []
    };
    this.#startCurrentLeg();
    return this.snapshot();
  }

  cancel(reason = "用户中断") {
    if (this.state.status !== "running") return this.snapshot();
    const leg = this.#currentLeg();
    for (const account of [leg?.seller, leg?.buyer]) {
      if (!account) continue;
      this.#command(account, "cancel_automation", { accountIndex: account.accountIndex });
    }
    this.state.status = "cancelled";
    this.state.phase = "cancelled";
    this.state.error = reason;
    this.state.updatedAt = this.now();
    return this.snapshot();
  }

  onDeviceOffline(deviceId) {
    if (this.state.status !== "running") return this.snapshot();
    const leg = this.#currentLeg();
    if (leg && (leg.seller.deviceId === deviceId || leg.buyer.deviceId === deviceId)) {
      return this.#fail(`当前交接设备 ${deviceId} 已离线`);
    }
    return this.snapshot();
  }

  onTelemetry(deviceId, telemetry) {
    if (this.state.status !== "running") return this.snapshot();
    const leg = this.#currentLeg();
    if (!leg) return this.#fail("计划交接序号无效");
    const sellerAutomation = this.#automationFor(leg.seller, deviceId, telemetry);
    const buyerAutomation = this.#automationFor(leg.buyer, deviceId, telemetry);

    if (sellerAutomation?.task === "equipment_sell" && sellerAutomation.status === "error") {
      return this.#fail(`${leg.seller.accountLabel} 上架失败：${sellerAutomation.lastMessage || "未知错误"}`);
    }
    if (buyerAutomation?.task === "equipment_buy" && buyerAutomation.status === "error") {
      return this.#fail(`${leg.buyer.accountLabel} 接收失败：${buyerAutomation.lastMessage || "未知错误"}`);
    }

    if (!this.state.buyerStarted && sellerAutomation?.task === "equipment_sell"
        && sellerAutomation.status === "running"
        && Number(sellerAutomation.equipmentListedInBatch) > 0) {
      this.state.buyerStarted = true;
      this.state.phase = "buyer_running";
      this.state.updatedAt = this.now();
      this.#command(leg.buyer, "switch_account", { accountIndex: leg.buyer.accountIndex });
      this.#command(leg.buyer, "run_equipment_buy", { accountIndex: leg.buyer.accountIndex });
    }

    if (buyerAutomation?.task === "equipment_buy" && buyerAutomation.status === "success") {
      if (buyerAutomation.equipmentAllTransferred !== true) {
        return this.#fail(`${leg.buyer.accountLabel} 未通过十件装备最终验收`);
      }
      this.state.history.push({
        legIndex: this.state.legIndex,
        seller: leg.seller.accountLabel,
        buyer: leg.buyer.accountLabel,
        completedAt: this.now(),
        result: "success"
      });
      if (this.state.legIndex >= this.state.route.length - 2) {
        this.state.status = "success";
        this.state.phase = "complete";
        this.state.updatedAt = this.now();
        return this.snapshot();
      }
      this.state.legIndex += 1;
      this.state.buyerStarted = false;
      this.state.phase = "starting_leg";
      this.#startCurrentLeg();
    }
    return this.snapshot();
  }

  #automationFor(account, deviceId, telemetry) {
    if (account.deviceId !== deviceId) return null;
    const accounts = Array.isArray(telemetry?.accounts) ? telemetry.accounts : [];
    return accounts.find((entry) => entry?.index === account.accountIndex)?.automation ?? null;
  }

  #currentLeg() {
    if (this.state.legIndex < 0 || this.state.legIndex >= this.state.route.length - 1) return null;
    return {
      seller: this.state.route[this.state.legIndex],
      buyer: this.state.route[this.state.legIndex + 1]
    };
  }

  #startCurrentLeg() {
    const leg = this.#currentLeg();
    if (!leg) return this.#fail("计划交接序号无效");
    const common = { items: [...this.state.items], price: this.state.price };
    this.#command(leg.seller, "configure_equipment_transfer", {
      accountIndex: leg.seller.accountIndex,
      ...common,
      buyer: leg.buyer.accountLabel
    });
    this.#command(leg.buyer, "configure_equipment_transfer", {
      accountIndex: leg.buyer.accountIndex,
      ...common,
      buyer: ""
    });
    this.#command(leg.seller, "switch_account", { accountIndex: leg.seller.accountIndex });
    this.#command(leg.seller, "run_equipment_sell", { accountIndex: leg.seller.accountIndex });
    this.state.phase = "seller_running";
    this.state.updatedAt = this.now();
  }

  #command(account, command, parameters) {
    this.emitAction({
      deviceId: account.deviceId,
      accountLabel: account.accountLabel,
      command,
      parameters
    });
  }

  #fail(message) {
    this.state.status = "error";
    this.state.phase = "error";
    this.state.error = message;
    this.state.updatedAt = this.now();
    return this.snapshot();
  }

  #validateRoute(route) {
    if (!Array.isArray(route) || route.length !== REQUIRED_ROUTE.length) {
      throw new Error("八账号路线必须包含起点和回到 hao 的共9个节点");
    }
    route.forEach((entry, index) => {
      if (!entry || entry.accountLabel !== REQUIRED_ROUTE[index]
          || typeof entry.deviceId !== "string"
          || !Number.isInteger(entry.accountIndex)
          || entry.accountIndex < 0 || entry.accountIndex > 3) {
        throw new Error(`路线第${index + 1}个账号无效`);
      }
    });
  }
}
