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
  clearLog: document.querySelector("#clearLog")
};

const devices = new Map();
let socket;
let manuallyClosed = false;
let reconnectTimer;
let connectionGeneration = 0;

elements.adminToken.value = sessionStorage.getItem("playKeeperAdminToken") ?? "";
elements.connectButton.addEventListener("click", connect);
elements.adminToken.addEventListener("keydown", (event) => { if (event.key === "Enter") connect(); });
elements.disconnectButton.addEventListener("click", disconnect);
elements.refreshStatus.addEventListener("click", () => {
  for (const deviceId of devices.keys()) sendCommand(deviceId, "request_status", {});
});
elements.clearLog.addEventListener("click", () => elements.eventLog.replaceChildren());

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
  manuallyClosed = true;
  connectionGeneration += 1;
  clearTimeout(reconnectTimer);
  sessionStorage.removeItem("playKeeperAdminToken");
  devices.clear();
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
      devices.delete(message.deviceId);
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
    const deviceInfo = telemetry.device ?? {};
    card.querySelector(".device-id").textContent = device.deviceId;
    card.querySelector(".device-model").textContent = [deviceInfo.manufacturer, deviceInfo.model].filter(Boolean).join(" ") || "等待设备状态";
    card.querySelector(".last-update").textContent = formatTime(device.lastUpdate ?? device.connectedAt);
    card.querySelector(".battery-level").textContent = value(battery.levelPercent, "%");
    card.querySelector(".battery-temp").textContent = value(battery.temperatureC, "°C", 1);
    card.querySelector(".battery-power").textContent = value(battery.estimatedPowerW, "W", 2);
    card.querySelector(".active-account").textContent = Number.isInteger(app.activeAccount) ? `账号${app.activeAccount + 1}` : "--";
    card.querySelector(".device-note").textContent = app.blackScreen ? "黑屏保护已开启" : `Android ${deviceInfo.androidVersion ?? "--"} · WebView ${deviceInfo.webViewVersion ?? "--"}`;

    const tabs = card.querySelector(".account-tabs");
    for (let index = 0; index < 4; index += 1) {
      const button = document.createElement("button");
      button.textContent = `账号${index + 1}`;
      if (app.activeAccount === index) button.classList.add("active");
      button.addEventListener("click", () => sendCommand(device.deviceId, "switch_account", { accountIndex: index }));
      tabs.append(button);
    }
    card.querySelectorAll(".button-grid button").forEach((button) => {
      button.addEventListener("click", () => {
        const parameters = {};
        const accountIndex = Number.isInteger(app.activeAccount) ? app.activeAccount : 0;
        if (["reload_account", "open_home", "set_browser_mode", "set_orientation"].includes(button.dataset.command)) {
          parameters.accountIndex = accountIndex;
        }
        if (button.dataset.mode) parameters.mode = button.dataset.mode;
        if (button.dataset.orientation) parameters.orientation = button.dataset.orientation;
        sendCommand(device.deviceId, button.dataset.command, parameters);
      });
    });
    elements.deviceList.append(card);
  }
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
