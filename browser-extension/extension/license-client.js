"use strict";

(() => {
  if (window.PlayKeeperLicense) return;
  const config = window.PlayKeeperLicenseConfig || {};
  const TOKEN_KEY = "pk-license-token-v1";
  const INSTALLATION_KEY = "pk-license-installation-v1";
  const LICENSE_REQUEST_MESSAGE = "pk-license/request-v1";
  const LICENSE_VERIFY_MESSAGE = "pk-license/verify-v1";

  const encodeBytes = (bytes) => btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  const decodeBytes = (value) => {
    const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
    return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
  };
  const decodeJson = (value) => JSON.parse(new TextDecoder().decode(decodeBytes(value)));
  const installationId = () => {
    let value = localStorage.getItem(INSTALLATION_KEY);
    if (!value) {
      value = crypto.randomUUID ? crypto.randomUUID() : encodeBytes(crypto.getRandomValues(new Uint8Array(24)));
      localStorage.setItem(INSTALLATION_KEY, value);
    }
    return value;
  };
  const compareVersions = (left, right) => {
    const a = String(left || "0").split(".").map((value) => Number(value) || 0);
    const b = String(right || "0").split(".").map((value) => Number(value) || 0);
    for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
      if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) - (b[i] || 0);
    }
    return 0;
  };
  const endpoint = (path) => `${String(config.serverBaseUrl || "").replace(/\/$/, "")}${path}`;
  const post = async (path, body) => {
    if (!globalThis.chrome?.runtime?.id) throw new Error("许可证后台组件未连接，请重新加载扩展");
    const response = await globalThis.chrome.runtime.sendMessage({
      type: LICENSE_REQUEST_MESSAGE,
      path,
      body,
    });
    if (!response?.ok) throw new Error(response?.error || "授权服务器请求失败");
    return response.result || {};
  };
  let refreshPromise = null;

  async function verifyToken(token) {
    const [payloadPart, signaturePart, extra] = String(token || "").split(".");
    if (!payloadPart || !signaturePart || extra) throw new Error("许可证令牌格式无效");
    if (!globalThis.chrome?.runtime?.id) throw new Error("许可证后台组件未连接，请重新加载扩展");
    const verification = await globalThis.chrome.runtime.sendMessage({
      type: LICENSE_VERIFY_MESSAGE,
      token,
    });
    if (!verification?.ok) throw new Error(verification?.error || "许可证签名验证失败");
    if (!verification.valid) throw new Error("许可证签名无效");
    const payload = decodeJson(payloadPart);
    if (payload.productId !== config.productId) throw new Error("许可证不属于当前产品");
    if (payload.installationId !== installationId()) throw new Error("许可证与当前安装实例不匹配");
    if (payload.minVersion && compareVersions(config.extensionVersion, payload.minVersion) < 0) {
      throw new Error(`许可证要求至少使用 v${payload.minVersion}`);
    }
    if (!Number.isFinite(Number(payload.expiresAt))) throw new Error("许可证缺少有效期");
    return payload;
  }

  async function activate(activationCode) {
    if (!config.enabled) return { disabled: true, message: "授权检查当前处于配置模式" };
    const code = String(activationCode || "").trim();
    if (!code) throw new Error("请输入激活码");
    const result = await post("/v1/activate", {
      activationCode: code,
      installationId: installationId(),
      productId: config.productId,
      extensionVersion: config.extensionVersion,
    });
    const payload = await verifyToken(result.token);
    if (Number(payload.expiresAt) <= Date.now()) throw new Error("服务器签发了已过期许可证");
    localStorage.setItem(TOKEN_KEY, result.token);
    return { token: result.token, payload };
  }

  async function refresh(token) {
    const result = await post("/v1/refresh", {
      token,
      installationId: installationId(),
      productId: config.productId,
      extensionVersion: config.extensionVersion,
    });
    const payload = await verifyToken(result.token);
    if (Number(payload.expiresAt) <= Date.now()) throw new Error("服务器续签了已过期许可证");
    localStorage.setItem(TOKEN_KEY, result.token);
    return { token: result.token, payload };
  }

  async function ensureValid(options = {}) {
    if (!config.enabled) return { disabled: true, payload: null };
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) throw new Error("尚未激活许可证");
    const payload = await verifyToken(token);
    const remainingMs = Number(payload.expiresAt) - Date.now();
    if (remainingMs <= 0) throw new Error("许可证已过期，请联网续签");
    const refreshBeforeMs = Math.max(5, Number(config.refreshBeforeMinutes) || 720) * 60 * 1000;
    if (!options.forceRefresh && remainingMs > refreshBeforeMs) return { token, payload, cached: true };
    if (!refreshPromise) refreshPromise = refresh(token).finally(() => { refreshPromise = null; });
    try {
      return await refreshPromise;
    } catch (error) {
      if (remainingMs > 0 && !options.forceRefresh) return { token, payload, cached: true, refreshError: error.message };
      throw error;
    }
  }

  async function status() {
    if (!config.enabled) return { enabled: false, valid: true, message: "授权未启用（配置/测试模式）" };
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return { enabled: true, valid: false, message: "尚未激活" };
    try {
      const payload = await verifyToken(token);
      const valid = Number(payload.expiresAt) > Date.now();
      return { enabled: true, valid, payload, message: valid ? "许可证有效" : "许可证已过期" };
    } catch (error) {
      return { enabled: true, valid: false, message: error.message };
    }
  }

  function clear() {
    localStorage.removeItem(TOKEN_KEY);
  }

  window.PlayKeeperLicense = Object.freeze({ config, activate, ensureValid, status, clear, installationId });
})();
