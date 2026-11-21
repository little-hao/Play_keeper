"use strict";

importScripts("license-config.js");

const TRUSTED_CLICK_MESSAGE = "pk-auto-capture/trusted-click-v1";
const TRUSTED_CLICK_PING = "pk-auto-capture/ping-v1";
const LICENSE_REQUEST_MESSAGE = "pk-license/request-v1";
const LICENSE_VERIFY_MESSAGE = "pk-license/verify-v1";
const EXTENSION_VERSION = "1.8.9";
const BROWSER_CONTEXT_MESSAGE = "pk-auto-capture/browser-context-v1";
const FOREGROUND_MESSAGE = "pk-auto-capture/foreground-v1";
const GAME_URL_RE = /^https?:\/\/(?:www\.)?sgplay\.cc(?:[/:#?]|$)/i;
const LICENSE_PATHS = new Set(["/v1/activate", "/v1/refresh"]);
const LICENSE_CONFIG = globalThis.PlayKeeperLicenseConfig || {};
const attachedTargets = new Set();
let licensePublicKey = null;

function decodeBase64Url(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function verifyLicenseSignature(token) {
  const [payloadPart, signaturePart, extra] = String(token || "").split(".");
  if (!payloadPart || !signaturePart || extra) throw new Error("许可证令牌格式无效");
  licensePublicKey ||= await crypto.subtle.importKey(
    "jwk",
    LICENSE_CONFIG.publicKeyJwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    licensePublicKey,
    decodeBase64Url(signaturePart),
    new TextEncoder().encode(payloadPart),
  );
}

async function requestLicense(path, body) {
  if (!LICENSE_CONFIG.enabled) throw new Error("许可证服务未启用");
  if (!LICENSE_PATHS.has(path)) throw new Error("不允许的许可证请求路径");
  const baseUrl = String(LICENSE_CONFIG.serverBaseUrl || "").replace(/\/$/, "");
  if (!/^https:\/\//i.test(baseUrl)) throw new Error("许可证服务器必须使用 HTTPS");
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `授权服务器返回 ${response.status}`);
  return result;
}

async function resolveGameTarget(sender) {
  const tabId = sender.tab?.id;
  const senderUrl = String(sender.url || "");
  const tabUrl = String(sender.tab?.url || "");
  if (!Number.isInteger(tabId)) throw new Error("无法识别当前游戏标签页");
  if (!GAME_URL_RE.test(senderUrl) && !GAME_URL_RE.test(tabUrl)) {
    throw new Error(`拒绝连接非游戏页面：${tabUrl || senderUrl || "未知 URL"}`);
  }
  const targets = await chrome.debugger.getTargets();
  const target = targets.find((item) => (
    item.tabId === tabId
    && item.type === "page"
    && GAME_URL_RE.test(String(item.url || ""))
  ));
  if (!target?.id) {
    const current = targets.find((item) => item.tabId === tabId);
    throw new Error(
      current
        ? `当前标签页调试目标不是游戏页面：${current.url || current.type || "未知目标"}`
        : "Chrome 未找到当前 sgplay.cc 页面调试目标，请刷新游戏页后重试",
    );
  }
  return { targetId: target.id, tabId, url: target.url };
}

async function ensureAttached(targetInfo) {
  const { targetId } = targetInfo;
  const target = { targetId };
  const targets = await chrome.debugger.getTargets();
  const current = targets.find((item) => item.id === targetId);
  if (!current || !GAME_URL_RE.test(String(current.url || ""))) {
    attachedTargets.delete(targetId);
    throw new Error("游戏页面调试目标已经切换，请刷新页面后重试");
  }
  if (attachedTargets.has(targetId) && current.attached) return target;
  attachedTargets.delete(targetId);
  try {
    await chrome.debugger.attach(target, "1.3");
    attachedTargets.add(targetId);
    return target;
  } catch (error) {
    const latestTargets = await chrome.debugger.getTargets();
    const occupied = latestTargets.some((item) => item.id === targetId && item.attached);
    if (occupied) {
      throw new Error("当前游戏标签页已被其他调试器占用。请关闭该标签页的开发者工具或 Codex Computer Use，刷新页面后重试");
    }
    throw error;
  }
}

async function dispatchTrustedClick(sender, x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0) {
    throw new Error(`无效点击坐标：${x}, ${y}`);
  }
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    let targetInfo;
    try {
      targetInfo = await resolveGameTarget(sender);
      const target = await ensureAttached(targetInfo);
      await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x,
        y,
        button: "none",
        buttons: 0,
        pointerType: "mouse"
      });
      await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", {
        type: "mousePressed",
        x,
        y,
        button: "left",
        buttons: 1,
        clickCount: 1,
        pointerType: "mouse"
      });
      await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", {
        type: "mouseReleased",
        x,
        y,
        button: "left",
        buttons: 0,
        clickCount: 1,
        pointerType: "mouse"
      });
      return { attempt, targetId: targetInfo.targetId, tabId: targetInfo.tabId, url: targetInfo.url };
    } catch (error) {
      lastError = error;
      if (targetInfo?.targetId) attachedTargets.delete(targetInfo.targetId);
      if (attempt === 1 && /different extension|target|No tab|not attached|closed/i.test(String(error?.message || error))) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        continue;
      }
      break;
    }
  }
  throw lastError;
}

async function browserContext(sender) {
  const tabId = sender.tab?.id;
  if (!Number.isInteger(tabId)) throw new Error("无法识别当前游戏标签页");
  const tab = await chrome.tabs.get(tabId);
  const windowInfo = await chrome.windows.get(tab.windowId);
  return {
    tabId,
    windowId: tab.windowId,
    tabActive: Boolean(tab.active),
    windowFocused: Boolean(windowInfo.focused),
    windowState: String(windowInfo.state || "unknown"),
    minimized: windowInfo.state === "minimized",
  };
}

async function bringGameToForeground(sender) {
  const contextBefore = await browserContext(sender);
  if (contextBefore.minimized) {
    await chrome.windows.update(contextBefore.windowId, { state: "normal" });
  }
  await chrome.windows.update(contextBefore.windowId, { focused: true });
  await chrome.tabs.update(contextBefore.tabId, { active: true });
  await new Promise((resolve) => setTimeout(resolve, 180));
  return { before: contextBefore, after: await browserContext(sender) };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === BROWSER_CONTEXT_MESSAGE) {
    browserContext(sender).then(
      (context) => sendResponse({ ok: true, context }),
      (error) => sendResponse({ ok: false, error: String(error?.message || error) }),
    );
    return true;
  }
  if (message?.type === FOREGROUND_MESSAGE) {
    bringGameToForeground(sender).then(
      (details) => sendResponse({ ok: true, details }),
      (error) => sendResponse({ ok: false, error: String(error?.message || error) }),
    );
    return true;
  }
  if (message?.type === LICENSE_VERIFY_MESSAGE) {
    verifyLicenseSignature(message.token).then(
      (valid) => sendResponse({ ok: true, valid }),
      (error) => sendResponse({ ok: false, error: String(error?.message || error) }),
    );
    return true;
  }
  if (message?.type === LICENSE_REQUEST_MESSAGE) {
    requestLicense(String(message.path || ""), message.body).then(
      (result) => sendResponse({ ok: true, result }),
      (error) => sendResponse({ ok: false, error: String(error?.message || error) }),
    );
    return true;
  }
  if (message?.type === TRUSTED_CLICK_PING) {
    const senderUrl = String(sender.url || "");
    const tabUrl = String(sender.tab?.url || "");
    const gameContext = GAME_URL_RE.test(senderUrl) || GAME_URL_RE.test(tabUrl);
    sendResponse({
      ok: gameContext,
      version: EXTENSION_VERSION,
      tabId: sender.tab?.id ?? null,
      senderUrl,
      tabUrl,
      error: gameContext ? "" : `扩展当前连接的不是 sgplay.cc 游戏页：${tabUrl || senderUrl || "未知 URL"}`,
    });
    return false;
  }
  if (message?.type !== TRUSTED_CLICK_MESSAGE) return false;
  dispatchTrustedClick(sender, Number(message.x), Number(message.y)).then(
    (details) => sendResponse({
      ok: true,
      requestId: message.requestId,
      method: "chrome-debugger/Input.dispatchMouseEvent",
      details,
    }),
    (error) => sendResponse({ ok: false, requestId: message.requestId, error: String(error?.message || error) }),
  );
  return true;
});

chrome.debugger.onDetach.addListener((source) => {
  if (source.targetId) attachedTargets.delete(source.targetId);
});
