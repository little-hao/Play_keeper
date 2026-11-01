import crypto from "node:crypto";

export class EquipmentTransferCoordinator {
  constructor({ emitAction = () => {}, now = () => Date.now(), onUpdate = () => {},
    progressTimeoutMs = 15 * 60_000 } = {}) {
    this.emitAction = emitAction;
    this.now = now;
    this.onUpdate = onUpdate;
    this.progressTimeoutMs = progressTimeoutMs;
    this.state = this.#idle();
  }

  #idle() {
    return { status: "idle", phase: "idle", startedAt: 0, updatedAt: this.now(),
      runId: "", ownerId: "", seller: null, buyer: null, items: [], price: 920,
      returnMap: "圣兽云殿", configuredAccounts: [], buyerStarted: false,
      sellerReleased: false, message: "" };
  }

  snapshot() { return JSON.parse(JSON.stringify(this.state)); }

  isActive() { return ["running", "intervention"].includes(this.state.status); }

  restore(saved) {
    if (!saved || !saved.runId || !saved.seller || !saved.buyer) return this.snapshot();
    this.state = { ...this.#idle(), ...saved };
    if (this.isActive()) {
      this.state.status = "intervention";
      this.state.message = "服务已重启，单次转移已暂停。请检查两方现场后中断旧任务，再选择后续操作；不会自动重复交易。";
    }
    return this.snapshot();
  }

  cancel(reason = "用户中断单次转移") {
    if (!this.isActive()) return this.snapshot();
    this.state.status = "cancelled";
    this.state.phase = "cancelled";
    this.state.updatedAt = this.now();
    this.state.message = reason;
    this.#stopAccounts();
    this.#publish();
    return this.snapshot();
  }

  onCommandResult(action, success, message = "") {
    if (this.state.status !== "running" || action?.runId !== this.state.runId
        || action.command === "cancel_automation") return this.snapshot();
    // A result for the old seller listing is irrelevant once cleanup owns that account.
    if (this.state.sellerReleased
        && ["run_equipment_sell", "configure_equipment_transfer"].includes(action.command)) {
      return this.snapshot();
    }
    if (!success) return this.#fail(`${action.accountLabel} 命令被拒绝或超时：${message}`);
    if (action.command === "configure_equipment_transfer"
        && !this.state.configuredAccounts.includes(action.accountLabel)) {
      this.state.configuredAccounts.push(action.accountLabel);
      this.state.updatedAt = this.now();
      if (this.state.configuredAccounts.length === 2) {
        this.state.phase = "seller_listing";
        this.state.message = `${this.state.seller.accountLabel} 与 ${this.state.buyer.accountLabel}`
          + " 已确认目标套装，正在启动上架";
        this.#command(this.state.seller, "configure_return_hang", { map: this.state.returnMap });
        this.#command(this.state.seller, "run_equipment_sell", {});
        this.#publish();
      }
    }
    return this.snapshot();
  }

  onDeviceOffline(deviceId) {
    if (this.state.status === "running"
        && [this.state.seller, this.state.buyer].some(a => a.deviceId === deviceId)) {
      return this.#fail("设备离线，单次转移已暂停，请检查现场后处理");
    }
    return this.snapshot();
  }

  tick() {
    if (this.state.status === "running" && !this.state.verificationPending
        && this.now() - this.state.updatedAt > this.progressTimeoutMs) {
      return this.#fail("单次转移15分钟未完成阶段交接，已暂停，未自动重复交易");
    }
    return this.snapshot();
  }

  start({ ownerId, seller, buyer, items, price, returnMap = "圣兽云殿" }) {
    if (this.isActive()) throw new Error("已有单次转移运行或等待处理，请先检查并中断旧任务");
    if (!seller || !buyer || seller.accountLabel === buyer.accountLabel) {
      throw new Error("卖方与买方必须是两个不同的在线账号");
    }
    const now = this.now();
    this.state = { status: "running", phase: "configuring", startedAt: now,
      runId: crypto.randomUUID(), verificationPending: false,
      updatedAt: now, ownerId: String(ownerId || ""), seller: { ...seller }, buyer: { ...buyer },
      items: [...items], price, returnMap, configuredAccounts: [], buyerStarted: false,
      sellerReleased: false, message: `正在等待 ${seller.accountLabel} 与 ${buyer.accountLabel} 确认目标套装` };
    const common = { items: [...items], price };
    this.#command(seller, "configure_equipment_transfer", { ...common, buyer: buyer.accountLabel });
    this.#command(buyer, "configure_equipment_transfer", { ...common, buyer: "" });
    this.#publish();
    return this.snapshot();
  }

  onTelemetry(deviceId, telemetry) {
    if (this.state.status !== "running") return this.snapshot();
    const seller = this.#automationFor(this.state.seller, deviceId, telemetry);
    const buyer = this.#automationFor(this.state.buyer, deviceId, telemetry);
    for (const [account, automation] of [[this.state.seller, seller], [this.state.buyer, buyer]]) {
      if (!automation || !this.state.configuredAccounts.includes(account.accountLabel)
          || !Array.isArray(automation.equipmentItems)) continue;
      const actual = automation.equipmentItems.map(item => String(item).trim()).filter(Boolean);
      if (actual.length !== this.state.items.length
          || actual.some((item, index) => item !== this.state.items[index])) {
        return this.#fail(`${account.accountLabel} 回传的装备组合与网页选择不一致；`
          + `期望：${this.state.items.join("、")}；设备：${actual.join("、") || "空"}。`
          + "已停止，避免按错误套装重复刷新");
      }
    }
    if (this.#fresh(buyer)) {
      const pending = !!buyer.equipmentVerificationToken;
      if (pending !== this.state.verificationPending) {
        this.state.verificationPending = pending;
        this.state.updatedAt = this.now();
        this.state.message = pending
          ? `${this.state.buyer.accountLabel} 等待人工核对主宠装备，未自动继续副本`
          : `${this.state.buyer.accountLabel} 已结束人工核验等待，继续跟踪交接`;
        this.#publish();
      }
    }
    if (!this.state.sellerReleased && this.#fresh(seller)
        && seller?.task === "equipment_sell" && seller.status === "error") {
      return this.#fail(`${this.state.seller.accountLabel} 上架失败：${seller.lastMessage || "未知错误"}`);
    }
    if (this.state.buyerStarted && this.#fresh(buyer) && buyer?.status === "error") {
      return this.#fail(`${this.state.buyer.accountLabel} 购买或副本失败：${buyer.lastMessage || "未知错误"}`);
    }
    if (!this.state.buyerStarted && this.#fresh(seller) && seller?.task === "equipment_sell"
        && seller.status === "running" && Number(seller.equipmentListedInBatch) > 0) {
      this.state.buyerStarted = true;
      this.state.phase = "buyer_running";
      this.state.updatedAt = this.now();
      this.state.message = `${this.state.buyer.accountLabel} 已开始购买装备并执行副本`;
      this.#command(this.state.buyer, "run_equipment_buy", {});
      this.#publish();
    }
    const transferredAt = Number(buyer?.equipmentTransferLastRunAt);
    if (this.state.buyerStarted && this.#fresh(buyer) && !this.state.verificationPending
        && !this.state.sellerReleased && Number.isFinite(transferredAt)
        && transferredAt >= this.state.startedAt) {
      this.state.sellerReleased = true;
      this.state.phase = "seller_cleanup";
      this.state.updatedAt = this.now();
      this.state.message = `${this.state.buyer.accountLabel} 已收到套装；${this.state.seller.accountLabel} 正在穿戴剩余装备并返回挂机`;
      this.#command(this.state.seller, "cancel_automation", {});
      this.#command(this.state.seller, "configure_return_hang", { map: this.state.returnMap });
      this.#command(this.state.seller, "run_seller_cleanup", {});
      this.#publish();
    }
    if (this.state.sellerReleased && this.#fresh(seller)
        && seller?.task === "seller_cleanup" && seller.status === "error") {
      return this.#fail(`${this.state.seller.accountLabel} 返回挂机失败：${seller.lastMessage || "未知错误"}`);
    }
    if (this.state.status === "running" && this.state.sellerReleased
        && seller?.task === "temple" && seller.status === "ok"
        && Number(seller.updatedAt) >= this.state.startedAt
        && Number(seller.finalEquipLastRunAt) >= this.state.startedAt) {
      this.state.status = "success";
      this.state.phase = "complete";
      this.state.updatedAt = this.now();
      this.state.message = `${this.state.seller.accountLabel} 已穿戴剩余装备并返回挂机；${this.state.buyer.accountLabel} 继续执行副本`;
      this.#publish();
    }
    return this.snapshot();
  }

  #automationFor(account, deviceId, telemetry) {
    if (!account || account.deviceId !== deviceId) return null;
    const accounts = Array.isArray(telemetry?.accounts) ? telemetry.accounts : [];
    return accounts.find((entry) => entry?.index === account.accountIndex)?.automation ?? null;
  }

  #fresh(automation) {
    return automation && Number(automation.updatedAt) >= this.state.startedAt;
  }

  #command(account, command, parameters) {
    if (this.state.status !== "running" && command !== "cancel_automation") return;
    try {
      this.emitAction({ deviceId: account.deviceId, accountLabel: account.accountLabel,
        runId: this.state.runId, command, parameters: { accountIndex: account.accountIndex, ...parameters } });
    } catch (error) {
      if (command !== "cancel_automation") {
        this.#fail(`${account.accountLabel} 命令未能发送：${error.message}`);
      }
    }
  }

  #fail(message) {
    this.state.status = "intervention";
    this.state.updatedAt = this.now();
    this.state.message = message;
    this.#stopAccounts();
    this.#publish();
    return this.snapshot();
  }

  #stopAccounts() {
    for (const account of [this.state.seller, this.state.buyer]) {
      if (account) this.#command(account, "cancel_automation", {});
    }
  }

  #publish() { this.onUpdate(this.snapshot()); }
}
