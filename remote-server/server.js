import crypto from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket, WebSocketServer } from "ws";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const publicDirectory = path.join(currentDirectory, "public");
const MAX_MESSAGE_BYTES = 5 * 1024 * 1024;
const MAX_PREVIEW_BYTES = 2_500 * 1024;
const COMMAND_WINDOW_MS = 60_000;
const COMMAND_LIMIT = 180;

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
  request_status: emptyParameters,
  preview_start(parameters) {
    return accountParameters(parameters)
      && Number.isInteger(parameters.maxWidth)
      && parameters.maxWidth >= 360
      && parameters.maxWidth <= 2560
      && typeof parameters.fps === "number"
      && parameters.fps >= 0.1
      && parameters.fps <= 1;
  },
  preview_stop: emptyParameters,
  pointer_tap(parameters) {
    return accountParameters(parameters)
      && finiteRange(parameters.x, 0, 1)
      && finiteRange(parameters.y, 0, 1)
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
      && /^[A-Za-z0-9_.-]{1,30}$/.test(parameters.buyer)
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
      && typeof parameters.item === "string"
      && parameters.item.trim().length >= 1
      && parameters.item.trim().length <= 30
      && !/[\r\n\t]/.test(parameters.item);
  },
  run_warehouse_sync: accountParameters,
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
      && (/^[A-Za-z0-9@_.-]{0,30}$/).test(parameters.buyer);
  },
  run_equipment_sell: accountParameters,
  run_equipment_buy: accountParameters,
  run_auction_buy: accountParameters,
  resolve_temple_confirmation(parameters) {
    return accountParameters(parameters) && typeof parameters.enterTemple === "boolean";
  },
  configure_temple_guard(parameters) {
    return accountParameters(parameters) && typeof parameters.enabled === "boolean";
  },
  run_temple_guard: accountParameters
};

function finiteRange(value, minimum, maximum) {
  return typeof value === "number" && Number.isFinite(value)
    && value >= minimum && value <= maximum;
}

function accountParameters(parameters) {
  return Number.isInteger(parameters?.accountIndex)
    && parameters.accountIndex >= 0
    && parameters.accountIndex <= 3;
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
    response.end(JSON.stringify({ ok: true, service: "play-keeper-relay", version: "1.5.0" }));
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

export function createRelayServer({ adminToken, deviceToken, logger = console } = {}) {
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

  function deviceSummary(entry) {
    return {
      deviceId: entry.deviceId,
      connectedAt: entry.connectedAt,
      appVersion: entry.appVersion,
      telemetry: entry.telemetry ?? null
    };
  }

  function broadcast(value) {
    for (const controller of controllers) sendJson(controller, value);
  }

  function broadcastSnapshot(controller) {
    sendJson(controller, {
      type: "devices.snapshot",
      devices: [...devices.values()].map(deviceSummary),
      timestamp: Date.now()
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
        if (message.type !== "device.hello"
            || !safeEqual(message.token, deviceToken)
            || typeof message.deviceId !== "string"
            || !/^PK-[A-Z0-9]{6,32}$/.test(message.deviceId)) {
          sendJson(socket, { type: "device.rejected", message: "authentication failed" });
          return socket.close(1008, "authentication failed");
        }
        clearTimeout(authTimer);
        const previous = devices.get(message.deviceId);
        if (previous && previous.socket !== socket) previous.socket.close(4001, "new connection");
        socket.authenticated = true;
        socket.deviceId = message.deviceId;
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
        broadcast({
          type: "telemetry.update",
          deviceId: entry.deviceId,
          timestamp: Number(message.timestamp) || Date.now(),
          payload: entry.telemetry
        });
      } else if (message.type === "command.result" && typeof message.commandId === "string") {
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
          if (controller.previewDevices?.has(entry.deviceId)) {
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
          if (controller.previewDevices?.has(entry.deviceId)) {
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
        if (message.type !== "control.hello" || !safeEqual(message.token, adminToken)) {
          sendJson(socket, { type: "control.rejected", message: "authentication failed" });
          return socket.close(1008, "authentication failed");
        }
        clearTimeout(authTimer);
        socket.authenticated = true;
        controllers.add(socket);
        sendJson(socket, { type: "control.accepted", serverTime: Date.now() });
        broadcastSnapshot(socket);
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
      if (message.command === "preview_start") socket.previewDevices.add(target.deviceId);
      if (message.command === "preview_stop") socket.previewDevices.delete(target.deviceId);
      const commandId = crypto.randomUUID();
      sendJson(target.socket, {
        type: "command.request",
        commandId,
        command: message.command,
        parameters,
        issuedAt: now,
        expiresAt: now + 30_000
      });
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

  server.on("close", () => {
    clearInterval(heartbeat);
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
