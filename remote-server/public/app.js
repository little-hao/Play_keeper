const elements = {
  loginPanel: document.querySelector("#loginPanel"),
  loginUser: document.querySelector("#loginUser"),
  loginDeviceToken: document.querySelector("#loginDeviceToken"),
  rememberLogin: document.querySelector("#rememberLogin"),
  dashboard: document.querySelector("#dashboard"),
  adminToken: document.querySelector("#adminToken"),
  connectButton: document.querySelector("#connectButton"),
  disconnectButton: document.querySelector("#disconnectButton"),
  refreshStatus: document.querySelector("#refreshStatus"),
  connectionState: document.querySelector("#connectionState"),
  loginError: document.querySelector("#loginError"),
  deviceCount: document.querySelector("#deviceCount"),
  sessionUser: document.querySelector("#sessionUser"),
  sessionTask: document.querySelector("#sessionTask"),
  sessionStartedAt: document.querySelector("#sessionStartedAt"),
  sessionRuntime: document.querySelector("#sessionRuntime"),
  deviceList: document.querySelector("#deviceList"),
  deviceTemplate: document.querySelector("#deviceTemplate"),
  eventLog: document.querySelector("#eventLog"),
  clearLog: document.querySelector("#clearLog"),
  selectOverlay: document.querySelector("#selectOverlay"),
  selectTitle: document.querySelector("#selectTitle"),
  selectAccount: document.querySelector("#selectAccount"),
  selectOptions: document.querySelector("#selectOptions"),
  closeSelect: document.querySelector("#closeSelect"),
  dailyPlanStatus: document.querySelector("#dailyPlanStatus"),
  dailyPlanDetail: document.querySelector("#dailyPlanDetail"),
  dailyPlanProgress: document.querySelector("#dailyPlanProgress"),
  startDailyPlan: document.querySelector("#startDailyPlan"),
  retryDailyPlan: document.querySelector("#retryDailyPlan"),
  cancelDailyPlan: document.querySelector("#cancelDailyPlan"),
  planIntervention: document.querySelector("#planIntervention"),
  resumeConfirmation: document.querySelector("#resumeConfirmation"),
  resumeEquipmentHolder: document.querySelector("#resumeEquipmentHolder"),
  planRoutePreset: document.querySelector("#planRoutePreset"),
  planResourcePreset: document.querySelector("#planResourcePreset"),
  planRoute: document.querySelector("#planRoute"),
  planEquipmentPreset: document.querySelector("#planEquipmentPreset"),
  planEquipmentItems: document.querySelector("#planEquipmentItems"),
  planEquipmentPrice: document.querySelector("#planEquipmentPrice"),
  planResourceItems: document.querySelector("#planResourceItems"),
  planResourcePrice: document.querySelector("#planResourcePrice"),
  planResourceReserve: document.querySelector("#planResourceReserve"),
  planDungeonPreset: document.querySelector("#planDungeonPreset"),
  planDungeonItems: document.querySelector("#planDungeonItems"),
  planInventoryItems: document.querySelector("#planInventoryItems"),
  planReturnMap: document.querySelector("#planReturnMap"),
  planReturnMaps: document.querySelector("#planReturnMaps"),
  planReportEmail: document.querySelector("#planReportEmail"),
  planDisconnectGrace: document.querySelector("#planDisconnectGrace"),
  planSellerTimeout: document.querySelector("#planSellerTimeout"),
  planBuyerTimeout: document.querySelector("#planBuyerTimeout"),
  planResourceTimeout: document.querySelector("#planResourceTimeout"),
  planScheduleEnabled: document.querySelector("#planScheduleEnabled"),
  planScheduleTime: document.querySelector("#planScheduleTime"),
  savePlanSchedule: document.querySelector("#savePlanSchedule"),
  planScheduleStatus: document.querySelector("#planScheduleStatus"),
  quickAuctionAccount: document.querySelector("#quickAuctionAccount"),
  quickBuyerAccount: document.querySelector("#quickBuyerAccount"),
  userAccountOptions: document.querySelector("#userAccountOptions"),
  hangAccountOptions: document.querySelector("#hangAccountOptions"),
  quickAuctionToMain: document.querySelector("#quickAuctionToMain"),
  quickBuyPrice: document.querySelector("#quickBuyPrice"),
  quickMainBuy: document.querySelector("#quickMainBuy"),
  quickSweepAll: document.querySelector("#quickSweepAll"),
  quickHangAccount: document.querySelector("#quickHangAccount"),
  quickHangMap: document.querySelector("#quickHangMap"),
  quickStartHang: document.querySelector("#quickStartHang"),
  downloadPlanDiagnostics: document.querySelector("#downloadPlanDiagnostics"),
  downloadDiagnosticBundle: document.querySelector("#downloadDiagnosticBundle"),
  keepPlayerDevice: document.querySelector("#keepPlayerDevice"),
  startKeepPlayer: document.querySelector("#startKeepPlayer"),
  exitKeepPlayer: document.querySelector("#exitKeepPlayer"),
  globalDailyMonitor: document.querySelector("#globalDailyMonitor"),
  refreshAllInventory: document.querySelector("#refreshAllInventory")
  ,userAdminPanel: document.querySelector("#userAdminPanel"),
  newUsername: document.querySelector("#newUsername"),
  newUserPassword: document.querySelector("#newUserPassword"),
  newUserDeviceToken: document.querySelector("#newUserDeviceToken"),
  newUserAccounts: document.querySelector("#newUserAccounts"),
  newUserRole: document.querySelector("#newUserRole"),
  saveUser: document.querySelector("#saveUser"),
  assignDevice: document.querySelector("#assignDevice"),
  assignUser: document.querySelector("#assignUser"),
  assignDeviceButton: document.querySelector("#assignDeviceButton"),
  userAdminStatus: document.querySelector("#userAdminStatus")
};

const devices = new Map();
const previewFrames = new Map();
const activePreviews = new Set();
const previewSettings = new Map();
// Device telemetry can refresh while the operator is editing the advanced form.
// Keep equipment fields outside the replaced DOM until the APP reports the same
// configuration, otherwise a preset selection can silently revert to defaults.
const equipmentDrafts = new Map();
const previewProfiles = {
  "720": { maxWidth: 720, fps: 1, label: "流畅" },
  "1280": { maxWidth: 1280, fps: 0.33, label: "高清" },
  "2560": { maxWidth: 2560, fps: 0.1, label: "超清" }
};
const equipmentPresets = {
  ephis: "厄菲斯神剑,厄菲斯神铠,厄菲斯神冠,厄菲斯神靴,厄菲斯神链,厄菲斯神戒,厄菲斯神翼,厄菲斯神镯,厄菲斯神玉,厄菲斯神印",
  lover: "柔情方巾·改,轻罗流萤衫·改,逢羡履·改,君我剑·改,佳人之恋·改,三生戒·改,比翼·改,相望镯·改,尾生之泪·改,龙神印记·庆",
  lover_romance: "柔情方巾§恋§,轻罗流萤衫§恋§,逢羡履§恋§,君我剑§恋§,佳人之恋§恋§,三生戒§恋§,比翼§恋§,相望镯§恋§,尾生之泪§恋§"
};
const auctionPresets = {
  one: "曙光印记,进化宝石,强化丹A,强化丹B,天仙玉露",
  two: "黑暗徽章,黑暗结晶,黑暗首领的勋章,黑暗宝石"
};
const defaultDungeonItems = "绘画小屋,伊苏王的神墓,火龙王的宫殿,史芬克斯密穴";
const defaultRouteLabels = ["hao", "hao1", "hao2", "hao3", "hao4", "hao5", "hao6", "hao7", "hao"];
const defaultRouteText = defaultRouteLabels.join(" → ");
const defaultResourceItems = auctionPresets.one;
const defaultReturnMap = "圣兽云殿";
const defaultTransferPrice = 920;
const defaultEquipmentItems = "厄菲斯神剑,厄菲斯神铠,厄菲斯神冠,厄菲斯神靴,厄菲斯神链,"
  + "厄菲斯神戒,厄菲斯神翼,厄菲斯神镯,厄菲斯神玉,厄菲斯神印";
let socket;
let manuallyClosed = false;
let reconnectTimer;
let connectionGeneration = 0;
let pendingSelect;
let dailyPlan = { status: "idle", legIndex: -1, phase: "idle", history: [] };
let planSchedule = { enabled: false, time: "04:00", options: {} };
let signedInUser = null;
let userSettings = { accountLabels: [], mainAccount: "", quickAuctionAccount: "",
  quickBuyPrice: 920, quickHangAccount: "", quickHangMap: "圣兽云殿",
  auctionBuyer: "", equipmentBuyer: "" };
let adminSnapshot = { users: [], deviceOwners: {} };
const openAdvancedDevices = new Set();
let feedbackTimer;
let pendingPlanSave = false;
let singleTransfer = { status: "idle" };

function showFeedback(text, kind = "info") {
  const banner = document.querySelector("#operationFeedback");
  banner.textContent = text;
  banner.dataset.kind = kind;
  clearTimeout(feedbackTimer);
  if (kind === "pending") {
    feedbackTimer = setTimeout(() => {
      banner.dataset.kind = "warning";
      banner.textContent = "尚未收到明确反馈，请刷新状态并核对任务进度，避免重复提交。";
    }, 30_000);
  }
}

document.querySelector(".daily-plan-panel").addEventListener("input", () => {
  document.querySelector("#settingsSaveState").textContent = "有未保存的修改；保存后用于后续运行";
});
document.querySelector("#cancelSingleTransfer").addEventListener("click", () => {
  if (socket?.readyState !== WebSocket.OPEN) return showFeedback("连接已断开，未发送中断请求", "error");
  if (!window.confirm("中断单次转移的两方脚本并保留页面？不会自动回购或撤销已成交交易。")) return;
  socket.send(JSON.stringify({ type: "equipment.transfer.cancel" }));
  showFeedback("已请求中断单次转移，等待服务器确认", "pending");
});

function renderSingleTransfer() {
  document.querySelector("#singleTransferPanel").classList.toggle("hidden", singleTransfer.status === "idle");
  document.querySelector("#singleTransferDetail").textContent = singleTransfer.message || "";
  document.querySelector("#cancelSingleTransfer").disabled =
    !["running", "intervention"].includes(singleTransfer.status);
  renderSessionOverview();
}

function renderEquipmentChecks() {
  const panel = document.querySelector("#equipmentChecks");
  panel.replaceChildren();
  let count = 0;
  for (const device of devices.values()) {
    for (const account of device.telemetry?.accounts || []) {
      const automation = account.automation || {};
      if (!automation.equipmentVerificationToken) continue;
      count++;
      const box = document.createElement("div");
      const title = document.createElement("h2");
      title.textContent = `${account.label || `账号${account.index + 1}`} · 装备等待人工核验`;
      const detail = document.createElement("p");
      const names = (automation.equipmentVerificationItems || []).join("、");
      detail.textContent = `${automation.equipmentVerificationReason || "未能可靠读取装备"}。请在手机画面逐件检查主宠：${names}`;
      const confirm = document.createElement("button");
      confirm.className = "primary";
      confirm.textContent = "已逐件核对主宠装备，继续";
      confirm.addEventListener("click", () => {
        if (!window.confirm(`确认 ${account.label || "该账号"} 的主宠已穿戴以下全部装备？\n${names}\n此操作记录为人工核验，不代表自动检测成功。`)) return;
        sendCommand(device.deviceId, "confirm_equipment_verification",
          { accountIndex: account.index, verificationToken: automation.equipmentVerificationToken });
      });
      box.append(title, detail, confirm);
      panel.append(box);
    }
  }
  panel.classList.toggle("hidden", count === 0);
}

elements.loginUser.value = sessionStorage.getItem("playKeeperUser") ?? "";
elements.adminToken.value = sessionStorage.getItem("playKeeperCredential") ?? "";
elements.loginDeviceToken.value = sessionStorage.getItem("playKeeperDeviceToken") ?? "";
let savedLogins = {};
try { savedLogins = JSON.parse(localStorage.getItem("playKeeperLoginProfiles") || "{}"); }
catch { localStorage.removeItem("playKeeperLoginProfiles"); }
function loadSavedLogin() {
  const saved = savedLogins[elements.loginUser.value.trim()];
  if (!saved) return;
  elements.adminToken.value = saved.password || "";
  elements.loginDeviceToken.value = saved.deviceToken || "";
  elements.rememberLogin.checked = true;
}
elements.loginUser.addEventListener("change", loadSavedLogin);
if (!elements.adminToken.value) loadSavedLogin();
elements.connectButton.addEventListener("click", connect);
elements.adminToken.addEventListener("keydown", (event) => { if (event.key === "Enter") connect(); });
elements.disconnectButton.addEventListener("click", disconnect);
elements.refreshStatus.addEventListener("click", () => {
  for (const deviceId of devices.keys()) sendCommand(deviceId, "request_status", {});
});
elements.clearLog.addEventListener("click", () => elements.eventLog.replaceChildren());
elements.saveUser.addEventListener("click", () => {
  if (socket?.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify({ type: "admin.user.upsert",
    username: elements.newUsername.value.trim(), password: elements.newUserPassword.value,
    role: elements.newUserRole.value, deviceToken: elements.newUserDeviceToken.value.trim(),
    accountLabels: elements.newUserAccounts.value.split(/[,，\n]/).map((item) => item.trim()).filter(Boolean) }));
  elements.newUserPassword.value = "";
  elements.newUserDeviceToken.value = "";
});
elements.assignDeviceButton.addEventListener("click", () => {
  if (socket?.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify({ type: "admin.device.assign",
    deviceId: elements.assignDevice.value, username: elements.assignUser.value }));
});
elements.closeSelect.addEventListener("click", closeSelectDialog);
elements.startDailyPlan.addEventListener("click", () => {
  if (socket?.readyState !== WebSocket.OPEN) return addLog("控制台尚未连接");
  const options = readPlanOptions();
  if (!options) return;
  socket.send(JSON.stringify({ type: "plan.start", plan: "eight_account_daily",
    options }));
  showFeedback("已提交多用户挂机请求，等待服务器确认；不要重复点击", "pending");
});
elements.retryDailyPlan.addEventListener("click", () => {
  if (socket?.readyState === WebSocket.OPEN) {
    if (dailyPlan.mode !== "daily") {
      socket.send(JSON.stringify({ type: "plan.retry", plan: "eight_account_daily" }));
      return;
    }
    const equipmentHolder = elements.resumeEquipmentHolder.value;
    if (!equipmentHolder) return addLog("请先确认当前所选套装的所在账号");
    if (!window.confirm(`已核对当前所选套装全部在 ${equipmentHolder}？将保留原路线并继续对应阶段。装备尚未成交或分散时请取消。`)) return;
    socket.send(JSON.stringify({ type: "plan.retry", plan: "eight_account_daily",
      equipmentHolder }));
    addLog(`已提交恢复请求：从 ${equipmentHolder} 继续装备循环`);
    showFeedback(`恢复请求已提交：${equipmentHolder}，等待服务器确认`, "pending");
  } else {
    addLog("控制台连接已断开，恢复请求未发送");
  }
});
elements.cancelDailyPlan.addEventListener("click", () => {
  if (socket?.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify({ type: "plan.cancel", plan: "eight_account_daily" }));
  showFeedback("中断请求已提交，等待服务器确认", "pending");
});
elements.savePlanSchedule.addEventListener("click", () => {
  if (socket?.readyState !== WebSocket.OPEN) return addLog("控制台尚未连接");
  const options = readPlanOptions();
  if (!options) return;
  pendingPlanSave = true;
  document.querySelector("#settingsSaveState").textContent = "正在保存…";
  socket.send(JSON.stringify({ type: "plan.schedule.update", payload: {
    enabled: elements.planScheduleEnabled.checked,
    time: elements.planScheduleTime.value,
    options,
    workspace: { quickAuctionAccount: elements.quickAuctionAccount.value.trim(),
      quickBuyPrice: Number.parseInt(elements.quickBuyPrice.value, 10),
      quickHangAccount: elements.quickHangAccount.value.trim(),
      quickHangMap: elements.quickHangMap.value.trim(),
      auctionBuyer: elements.quickBuyerAccount.value.trim(), equipmentBuyer: "" }
  } }));
});
elements.downloadPlanDiagnostics.addEventListener("click", () => {
  if (socket?.readyState !== WebSocket.OPEN) return addLog("控制台尚未连接");
  socket.send(JSON.stringify({ type: "plan.diagnostics.request" }));
});
elements.downloadDiagnosticBundle.addEventListener("click", () => {
  if (socket?.readyState !== WebSocket.OPEN) return addLog("控制台尚未连接");
  socket.send(JSON.stringify({ type: "plan.diagnostics.bundle.request" }));
});
elements.planResourcePreset.addEventListener("change", () => {
  if (auctionPresets[elements.planResourcePreset.value]) {
    elements.planResourceItems.value = auctionPresets[elements.planResourcePreset.value];
  }
});
elements.planRoutePreset.addEventListener("change", () => {
  if (elements.planRoutePreset.value === "default") elements.planRoute.value = defaultRouteText;
  renderPlanReturnMaps();
});
elements.planRoute.addEventListener("input", () => {
  elements.planRoutePreset.value = elements.planRoute.value.trim() === defaultRouteText
    ? "default" : "custom";
});
elements.planRoute.addEventListener("change", () => renderPlanReturnMaps());
elements.planResourceItems.addEventListener("input", () => {
  elements.planResourcePreset.value = Object.entries(auctionPresets)
    .find(([, value]) => value === elements.planResourceItems.value.trim())?.[0] ?? "custom";
});
elements.planDungeonPreset.addEventListener("change", () => {
  if (elements.planDungeonPreset.value === "default") {
    elements.planDungeonItems.value = defaultDungeonItems;
  }
});
elements.planDungeonItems.addEventListener("input", () => {
  elements.planDungeonPreset.value = elements.planDungeonItems.value.trim() === defaultDungeonItems
    ? "default" : "custom";
});
elements.planEquipmentPreset.addEventListener("change", () => {
  const preset = equipmentPresets[elements.planEquipmentPreset.value];
  if (preset) elements.planEquipmentItems.value = preset;
});
elements.planEquipmentItems.addEventListener("input", () => {
  elements.planEquipmentPreset.value = Object.entries(equipmentPresets)
    .find(([, value]) => value === elements.planEquipmentItems.value.trim())?.[0] ?? "custom";
});
elements.startKeepPlayer.addEventListener("click", () => runKeepPlayerCommand("keep_player_start"));
elements.exitKeepPlayer.addEventListener("click", () => runKeepPlayerCommand("keep_player_exit"));
elements.refreshAllInventory.addEventListener("click", () => {
  const items = planInventoryItems();
  if (!items) return;
  let refreshed = 0;
  const labels = configuredAccountLabels();
  for (const label of labels) {
    const target = accountTarget(label);
    if (!target) continue;
    sendCommand(target.deviceId, "configure_inventory_monitor", {
      accountIndex: target.accountIndex, items });
    sendCommand(target.deviceId, "run_inventory_snapshot", { accountIndex: target.accountIndex });
    refreshed++;
  }
  addLog(`已按统一清单刷新 ${refreshed}/${labels.length} 个在线账号背包`);
});
elements.quickAuctionToMain.addEventListener("click", () => {
  const target = accountTarget(elements.quickAuctionAccount.value);
  if (!target) return addLog(`账号 ${elements.quickAuctionAccount.value || "--"} 当前不在线`);
  const items = planResourceItems();
  if (!items) return;
  const buyer = elements.quickBuyerAccount.value.trim();
  if (!buyer) return addLog("请先填写指定买家");
  const price = Number.parseInt(elements.quickBuyPrice.value, 10);
  if (!Number.isInteger(price) || price < 1 || price > 9_999_999) return addLog("快捷拍卖单价无效");
  const returnMap = elements.planReturnMap.value.trim() || "圣兽云殿";
  sendCommand(target.deviceId, "configure_auto_auction", { accountIndex: target.accountIndex,
    enabled: false, items, buyer, price, intervalHours: 24,
    reserveCount: Number(elements.planResourceReserve.value) });
  sendCommand(target.deviceId, "configure_return_hang", {
    accountIndex: target.accountIndex, map: returnMap });
  sendCommand(target.deviceId, "run_auto_auction", { accountIndex: target.accountIndex });
  addLog(`${target.label} 已按 ${price} 金币启动组合道具拍卖，指定买家 ${buyer}`);
});
elements.quickMainBuy.addEventListener("click", () => {
  const buyer = elements.quickBuyerAccount.value.trim();
  if (!buyer) return addLog("请先填写指定买家");
  const target = accountTarget(buyer);
  if (!target) return addLog(`主号 ${buyer} 当前不在线`);
  const items = planResourceItems();
  if (!items) return;
  const price = Number.parseInt(elements.quickBuyPrice.value, 10);
  if (!Number.isInteger(price) || price < 1 || price > 9_999_999) return addLog("快捷购买单价无效");
  const returnMap = elements.planReturnMap.value.trim() || "圣兽云殿";
  sendCommand(target.deviceId, "configure_auto_auction", { accountIndex: target.accountIndex,
    enabled: false, items, buyer, price, intervalHours: 24,
    reserveCount: Number(elements.planResourceReserve.value) });
  sendCommand(target.deviceId, "configure_return_hang", {
    accountIndex: target.accountIndex, map: returnMap });
  sendCommand(target.deviceId, "run_auction_buy", { accountIndex: target.accountIndex });
  addLog(`${buyer} 已启动 ${price} 金币组合道具购买`);
});
elements.quickSweepAll.addEventListener("click", () => {
  if (socket?.readyState !== WebSocket.OPEN) return addLog("控制台尚未连接");
  const options = readPlanOptions();
  if (!options) return;
  socket.send(JSON.stringify({ type: "plan.resource_sweep.start", options: {
    resourceItems: options.resourceItems,
    resourceReserveCount: options.resourceReserveCount,
    resourcePrice: options.resourcePrice,
    returnMap: options.returnMap,
    returnMaps: options.returnMaps,
    routeLabels: options.routeLabels
  } }));
  addLog("已启动路线卖方逐号拍卖、主号统一购买及全部账号回挂机副本");
});
elements.quickStartHang.addEventListener("click", () => {
  if (elements.quickHangAccount.value === "all") {
    const map = elements.quickHangMap.value.trim() || "圣兽云殿";
    let started = 0;
    const labels = configuredAccountLabels();
    for (const label of labels) {
      const target = accountTarget(label);
      if (!target) continue;
      sendCommand(target.deviceId, "configure_return_hang", { accountIndex: target.accountIndex, map });
      sendCommand(target.deviceId, "run_temple_guard", { accountIndex: target.accountIndex });
      started++;
    }
    return addLog(`已向 ${started}/${labels.length} 个在线账号发送${map}挂机指令`);
  }
  const target = accountTarget(elements.quickHangAccount.value);
  if (!target) return addLog(`账号 ${elements.quickHangAccount.value || "--"} 当前不在线`);
  const map = elements.quickHangMap.value.trim() || "圣兽云殿";
  sendCommand(target.deviceId, "configure_return_hang", {
    accountIndex: target.accountIndex, map });
  sendCommand(target.deviceId, "run_temple_guard", { accountIndex: target.accountIndex });
  addLog(`${target.label} 已启动${map}挂机`);
});
elements.selectOverlay.addEventListener("click", (event) => {
  if (event.target === elements.selectOverlay) closeSelectDialog();
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") stopAllPreviews();
});

function connect() {
  const token = elements.adminToken.value.trim();
  const username = elements.loginUser.value.trim();
  const deviceToken = elements.loginDeviceToken.value.trim();
  if (!token) return showError("请输入密码或管理密钥");
  sessionStorage.setItem("playKeeperUser", username);
  sessionStorage.setItem("playKeeperCredential", token);
  sessionStorage.setItem("playKeeperDeviceToken", deviceToken);
  if (elements.rememberLogin.checked && username) {
    savedLogins[username] = { password: token, deviceToken };
    localStorage.setItem("playKeeperLoginProfiles", JSON.stringify(savedLogins));
  } else if (username && savedLogins[username]) {
    delete savedLogins[username];
    localStorage.setItem("playKeeperLoginProfiles", JSON.stringify(savedLogins));
  }
  manuallyClosed = false;
  devices.clear();
  previewFrames.clear();
  activePreviews.clear();
  resetUserWorkspace();
  const generation = ++connectionGeneration;
  clearTimeout(reconnectTimer);
  if (socket) socket.close();
  setConnectionState("connecting", "连接中");
  showError("");
  const scheme = location.protocol === "https:" ? "wss:" : "ws:";
  socket = new WebSocket(`${scheme}//${location.host}/control`);
  socket.addEventListener("open", () => socket.send(JSON.stringify({
    type: "control.hello", username, password: token, token, deviceToken
  })));
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
  sessionStorage.removeItem("playKeeperCredential");
  sessionStorage.removeItem("playKeeperDeviceToken");
  devices.clear();
  resetUserWorkspace();
  previewFrames.clear();
  activePreviews.clear();
  closeSelectDialog();
  renderDevices();
  socket?.close();
  elements.loginPanel.classList.remove("hidden");
  elements.dashboard.classList.add("hidden");
}

function resetUserWorkspace() {
  signedInUser = null;
  userSettings = { accountLabels: [], mainAccount: "", quickAuctionAccount: "",
    quickBuyPrice: 920, quickHangAccount: "", quickHangMap: "圣兽云殿",
    auctionBuyer: "", equipmentBuyer: "" };
  dailyPlan = { status: "idle", legIndex: -1, phase: "idle", history: [] };
  planSchedule = { enabled: false, time: "04:00", options: {} };
  adminSnapshot = { users: [], deviceOwners: {} };
  singleTransfer = { status: "idle" };
  pendingPlanSave = false;
  clearTimeout(feedbackTimer);
  renderSingleTransfer();
  renderEquipmentChecks();
  document.querySelector("#settingsSaveState").textContent = "设置按当前登录用户保存";
  showFeedback("请选择任务。设备接受指令后，仍需等待实际执行结果。");
  renderDailyPlan();
  renderQuickAccountControls();
  renderSessionOverview();
}

function handleMessage(message) {
  switch (message.type) {
    case "control.accepted":
      signedInUser = message.user ?? { username: "admin", role: "admin" };
      setConnectionState("online", "已连接");
      elements.loginPanel.classList.add("hidden");
      elements.dashboard.classList.remove("hidden");
      addLog("控制台已安全连接");
      elements.userAdminPanel.classList.toggle("hidden", signedInUser.role !== "admin");
      renderSessionOverview();
      break;
    case "control.rejected":
      manuallyClosed = true;
      showError("管理密钥错误");
      sessionStorage.removeItem("playKeeperCredential");
      socket?.close();
      break;
    case "user.settings":
      userSettings = message.payload ?? userSettings;
      applyUserSettings();
      renderQuickAccountControls();
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
      renderEquipmentChecks();
      if (openAdvancedDevices.size) renderGlobalDailyMonitor();
      else renderDevices();
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
      addLog(`命令已发送至 ${message.deviceId}，等待设备接受`);
      showFeedback(`命令已发送至 ${message.deviceId}，等待设备接受`, "pending");
      break;
    case "command.result":
      addLog(`${message.deviceId}：${message.success ? "设备已回执（不代表任务全部完成）" : "设备拒绝/执行失败"} · ${message.message}`);
      showFeedback(message.message || "设备已返回回执，请查看任务实际进度",
        message.success ? "info" : "error");
      break;
    case "command.error":
      addLog(`操作失败：${message.message}`);
      break;
    case "plan.update":
      if (message.plan === "eight_account_daily") {
        dailyPlan = message.payload ?? dailyPlan;
        renderDailyPlan();
        showFeedback(`计划状态：${elements.dailyPlanStatus.textContent} · ${elements.dailyPlanDetail.textContent}`);
      }
      break;
    case "plan.schedule":
      planSchedule = message.payload ?? planSchedule;
      renderPlanSchedule();
      if (pendingPlanSave) {
        pendingPlanSave = false;
        document.querySelector("#settingsSaveState").textContent = "已收到服务器保存确认";
        showFeedback("本用户设置与每日定时已保存");
      }
      break;
    case "plan.command":
      addLog(`每日计划：${message.accountLabel} · ${message.command}`);
      break;
    case "plan.error":
      pendingPlanSave = false;
      document.querySelector("#settingsSaveState").textContent = "操作未完成，请检查提示；修改仍保留在页面";
      addLog(`每日计划操作失败：${message.message}`);
      break;
    case "equipment.transfer.update":
      singleTransfer = message.payload || { status: "idle" };
      renderSingleTransfer();
      addLog(`装备定向转移：${message.payload?.message || message.payload?.status || "状态已更新"}`);
      showFeedback(singleTransfer.message || "单次转移状态已更新",
        singleTransfer.status === "intervention" ? "warning" : "info");
      break;
    case "equipment.transfer.error":
      addLog(`装备定向转移失败：${message.message}`);
      break;
    case "plan.diagnostics": {
      const content = typeof message.content === "string" ? message.content : "";
      const filename = message.filename || "多用户挂机报错说明.md";
      const url = URL.createObjectURL(new Blob([content], { type: "text/markdown;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1_000);
      addLog("本用户多用户挂机报错说明已下载");
      break;
    }
    case "plan.diagnostics.bundle": {
      const content = typeof message.content === "string" ? message.content : "{}";
      const filename = message.filename || "PlayKeeper-卡顿诊断包.json";
      const url = URL.createObjectURL(new Blob([content], { type: "application/json;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1_000);
      addLog("最新卡顿诊断包已下载");
      break;
    }
    case "admin.snapshot":
      adminSnapshot = message.payload ?? adminSnapshot;
      renderAdminPanel();
      break;
  }
}

function renderAdminPanel() {
  if (signedInUser?.role !== "admin") return;
  const selectedDevice = elements.assignDevice.value;
  const selectedUser = elements.assignUser.value;
  elements.assignDevice.replaceChildren();
  for (const deviceId of devices.keys()) {
    const option = document.createElement("option");
    option.value = deviceId;
    option.textContent = deviceId;
    elements.assignDevice.append(option);
  }
  elements.assignUser.replaceChildren();
  for (const user of adminSnapshot.users || []) {
    if (user.disabled) continue;
    const option = document.createElement("option");
    option.value = user.username;
    option.textContent = `${user.username}（${user.role === "admin" ? "管理员" : "普通用户"}）`;
    elements.assignUser.append(option);
  }
  if ([...elements.assignDevice.options].some((o) => o.value === selectedDevice)) {
    elements.assignDevice.value = selectedDevice;
  }
  if ([...elements.assignUser.options].some((o) => o.value === selectedUser)) {
    elements.assignUser.value = selectedUser;
  }
  const assignments = Object.entries(adminSnapshot.deviceOwners || {}).length;
  elements.userAdminStatus.textContent = `已有 ${adminSnapshot.users?.length || 0} 个用户，${assignments} 台设备已分配。`;
}

function renderDailyPlan() {
  const statusLabels = {
    idle: "未运行", running: "运行中", reconnecting: "等待设备重连", success: "已完成",
    intervention: "等待人工处理", error: "失败可继续", cancelled: "已中断可继续"
  };
  elements.dailyPlanStatus.textContent = statusLabels[dailyPlan.status] ?? dailyPlan.status;
  elements.dailyPlanStatus.className = `state ${["running", "reconnecting", "success"].includes(dailyPlan.status) ? "online" : "offline"}`;
  const completed = Array.isArray(dailyPlan.history) ? dailyPlan.history.length : 0;
  const current = Number.isInteger(dailyPlan.legIndex) && dailyPlan.legIndex >= 0
    ? `${dailyPlan.route?.[dailyPlan.legIndex]?.accountLabel ?? "--"} → ${dailyPlan.route?.[dailyPlan.legIndex + 1]?.accountLabel ?? "--"}`
    : "等待启动";
  const total = Math.max(1, (dailyPlan.route?.length ?? 1) - 1);
  const email = dailyPlan.status === "success" ? ` · 邮件：${dailyPlan.emailStatus || "处理中"}` : "";
  const holder = dailyPlan.equipmentHolderLabel || "未知账号";
  const effectiveRoute = Array.isArray(dailyPlan.route)
    ? dailyPlan.route.map((entry) => entry?.accountLabel).filter(Boolean).join(" → ") : "";
  const skipped = Array.isArray(dailyPlan.skippedDungeonAccounts)
    ? dailyPlan.skippedDungeonAccounts.filter(Boolean) : [];
  const routeSummary = skipped.length
    ? ` · 本轮路线：${effectiveRoute}（已跳过今日副本完成：${skipped.join("、")}）` : "";
  const offlineEntries = Object.values(dailyPlan.disconnectedDevices || {});
  const reconnectSummary = offlineEntries.length
    ? ` · 等待设备重连：${offlineEntries.map((entry) => entry.accountLabel || "设备").join("、")}` : "";
  elements.dailyPlanDetail.textContent = (dailyPlan.error
    ? `装备所在：${holder} · ${dailyPlan.error}`
    : `当前：${current} · 装备所在：${holder} · 已完成 ${completed}/${total}${email}`)
    + routeSummary + reconnectSummary;
  elements.dailyPlanProgress.style.width = `${Math.min(100, completed * 100 / total)}%`;
  elements.startDailyPlan.disabled = ["running", "reconnecting", "intervention"].includes(dailyPlan.status);
  elements.retryDailyPlan.disabled = !["intervention", "error", "cancelled"].includes(dailyPlan.status);
  const resumable = ["intervention", "error", "cancelled"].includes(dailyPlan.status);
  const needsHolderConfirmation = resumable && dailyPlan.mode !== "resource_sweep";
  elements.resumeConfirmation.classList.toggle("hidden", !needsHolderConfirmation);
  if (needsHolderConfirmation) {
    const selected = elements.resumeEquipmentHolder.value || holder;
    elements.resumeEquipmentHolder.replaceChildren();
    const resumeLabels = [...new Set([
      ...(dailyPlan.fullRoute || []).map((entry) => entry?.accountLabel),
      ...(dailyPlan.route || []).map((entry) => entry?.accountLabel),
      ...configuredAccountLabels()
    ].filter((label) => typeof label === "string" && label.length > 0))];
    for (const label of resumeLabels) {
      const option = document.createElement("option");
      option.value = label;
      option.textContent = accountTarget(label) ? label : `${label}（离线）`;
      option.disabled = !accountTarget(label);
      elements.resumeEquipmentHolder.append(option);
    }
    if ([...elements.resumeEquipmentHolder.options].some((option) => option.value === selected && !option.disabled)) {
      elements.resumeEquipmentHolder.value = selected;
    }
  }
  elements.retryDailyPlan.textContent = needsHolderConfirmation
    ? "确认套装账号并继续" : "重试当前步骤";
  elements.cancelDailyPlan.disabled = !["running", "intervention"].includes(dailyPlan.status);
  if (["intervention", "error", "cancelled"].includes(dailyPlan.status)) {
    const advice = dailyPlan.gptSuggestion?.summary
      ? ` GPT诊断建议（只读）：${dailyPlan.gptSuggestion.summary}；${dailyPlan.gptSuggestion.recommendation || ""}` : "";
    elements.planIntervention.textContent = `报错账号：${dailyPlan.errorAccount || "当前账号"}；装备所在：${holder}；${dailyPlan.error || "任务已中断"}。现场会持续保留，人工处理后可从装备所在账号继续。${advice}`;
    elements.planIntervention.classList.remove("hidden");
  } else {
    elements.planIntervention.classList.add("hidden");
  }
  renderSessionOverview();
}

function formatDuration(milliseconds) {
  const total = Math.max(0, Math.floor(Number(milliseconds || 0) / 1_000));
  const hours = Math.floor(total / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  const seconds = total % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
}

function activeDeviceScript() {
  const active = [];
  for (const device of devices.values()) {
    for (const account of device.telemetry?.accounts || []) {
      const automation = account?.automation || {};
      if (!automation.busy && automation.status !== "running") continue;
      active.push({ label: account.label || `账号${Number(account.index) + 1}`,
        message: automation.lastMessage || automation.task || "正在执行",
        startedAt: Number(automation.startedAt) || 0 });
    }
  }
  if (!active.length) return null;
  const starts = active.map((entry) => entry.startedAt).filter((value) => value > 0);
  return { label: active.length === 1
    ? `${active[0].label} · ${active[0].message}` : `${active.length}个账号脚本正在运行`,
  startedAt: starts.length ? Math.min(...starts) : 0, running: true };
}

function activeScriptSummary() {
  const planActive = ["running", "reconnecting", "intervention"].includes(dailyPlan.status);
  if (planActive) {
    const labels = { running: "运行中", reconnecting: "等待设备重连",
      intervention: "等待人工处理" };
    return { label: `多用户挂机 · ${labels[dailyPlan.status] || dailyPlan.status}`,
      startedAt: Number(dailyPlan.startedAt) || 0,
      running: true };
  }
  if (["running", "intervention"].includes(singleTransfer.status)) {
    return { label: `单次装备转移 · ${singleTransfer.message || "正在执行"}`,
      startedAt: Number(singleTransfer.startedAt) || 0, running: true };
  }
  const deviceScript = activeDeviceScript();
  if (deviceScript) return deviceScript;
  if (dailyPlan.status === "success" && Number(dailyPlan.startedAt) > 0) {
    return { label: "多用户挂机 · 已完成", startedAt: Number(dailyPlan.startedAt),
      endedAt: Number(dailyPlan.updatedAt) || Date.now(), running: false };
  }
  return { label: "暂无运行中的脚本", startedAt: 0, running: false };
}

function renderSessionOverview() {
  if (!elements.sessionUser) return;
  const role = signedInUser?.role === "admin" ? "管理员" : "用户";
  elements.sessionUser.textContent = signedInUser?.username
    ? `${signedInUser.username} · ${role}` : "未登录";
  const script = activeScriptSummary();
  elements.sessionTask.textContent = script.label;
  elements.sessionStartedAt.textContent = script.startedAt
    ? new Date(script.startedAt).toLocaleTimeString("zh-CN", { hour12: false }) : "--";
  const end = script.endedAt || Date.now();
  elements.sessionRuntime.textContent = script.startedAt
    ? formatDuration(end - script.startedAt) : "00:00:00";
}

function readPlanOptions() {
  const resourceItems = (elements.planResourceItems.value.trim() || defaultResourceItems).split(/[,，\n]/)
    .map((item) => item.trim()).filter(Boolean);
  const dungeonItems = (elements.planDungeonItems.value.trim() || defaultDungeonItems).split(/[,，\n]/)
    .map((item) => item.trim()).filter(Boolean);
  const inventoryItems = (elements.planInventoryItems.value.trim() || defaultResourceItems).split(/[,，\n]/)
    .map((item) => item.trim()).filter(Boolean);
  const resourceReserveCount = Number(elements.planResourceReserve.value);
  const reportEmail = elements.planReportEmail.value.trim();
  const returnMap = elements.planReturnMap.value.trim() || defaultReturnMap;
  const routeLabels = (elements.planRoute.value.trim() || defaultRouteText).split(/\s*(?:→|->|,|，)\s*/)
    .map((label) => label.trim()).filter(Boolean);
  const equipmentItems = (elements.planEquipmentItems.value.trim() || defaultEquipmentItems).split(/[,，\n]/)
    .map((item) => item.trim()).filter(Boolean);
  const equipmentPrice = Number(elements.planEquipmentPrice.value || defaultTransferPrice);
  const resourcePrice = Number(elements.planResourcePrice.value || defaultTransferPrice);
  const disconnectGraceSeconds = Number(elements.planDisconnectGrace.value || 120);
  const phaseTimeoutSeconds = {
    starting_leg: 120,
    seller_running: Number(elements.planSellerTimeout.value || 240),
    buyer_running: Number(elements.planBuyerTimeout.value || 720),
    resource_auction_running: Number(elements.planResourceTimeout.value || 240),
    standalone_main_running: Number(elements.planBuyerTimeout.value || 720),
    main_buy_running: 90
  };
  if (!resourceItems.length || resourceItems.length > 10) {
    addLog("道具组合需填写1–10项"); return null;
  }
  if (!dungeonItems.length || dungeonItems.length > 20) {
    addLog("副本组合需填写1–20项"); return null;
  }
  if (!inventoryItems.length || inventoryItems.length > 20
      || inventoryItems.some((item) => item.length > 30)) {
    addLog("统一背包检查项目需填写1–20项，每项不超过30字"); return null;
  }
  if (routeLabels.length < 3 || routeLabels[0] !== routeLabels.at(-1)
      || new Set(routeLabels.slice(0, -1)).size !== routeLabels.length - 1
      || routeLabels.slice(0, -1).some((label) => !label || label.length > 30 || /[→,，\r\n\t]/.test(label))) {
    addLog("装备路线必须首尾为同一主号，且中间账号不能重复"); return null;
  }
  if (equipmentItems.length < 1 || equipmentItems.length > 10
      || new Set(equipmentItems).size !== equipmentItems.length) {
    addLog("装备转移清单必须包含1–10件不重复装备"); return null;
  }
  if (!Number.isInteger(equipmentPrice) || equipmentPrice < 1 || equipmentPrice > 9_999_999) {
    addLog("装备定向转移单价无效"); return null;
  }
  if (!Number.isInteger(resourcePrice) || resourcePrice < 1 || resourcePrice > 9_999_999) {
    addLog("道具拍卖/购买单价无效"); return null;
  }
  if (!Number.isInteger(disconnectGraceSeconds) || disconnectGraceSeconds < 30
      || disconnectGraceSeconds > 600
      || Object.values(phaseTimeoutSeconds).some((value) => !Number.isInteger(value)
        || value < 30 || value > 3600)) {
    addLog("断线宽限期需为30–600秒，阶段超时需为30–3600秒"); return null;
  }
  const returnMaps = {};
  for (const input of elements.planReturnMaps.querySelectorAll("input[data-account-label]")) {
    returnMaps[input.dataset.accountLabel] = input.value.trim() || returnMap;
  }
  if (reportEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(reportEmail)) {
    addLog("完成报告邮箱格式无效"); return null;
  }
  return { resourceItems, resourceReserveCount, dungeonItems, inventoryItems,
    routeLabels, equipmentItems, equipmentPrice, resourcePrice, returnMap, returnMaps, reportEmail,
    disconnectGraceSeconds, phaseTimeoutSeconds };
}

function renderPlanReturnMaps(savedMaps = null) {
  const previous = {};
  for (const input of elements.planReturnMaps.querySelectorAll("input[data-account-label]")) {
    previous[input.dataset.accountLabel] = input.value;
  }
  const route = (elements.planRoute.value.trim() || defaultRouteText)
    .split(/\s*(?:→|->|,|，)\s*/).map((label) => label.trim()).filter(Boolean);
  const labels = [...new Set(route.at(-1) === route[0] ? route.slice(0, -1) : route)];
  elements.planReturnMaps.replaceChildren();
  for (const label of labels) {
    const wrapper = document.createElement("label");
    wrapper.textContent = label;
    const input = document.createElement("input");
    input.dataset.accountLabel = label;
    input.maxLength = 30;
    input.placeholder = defaultReturnMap;
    input.value = savedMaps?.[label] ?? previous[label] ?? "";
    wrapper.append(input);
    elements.planReturnMaps.append(wrapper);
  }
}

function renderPlanSchedule() {
  elements.planScheduleEnabled.checked = planSchedule.enabled === true;
  elements.planScheduleTime.value = planSchedule.time || "04:00";
  const options = planSchedule.options ?? {};
  elements.planRoute.value = Array.isArray(options.routeLabels) && options.routeLabels.length
    ? options.routeLabels.join(" → ") : defaultRouteText;
  elements.planRoutePreset.value = elements.planRoute.value.trim() === defaultRouteText
    ? "default" : "custom";
  if (Array.isArray(options.equipmentItems)) elements.planEquipmentItems.value = options.equipmentItems.join(",");
  elements.planEquipmentPreset.value = Object.entries(equipmentPresets)
    .find(([, value]) => value === elements.planEquipmentItems.value.trim())?.[0] ?? "custom";
  if (Array.isArray(options.resourceItems)) elements.planResourceItems.value = options.resourceItems.join(",");
  elements.planEquipmentPrice.value = String(Number.isInteger(options.equipmentPrice)
    ? options.equipmentPrice : defaultTransferPrice);
  elements.planResourcePrice.value = String(Number.isInteger(options.resourcePrice)
    ? options.resourcePrice : defaultTransferPrice);
  if (Number.isInteger(options.resourceReserveCount)) {
    elements.planResourceReserve.value = String(options.resourceReserveCount);
  }
  if (Array.isArray(options.dungeonItems)) elements.planDungeonItems.value = options.dungeonItems.join(",");
  elements.planDungeonPreset.value = elements.planDungeonItems.value.trim() === defaultDungeonItems
    ? "default" : "custom";
  if (Array.isArray(options.inventoryItems)) elements.planInventoryItems.value = options.inventoryItems.join(",");
  if (typeof options.returnMap === "string") elements.planReturnMap.value = options.returnMap;
  renderPlanReturnMaps(options.returnMaps);
  if (typeof options.reportEmail === "string") elements.planReportEmail.value = options.reportEmail;
  elements.planDisconnectGrace.value = String(Number.isInteger(options.disconnectGraceSeconds)
    ? options.disconnectGraceSeconds : 120);
  elements.planSellerTimeout.value = String(Number.isInteger(options.phaseTimeoutSeconds?.seller_running)
    ? options.phaseTimeoutSeconds.seller_running : 240);
  elements.planBuyerTimeout.value = String(Number.isInteger(options.phaseTimeoutSeconds?.buyer_running)
    ? options.phaseTimeoutSeconds.buyer_running : 720);
  elements.planResourceTimeout.value = String(Number.isInteger(options.phaseTimeoutSeconds?.resource_auction_running)
    ? options.phaseTimeoutSeconds.resource_auction_running : 240);
  elements.planResourcePreset.value = Object.entries(auctionPresets)
    .find(([, value]) => value === elements.planResourceItems.value.trim())?.[0] ?? "custom";
  const last = planSchedule.lastRunDate ? ` · 上次运行 ${planSchedule.lastRunDate}` : "";
  const error = planSchedule.lastError ? ` · 上次启动失败：${planSchedule.lastError}` : "";
  elements.planScheduleStatus.textContent = planSchedule.enabled
    ? `每天 ${planSchedule.time}（北京时间）${last}${error}` : "每日定时未启用";
}

function configuredAccountLabels() {
  const fromSettings = Array.isArray(userSettings.accountLabels)
    ? userSettings.accountLabels.map((label) => String(label).trim()).filter(Boolean) : [];
  if (fromSettings.length) return [...new Set(fromSettings)];
  const route = elements.planRoute.value.split(/\s*(?:→|->|,|，)\s*/)
    .map((label) => label.trim()).filter(Boolean);
  const withoutReturn = route.at(-1) === route[0] ? route.slice(0, -1) : route;
  return [...new Set(withoutReturn)];
}

function applyUserSettings() {
  const labels = configuredAccountLabels();
  if (labels.length && (!planSchedule.options?.routeLabels || planSchedule.options.routeLabels.length < 3)) {
    elements.planRoute.value = [...labels, labels[0]].join(" → ");
  }
  elements.quickAuctionAccount.value = userSettings.quickAuctionAccount || labels[0] || "";
  elements.quickBuyPrice.value = String(Number.isInteger(userSettings.quickBuyPrice)
    ? userSettings.quickBuyPrice : 920);
  elements.quickBuyerAccount.value = userSettings.auctionBuyer || userSettings.mainAccount || labels[0] || "";
  elements.quickHangAccount.value = userSettings.quickHangAccount || labels[0] || "";
  elements.quickHangMap.value = userSettings.quickHangMap || "圣兽云殿";
  renderPlanReturnMaps(planSchedule.options?.returnMaps);
}

renderDailyPlan();
renderPlanReturnMaps();
setInterval(() => {
  if (["intervention", "error", "cancelled"].includes(dailyPlan.status)) renderDailyPlan();
  else renderSessionOverview();
}, 1_000);

function runKeepPlayerCommand(command) {
  const deviceId = elements.keepPlayerDevice.value;
  if (!deviceId || !devices.has(deviceId)) return addLog("请先选择在线设备");
  const action = command === "keep_player_exit" ? "关闭" : "启动";
  if (!window.confirm(`${action} ${deviceId} 的 KeepPlayer 属于高风险操作，确认继续？`)) return;
  sendCommand(deviceId, command, {});
}

function renderGlobalControls() {
  const selected = elements.keepPlayerDevice.value;
  elements.keepPlayerDevice.replaceChildren();
  for (const device of devices.values()) {
    const option = document.createElement("option");
    option.value = device.deviceId;
    const model = device.telemetry?.device?.model;
    option.textContent = model ? `${device.deviceId} · ${model}` : device.deviceId;
    elements.keepPlayerDevice.append(option);
  }
  if (devices.has(selected)) elements.keepPlayerDevice.value = selected;
  const disabled = devices.size === 0;
  elements.startKeepPlayer.disabled = disabled;
  elements.exitKeepPlayer.disabled = disabled;
  renderQuickAccountControls();
}

function accountTarget(label) {
  for (const device of devices.values()) {
    const accounts = Array.isArray(device.telemetry?.accounts) ? device.telemetry.accounts : [];
    const account = accounts.find((entry) => entry?.label === label && Number.isInteger(entry?.index));
    if (account) return { deviceId: device.deviceId, accountIndex: account.index, label };
  }
  return null;
}

function renderQuickAccountControls() {
  const reportedLabels = configuredAccountLabels();
  for (const device of devices.values()) {
    const accounts = Array.isArray(device.telemetry?.accounts) ? device.telemetry.accounts : [];
    for (const account of accounts) {
      const label = typeof account?.label === "string" ? account.label.trim() : "";
      if (label && Number.isInteger(account?.index) && !reportedLabels.includes(label)) {
        reportedLabels.push(label);
      }
    }
  }
  reportedLabels.sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
  elements.userAccountOptions.replaceChildren();
  elements.hangAccountOptions.replaceChildren();
  const allOption = document.createElement("option");
  allOption.value = "all";
  allOption.label = "所有账号";
  elements.hangAccountOptions.append(allOption);
  for (const label of reportedLabels) {
    const option = document.createElement("option");
    option.value = label;
    option.label = accountTarget(label) ? label : `${label}（离线）`;
    elements.userAccountOptions.append(option);
    elements.hangAccountOptions.append(option.cloneNode());
  }
  const disabled = devices.size === 0;
  elements.quickAuctionToMain.disabled = disabled;
  elements.quickMainBuy.disabled = disabled;
  elements.quickSweepAll.disabled = disabled;
  elements.quickStartHang.disabled = disabled;
}

function planResourceItems() {
  const items = elements.planResourceItems.value.split(/[,，\n]/)
    .map((item) => item.trim()).filter(Boolean);
  if (!items.length || items.length > 10) {
    addLog("道具组合需填写1–10项");
    return null;
  }
  return items;
}

function planInventoryItems() {
  const items = elements.planInventoryItems.value.split(/[,，\n]/)
    .map((item) => item.trim()).filter(Boolean);
  if (!items.length || items.length > 20 || items.some((item) => item.length > 30)) {
    addLog("统一背包检查项目需填写1–20项，每项不超过30字");
    return null;
  }
  return items;
}

function renderGlobalDailyMonitor() {
  elements.globalDailyMonitor.replaceChildren();
  const entries = [];
  for (const device of devices.values()) {
    const accounts = Array.isArray(device.telemetry?.accounts) ? device.telemetry.accounts : [];
    for (const account of accounts) {
      if (!Number.isInteger(account?.index)) continue;
      entries.push({ device, account, monitor: account.automation ?? {} });
    }
  }
  entries.sort((left, right) => String(left.account.label).localeCompare(
    String(right.account.label), undefined, { numeric: true }));
  if (!entries.length) {
    const empty = document.createElement("p");
    empty.textContent = "等待两台设备上报八个账号状态。";
    elements.globalDailyMonitor.append(empty);
    return;
  }
  const totals = new Map();
  for (const { monitor } of entries) {
    const counts = monitor.inventoryCounts && typeof monitor.inventoryCounts === "object"
      ? monitor.inventoryCounts : {};
    for (const [name, count] of Object.entries(counts)) {
      if (!name.trim()) continue;
      totals.set(name, (totals.get(name) || 0) + (Number(count) || 0));
    }
  }
  const total = document.createElement("div");
  total.className = "daily-inventory-total";
  const totalTitle = document.createElement("strong");
  totalTitle.textContent = `本用户全部账号背包合计（${entries.length}个账号）`;
  const totalDetail = document.createElement("span");
  totalDetail.textContent = totals.size
    ? [...totals].map(([name, count]) => `${name} ${count}`).join(" · ")
    : "尚无背包快照，请刷新全部背包";
  total.append(totalTitle, totalDetail);
  elements.globalDailyMonitor.append(total);
  for (const { device, account, monitor } of entries) {
    const row = document.createElement("div");
    row.className = "daily-monitor-row";
    const title = document.createElement("strong");
    title.textContent = account.label || `账号${account.index + 1}`;
    const status = document.createElement("span");
    const transferDone = isToday(monitor.equipmentTransferLastRunAt);
    const dungeonDone = isToday(monitor.dungeonLastRunAt);
    const signInDone = isToday(monitor.signInLastRunAt);
    const dailyTaskDone = isToday(monitor.dailyTaskLastRunAt);
    status.className = transferDone && dungeonDone && signInDone && dailyTaskDone
      ? "daily-ok" : "daily-pending";
    status.textContent = `签到${signInDone ? "✓" : "—"} · 日常${dailyTaskDone ? "✓" : "—"}`
      + ` · 装备${transferDone ? "✓" : "—"} · 副本${dungeonDone ? "✓" : "—"}`;
    const inventory = document.createElement("small");
    const counts = monitor.inventoryCounts && typeof monitor.inventoryCounts === "object"
      ? Object.entries(monitor.inventoryCounts).map(([name, count]) => `${name} ${count}`).join(" · ") : "";
    inventory.textContent = monitor.inventoryStatus === "ok"
      ? `${counts || "未找到监控物资"} · ${formatDateTime(monitor.inventoryLastRunAt)}`
      : `背包待刷新${monitor.inventoryStatus === "error" ? "（上次失败）" : ""}`;
    const failure = account.lastFailure;
    const obsoleteInventoryFailure = failure?.task === "inventory_snapshot"
      || /未找到挂机辅助背包|背包快照失败/.test(failure?.message || "");
    if (failure?.capturedAt && !obsoleteInventoryFailure) {
      const retained = failure.screenshotAvailable ? "已保留截图" : "已保留信息";
      inventory.textContent += ` · 异常${retained}：${failure.message || failure.task || "未知错误"}`;
    }
    const refresh = document.createElement("button");
    refresh.className = "secondary";
    refresh.textContent = "刷新背包";
    refresh.addEventListener("click", () => {
      sendCommand(device.deviceId, "run_inventory_snapshot", { accountIndex: account.index });
    });
    const actions = document.createElement("div");
    actions.className = "daily-status-actions";
    const completionButton = (kind, done, label) => {
      const button = document.createElement("button");
      button.className = "secondary compact";
      button.textContent = done ? `重置${label}` : `标记${label}完成`;
      button.addEventListener("click", () => sendCommand(device.deviceId,
        "set_daily_completion", { accountIndex: account.index, kind, completed: !done }));
      return button;
    };
    actions.append(completionButton("equipment", transferDone, "装备"),
      completionButton("dungeon", dungeonDone, "副本"), refresh);
    row.append(title, status, inventory, actions);
    elements.globalDailyMonitor.append(row);
  }
}

function renderDevices() {
  renderEquipmentChecks();
  elements.deviceCount.textContent = String(devices.size);
  renderGlobalControls();
  renderAdminPanel();
  renderGlobalDailyMonitor();
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
    const advancedPanel = card.querySelector(".automation-panel");
    advancedPanel.open = openAdvancedDevices.has(device.deviceId);
    advancedPanel.addEventListener("toggle", () => {
      if (advancedPanel.open) openAdvancedDevices.add(device.deviceId);
      else {
        openAdvancedDevices.delete(device.deviceId);
        renderDevices();
      }
    });
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
      button.addEventListener("click", () => {
        openAdvancedDevices.delete(device.deviceId);
        sendCommand(device.deviceId, "switch_account", { accountIndex: index });
      });
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
        if (button.dataset.command === "keep_player_exit"
            && !window.confirm("退出前台后会保留远程连接，以便再次一键启动。确认继续？")) return;
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
    const previewImage = card.querySelector(".preview-image");
    let dragStart = null;
    const normalizedPoint = (event, frame) => {
      const rectangle = previewImage.getBoundingClientRect();
      const imageRatio = frame.width / frame.height;
      const boxRatio = rectangle.width / rectangle.height;
      const contentWidth = boxRatio > imageRatio ? rectangle.height * imageRatio : rectangle.width;
      const contentHeight = boxRatio > imageRatio ? rectangle.height : rectangle.width / imageRatio;
      const contentLeft = rectangle.left + (rectangle.width - contentWidth) / 2;
      const contentTop = rectangle.top + (rectangle.height - contentHeight) / 2;
      return { x: (event.clientX - contentLeft) / contentWidth,
        y: (event.clientY - contentTop) / contentHeight };
    };
    const sendSwipe = (frame, start, end, durationMs = 360) => sendCommand(device.deviceId,
      "pointer_swipe", { accountIndex: frame.accountIndex,
        x1: Math.max(0, Math.min(1, start.x)), y1: Math.max(0, Math.min(1, start.y)),
        x2: Math.max(0, Math.min(1, end.x)), y2: Math.max(0, Math.min(1, end.y)),
        durationMs, frameSequence: frame.sequence });
    const boostPreview = () => {
      const frame = previewFrames.get(device.deviceId);
      if (!frame || !activePreviews.has(device.deviceId)) return;
      sendCommand(device.deviceId, "preview_start", {
        accountIndex: frame.accountIndex, maxWidth: 720, fps: 3 });
      clearTimeout(card.previewBoostTimer);
      card.previewBoostTimer = setTimeout(() => {
        if (activePreviews.has(device.deviceId)) sendCommand(device.deviceId, "preview_start", {
          accountIndex: frame.accountIndex, maxWidth: 720, fps: 1 });
      }, 10_000);
    };
    previewImage.addEventListener("pointerdown", (event) => {
      const frame = previewFrames.get(device.deviceId);
      if (!frame) return addLog("尚未收到可点击的手机画面");
      const point = normalizedPoint(event, frame);
      if (point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) {
        return addLog("请在画面内容区域操作");
      }
      event.currentTarget.setPointerCapture(event.pointerId);
      dragStart = { ...point, at: Date.now(), frame };
      boostPreview();
    });
    previewImage.addEventListener("pointerup", (event) => {
      if (!dragStart) return;
      const end = normalizedPoint(event, dragStart.frame);
      const dx = end.x - dragStart.x;
      const dy = end.y - dragStart.y;
      const elapsed = Math.max(120, Math.min(1_500, Date.now() - dragStart.at));
      if (Math.hypot(dx, dy) < 0.025) {
        sendCommand(device.deviceId, "pointer_tap", { accountIndex: dragStart.frame.accountIndex,
          x: dragStart.x, y: dragStart.y, frameSequence: dragStart.frame.sequence });
      } else {
        sendSwipe(dragStart.frame, dragStart, end, elapsed);
      }
      dragStart = null;
    });
    previewImage.addEventListener("pointercancel", () => { dragStart = null; });
    for (const button of card.querySelectorAll("[data-swipe]")) {
      button.addEventListener("click", () => {
        const frame = previewFrames.get(device.deviceId);
        if (!frame) return addLog("请先加载手机画面");
        const directions = { up: [{ x: .5, y: .88 }, { x: .5, y: .12 }],
          down: [{ x: .5, y: .12 }, { x: .5, y: .88 }],
          left: [{ x: .88, y: .5 }, { x: .12, y: .5 }],
          right: [{ x: .12, y: .5 }, { x: .88, y: .5 }] };
        const [start, end] = directions[button.dataset.swipe];
        boostPreview();
        sendSwipe(frame, start, end, 560);
      });
    }

    const auctionEnabled = card.querySelector(".auction-enabled");
    const auctionHours = card.querySelector(".auction-hours");
    const auctionItemsInput = card.querySelector(".auction-items");
    const auctionPreset = card.querySelector(".auction-preset");
    const auctionBuyer = card.querySelector(".auction-buyer");
    const auctionPrice = card.querySelector(".auction-price");
    const auctionReserve = card.querySelector(".auction-reserve");
    const storeSellEnabled = card.querySelector(".store-sell-enabled");
    const storeSellItem = card.querySelector(".store-sell-item");
    const templeEnabled = card.querySelector(".temple-enabled");
    const returnHangMap = card.querySelector(".return-hang-map");
    const warehouseEnabled = card.querySelector(".warehouse-enabled");
    const warehouseStoreAll = card.querySelector(".warehouse-store-all");
    const warehouseItem = card.querySelector(".warehouse-item");
    const dungeonItemsInput = card.querySelector(".dungeon-items");
    const dungeonSkillInput = card.querySelector(".dungeon-skill");
    const prestigeEnabled = card.querySelector(".prestige-enabled");
    const prestigeItemsInput = card.querySelector(".prestige-items");
    const inventoryItemsInput = card.querySelector(".inventory-items");
    const equipmentPreset = card.querySelector(".equipment-preset");
    const equipmentItemsInput = card.querySelector(".equipment-items");
    const equipmentPriceInput = card.querySelector(".equipment-price");
    const equipmentSellerInput = card.querySelector(".equipment-seller");
    const equipmentBuyerInput = card.querySelector(".equipment-buyer");
    const equipmentDraftKey = `${device.deviceId}:${activeAccountIndex}`;
    let equipmentDraft = equipmentDrafts.get(equipmentDraftKey);
    if (equipmentDraft && Array.isArray(automation.equipmentItems)
        && automation.equipmentItems.join(",") === equipmentDraft.items
        && Number(automation.equipmentPrice) === equipmentDraft.price
        && String(automation.equipmentBuyer || "") === equipmentDraft.buyer) {
      equipmentDrafts.delete(equipmentDraftKey);
      equipmentDraft = null;
    }
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
      ? automation.auctionBuyer : (automation.sellBuyer || userSettings.auctionBuyer || "");
    auctionPrice.value = String(Number.isInteger(automation.auctionPrice)
      ? automation.auctionPrice : 920);
    auctionReserve.value = String(automation.auctionReserveCount === 0 ? 0 : 1);
    storeSellEnabled.checked = automation.storeSellEnabled === true;
    storeSellItem.value = "金币券";
    templeEnabled.checked = automation.templeEnabled === true;
    returnHangMap.value = typeof automation.returnHangMap === "string"
      ? automation.returnHangMap : "圣兽云殿";
    warehouseEnabled.checked = automation.warehouseEnabled === true;
    warehouseStoreAll.checked = automation.warehouseStoreAll !== false;
    warehouseItem.value = typeof automation.warehouseItem === "string"
      && automation.warehouseItem.trim() ? automation.warehouseItem.trim() : "护宠仙石";
    dungeonItemsInput.value = Array.isArray(automation.dungeonItems)
      ? automation.dungeonItems.join(",") : "绘画小屋,伊苏王的神墓,火龙王的宫殿,史芬克斯密穴";
    dungeonSkillInput.value = typeof automation.dungeonSkill === "string"
      && automation.dungeonSkill.trim() ? automation.dungeonSkill.trim() : "auto";
    prestigeEnabled.checked = automation.prestigeEnabled === true;
    prestigeItemsInput.value = Array.isArray(automation.prestigeItems)
      ? automation.prestigeItems.join(",") : "黑暗徽章,黑暗结晶,黑暗首领的勋章,黑暗宝石";
    inventoryItemsInput.value = Array.isArray(automation.inventoryItems)
      ? automation.inventoryItems.join(",") : "进化宝石,曙光印记,强化丹A,强化丹B,天仙玉露";
    equipmentItemsInput.value = equipmentDraft?.items ?? (Array.isArray(automation.equipmentItems)
      ? automation.equipmentItems.join(",") : defaultEquipmentItems);
    equipmentPreset.value = Object.entries(equipmentPresets)
      .find(([, value]) => value === equipmentItemsInput.value.trim())?.[0] ?? "custom";
    equipmentPreset.addEventListener("change", () => {
      if (equipmentPreset.value !== "custom") {
        equipmentItemsInput.value = equipmentPresets[equipmentPreset.value];
      }
      persistEquipmentDraft();
    });
    equipmentItemsInput.addEventListener("input", () => {
      equipmentPreset.value = Object.entries(equipmentPresets)
        .find(([, value]) => value === equipmentItemsInput.value.trim())?.[0] ?? "custom";
      persistEquipmentDraft();
    });
    equipmentPriceInput.value = String(equipmentDraft?.price ?? (Number.isInteger(automation.equipmentPrice)
      ? automation.equipmentPrice : 920));
    equipmentSellerInput.value = equipmentDraft?.seller ?? accountLabel(accounts, activeAccountIndex);
    equipmentBuyerInput.value = equipmentDraft?.buyer ?? (typeof automation.equipmentBuyer === "string"
      ? automation.equipmentBuyer : "");
    function persistEquipmentDraft() {
      equipmentDrafts.set(equipmentDraftKey, {
        items: equipmentItemsInput.value.trim(),
        price: Number.parseInt(equipmentPriceInput.value, 10),
        seller: equipmentSellerInput.value.trim(),
        buyer: equipmentBuyerInput.value.trim()
      });
    }
    equipmentPriceInput.addEventListener("input", persistEquipmentDraft);
    equipmentSellerInput.addEventListener("input", persistEquipmentDraft);
    equipmentBuyerInput.addEventListener("input", persistEquipmentDraft);
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
      const reserveCount = Number.parseInt(auctionReserve.value, 10);
      const equipmentItems = equipmentItemsInput.value.split(/[,，\n]/)
        .map((item) => item.trim()).filter(Boolean);
      const equipmentPrice = Number.parseInt(equipmentPriceInput.value, 10);
      const equipmentBuyer = equipmentBuyerInput.value.trim();
      const warehouseItems = warehouseItem.value.split(/[,，\n]/)
        .map((item) => item.trim()).filter(Boolean);
      const dungeonItems = dungeonItemsInput.value.split(/[,，\n]/)
        .map((item) => item.trim()).filter(Boolean);
      const dungeonSkill = dungeonSkillInput.value.trim() || "auto";
      const prestigeItems = prestigeItemsInput.value.split(/[,，\n]/)
        .map((item) => item.trim()).filter(Boolean);
      const inventoryItems = inventoryItemsInput.value.split(/[,，\n]/)
        .map((item) => item.trim()).filter(Boolean);
      if (!items.length || items.length > 10 || items.some((item) => item.length > 30)) {
        return addLog("拍卖道具需填写1–10种，每项不超过30字");
      }
      if (!Number.isInteger(intervalHours) || intervalHours < 1 || intervalHours > 168) {
        return addLog("拍卖间隔需为1–168小时");
      }
      if (auctionEnabled.checked && (!buyer || buyer.length > 30 || /[→,，\r\n\t]/.test(buyer))) {
        return addLog("启用拍卖时必须填写有效的指定买家");
      }
      if (!Number.isInteger(itemAuctionPrice) || itemAuctionPrice < 1
          || itemAuctionPrice > 9_999_999) return addLog("拍卖单价无效");
      if (!equipmentItems.length || equipmentItems.length > 10
          || equipmentItems.some((item) => item.length > 30)) {
        return addLog("装备名称需填写1–10种，每项不超过30字");
      }
      if (!Number.isInteger(equipmentPrice) || equipmentPrice < 1 || equipmentPrice > 9_999_999) {
        return addLog("装备单价需为1–9999999金币");
      }
      if (equipmentBuyer.length > 30 || /[→,，\r\n\t]/.test(equipmentBuyer)) {
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
      if (dungeonSkill.length > 30 || /[\r\n\t]/.test(dungeonSkill)) {
        return addLog("副本技能名称无效");
      }
      if (!prestigeItems.length || prestigeItems.length > 10
          || prestigeItems.some((item) => item.length > 30)) {
        return addLog("威望道具需填写1–10种，每项不超过30字");
      }
      if (!inventoryItems.length || inventoryItems.length > 20
          || inventoryItems.some((item) => item.length > 30)) {
        return addLog("背包监控需填写1–20种，每项不超过30字");
      }
      sendCommand(device.deviceId, "configure_auto_auction", {
        accountIndex: activeAccountIndex,
        enabled: auctionEnabled.checked,
        items,
        buyer,
        price: itemAuctionPrice,
        reserveCount,
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
      sendCommand(device.deviceId, "configure_return_hang", {
        accountIndex: activeAccountIndex,
        map: returnHangMap.value.trim() || "圣兽云殿"
      });
      sendCommand(device.deviceId, "configure_warehouse_sync", {
        accountIndex: activeAccountIndex,
        enabled: warehouseEnabled.checked,
        storeAll: warehouseStoreAll.checked,
        items: warehouseItems
      });
      sendCommand(device.deviceId, "configure_dungeon_sequence", {
        accountIndex: activeAccountIndex,
        items: dungeonItems,
        skill: dungeonSkill
      });
      sendCommand(device.deviceId, "configure_prestige_items", {
        accountIndex: activeAccountIndex,
        enabled: prestigeEnabled.checked,
        items: prestigeItems
      });
      sendCommand(device.deviceId, "configure_inventory_monitor", {
        accountIndex: activeAccountIndex,
        items: inventoryItems
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
    card.querySelector(".run-daily-tasks").addEventListener("click", () => {
      sendCommand(device.deviceId, "run_daily_tasks", { accountIndex: activeAccountIndex });
    });
    card.querySelector(".run-prestige").addEventListener("click", () => {
      if (saveAutomation()) sendCommand(device.deviceId, "run_prestige_items", { accountIndex: activeAccountIndex });
    });
    card.querySelector(".run-inventory").addEventListener("click", () => {
      if (saveAutomation()) sendCommand(device.deviceId, "run_inventory_snapshot", { accountIndex: activeAccountIndex });
    });
    card.querySelector(".confirm-temple").addEventListener("click", () => {
      sendCommand(device.deviceId, "resolve_temple_confirmation", { accountIndex: activeAccountIndex, enterTemple: true });
    });
    card.querySelector(".decline-temple").addEventListener("click", () => {
      sendCommand(device.deviceId, "resolve_temple_confirmation", { accountIndex: activeAccountIndex, enterTemple: false });
    });
    card.querySelector(".run-equipment-sell").addEventListener("click", () => {
      const seller = accountTarget(equipmentSellerInput.value.trim());
      const buyerLabel = equipmentBuyerInput.value.trim();
      const buyer = accountTarget(buyerLabel);
      const items = equipmentItemsInput.value.split(/[,，\n]/).map((item) => item.trim()).filter(Boolean);
      const price = Number.parseInt(equipmentPriceInput.value, 10);
      if (!seller) return addLog(`卖方账号 ${equipmentSellerInput.value || "--"} 当前不在线`);
      if (!buyerLabel) return addLog("上架装备前请选择或填写指定买家");
      if (!items.length || items.length > 10 || !Number.isInteger(price)) return addLog("请检查装备组合和单价");
      if (!buyer) return addLog(`买方账号 ${buyerLabel} 当前不在线，无法自动衔接购买和卖方返回挂机`);
      socket.send(JSON.stringify({ type: "equipment.transfer.start",
        sellerLabel: seller.label, buyerLabel: buyer.label, items, price,
        returnMap: returnHangMap.value.trim() || "圣兽云殿" }));
      addLog(`${seller.label} → ${buyerLabel} 定向转移请求已发送；成交后卖方将自动返回挂机`);
    });
    card.querySelector(".run-equipment-buy").addEventListener("click", () => {
      const buyer = accountTarget(equipmentBuyerInput.value.trim());
      const items = equipmentItemsInput.value.split(/[,，\n]/).map((item) => item.trim()).filter(Boolean);
      const price = Number.parseInt(equipmentPriceInput.value, 10);
      if (!buyer) return addLog(`买方账号 ${equipmentBuyerInput.value || "--"} 当前不在线`);
      if (!items.length || items.length > 10 || !Number.isInteger(price)) return addLog("请检查装备组合和单价");
      sendCommand(buyer.deviceId, "configure_equipment_transfer", {
        accountIndex: buyer.accountIndex, items, price, buyer: "" });
      sendCommand(buyer.deviceId, "run_equipment_buy", { accountIndex: buyer.accountIndex });
      addLog(`${buyer.label} 已开始购买指定装备`);
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
  if (!["request_status", "preview_start", "preview_stop", "pointer_tap", "pointer_swipe"].includes(command)) {
    showFeedback("操作已提交，等待设备回执；实际执行结果请查看账号状态", "pending");
  }
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
function formatDateTime(timestamp) {
  return timestamp ? new Date(timestamp).toLocaleString("zh-CN", { hour12: false }) : "尚未刷新";
}
function isToday(timestamp) {
  if (!timestamp) return false;
  const value = new Date(timestamp);
  const now = new Date();
  return value.getFullYear() === now.getFullYear()
    && value.getMonth() === now.getMonth()
    && value.getDate() === now.getDate();
}
function addLog(text) {
  const error = /失败|错误|未发送|尚未连接|未连接|已断开|无效|不在线/.test(text);
  // Background logs must not erase a pending-operation timeout.
  if (error || document.querySelector("#operationFeedback").dataset.kind !== "pending") {
    showFeedback(text, error ? "error" : "info");
  }
  const item = document.createElement("li");
  const time = document.createElement("time");
  time.textContent = new Date().toLocaleTimeString("zh-CN", { hour12: false });
  item.append(time, document.createTextNode(text));
  elements.eventLog.prepend(item);
  while (elements.eventLog.children.length > 60) elements.eventLog.lastElementChild.remove();
}
