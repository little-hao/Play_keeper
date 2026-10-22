import crypto from "node:crypto";
import syncFs from "node:fs";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket, WebSocketServer } from "ws";
import { EightAccountPlan, resolveAccountRoute } from "./eight-account-plan.js";
import { sendCompletionReport } from "./email-report.js";
import { AuthStore } from "./auth-store.js";
import { PlanDiagnosticsStore } from "./plan-diagnostics.js";
import { EquipmentTransferCoordinator } from "./equipment-transfer-coordinator.js";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const publicDirectory = path.join(currentDirectory, "public");
const MAX_MESSAGE_BYTES = 5 * 1024 * 1024;
const MAX_PREVIEW_BYTES = 2_500 * 1024;
const COMMAND_WINDOW_MS = 60_000;
const COMMAND_LIMIT = 180;
const DEFAULT_DUNGEONS = Object.freeze([
  "绘画小屋", "伊苏王的神墓", "火龙王的宫殿", "史芬克斯密穴"
]);

const commandValidators = {
  switch_account: accountParameters,
  reload_account: accountParameters,
  open_home: accountParameters,
  set_browser_mode(parameters) {
    return accountParameters(parameters)
      && ["desktop", "mobile"].includes(parameters.mode);
  },
  set_orientation(parameters) {
    return accountParameters(parameters)
      && ["landscape", "portrait"].includes(parameters.orientation);
  },
  enter_black_screen: emptyParameters,
  exit_black_screen: emptyParameters,
  keep_player_start: emptyParameters,
  keep_player_exit: emptyParameters,
  request_status: emptyParameters,
  preview_start(parameters) {
    return accountParameters(parameters)
      && Number.isInteger(parameters.maxWidth)
      && parameters.maxWidth >= 360
      && parameters.maxWidth <= 2560
      && typeof parameters.fps === "number"
      && parameters.fps >= 0.1
      && parameters.fps <= 3;
  },
  preview_stop: emptyParameters,
  pointer_tap(parameters) {
    return accountParameters(parameters)
      && finiteRange(parameters.x, 0, 1)
      && finiteRange(parameters.y, 0, 1)
      && Number.isSafeInteger(parameters.frameSequence)
      && parameters.frameSequence >= 0;
  },
  pointer_swipe(parameters) {
    return accountParameters(parameters)
      && finiteRange(parameters.x1, 0, 1) && finiteRange(parameters.y1, 0, 1)
      && finiteRange(parameters.x2, 0, 1) && finiteRange(parameters.y2, 0, 1)
      && Number.isInteger(parameters.durationMs)
      && parameters.durationMs >= 120 && parameters.durationMs <= 1_500
      && Number.isSafeInteger(parameters.frameSequence)
      && parameters.frameSequence >= 0;
  },
  select_option(parameters) {
    return accountParameters(parameters)
      && typeof parameters.elementToken === "string"
      && /^[A-Za-z0-9_-]{1,80}$/.test(parameters.elementToken)
      && Number.isInteger(parameters.optionIndex)
      && parameters.optionIndex >= 0
      && parameters.optionIndex < 200;
  },
  configure_auto_auction(parameters) {
    return accountParameters(parameters)
      && typeof parameters.enabled === "boolean"
      && Array.isArray(parameters.items)
      && parameters.items.length >= 1
      && parameters.items.length <= 10
      && parameters.items.every((item) => typeof item === "string"
        && item.trim().length >= 1 && item.trim().length <= 30)
      && typeof parameters.buyer === "string"
      && validAccountLabel(parameters.buyer, true)
      && (parameters.price === undefined || (Number.isInteger(parameters.price)
        && parameters.price >= 1 && parameters.price <= 9_999_999))
      && (parameters.reserveCount === undefined
        || (Number.isInteger(parameters.reserveCount) && [0, 1].includes(parameters.reserveCount)))
      && Number.isInteger(parameters.intervalHours)
      && parameters.intervalHours >= 1
      && parameters.intervalHours <= 168;
  },
  configure_auto_sell(parameters) {
    return commandValidators.configure_auto_auction(parameters);
  },
  run_auto_auction: accountParameters,
  run_auto_sell: accountParameters,
  configure_store_sell(parameters) {
    return accountParameters(parameters)
      && typeof parameters.enabled === "boolean"
      && Array.isArray(parameters.items)
      && parameters.items.length === 1
      && parameters.items[0] === "金币券"
      && Number.isInteger(parameters.intervalHours)
      && parameters.intervalHours >= 1
      && parameters.intervalHours <= 168;
  },
  run_store_sell: accountParameters,
  configure_warehouse_sync(parameters) {
    return accountParameters(parameters)
      && typeof parameters.enabled === "boolean"
      && (parameters.storeAll === undefined || typeof parameters.storeAll === "boolean")
      && (validItemList(parameters.items, 10)
        || validLegacyItem(parameters.item));
  },
  run_warehouse_sync: accountParameters,
  configure_dungeon_sequence(parameters) {
    return accountParameters(parameters) && validItemList(parameters.items, 20);
  },
  run_dungeon_sequence: accountParameters,
  run_daily_tasks: accountParameters,
  configure_prestige_items(parameters) {
    return accountParameters(parameters)
      && typeof parameters.enabled === "boolean"
      && validItemList(parameters.items, 10);
  },
  run_prestige_items: accountParameters,
  configure_inventory_monitor(parameters) {
    return accountParameters(parameters) && validItemList(parameters.items, 20);
  },
  run_inventory_snapshot: accountParameters,
  set_daily_completion(parameters) {
    return accountParameters(parameters)
      && ["equipment", "dungeon"].includes(parameters.kind)
      && typeof parameters.completed === "boolean";
  },
  configure_equipment_transfer(parameters) {
    return accountParameters(parameters)
      && Array.isArray(parameters.items)
      && parameters.items.length >= 1
      && parameters.items.length <= 10
      && parameters.items.every((item) => typeof item === "string"
        && item.trim().length >= 1 && item.trim().length <= 30)
      && Number.isInteger(parameters.price)
      && parameters.price >= 1
      && parameters.price <= 9_999_999
      && typeof parameters.buyer === "string"
      && validAccountLabel(parameters.buyer, true);
  },
  run_equipment_sell: accountParameters,
  run_equipment_buy: equipmentBuyParameters,
  confirm_equipment_verification(parameters) {
    return accountParameters(parameters)
      && typeof parameters.verificationToken === "string"
      && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(parameters.verificationToken);
  },
  run_seller_cleanup: accountParameters,
  cancel_automation: accountParameters,
  run_auction_buy: accountParameters,
  resolve_temple_confirmation(parameters) {
    return accountParameters(parameters) && typeof parameters.enterTemple === "boolean";
  },
  configure_temple_guard(parameters) {
    return accountParameters(parameters) && typeof parameters.enabled === "boolean";
  },
  configure_return_hang(parameters) {
    return accountParameters(parameters)
      && typeof parameters.map === "string"
      && parameters.map.trim().length >= 1
      && parameters.map.trim().length <= 30;
  },
  run_temple_guard: accountParameters
};

function validItemList(items, maximum) {
  return Array.isArray(items)
    && items.length >= 1
    && items.length <= maximum
    && items.every((item) => typeof item === "string"
      && item.trim().length >= 1 && item.trim().length <= 30
      && !/[\r\n\t]/.test(item));
}

function validAccountLabel(value, allowEmpty = false) {
  if (typeof value !== "string") return false;
  const label = value.trim();
  if (!label) return allowEmpty;
  return label.length <= 30 && !/[\r\n\t→,，]/.test(label);
}

function validLegacyItem(item) {
  return typeof item === "string"
    && item.trim().length >= 1
    && item.trim().length <= 30
    && !/[\r\n\t]/.test(item);
}

function finiteRange(value, minimum, maximum) {
  return typeof value === "number" && Number.isFinite(value)
    && value >= minimum && value <= maximum;
}

function accountParameters(parameters) {
  return Number.isInteger(parameters?.accountIndex)
    && parameters.accountIndex >= 0
    && parameters.accountIndex <= 3;
}

function equipmentBuyParameters(parameters) {
  return accountParameters(parameters)
    && (parameters.sellerAccountIndex === undefined
      || (Number.isInteger(parameters.sellerAccountIndex)
        && parameters.sellerAccountIndex >= -1
        && parameters.sellerAccountIndex <= 3))
    && (parameters.recovery === undefined || typeof parameters.recovery === "boolean");
}

function emptyParameters(parameters) {
  return parameters !== null && typeof parameters === "object" && !Array.isArray(parameters);
}

function safeEqual(actual, expected) {
  const actualBuffer = Buffer.from(String(actual ?? ""));
  const expectedBuffer = Buffer.from(String(expected ?? ""));
  return actualBuffer.length === expectedBuffer.length
    && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function sendJson(socket, value) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(value));
  }
}

function securityHeaders(response) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data:; "
      + "style-src 'self'; script-src 'self'; object-src 'none'; frame-ancestors 'none'; "
      + "base-uri 'none'; form-action 'self'"
  );
}

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"]
]);

async function serveHttp(request, response) {
  securityHeaders(response);
  if (request.url === "/health") {
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ ok: true, service: "play-keeper-relay", version: "2.0.2-rc6" }));
    return;
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end();
    return;
  }

  const requestPath = new URL(request.url, "http://localhost").pathname;
  const relative = requestPath === "/" ? "index.html" : requestPath.slice(1);
  const normalized = path.normalize(relative);
  if (normalized.startsWith("..") || path.isAbsolute(normalized)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }
  try {
    const contents = await fs.readFile(path.join(publicDirectory, normalized));
    response.writeHead(200, {
      "Content-Type": mimeTypes.get(path.extname(normalized)) ?? "application/octet-stream",
      "Cache-Control": normalized === "index.html" ? "no-store" : "public, max-age=3600"
    });
    response.end(request.method === "HEAD" ? undefined : contents);
  } catch (error) {
    response.writeHead(error?.code === "ENOENT" ? 404 : 500);
    response.end(error?.code === "ENOENT" ? "Not found" : "Server error");
  }
}

function normalizePlanOptions(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const resourceItems = Array.isArray(source.resourceItems) ? source.resourceItems : undefined;
  const inventoryItems = Array.isArray(source.inventoryItems)
    ? source.inventoryItems : (resourceItems ?? undefined);
  const resourceReserveCount = source.resourceReserveCount === undefined
    ? 1 : Number(source.resourceReserveCount);
  const dungeonItems = Array.isArray(source.dungeonItems) ? source.dungeonItems : [...DEFAULT_DUNGEONS];
  const routeLabels = Array.isArray(source.routeLabels)
    ? source.routeLabels.map((label) => String(label).trim()).filter(Boolean)
    : ["hao", "hao1", "hao2", "hao3", "hao4", "hao5", "hao6", "hao7", "hao"];
  const equipmentItems = Array.isArray(source.equipmentItems)
    ? source.equipmentItems.map((item) => String(item).trim()).filter(Boolean) : undefined;
  if (resourceItems !== undefined && !validItemList(resourceItems, 10)) {
    throw new Error("道具组合无效");
  }
  if (inventoryItems !== undefined && !validItemList(inventoryItems, 20)) {
    throw new Error("统一背包检查项目无效");
  }
  if (!Number.isInteger(resourceReserveCount) || ![0, 1].includes(resourceReserveCount)) {
    throw new Error("道具保留数量只能是0或1");
  }
  if (!validItemList(dungeonItems, 20)) throw new Error("副本组合无效");
  if (routeLabels.length < 3 || routeLabels.length > 9
      || routeLabels[0] !== routeLabels.at(-1)
      || new Set(routeLabels.slice(0, -1)).size !== routeLabels.length - 1
      || routeLabels.slice(0, -1).some((label) => !validAccountLabel(label))) {
    throw new Error("装备路线必须首尾为同一主号，且参与账号不能重复");
  }
  if (equipmentItems !== undefined
      && (!validItemList(equipmentItems, 10) || new Set(equipmentItems).size !== equipmentItems.length)) {
    throw new Error("装备套装必须包含1–10件不重复装备");
  }
  const returnMap = typeof source.returnMap === "string" ? source.returnMap.trim() : "圣兽云殿";
  if (!returnMap || returnMap.length > 30) throw new Error("返回挂机副本无效");
  const reportEmail = typeof source.reportEmail === "string"
    ? source.reportEmail.trim() : "";
  if (reportEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(reportEmail)) throw new Error("报告邮箱格式无效");
  return { resourceItems, resourceReserveCount, inventoryItems,
    dungeonItems, routeLabels, equipmentItems, returnMap, reportEmail };
}

function defaultPlanSchedule() {
  return { enabled: false, time: "04:00", timeZone: "Asia/Shanghai", lastRunDate: "",
    lastAttemptAt: 0, lastError: "", options: normalizePlanOptions({}) };
}

function normalizePlanSchedule(value, previous = defaultPlanSchedule()) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const time = typeof source.time === "string" ? source.time : previous.time;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error("每日运行时间无效");
  return { enabled: source.enabled === true, time, timeZone: "Asia/Shanghai",
    lastRunDate: typeof source.lastRunDate === "string" ? source.lastRunDate : (previous.lastRunDate || ""),
    lastAttemptAt: Number(source.lastAttemptAt ?? previous.lastAttemptAt) || 0,
    lastError: typeof source.lastError === "string" ? source.lastError.slice(0, 160) : "",
    options: normalizePlanOptions(source.options ?? previous.options) };
}

function normalizeWorkspace(value, schedule) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const routeLabels = schedule.options.routeLabels;
  const accountLabels = [...new Set(routeLabels.slice(0, -1))];
  const field = (name) => typeof source[name] === "string" ? source[name].trim() : "";
  const quickAuctionAccount = field("quickAuctionAccount");
  const quickHangAccount = field("quickHangAccount");
  const auctionBuyer = field("auctionBuyer");
  const equipmentBuyer = field("equipmentBuyer");
  const quickBuyPrice = Number(source.quickBuyPrice ?? 920);
  const quickHangMap = field("quickHangMap") || schedule.options.returnMap;
  for (const label of [quickAuctionAccount, quickHangAccount, auctionBuyer, equipmentBuyer]) {
    if (!validAccountLabel(label, true)) throw new Error("账号名称格式无效");
  }
  if (!quickHangMap || quickHangMap.length > 30 || /[\r\n\t]/.test(quickHangMap)) {
    throw new Error("快捷挂机副本名称无效");
  }
  if (!Number.isInteger(quickBuyPrice) || quickBuyPrice < 1 || quickBuyPrice > 9_999_999) {
    throw new Error("快捷拍卖/购买单价无效");
  }
  return { accountLabels, mainAccount: routeLabels[0], quickAuctionAccount,
    quickBuyPrice, quickHangAccount, quickHangMap, auctionBuyer, equipmentBuyer };
}

function loadPlanSchedule(file, logger) {
  try {
    if (!syncFs.existsSync(file)) return defaultPlanSchedule();
    return normalizePlanSchedule(JSON.parse(syncFs.readFileSync(file, "utf8")));
  } catch (error) {
    logger.warn?.("Unable to load plan schedule", error.message);
    return defaultPlanSchedule();
  }
}

function savePlanSchedule(file, schedule, logger) {
  try {
    syncFs.mkdirSync(path.dirname(file), { recursive: true });
    syncFs.writeFileSync(file, `${JSON.stringify(schedule, null, 2)}\n`, { mode: 0o600 });
  } catch (error) {
    logger.warn?.("Unable to save plan schedule", error.message);
  }
}

function loadPlanState(file, logger) {
  try {
    if (!syncFs.existsSync(file)) return null;
    const value = JSON.parse(syncFs.readFileSync(file, "utf8"));
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch (error) {
    logger.warn?.("Unable to load plan state", error.message);
    return null;
  }
}

function savePlanState(file, state, logger) {
  try {
    syncFs.mkdirSync(path.dirname(file), { recursive: true });
    const temporary = `${file}.tmp`;
    syncFs.writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
    syncFs.renameSync(temporary, file);
  } catch (error) {
    logger.warn?.("Unable to save plan state", error.message);
  }
}

function timeToMinutes(time) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function zonedClock(timestamp, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit",
    day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date(timestamp));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { date: `${values.year}-${values.month}-${values.day}`,
    minutes: Number(values.hour) * 60 + Number(values.minute) };
}

export function createRelayServer({ adminToken, deviceToken, logger = console,
  planScheduleFile, planStateFile, authFile } = {}) {
  if (!adminToken || adminToken.length < 16 || !deviceToken || deviceToken.length < 16) {
    throw new Error("ADMIN_TOKEN and DEVICE_TOKEN must each contain at least 16 characters");
  }

  const server = http.createServer((request, response) => {
    serveHttp(request, response).catch((error) => {
      logger.error("HTTP request failed", error);
      if (!response.headersSent) response.writeHead(500);
      response.end();
    });
  });
  const deviceServer = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });
  const controlServer = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });
  const devices = new Map();
  const controllers = new Set();
  const pendingPlanCommands = new Map();
  const pendingTransferCommands = new Map();
  const authStoreFile = authFile || process.env.AUTH_STORE_FILE
    || path.join(currentDirectory, "data", "users.json");
  const authStore = new AuthStore(authStoreFile, adminToken);
  const planDiagnostics = new PlanDiagnosticsStore(
    process.env.PLAN_DIAGNOSTICS_DIR || path.join(path.dirname(authStoreFile), "diagnostics"), logger);
  const scheduleFile = planScheduleFile || process.env.PLAN_SETTINGS_FILE
    || path.join(currentDirectory, "data", "plan-schedule.json");
  const stateFile = planStateFile || process.env.PLAN_STATE_FILE
    || (planScheduleFile ? `${scheduleFile}.state` : path.join(currentDirectory, "data", "plan-state.json"));
  let planSchedule = loadPlanSchedule(scheduleFile, logger);

  function dispatchDeviceCommand(deviceId, command, parameters) {
    const validator = commandValidators[command];
    if (!validator || !validator(parameters)) throw new Error("计划生成了无效命令");
    const target = devices.get(deviceId);
    if (!target) throw new Error(`设备 ${deviceId} 当前不在线`);
    const now = Date.now();
    const commandId = crypto.randomUUID();
    sendJson(target.socket, {
      type: "command.request",
      commandId,
      command,
      parameters,
      issuedAt: now,
      expiresAt: now + 30_000
    });
    return commandId;
  }

  const eightAccountPlan = new EightAccountPlan({
    emitAction(action) {
      const commandId = dispatchDeviceCommand(
        action.deviceId, action.command, action.parameters);
      pendingPlanCommands.set(commandId, { action: structuredClone(action),
        sentAt: Date.now() });
      broadcast({
        type: "plan.command",
        plan: "eight_account_daily",
        commandId,
        ...action,
        timestamp: Date.now()
      });
    },
    async onComplete(plan) {
      try {
        const result = await sendCompletionReport(plan);
        const payload = eightAccountPlan.updateEmailStatus(result.status);
        publishPlan(payload);
      } catch (error) {
        const payload = eightAccountPlan.updateEmailStatus(
          `发送失败：${String(error?.message || error).slice(0, 80)}`);
        publishPlan(payload);
      }
    }
  });
  eightAccountPlan.restore(loadPlanState(stateFile, logger));
  const equipmentTransfer = new EquipmentTransferCoordinator({
    emitAction(action) {
      const commandId = dispatchDeviceCommand(action.deviceId, action.command, action.parameters);
      if (action.command !== "cancel_automation") {
        pendingTransferCommands.set(commandId, { action: structuredClone(action), sentAt: Date.now() });
      }
      broadcast({ type: "equipment.transfer.command", ...action, timestamp: Date.now() });
    },
    onUpdate(payload) {
      savePlanState(`${stateFile}.transfer`, payload, logger);
      for (const controller of controllers) {
        if (controller.user?.role === "admin" || controller.user?.id === payload.ownerId) {
          sendJson(controller, { type: "equipment.transfer.update", payload });
        }
      }
    }
  });
  equipmentTransfer.restore(loadPlanState(`${stateFile}.transfer`, logger));

  function deviceSummary(entry) {
    return {
      deviceId: entry.deviceId,
      connectedAt: entry.connectedAt,
      appVersion: entry.appVersion,
      telemetry: entry.telemetry ?? null
    };
  }

  function messageDeviceId(value) {
    return value?.deviceId || value?.device?.deviceId || value?.action?.deviceId || "";
  }

  function broadcast(value) {
    const deviceId = messageDeviceId(value);
    for (const controller of controllers) {
      if (!deviceId || authStore.canAccess(controller.user, deviceId)) sendJson(controller, value);
    }
  }

  function publishPlan(payload) {
    savePlanState(stateFile, payload, logger);
    planDiagnostics.append(payload);
    const routeDeviceIds = [...new Set((payload?.route || []).map((entry) => entry.deviceId).filter(Boolean))];
    for (const controller of controllers) {
      if (controller.user?.role === "admin"
          || (routeDeviceIds.length > 0 && routeDeviceIds.every((deviceId) =>
            authStore.canAccess(controller.user, deviceId)))) {
        sendJson(controller, { type: "plan.update", plan: "eight_account_daily", payload });
      }
    }
  }

  function broadcastSnapshot(controller) {
    sendJson(controller, {
      type: "devices.snapshot",
      devices: [...devices.values()].filter((entry) =>
        authStore.canAccess(controller.user, entry.deviceId)).map(deviceSummary),
      timestamp: Date.now()
    });
  }

  function sendSchedule(controller) {
    const settings = authStore.getSettings(controller.user);
    const schedule = settings.planSchedule
      ? normalizePlanSchedule(settings.planSchedule) : planSchedule;
    sendJson(controller, { type: "user.settings", payload: settings });
    sendJson(controller, { type: "plan.schedule", payload: schedule });
  }

  function accessibleSummaries(user) {
    return [...devices.values()].filter((entry) =>
      authStore.canAccess(user, entry.deviceId)).map(deviceSummary);
  }

  function syncReportedAccounts(deviceId) {
    const ownerId = authStore.ownerIdForDevice(deviceId);
    if (!ownerId) return;
    const labels = [];
    for (const entry of devices.values()) {
      if (authStore.ownerIdForDevice(entry.deviceId) !== ownerId) continue;
      const accounts = Array.isArray(entry.telemetry?.accounts) ? entry.telemetry.accounts : [];
      for (const account of [...accounts].sort((left, right) =>
        Number(left?.index ?? 0) - Number(right?.index ?? 0))) {
        const label = typeof account?.label === "string" ? account.label.trim() : "";
        if (label && !labels.includes(label)) labels.push(label);
      }
    }
    const settings = authStore.syncAccountLabels(ownerId, labels);
    if (!settings) return;
    for (const controller of controllers) {
      if (controller.user?.id === ownerId) {
        sendJson(controller, { type: "user.settings", payload: settings });
        sendJson(controller, { type: "plan.schedule",
          payload: normalizePlanSchedule(settings.planSchedule) });
      }
    }
  }

  function canAccessCurrentPlan(user) {
    if (user?.role === "admin") return true;
    const route = eightAccountPlan.snapshot().route || [];
    return route.length > 0 && route.every((entry) =>
      authStore.canAccess(user, entry.deviceId));
  }

  function startConfiguredPlan(options, user = { role: "admin" }) {
    if (equipmentTransfer.isActive()) throw new Error("单次转移正在运行或等待处理，请先检查并中断该任务");
    const summaries = accessibleSummaries(user);
    const route = resolveAccountRoute(summaries, options.routeLabels);
    return eightAccountPlan.start(route, {
      items: Array.isArray(options.equipmentItems) ? options.equipmentItems : undefined,
      resourceItems: Array.isArray(options.resourceItems) ? options.resourceItems : undefined,
      resourceReserveCount: options.resourceReserveCount,
      inventoryItems: Array.isArray(options.inventoryItems) ? options.inventoryItems : undefined,
      dungeonItems: Array.isArray(options.dungeonItems) ? options.dungeonItems : undefined,
      returnMap: typeof options.returnMap === "string" ? options.returnMap : undefined,
      reportEmail: typeof options.reportEmail === "string" ? options.reportEmail : undefined,
      ownerUsername: typeof user?.username === "string" ? user.username : ""
    });
  }

  function startResourceSweep(options, user = { role: "admin" }) {
    if (equipmentTransfer.isActive()) throw new Error("单次转移正在运行或等待处理，请先检查并中断该任务");
    const summaries = accessibleSummaries(user);
    const mainAccount = options.routeLabels[0];
    const routeLabels = [...options.routeLabels.slice(1, -1), mainAccount];
    const route = resolveAccountRoute(summaries, routeLabels);
    return eightAccountPlan.startResourceSweep(route, {
      resourceItems: Array.isArray(options.resourceItems) ? options.resourceItems : undefined,
      resourceReserveCount: options.resourceReserveCount,
      returnMap: typeof options.returnMap === "string" ? options.returnMap : undefined,
      ownerUsername: typeof user?.username === "string" ? user.username : ""
    });
  }

  deviceServer.on("connection", (socket) => {
    socket.isAlive = true;
    socket.authenticated = false;
    socket.on("pong", () => { socket.isAlive = true; });
    const authTimer = setTimeout(() => socket.close(1008, "authentication timeout"), 10_000);

    socket.on("message", (buffer, isBinary) => {
      if (isBinary) return socket.close(1003, "text messages only");
      let message;
      try { message = JSON.parse(buffer.toString()); } catch { return socket.close(1007, "invalid json"); }

      if (!socket.authenticated) {
        const deviceOwner = message.type === "device.hello"
          ? authStore.authenticateDeviceToken(message.token, deviceToken) : null;
        if (!deviceOwner || typeof message.deviceId !== "string"
            || !/^PK-[A-Z0-9]{6,32}$/.test(message.deviceId)) {
          sendJson(socket, { type: "device.rejected", message: "authentication failed" });
          return socket.close(1008, "authentication failed");
        }
        clearTimeout(authTimer);
        const previous = devices.get(message.deviceId);
        if (previous && previous.socket !== socket) previous.socket.close(4001, "new connection");
        socket.authenticated = true;
        socket.deviceId = message.deviceId;
        socket.user = deviceOwner;
        authStore.claimDevice(message.deviceId, deviceOwner);
        const entry = {
          deviceId: message.deviceId,
          appVersion: String(message.appVersion ?? "unknown").slice(0, 40),
          connectedAt: Date.now(),
          socket,
          telemetry: previous?.telemetry ?? null
        };
        devices.set(entry.deviceId, entry);
        sendJson(socket, { type: "device.accepted", serverTime: Date.now() });
        broadcast({ type: "device.online", device: deviceSummary(entry) });
        return;
      }

      const entry = devices.get(socket.deviceId);
      if (!entry || entry.socket !== socket) return;
      if (message.type === "telemetry.update" && message.payload && typeof message.payload === "object") {
        entry.telemetry = message.payload;
        syncReportedAccounts(entry.deviceId);
        broadcast({
          type: "telemetry.update",
          deviceId: entry.deviceId,
          timestamp: Number(message.timestamp) || Date.now(),
          payload: entry.telemetry
        });
        const before = JSON.stringify(eightAccountPlan.snapshot());
        const after = eightAccountPlan.onTelemetry(entry.deviceId, entry.telemetry);
        if (JSON.stringify(after) !== before) {
          publishPlan(after);
        }
        equipmentTransfer.onTelemetry(entry.deviceId, entry.telemetry);
      } else if (message.type === "command.result" && typeof message.commandId === "string") {
        const pending = pendingPlanCommands.get(message.commandId);
        if (pending && pending.action.deviceId === entry.deviceId) {
          pendingPlanCommands.delete(message.commandId);
          const before = JSON.stringify(eightAccountPlan.snapshot());
          const after = eightAccountPlan.onCommandResult(pending.action,
            message.success === true, String(message.message ?? ""));
          if (JSON.stringify(after) !== before) publishPlan(after);
        }
        const transferPending = pendingTransferCommands.get(message.commandId);
        if (transferPending && transferPending.action.deviceId === entry.deviceId) {
          pendingTransferCommands.delete(message.commandId);
          equipmentTransfer.onCommandResult(transferPending.action, message.success === true,
            String(message.message ?? ""));
        }
        broadcast({
          type: "command.result",
          deviceId: entry.deviceId,
          commandId: message.commandId.slice(0, 80),
          success: message.success === true,
          message: String(message.message ?? "").slice(0, 200),
          timestamp: Number(message.timestamp) || Date.now()
        });
      } else if (message.type === "preview.frame" && validPreviewFrame(message.payload)) {
        for (const controller of controllers) {
          if (controller.previewDevices?.has(entry.deviceId)
              && authStore.canAccess(controller.user, entry.deviceId)) {
            sendJson(controller, {
              type: "preview.frame",
              deviceId: entry.deviceId,
              timestamp: Number(message.timestamp) || Date.now(),
              payload: message.payload
            });
          }
        }
      } else if (message.type === "interaction.select") {
        const interaction = sanitizeSelectInteraction(message.payload);
        if (!interaction) return;
        for (const controller of controllers) {
          if (controller.previewDevices?.has(entry.deviceId)
              && authStore.canAccess(controller.user, entry.deviceId)) {
            sendJson(controller, {
              type: "interaction.select",
              deviceId: entry.deviceId,
              timestamp: Number(message.timestamp) || Date.now(),
              payload: interaction
            });
          }
        }
      }
    });

    socket.on("close", () => {
      clearTimeout(authTimer);
      if (socket.deviceId && devices.get(socket.deviceId)?.socket === socket) {
        devices.delete(socket.deviceId);
        broadcast({ type: "device.offline", deviceId: socket.deviceId, timestamp: Date.now() });
        const before = JSON.stringify(eightAccountPlan.snapshot());
        const after = eightAccountPlan.onDeviceOffline(socket.deviceId);
        if (JSON.stringify(after) !== before) {
          publishPlan(after);
        }
        equipmentTransfer.onDeviceOffline(socket.deviceId);
      }
    });
    socket.on("error", (error) => logger.warn?.("Device socket error", error.message));
  });

  controlServer.on("connection", (socket) => {
    socket.isAlive = true;
    socket.authenticated = false;
    socket.commandTimes = [];
    socket.previewDevices = new Set();
    socket.on("pong", () => { socket.isAlive = true; });
    const authTimer = setTimeout(() => socket.close(1008, "authentication timeout"), 10_000);

    socket.on("message", (buffer, isBinary) => {
      if (isBinary) return socket.close(1003, "text messages only");
      let message;
      try { message = JSON.parse(buffer.toString()); } catch { return socket.close(1007, "invalid json"); }
      if (!socket.authenticated) {
        const user = message.type === "control.hello"
          ? authStore.authenticate(message.username, message.password, message.token,
            message.deviceToken) : null;
        if (!user) {
          sendJson(socket, { type: "control.rejected", message: "authentication failed" });
          return socket.close(1008, "authentication failed");
        }
        clearTimeout(authTimer);
        socket.authenticated = true;
        socket.user = user;
        controllers.add(socket);
        sendJson(socket, { type: "control.accepted", serverTime: Date.now(),
          user: { username: user.username, role: user.role } });
        broadcastSnapshot(socket);
        const planSnapshot = eightAccountPlan.snapshot();
        const transferSnapshot = equipmentTransfer.snapshot();
        if (user.role === "admin" || user.id === transferSnapshot.ownerId) {
          sendJson(socket, { type: "equipment.transfer.update", payload: transferSnapshot });
        }
        const routeIds = [...new Set((planSnapshot.route || [])
          .map((entry) => entry.deviceId).filter(Boolean))];
        if (user.role === "admin" || (routeIds.length > 0
            && routeIds.every((deviceId) => authStore.canAccess(user, deviceId)))) {
          sendJson(socket, { type: "plan.update", plan: "eight_account_daily",
            payload: planSnapshot });
        }
        sendSchedule(socket);
        if (user.role === "admin") {
          sendJson(socket, { type: "admin.snapshot", payload: authStore.publicSnapshot() });
        }
        return;
      }

      if (message.type === "admin.user.upsert") {
        if (socket.user?.role !== "admin") return sendJson(socket,
          { type: "command.error", message: "仅管理员可管理用户" });
        try {
          authStore.upsertUser(message.username, message.password, message.role,
            message.deviceToken, message.accountLabels);
          sendJson(socket, { type: "admin.snapshot", payload: authStore.publicSnapshot() });
        } catch (error) {
          sendJson(socket, { type: "command.error", message: String(error?.message || error) });
        }
        return;
      }
      if (message.type === "admin.device.assign") {
        if (socket.user?.role !== "admin") return sendJson(socket,
          { type: "command.error", message: "仅管理员可分配设备" });
        try {
          if (!devices.has(message.deviceId)) throw new Error("设备当前不在线");
          authStore.assignDevice(message.deviceId, message.username);
          sendJson(socket, { type: "admin.snapshot", payload: authStore.publicSnapshot() });
        } catch (error) {
          sendJson(socket, { type: "command.error", message: String(error?.message || error) });
        }
        return;
      }

      if (message.type === "plan.start") {
        try {
          const options = normalizePlanOptions(message.options);
          const payload = startConfiguredPlan(options, socket.user);
          publishPlan(payload);
        } catch (error) {
          sendJson(socket, { type: "plan.error", message: String(error?.message || error) });
        }
        return;
      }
      if (message.type === "plan.resource_sweep.start") {
        try {
          const options = normalizePlanOptions(message.options);
          const payload = startResourceSweep(options, socket.user);
          publishPlan(payload);
        } catch (error) {
          sendJson(socket, { type: "plan.error", message: String(error?.message || error) });
        }
        return;
      }
      if (message.type === "plan.schedule.update") {
        try {
          const previous = authStore.getSettings(socket.user).planSchedule || defaultPlanSchedule();
          const userSchedule = normalizePlanSchedule(message.payload, previous);
          const workspace = normalizeWorkspace(message.payload?.workspace, userSchedule);
          let settings;
          if (socket.user?.legacy) {
            planSchedule = userSchedule;
            savePlanSchedule(scheduleFile, planSchedule, logger);
            settings = { ...authStore.getSettings(socket.user), ...workspace,
              planSchedule: userSchedule };
          } else {
            settings = authStore.updateSettings(socket.user,
              { ...workspace, planSchedule: userSchedule });
          }
          sendJson(socket, { type: "user.settings", payload: settings });
          sendJson(socket, { type: "plan.schedule", payload: userSchedule });
        } catch (error) {
          sendJson(socket, { type: "plan.error", message: String(error?.message || error) });
        }
        return;
      }
      if (message.type === "plan.diagnostics.request") {
        const username = String(socket.user?.username || "用户");
        sendJson(socket, { type: "plan.diagnostics",
          filename: `多用户挂机报错说明-${username}.md`,
          content: planDiagnostics.read(username) });
        return;
      }
      if (message.type === "equipment.transfer.start") {
        try {
          if (eightAccountPlan.snapshot().status === "running") {
            throw new Error("多用户挂机正在运行，请先中断计划后再使用单次定向转移");
          }
          const sellerLabel = String(message.sellerLabel || "").trim();
          const buyerLabel = String(message.buyerLabel || "").trim();
          const items = Array.isArray(message.items)
            ? message.items.map((item) => String(item).trim()).filter(Boolean) : [];
          const price = Number(message.price);
          const returnMap = String(message.returnMap || "圣兽云殿").trim();
          if (!validAccountLabel(sellerLabel) || !validAccountLabel(buyerLabel)
              || !validItemList(items, 10) || !Number.isInteger(price)
              || price < 1 || price > 9_999_999 || !returnMap || returnMap.length > 30) {
            throw new Error("请检查卖方、买方、装备组合、价格和返回挂机地图");
          }
          const [seller, buyer] = resolveAccountRoute(
            accessibleSummaries(socket.user), [sellerLabel, buyerLabel]);
          equipmentTransfer.start({ ownerId: socket.user?.id, seller, buyer,
            items, price, returnMap });
        } catch (error) {
          sendJson(socket, { type: "equipment.transfer.error",
            message: String(error?.message || error) });
        }
        return;
      }
      if (message.type === "equipment.transfer.cancel") {
        const snapshot = equipmentTransfer.snapshot();
        if (socket.user?.role !== "admin" && socket.user?.id !== snapshot.ownerId) {
          sendJson(socket, { type: "equipment.transfer.error", message: "无权中断此单次转移" });
        } else {
          equipmentTransfer.cancel();
        }
        return;
      }
      if (message.type === "plan.retry") {
        if (!canAccessCurrentPlan(socket.user)) {
          sendJson(socket, { type: "plan.error", message: "无权恢复该计划" });
          return;
        }
        try {
          if (equipmentTransfer.isActive()) throw new Error("请先中断正在运行或等待处理的单次转移");
          const summaries = accessibleSummaries(socket.user);
          const planSnapshot = eightAccountPlan.snapshot();
          const snapshotLabels = Array.isArray(planSnapshot.fullRoute)
            ? planSnapshot.fullRoute.map((entry) => entry.accountLabel) : [];
          const snapshotIsClosed = snapshotLabels.length >= 3
            && snapshotLabels[0] === snapshotLabels.at(-1);
          // rc5 could persist a sliced, non-closed route after the first manual
          // resume. Fall back to this user's saved full route so those existing
          // interrupted plans can be resumed after upgrading the VPS alone.
          const savedSchedule = normalizePlanSchedule(
            authStore.getSettings(socket.user)?.planSchedule);
          const labels = snapshotIsClosed
            ? snapshotLabels : savedSchedule.options.routeLabels;
          const route = resolveAccountRoute(summaries, labels);
          const holder = typeof message.equipmentHolder === "string"
            ? message.equipmentHolder.trim() : "";
          const payload = eightAccountPlan.resume(route, holder);
          publishPlan(payload);
        } catch (error) {
          sendJson(socket, { type: "plan.error", message: String(error?.message || error) });
        }
        return;
      }
      if (message.type === "plan.cancel") {
        if (!canAccessCurrentPlan(socket.user)) {
          sendJson(socket, { type: "plan.error", message: "无权中断该计划" });
          return;
        }
        try {
          const payload = eightAccountPlan.cancel("用户从监控页面中断");
          publishPlan(payload);
        } catch (error) {
          sendJson(socket, { type: "plan.error", message: String(error?.message || error) });
        }
        return;
      }
      if (message.type !== "command.send") return;
      const validator = commandValidators[message.command];
      const parameters = message.parameters ?? {};
      if (!validator || !validator(parameters)) {
        return sendJson(socket, { type: "command.error", message: "命令或参数无效" });
      }
      const now = Date.now();
      socket.commandTimes = socket.commandTimes.filter((time) => now - time < COMMAND_WINDOW_MS);
      if (socket.commandTimes.length >= COMMAND_LIMIT) {
        return sendJson(socket, { type: "command.error", message: "操作过于频繁，请稍后再试" });
      }
      socket.commandTimes.push(now);
      const target = devices.get(message.deviceId);
      if (!target) return sendJson(socket, { type: "command.error", message: "设备当前不在线" });
      if (!authStore.canAccess(socket.user, target.deviceId)) {
        return sendJson(socket, { type: "command.error", message: "无权控制该设备" });
      }
      if (message.command === "cancel_automation" && equipmentTransfer.isActive()) {
        const transfer = equipmentTransfer.snapshot();
        if ([transfer.seller, transfer.buyer].some(account =>
          account?.deviceId === target.deviceId && account.accountIndex === parameters.accountIndex)) {
          equipmentTransfer.cancel("用户中断关联账号，单次转移已停止");
        }
      }
      if (message.command === "preview_start") socket.previewDevices.add(target.deviceId);
      if (message.command === "preview_stop") socket.previewDevices.delete(target.deviceId);
      const commandId = dispatchDeviceCommand(target.deviceId, message.command, parameters);
      sendJson(socket, { type: "command.queued", commandId, deviceId: target.deviceId });
    });

    socket.on("close", () => {
      clearTimeout(authTimer);
      controllers.delete(socket);
      for (const deviceId of socket.previewDevices) {
        const stillViewed = [...controllers].some((controller) =>
          controller.previewDevices?.has(deviceId));
        const target = devices.get(deviceId);
        if (!stillViewed && target) {
          const now = Date.now();
          sendJson(target.socket, {
            type: "command.request",
            commandId: crypto.randomUUID(),
            command: "preview_stop",
            parameters: {},
            issuedAt: now,
            expiresAt: now + 30_000
          });
        }
      }
    });
    socket.on("error", (error) => logger.warn?.("Control socket error", error.message));
  });

  server.on("upgrade", (request, socket, head) => {
    let pathname;
    try { pathname = new URL(request.url, "http://localhost").pathname; } catch { socket.destroy(); return; }
    const target = pathname === "/device" ? deviceServer : pathname === "/control" ? controlServer : null;
    if (!target) return socket.destroy();
    target.handleUpgrade(request, socket, head, (webSocket) => {
      target.emit("connection", webSocket, request);
    });
  });

  const heartbeat = setInterval(() => {
    for (const socket of [...deviceServer.clients, ...controlServer.clients]) {
      if (!socket.isAlive) {
        socket.terminate();
        continue;
      }
      socket.isAlive = false;
      socket.ping();
    }
  }, 30_000);
  heartbeat.unref();
  const planTicker = setInterval(() => {
    const now = Date.now();
    for (const [commandId, pending] of pendingTransferCommands) {
      if (now - pending.sentAt < 30_000) continue;
      pendingTransferCommands.delete(commandId);
      equipmentTransfer.onCommandResult(pending.action, false, "30秒内未收到APP确认");
    }
    equipmentTransfer.tick();
    for (const [commandId, pending] of pendingPlanCommands) {
      if (now - pending.sentAt < 30_000) continue;
      pendingPlanCommands.delete(commandId);
      const beforeTimeout = JSON.stringify(eightAccountPlan.snapshot());
      const afterTimeout = eightAccountPlan.onCommandResult(
        pending.action, false, "30秒内未收到APP确认");
      if (JSON.stringify(afterTimeout) !== beforeTimeout) publishPlan(afterTimeout);
    }
    const before = JSON.stringify(eightAccountPlan.snapshot());
    const after = eightAccountPlan.tick();
    if (JSON.stringify(after) !== before) {
      publishPlan(after);
    }
  }, 1_000);
  planTicker.unref();
  const scheduleTicker = setInterval(() => {
    if (equipmentTransfer.isActive()) return;
    if (["running", "intervention"].includes(eightAccountPlan.snapshot().status)) return;
    for (const user of authStore.scheduledUsers()) {
      const settings = authStore.getSettings(user);
      let schedule;
      try { schedule = normalizePlanSchedule(settings.planSchedule); } catch { continue; }
      if (!schedule.enabled) continue;
      const local = zonedClock(Date.now(), schedule.timeZone);
      if (local.minutes < timeToMinutes(schedule.time)
          || schedule.lastRunDate === local.date
          || Date.now() - Number(schedule.lastAttemptAt || 0) < 5 * 60_000) continue;
      schedule.lastAttemptAt = Date.now();
      try {
        const payload = startConfiguredPlan(schedule.options, user);
        schedule.lastRunDate = local.date;
        schedule.lastError = "";
        publishPlan(payload);
      } catch (error) {
        schedule.lastError = String(error?.message || error).slice(0, 160);
      }
      authStore.updateSettings(user, { planSchedule: schedule });
      for (const controller of controllers) {
        if (controller.user?.id === user.id) {
          sendJson(controller, { type: "plan.schedule", payload: schedule });
        }
      }
      break;
    }
  }, 15_000);
  scheduleTicker.unref();

  server.on("close", () => {
    clearInterval(heartbeat);
    clearInterval(planTicker);
    clearInterval(scheduleTicker);
    for (const socket of deviceServer.clients) socket.terminate();
    for (const socket of controlServer.clients) socket.terminate();
    deviceServer.close();
    controlServer.close();
  });

  return server;
}

function validPreviewFrame(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  if (!Number.isInteger(payload.accountIndex)
      || payload.accountIndex < 0 || payload.accountIndex > 3) return false;
  if (!Number.isSafeInteger(payload.sequence) || payload.sequence < 0) return false;
  if (!Number.isInteger(payload.width) || payload.width < 1 || payload.width > 2560) return false;
  if (!Number.isInteger(payload.height) || payload.height < 1 || payload.height > 3200) return false;
  if (payload.mime !== "image/jpeg" || typeof payload.imageBase64 !== "string") return false;
  if (payload.imageBase64.length > Math.ceil(MAX_PREVIEW_BYTES * 4 / 3) + 8) return false;
  return Buffer.byteLength(payload.imageBase64, "base64") <= MAX_PREVIEW_BYTES;
}

function sanitizeSelectInteraction(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  if (!Number.isInteger(payload.accountIndex)
      || payload.accountIndex < 0 || payload.accountIndex > 3) return null;
  if (typeof payload.elementToken !== "string"
      || !/^[A-Za-z0-9_-]{1,80}$/.test(payload.elementToken)) return null;
  if (!Array.isArray(payload.options) || payload.options.length < 1
      || payload.options.length > 200) return null;
  const options = [];
  for (const option of payload.options) {
    if (!option || !Number.isInteger(option.index)
        || option.index < 0 || option.index >= 200
        || typeof option.label !== "string") return null;
    options.push({
      index: option.index,
      label: option.label.slice(0, 120),
      selected: option.selected === true,
      disabled: option.disabled === true
    });
  }
  return {
    accountIndex: payload.accountIndex,
    accountLabel: String(payload.accountLabel ?? `账号${payload.accountIndex + 1}`).slice(0, 24),
    elementToken: payload.elementToken,
    title: String(payload.title ?? "请选择").slice(0, 80),
    selectedIndex: Number.isInteger(payload.selectedIndex) ? payload.selectedIndex : -1,
    options
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number.parseInt(process.env.PORT ?? "8080", 10);
  const server = createRelayServer({
    adminToken: process.env.ADMIN_TOKEN,
    deviceToken: process.env.DEVICE_TOKEN
  });
  server.listen(port, process.env.HOST ?? "127.0.0.1", () => {
    console.log(`Play Keeper relay listening on ${process.env.HOST ?? "127.0.0.1"}:${port}`);
  });
}
