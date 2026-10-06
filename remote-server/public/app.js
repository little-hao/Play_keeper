const elements = {
  loginPanel: document.querySelector("#loginPanel"),
  dashboard: document.querySelector("#dashboard"),
  adminToken: document.querySelector("#adminToken"),
  connectButton: document.querySelector("#connectButton"),
  disconnectButton: document.querySelector("#disconnectButton"),
  refreshStatus: document.querySelector("#refreshStatus"),
  connectionState: document.querySelector("#connectionState"),
  loginError: document.querySelector("#loginError"),
  deviceCount: document.querySelector("#deviceCount"),
  deviceList: document.querySelector("#deviceList"),
  deviceTemplate: document.querySelector("#deviceTemplate"),
  eventLog: document.querySelector("#eventLog"),
  clearLog: document.querySelector("#clearLog"),
  selectOverlay: document.querySelector("#selectOverlay"),
  selectTitle: document.querySelector("#selectTitle"),
  selectAccount: document.querySelector("#selectAccount"),
  selectOptions: document.querySelector("#selectOptions"),
  closeSelect: document.querySelector("#closeSelect")
};

const devices = new Map();
const previewFrames = new Map();
const activePreviews = new Set();
const previewSettings = new Map();
const previewProfiles = {
  "720": { maxWidth: 720, fps: 1, label: "流畅" },
  "1280": { maxWidth: 1280, fps: 0.33, label: "高清" },
  "2560": { maxWidth: 2560, fps: 0.1, label: "超清" }
};
const auctionPresets = {
  one: "曙光印记,进化宝石",
  two: "强化丹A,强化丹B,天仙雨露,雨露结晶",
  three: "黑暗徽章,黑暗结晶,黑暗首领的勋章,黑暗宝石"
};
const defaultEquipmentItems = "柔情方巾·改,轻罗流萤衫·改,逢羡履·改,君我剑·改,佳人之恋·改,"
  + "三生戒·改,比翼·改,相望镯·改,尾生之泪·改,龙神印记·庆";
let socket;
let manuallyClosed = false;
let reconnectTimer;
let connectionGeneration = 0;
let pendingSelect;

elements.adminToken.value = sessionStorage.getItem("playKeeperAdminToken") ?? "";
elements.connectButton.addEventListener("click", connect);
elements.adminToken.addEventListener("keydown", (event) => { if (event.key === "Enter") connect(); });
elements.disconnectButton.addEventListener("click", disconnect);
elements.refreshStatus.addEventListener("click", () => {
  for (const deviceId of devices.keys()) sendCommand(deviceId, "request_status", {});
});
elements.clearLog.addEventListener("click", () => elements.eventLog.replaceChildren());
elements.closeSelect.addEventListener("click", closeSelectDialog);
elements.selectOverlay.addEventListener("click", (event) => {
  if (event.target === elements.selectOverlay) closeSelectDialog();
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") stopAllPreviews();
});

function connect() {
  const token = elements.adminToken.value.trim();
  if (!token) return showError("请输入管理密钥");
  sessionStorage.setItem("playKeeperAdminToken", token);
  manuallyClosed = false;
  const generation = ++connectionGeneration;
  clearTimeout(reconnectTimer);
  if (socket) socket.close();
  setConnectionState("connecting", "连接中");
  showError("");
  const scheme = location.protocol === "https:" ? "wss:" : "ws:";
  socket = new WebSocket(`${scheme}//${location.host}/control`);
  socket.addEventListener("open", () => socket.send(JSON.stringify({ type: "control.hello", token })));
  socket.addEventListener("message", (event) => {
    if (generation !== connectionGeneration) return;
    try { handleMessage(JSON.parse(event.data)); } catch { addLog("收到无法识别的服务器消息"); }
  });
  socket.addEventListener("close", () => {
    if (generation !== connectionGeneration) return;
    setConnectionState("offline", "已断开");
    if (!manuallyClosed) reconnectTimer = setTimeout(connect, 3000);
  });
  socket.addEventListener("error", () => {
    if (generation === connectionGeneration) showError("无法连接服务器，请检查网络或部署地址");
  });
}

function disconnect() {
  stopAllPreviews();
  manuallyClosed = true;
  connectionGeneration += 1;
  clearTimeout(reconnectTimer);
  sessionStorage.removeItem("playKeeperAdminToken");
  devices.clear();
  previewFrames.clear();
  activePreviews.clear();
  closeSelectDialog();
  renderDevices();
  socket?.close();
  elements.loginPanel.classList.remove("hidden");
  elements.dashboard.classList.add("hidden");
}

function handleMessage(message) {
  switch (message.type) {
    case "control.accepted":
      setConnectionState("online", "已连接");
      elements.loginPanel.classList.add("hidden");
      elements.dashboard.classList.remove("hidden");
      addLog("控制台已安全连接");
      break;
    case "control.rejected":
      manuallyClosed = true;
      showError("管理密钥错误");
      sessionStorage.removeItem("playKeeperAdminToken");
      socket?.close();
      break;
    case "devices.snapshot":
      devices.clear();
      for (const device of message.devices ?? []) devices.set(device.deviceId, device);
      renderDevices();
      break;
    case "device.online":
      devices.set(message.device.deviceId, message.device);
      renderDevices();
      addLog(`${message.device.deviceId} 已上线`);
      break;
    case "device.offline":
      if (pendingSelect?.deviceId === message.deviceId) closeSelectDialog();
      devices.delete(message.deviceId);
      previewFrames.delete(message.deviceId);
      activePreviews.delete(message.deviceId);
      renderDevices();
      addLog(`${message.deviceId} 已离线`);
      break;
    case "telemetry.update": {
      const current = devices.get(message.deviceId) ?? { deviceId: message.deviceId };
      current.telemetry = message.payload;
      current.lastUpdate = message.timestamp;
      devices.set(message.deviceId, current);
      renderDevices();
      break;
    }
    case "preview.frame":
      previewFrames.set(message.deviceId, message.payload);
      updatePreviewFrame(message.deviceId, message.payload);
      break;
    case "interaction.select":
      showSelectDialog(message.deviceId, message.payload);
      break;
    case "command.queued":
      addLog(`命令已发送至 ${message.deviceId}`);
      break;
    case "command.result":
      addLog(`${message.deviceId}：${message.success ? "成功" : "失败"} · ${message.message}`);
      break;
    case "command.error":
      addLog(`操作失败：${message.message}`);
      break;
  }
}

function renderDevices() {
  elements.deviceCount.textContent = String(devices.size);
  elements.deviceList.replaceChildren();
  if (devices.size === 0) {
    const empty = document.createElement("p");
    empty.textContent = "暂无在线设备。请在安卓 APP 的“远程”设置中填写 WSS 地址和设备密钥。";
    elements.deviceList.append(empty);
    return;
  }
  for (const device of devices.values()) {
    const card = elements.deviceTemplate.content.firstElementChild.cloneNode(true);
    const telemetry = device.telemetry ?? {};
    const battery = telemetry.battery ?? {};
    const app = telemetry.app ?? {};
    const accounts = Array.isArray(telemetry.accounts) ? telemetry.accounts : [];
    const deviceInfo = telemetry.device ?? {};
    const activeAccountIndex = Number.isInteger(app.activeAccount) ? app.activeAccount : 0;
    const activeAccountTelemetry = accounts.find((account) => account?.index === activeAccountIndex) ?? {};
    const automation = activeAccountTelemetry.automation ?? {};
    card.dataset.deviceId = device.deviceId;
    card.querySelector(".device-id").textContent = device.deviceId;
    card.querySelector(".device-model").textContent = [deviceInfo.manufacturer, deviceInfo.model].filter(Boolean).join(" ") || "等待设备状态";
    card.querySelector(".last-update").textContent = formatTime(device.lastUpdate ?? device.connectedAt);
    card.querySelector(".battery-level").textContent = value(battery.levelPercent, "%");
    card.querySelector(".battery-temp").textContent = value(battery.temperatureC, "°C", 1);
    card.querySelector(".battery-power").textContent = value(battery.estimatedPowerW, "W", 2);
    const activeMonitor = activeAccountTelemetry.automation ?? {};
    card.querySelector(".active-account").textContent = Number.isInteger(app.activeAccount)
      ? `${accountLabel(accounts, app.activeAccount)}${activeMonitor.monitorStatus === "offline" ? " · 掉线" : ""}` : "--";
    const runState = app.blackScreen
      ? "前台常亮 · 黑色遮罩已开启"
      : "前台常亮 · 页面可见";
    card.querySelector(".device-note").textContent = `${runState} · Android ${deviceInfo.androidVersion ?? "--"} · WebView ${deviceInfo.webViewVersion ?? "--"}`;

    const tabs = card.querySelector(".account-tabs");
    for (let index = 0; index < 4; index += 1) {
      const button = document.createElement("button");
      const account = accounts.find((item) => item?.index === index) ?? {};
      const monitor = account.automation ?? {};
      const isOffline = monitor.monitorStatus === "offline";
      button.textContent = `${accountLabel(accounts, index)}${isOffline ? " · 掉线" : ""}`;
      if (isOffline) button.classList.add("offline");
      if (monitor.monitorStatus === "online") button.classList.add("healthy");
      button.title = monitor.monitorMessage || "等待战斗统计检查";
      if (app.activeAccount === index) button.classList.add("active");
      button.addEventListener("click", () => sendCommand(device.deviceId, "switch_account", { accountIndex: index }));
      tabs.append(button);
    }
    card.querySelectorAll(".button-grid button").forEach((button) => {
      button.addEventListener("click", () => {
        const parameters = {};
        const accountIndex = Number.isInteger(app.activeAccount) ? app.activeAccount : 0;
        if (["reload_account", "open_home", "set_orientation"].includes(button.dataset.command)) {
          parameters.accountIndex = accountIndex;
        }
        if (button.dataset.orientation) parameters.orientation = button.dataset.orientation;
        sendCommand(device.deviceId, button.dataset.command, parameters);
      });
    });
    const resolution = card.querySelector(".preview-resolution");
    resolution.value = previewSettings.get(device.deviceId) ?? "720";
    resolution.addEventListener("change", () => previewSettings.set(device.deviceId, resolution.value));
    card.querySelector(".preview-start").addEventListener("click", () => {
      const accountIndex = Number.isInteger(app.activeAccount) ? app.activeAccount : 0;
      const selectedProfile = previewProfiles[resolution.value] ?? previewProfiles["720"];
      previewSettings.set(device.deviceId, String(selectedProfile.maxWidth));
      activePreviews.add(device.deviceId);
      sendCommand(device.deviceId, "preview_start", {
        accountIndex, maxWidth: selectedProfile.maxWidth, fps: selectedProfile.fps
      });
      card.querySelector(".preview-status").textContent = `正在等待${selectedProfile.label}画面…`;
    });
    card.querySelector(".preview-stop").addEventListener("click", () => {
      sendCommand(device.deviceId, "preview_stop", {});
      activePreviews.delete(device.deviceId);
      previewFrames.delete(device.deviceId);
      showPreviewPlaceholder(card, "预览已停止");
    });
    card.querySelector(".preview-image").addEventListener("click", (event) => {
      const frame = previewFrames.get(device.deviceId);
      if (!frame) return addLog("尚未收到可点击的手机画面");
      const rectangle = event.currentTarget.getBoundingClientRect();
      const imageRatio = frame.width / frame.height;
      const boxRatio = rectangle.width / rectangle.height;
      const contentWidth = boxRatio > imageRatio ? rectangle.height * imageRatio : rectangle.width;
      const contentHeight = boxRatio > imageRatio ? rectangle.height : rectangle.width / imageRatio;
      const contentLeft = rectangle.left + (rectangle.width - contentWidth) / 2;
      const contentTop = rectangle.top + (rectangle.height - contentHeight) / 2;
      const x = (event.clientX - contentLeft) / contentWidth;
      const y = (event.clientY - contentTop) / contentHeight;
      if (x < 0 || x > 1 || y < 0 || y > 1) return addLog("请点击画面内容区域");
      sendCommand(device.deviceId, "pointer_tap", {
        accountIndex: frame.accountIndex,
        x: Math.max(0, Math.min(1, x)),
        y: Math.max(0, Math.min(1, y)),
        frameSequence: frame.sequence
      });
    });

    const auctionEnabled = card.querySelector(".auction-enabled");
    const auctionHours = card.querySelector(".auction-hours");
    const auctionItemsInput = card.querySelector(".auction-items");
    const auctionPreset = card.querySelector(".auction-preset");
    const auctionBuyer = card.querySelector(".auction-buyer");
    const auctionPrice = card.querySelector(".auction-price");
    const storeSellEnabled = card.querySelector(".store-sell-enabled");
    const storeSellItem = card.querySelector(".store-sell-item");
    const templeEnabled = card.querySelector(".temple-enabled");
    const warehouseEnabled = card.querySelector(".warehouse-enabled");
    const warehouseStoreAll = card.querySelector(".warehouse-store-all");
    const warehouseItem = card.querySelector(".warehouse-item");
    const dungeonItemsInput = card.querySelector(".dungeon-items");
    const prestigeEnabled = card.querySelector(".prestige-enabled");
    const prestigeItemsInput = card.querySelector(".prestige-items");
    const equipmentItemsInput = card.querySelector(".equipment-items");
    const equipmentPriceInput = card.querySelector(".equipment-price");
    const equipmentBuyerInput = card.querySelector(".equipment-buyer");
    const auctionItems = Array.isArray(automation.auctionItems)
      ? automation.auctionItems : (automation.sellItems ?? ["进化宝石", "曙光印记"]);
    auctionEnabled.checked = automation.auctionEnabled === true || automation.sellEnabled === true;
    auctionHours.value = String(Number.isInteger(automation.auctionIntervalHours)
      ? automation.auctionIntervalHours : (automation.sellIntervalHours ?? 12));
    auctionItemsInput.value = auctionItems.join(",") || auctionPresets.one;
    auctionPreset.value = Object.entries(auctionPresets)
      .find(([, value]) => value === auctionItemsInput.value)?.[0] ?? "custom";
    auctionPreset.addEventListener("change", () => {
      if (auctionPreset.value !== "custom") auctionItemsInput.value = auctionPresets[auctionPreset.value];
    });
    auctionItemsInput.addEventListener("input", () => {
      auctionPreset.value = Object.entries(auctionPresets)
        .find(([, value]) => value === auctionItemsInput.value.trim())?.[0] ?? "custom";
    });
    auctionBuyer.value = typeof automation.auctionBuyer === "string" && automation.auctionBuyer
      ? automation.auctionBuyer : (automation.sellBuyer || "hao");
    auctionPrice.value = String(Number.isInteger(automation.auctionPrice)
      ? automation.auctionPrice : 920);
    storeSellEnabled.checked = automation.storeSellEnabled === true;
    storeSellItem.value = "金币券";
    templeEnabled.checked = automation.templeEnabled === true;
    warehouseEnabled.checked = automation.warehouseEnabled === true;
    warehouseStoreAll.checked = automation.warehouseStoreAll !== false;
    warehouseItem.value = typeof automation.warehouseItem === "string"
      && automation.warehouseItem.trim() ? automation.warehouseItem.trim() : "护宠仙石";
    dungeonItemsInput.value = Array.isArray(automation.dungeonItems)
      ? automation.dungeonItems.join(",") : "绘画小屋,伊苏王的神墓,火龙王的宫殿,史芬克斯密穴";
    prestigeEnabled.checked = automation.prestigeEnabled === true;
    prestigeItemsInput.value = Array.isArray(automation.prestigeItems)
      ? automation.prestigeItems.join(",") : "黑暗徽章,黑暗结晶,黑暗首领的勋章,黑暗宝石";
    equipmentItemsInput.value = Array.isArray(automation.equipmentItems)
      ? automation.equipmentItems.join(",") : defaultEquipmentItems;
    equipmentPriceInput.value = String(Number.isInteger(automation.equipmentPrice)
      ? automation.equipmentPrice : 920);
    equipmentBuyerInput.value = typeof automation.equipmentBuyer === "string"
      ? automation.equipmentBuyer : "";
    card.querySelector(".automation-status").textContent = automation.busy
      ? `运行中 · ${automation.lastMessage || "正在执行"}`
      : (automation.lastMessage || "尚未运行");
    const confirmation = card.querySelector(".automation-confirmation");
    if (automation.awaitingConfirmation === true) {
      confirmation.classList.remove("hidden");
      const seconds = Math.max(0, Math.ceil(((automation.confirmationDeadlineAt || Date.now()) - Date.now()) / 1000));
      card.querySelector(".automation-confirmation-message").textContent =
        `${automation.confirmationMessage || "是否进入圣兽云殿？"}（约${seconds}秒后自动进入）`;
    }

    const saveAutomation = () => {
      const items = auctionItemsInput.value.split(/[,，\n]/)
        .map((item) => item.trim()).filter(Boolean);
      const intervalHours = Number.parseInt(auctionHours.value, 10);
      const buyer = auctionBuyer.value.trim();
      const itemAuctionPrice = Number.parseInt(auctionPrice.value, 10);
      const equipmentItems = equipmentItemsInput.value.split(/[,，\n]/)
        .map((item) => item.trim()).filter(Boolean);
      const equipmentPrice = Number.parseInt(equipmentPriceInput.value, 10);
      const equipmentBuyer = equipmentBuyerInput.value.trim();
      const warehouseItems = warehouseItem.value.split(/[,，\n]/)
        .map((item) => item.trim()).filter(Boolean);
      const dungeonItems = dungeonItemsInput.value.split(/[,，\n]/)
        .map((item) => item.trim()).filter(Boolean);
      const prestigeItems = prestigeItemsInput.value.split(/[,，\n]/)
        .map((item) => item.trim()).filter(Boolean);
      if (!items.length || items.length > 10 || items.some((item) => item.length > 30)) {
        return addLog("拍卖道具需填写1–10种，每项不超过30字");
      }
      if (!Number.isInteger(intervalHours) || intervalHours < 1 || intervalHours > 168) {
        return addLog("拍卖间隔需为1–168小时");
      }
      if (!/^[A-Za-z0-9_.-]{1,30}$/.test(buyer)) return addLog("指定买家格式无效");
      if (!Number.isInteger(itemAuctionPrice) || itemAuctionPrice < 1
          || itemAuctionPrice > 9_999_999) return addLog("拍卖单价无效");
      if (!equipmentItems.length || equipmentItems.length > 10
          || equipmentItems.some((item) => item.length > 30)) {
        return addLog("装备名称需填写1–10种，每项不超过30字");
      }
      if (!Number.isInteger(equipmentPrice) || equipmentPrice < 1 || equipmentPrice > 9_999_999) {
        return addLog("装备单价需为1–9999999金币");
      }
      if (!/^[A-Za-z0-9@_.-]{0,30}$/.test(equipmentBuyer)) {
        return addLog("装备指定买家ID格式无效");
      }
      if (!warehouseItems.length || warehouseItems.length > 10
          || warehouseItems.some((item) => item.length > 30)) {
        return addLog("存仓组合需填写1–10种，每项不超过30字");
      }
      if (!dungeonItems.length || dungeonItems.length > 20
          || dungeonItems.some((item) => item.length > 30)) {
        return addLog("副本组合需填写1–20项，每项不超过30字");
      }
      if (!prestigeItems.length || prestigeItems.length > 10
          || prestigeItems.some((item) => item.length > 30)) {
        return addLog("威望道具需填写1–10种，每项不超过30字");
      }
      sendCommand(device.deviceId, "configure_auto_auction", {
        accountIndex: activeAccountIndex,
        enabled: auctionEnabled.checked,
        items,
        buyer,
        price: itemAuctionPrice,
        intervalHours
      });
      sendCommand(device.deviceId, "configure_store_sell", {
        accountIndex: activeAccountIndex,
        enabled: storeSellEnabled.checked,
        items: [storeSellItem.value],
        intervalHours
      });
      sendCommand(device.deviceId, "configure_temple_guard", {
        accountIndex: activeAccountIndex,
        enabled: templeEnabled.checked
      });
      sendCommand(device.deviceId, "configure_warehouse_sync", {
        accountIndex: activeAccountIndex,
        enabled: warehouseEnabled.checked,
        storeAll: warehouseStoreAll.checked,
        items: warehouseItems
      });
      sendCommand(device.deviceId, "configure_dungeon_sequence", {
        accountIndex: activeAccountIndex,
        items: dungeonItems
      });
      sendCommand(device.deviceId, "configure_prestige_items", {
        accountIndex: activeAccountIndex,
        enabled: prestigeEnabled.checked,
        items: prestigeItems
      });
      sendCommand(device.deviceId, "configure_equipment_transfer", {
        accountIndex: activeAccountIndex,
        items: equipmentItems,
        price: equipmentPrice,
        buyer: equipmentBuyer
      });
      addLog(`${accountLabel(accounts, activeAccountIndex)} 脚本设置已发送`);
      return true;
    };
    card.querySelector(".save-automation").addEventListener("click", saveAutomation);
    card.querySelector(".cancel-automation").addEventListener("click", () => {
      sendCommand(device.deviceId, "cancel_automation", { accountIndex: activeAccountIndex });
    });
    card.querySelector(".run-auction").addEventListener("click", () => {
      if (saveAutomation()) sendCommand(device.deviceId, "run_auto_auction", { accountIndex: activeAccountIndex });
    });
    card.querySelector(".run-auction-buy").addEventListener("click", () => {
      if (saveAutomation()) sendCommand(device.deviceId, "run_auction_buy", { accountIndex: activeAccountIndex });
    });
    card.querySelector(".run-store-sell").addEventListener("click", () => {
      if (saveAutomation()) sendCommand(device.deviceId, "run_store_sell", { accountIndex: activeAccountIndex });
    });
    card.querySelector(".run-warehouse").addEventListener("click", () => {
      if (saveAutomation()) sendCommand(device.deviceId, "run_warehouse_sync", { accountIndex: activeAccountIndex });
    });
    card.querySelector(".run-temple").addEventListener("click", () => {
      if (saveAutomation()) sendCommand(device.deviceId, "run_temple_guard", { accountIndex: activeAccountIndex });
    });
    card.querySelector(".run-dungeons").addEventListener("click", () => {
      if (saveAutomation()) sendCommand(device.deviceId, "run_dungeon_sequence", { accountIndex: activeAccountIndex });
    });
    card.querySelector(".run-prestige").addEventListener("click", () => {
      if (saveAutomation()) sendCommand(device.deviceId, "run_prestige_items", { accountIndex: activeAccountIndex });
    });
    card.querySelector(".confirm-temple").addEventListener("click", () => {
      sendCommand(device.deviceId, "resolve_temple_confirmation", { accountIndex: activeAccountIndex, enterTemple: true });
    });
    card.querySelector(".decline-temple").addEventListener("click", () => {
      sendCommand(device.deviceId, "resolve_temple_confirmation", { accountIndex: activeAccountIndex, enterTemple: false });
    });
    card.querySelector(".run-equipment-sell").addEventListener("click", () => {
      if (!equipmentBuyerInput.value.trim()) return addLog("上架装备前请填写指定买家ID");
      if (saveAutomation()) sendCommand(device.deviceId, "run_equipment_sell", { accountIndex: activeAccountIndex });
    });
    card.querySelector(".run-equipment-buy").addEventListener("click", () => {
      if (saveAutomation()) sendCommand(device.deviceId, "run_equipment_buy", { accountIndex: activeAccountIndex });
    });
    elements.deviceList.append(card);
    if (!app.previewEnabled) {
      previewFrames.delete(device.deviceId);
      activePreviews.delete(device.deviceId);
    }
    const frame = previewFrames.get(device.deviceId);
    if (frame) updatePreviewFrame(device.deviceId, frame);
  }
}

function showSelectDialog(deviceId, interaction) {
  if (!interaction || !Array.isArray(interaction.options)) return;
  pendingSelect = { deviceId, interaction };
  elements.selectTitle.textContent = interaction.title || "请选择";
  elements.selectAccount.textContent = `${interaction.accountLabel || `账号${interaction.accountIndex + 1}`} · 选择后会立即同步到手机页面`;
  elements.selectOptions.replaceChildren();
  for (const option of interaction.options) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "select-option";
    button.disabled = option.disabled === true;
    button.setAttribute("role", "radio");
    button.setAttribute("aria-checked", option.selected === true ? "true" : "false");
    if (option.selected === true) button.classList.add("selected");
    const label = document.createElement("span");
    label.textContent = option.label || `选项 ${option.index + 1}`;
    const mark = document.createElement("span");
    mark.className = "select-mark";
    button.append(label, mark);
    button.addEventListener("click", () => {
      sendCommand(deviceId, "select_option", {
        accountIndex: interaction.accountIndex,
        elementToken: interaction.elementToken,
        optionIndex: option.index
      });
      addLog(`已选择：${label.textContent}`);
      closeSelectDialog();
    });
    elements.selectOptions.append(button);
  }
  elements.selectOverlay.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function closeSelectDialog() {
  pendingSelect = undefined;
  elements.selectOverlay.classList.add("hidden");
  elements.selectOptions.replaceChildren();
  document.body.style.overflow = "";
}

function stopAllPreviews() {
  if (socket?.readyState === WebSocket.OPEN) {
    for (const deviceId of activePreviews) {
      sendCommand(deviceId, "preview_stop", {});
    }
  }
  activePreviews.clear();
  previewFrames.clear();
}

function accountLabel(accounts, index) {
  const label = accounts.find((account) => account?.index === index)?.label;
  return typeof label === "string" && label.trim() ? label.trim().slice(0, 24) : `账号${index + 1}`;
}

function updatePreviewFrame(deviceId, frame) {
  const card = elements.deviceList.querySelector(`[data-device-id="${deviceId}"]`);
  if (!card || frame?.mime !== "image/jpeg" || typeof frame.imageBase64 !== "string") return;
  const image = card.querySelector(".preview-image");
  const stage = card.querySelector(".preview-stage");
  const portrait = frame.height >= frame.width;
  stage.classList.toggle("portrait", portrait);
  stage.classList.toggle("landscape", !portrait);
  stage.style.setProperty("--frame-ratio", `${frame.width} / ${frame.height}`);
  image.src = `data:image/jpeg;base64,${frame.imageBase64}`;
  image.classList.remove("hidden");
  card.querySelector(".preview-placeholder").classList.add("hidden");
  card.querySelector(".preview-status").textContent = `${frame.accountLabel || `账号${frame.accountIndex + 1}`} · ${frame.width}×${frame.height} · ${formatTime(Date.now())}`;
}

function showPreviewPlaceholder(card, text) {
  const image = card.querySelector(".preview-image");
  image.removeAttribute("src");
  image.classList.add("hidden");
  const placeholder = card.querySelector(".preview-placeholder");
  placeholder.textContent = text;
  placeholder.classList.remove("hidden");
  card.querySelector(".preview-status").textContent = "按需加载，不在服务器保存";
}

function sendCommand(deviceId, command, parameters) {
  if (socket?.readyState !== WebSocket.OPEN) return addLog("控制台未连接");
  socket.send(JSON.stringify({ type: "command.send", deviceId, command, parameters }));
}

function setConnectionState(className, text) {
  elements.connectionState.className = `state ${className}`;
  elements.connectionState.textContent = text;
}

function showError(message) { elements.loginError.textContent = message; }
function value(input, suffix, digits = 0) {
  return typeof input === "number" && Number.isFinite(input) ? `${input.toFixed(digits)}${suffix}` : "--";
}
function formatTime(timestamp) {
  return timestamp ? new Date(timestamp).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "等待状态";
}
function addLog(text) {
  const item = document.createElement("li");
  const time = document.createElement("time");
  time.textContent = new Date().toLocaleTimeString("zh-CN", { hour12: false });
  item.append(time, document.createTextNode(text));
  elements.eventLog.prepend(item);
  while (elements.eventLog.children.length > 60) elements.eventLog.lastElementChild.remove();
}
