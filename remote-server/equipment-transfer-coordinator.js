export class EquipmentTransferCoordinator {
  constructor({ emitAction = () => {}, now = () => Date.now(), onUpdate = () => {} } = {}) {
    this.emitAction = emitAction;
    this.now = now;
    this.onUpdate = onUpdate;
    this.state = this.#idle();
  }

  #idle() {
    return { status: "idle", phase: "idle", startedAt: 0, updatedAt: this.now(),
      ownerId: "", seller: null, buyer: null, items: [], price: 920,
      returnMap: "圣兽云殿", buyerStarted: false, sellerReleased: false, message: "" };
  }

  snapshot() { return JSON.parse(JSON.stringify(this.state)); }

  start({ ownerId, seller, buyer, items, price, returnMap = "圣兽云殿" }) {
    if (this.state.status === "running") throw new Error("已有装备定向转移正在运行");
    if (!seller || !buyer || seller.accountLabel === buyer.accountLabel) {
      throw new Error("卖方与买方必须是两个不同的在线账号");
    }
    const now = this.now();
    this.state = { status: "running", phase: "seller_listing", startedAt: now,
      updatedAt: now, ownerId: String(ownerId || ""), seller: { ...seller }, buyer: { ...buyer },
      items: [...items], price, returnMap, buyerStarted: false, sellerReleased: false,
      message: `${seller.accountLabel} 正在向 ${buyer.accountLabel} 上架装备` };
    const common = { items: [...items], price };
    this.#command(seller, "configure_equipment_transfer", { ...common, buyer: buyer.accountLabel });
    this.#command(buyer, "configure_equipment_transfer", { ...common, buyer: "" });
    this.#command(seller, "configure_return_hang", { map: returnMap });
    this.#command(seller, "run_equipment_sell", {});
    this.#publish();
    return this.snapshot();
  }

  onTelemetry(deviceId, telemetry) {
    if (this.state.status !== "running") return this.snapshot();
    const seller = this.#automationFor(this.state.seller, deviceId, telemetry);
    const buyer = this.#automationFor(this.state.buyer, deviceId, telemetry);
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
    if (!this.state.sellerReleased && Number.isFinite(transferredAt)
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
    if (this.state.sellerReleased && seller?.task === "temple" && seller.status === "ok"
        && Number(seller.updatedAt) >= this.state.startedAt) {
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
    this.emitAction({ deviceId: account.deviceId, accountLabel: account.accountLabel,
      command, parameters: { accountIndex: account.accountIndex, ...parameters } });
  }

  #fail(message) {
    this.state.status = "error";
    this.state.phase = "error";
    this.state.updatedAt = this.now();
    this.state.message = message;
    this.#publish();
    return this.snapshot();
  }

  #publish() { this.onUpdate(this.snapshot()); }
}
