// ==UserScript==
// @name         Play Keeper Windows 浏览器自动捕捉
// @namespace    https://github.com/little-hao/Play_keeper
// @version      1.8.8
// @description  自动进入指定地图，仅遇到目标宠物时按顺序执行捕捉、使用精灵球、等待结果并继续探险。
// @match        http://sgplay.cc/*
// @match        https://sgplay.cc/*
// @run-at       document-idle
// @grant        none
// @noframes
// ==/UserScript==

(() => {
  "use strict";

  if (window.__PK_WINDOWS_AUTO_CAPTURE_V01__) return;
  window.__PK_WINDOWS_AUTO_CAPTURE_V01__ = true;

  const SCRIPT_VERSION = "1.8.8";
  const POLL_INTERVAL_MS = 800;
  const CLICK_GUARD_MS = 550;
  const BALL_MENU_TIMEOUT_MS = 15_000;
  const CAPTURE_RETRY_INTERVAL_MS = 1_500;
  const MAX_CAPTURE_CLICK_ATTEMPTS = 6;
  const CAPTURE_RESULT_TIMEOUT_MS = 20_000;
  const ADVENTURE_LOAD_TIMEOUT_MS = 30_000;
  const ADVENTURE_LOAD_MAX_MS = 60_000;
  const MAP_DETAIL_LOAD_TIMEOUT_MS = 30_000;
  const BATTLE_LOAD_TIMEOUT_MS = 30_000;
  const MAX_UNKNOWN_TICKS = 30;
  const DEFAULT_MAP = "圣诞小屋";
  const DEFAULT_TARGETS = ["小幽灵欧姆", "鬼精灵欧姆"];
  const STORAGE_MAP = "pk_windows_capture_map";
  const STORAGE_TARGETS = "pk_windows_capture_targets";
  const STORAGE_TEST_BATTLES = "pk_windows_capture_test_battles";
  const STORAGE_TEST_MINUTES = "pk_windows_capture_test_minutes";
  const STORAGE_PANEL_POSITION = "pk_windows_capture_panel_position_v1";
  const SESSION_LAST_DIAGNOSTIC = "pk_windows_capture_last_diagnostic_v1";
  const MAX_LOG_LINES = 120;
  const MAX_DIAGNOSTIC_EVENTS = 500;
  const TRUSTED_CLICK_MESSAGE = "pk-auto-capture/trusted-click-v1";
  const TRUSTED_CLICK_PING = "pk-auto-capture/ping-v1";
  const HAS_EXTENSION_RUNTIME = Boolean(
    globalThis.chrome?.runtime?.id && typeof globalThis.chrome?.runtime?.sendMessage === "function",
  );
  let trustedClickBridgeReady = false;
  let trustedClickBridgeError = "尚未检测";

  const runtime = {
    running: false,
    ticking: false,
    timer: 0,
    startedAt: 0,
    stoppedAt: 0,
    lastActionAt: 0,
    autoAttackEnabled: false,
    captureAttemptedThisBattle: false,
    ballUsedThisBattle: false,
    successCountedThisBattle: false,
    continueClicked: false,
    ballMenuDeadline: 0,
    captureClickAttempts: 0,
    lastCaptureClickAt: 0,
    targetLostAt: 0,
    lastCaptureFeedback: "",
    lastCaptureFeedbackAt: 0,
    captureResultDeadline: 0,
    captureState: "idle",
    captureOutcome: "",
    captureResolvedAt: 0,
    battleBox: null,
    targetName: "",
    unknownTicks: 0,
    navigationKey: "",
    navigationLockUntil: 0,
    phase: "idle",
    phaseDeadline: 0,
    phaseMaxDeadline: 0,
    phaseProgressNameCount: 0,
    phaseRetryCount: 0,
    stats: freshStats(),
    logs: [],
    events: [],
    errors: [],
    testMaxBattles: 20,
    testDeadline: 0,
    persistTimer: 0,
  };

  let panel = null;
  let statusNode = null;
  let runtimeNode = null;
  let ballsNode = null;
  let successesNode = null;
  let battlesNode = null;
  let targetsNode = null;
  let mapNode = null;
  let startButton = null;
  let stopButton = null;
  let testBattlesNode = null;
  let testMinutesNode = null;
  let bridgeNode = null;

  function freshStats() {
    return {
      battles: 0,
      targetBattles: 0,
      ballsUsed: 0,
      captureSuccesses: 0,
    };
  }

  function normalize(value) {
    return String(value || "").replace(/\s+/g, "").trim();
  }

  function canonicalLabel(value) {
    return normalize(value).replace(/[·•・‧.。:：\-—_]/g, "");
  }

  function isVisible(element) {
    if (!element || !element.isConnected) return false;
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
      return false;
    }
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.bottom > 0
      && rect.left < innerWidth && rect.top < innerHeight;
  }

  function isInteractable(element) {
    if (!element || !element.isConnected) return false;
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || style.pointerEvents === "none") {
      return false;
    }
    if (element.matches?.(":disabled,[disabled]")) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.bottom > 0
      && rect.left < innerWidth && rect.top < innerHeight;
  }

  function visibleElements(selector, root = document) {
    return Array.from(root.querySelectorAll(selector)).filter(isVisible);
  }

  function captureBallCandidates() {
    const candidates = [];
    const seen = new Set();
    const menus = visibleElements(".jineng-list");
    for (const menu of menus) {
      const elements = Array.from(menu.querySelectorAll(
        ".list .li,.li,button,uni-button,[role=button],view,uni-view,div,span",
      ));
      for (const element of elements) {
        if (seen.has(element) || !isInteractable(element)) continue;
        const text = normalize(element.textContent);
        if (!/精灵球/.test(text) || /没有可用|数量[:：]?0|剩余[:：]?0/.test(text)) continue;
        const preferred = element.matches(".li,button,uni-button,[role=button]") ? 0 : 1;
        const childWithSameText = Array.from(element.children || []).some((child) => (
          isInteractable(child) && normalize(child.textContent) === text
        ));
        if (preferred !== 0 && childWithSameText) continue;
        seen.add(element);
        const rect = element.getBoundingClientRect();
        candidates.push({
          element,
          text,
          preferred,
          area: rect.width * rect.height,
        });
      }
    }
    return candidates.sort((left, right) => (
      left.preferred - right.preferred
      || left.area - right.area
      || left.text.length - right.text.length
    ));
  }

  function findCaptureBall() {
    return captureBallCandidates()[0]?.element || null;
  }

  function captureControlsReady(captureButton) {
    if (!captureButton || !isInteractable(captureButton)) return false;
    const actionBar = captureButton.closest?.(".akc-list");
    if (!actionBar) return true;
    return isInteractable(actionBar) && !actionBar.classList.contains("hide");
  }

  function exactText(text, root = document) {
    return visibleElements("button,uni-button,[role=button],view,uni-view,div,span,a", root)
      .find((element) => normalize(element.textContent) === normalize(text));
  }

  function namedElement(name) {
    return Array.from(document.querySelectorAll("[name]"))
      .filter(isInteractable)
      .find((element) => canonicalLabel(element.getAttribute("name")) === canonicalLabel(name));
  }

  function labeledElement(label) {
    const wanted = canonicalLabel(label);
    if (!wanted) return null;
    const candidates = Array.from(document.querySelectorAll("[name],button,uni-button,[role=button],a,view,uni-view,div,span"))
      .filter(isInteractable)
      .filter((element) => {
        const name = canonicalLabel(element.getAttribute?.("name"));
        const text = canonicalLabel(element.textContent);
        return name === wanted || text === wanted;
      })
      .sort((left, right) => {
        const leftNamed = canonicalLabel(left.getAttribute?.("name")) === wanted ? 0 : 1;
        const rightNamed = canonicalLabel(right.getAttribute?.("name")) === wanted ? 0 : 1;
        if (leftNamed !== rightNamed) return leftNamed - rightNamed;
        const leftArea = left.getBoundingClientRect().width * left.getBoundingClientRect().height;
        const rightArea = right.getBoundingClientRect().width * right.getBoundingClientRect().height;
        return leftArea - rightArea;
      });
    return candidates[0] || null;
  }

  function enemyTextCandidates(battleBox) {
    if (!battleBox || !isVisible(battleBox)) return [];
    const box = battleBox.getBoundingClientRect();
    return visibleElements("[name],div,span,p,label,view,uni-view,text,uni-text", battleBox)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const text = normalize(element.textContent);
        return {
          element,
          text,
          xRatio: box.width ? (rect.left + rect.width / 2 - box.left) / box.width : 0,
          yRatio: box.height ? (rect.top + rect.height / 2 - box.top) / box.height : 0,
          area: rect.width * rect.height,
        };
      })
      .filter((item) => item.text && item.text.length <= 100 && item.xRatio >= 0.52 && item.yRatio <= 0.42)
      .sort((left, right) => left.text.length - right.text.length || left.area - right.area);
  }

  function detectTargetInBattle(battleBox) {
    const targets = configuredTargets();
    const enemyStatus = battleBox?.querySelector?.(".booss-info");
    if (enemyStatus && isVisible(enemyStatus)) {
      const statusText = normalize(enemyStatus.textContent);
      const canonicalStatus = canonicalLabel(statusText);
      const target = targets.find((name) => canonicalStatus.includes(canonicalLabel(name)));
      if (target) return { target, sourceText: statusText, source: ".booss-info", xRatio: null, yRatio: null };
    }
    const candidates = enemyTextCandidates(battleBox);
    for (const candidate of candidates) {
      const canonicalText = canonicalLabel(candidate.text);
      const target = targets.find((name) => canonicalText.includes(canonicalLabel(name)));
      if (target) return {
        target,
        sourceText: candidate.text,
        source: "enemy-region",
        xRatio: candidate.xRatio,
        yRatio: candidate.yRatio,
      };
    }
    return null;
  }

  function configuredMap() {
    return normalize(mapNode?.value) || DEFAULT_MAP;
  }

  function configuredTargets() {
    const values = String(targetsNode?.value || "")
      .split(/[,，、/\n]/)
      .map(normalize)
      .filter(Boolean);
    return values.length ? Array.from(new Set(values)) : [...DEFAULT_TARGETS];
  }

  function boundedNumber(node, fallback, minimum, maximum) {
    const value = Number.parseInt(node?.value, 10);
    return Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback;
  }

  function navigationCandidates() {
    const wantedMap = canonicalLabel(configuredMap());
    const seen = new Set();
    return Array.from(document.querySelectorAll("[name],button,uni-button,[role=button],a,view,uni-view,div,span"))
      .filter(isInteractable)
      .map((element) => {
        const text = normalize(element.textContent);
        const name = normalize(element.getAttribute?.("name"));
        const key = `${element.tagName}|${name}|${text}`;
        const relevant = canonicalLabel(text) === wantedMap || canonicalLabel(name) === wantedMap
          || /^(野外探险|战斗)$/.test(canonicalLabel(text))
          || /^(野外探险|战斗)$/.test(canonicalLabel(name));
        if (!relevant || seen.has(key)) return null;
        seen.add(key);
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName,
          className: String(element.className || "").slice(0, 120),
          name,
          text: text.slice(0, 100),
          rect: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          },
        };
      })
      .filter(Boolean)
      .slice(0, 30);
  }

  function pageSnapshot() {
    const battleBox = document.querySelector(".battle-box");
    const names = visibleElements("[name]")
      .map((element) => element.getAttribute("name"))
      .filter(Boolean);
    return {
      time: new Date().toISOString(),
      route: `${location.pathname}${location.hash}`,
      title: document.title,
      readyState: document.readyState,
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      clickTransport: trustedClickBridgeReady ? "chrome-debugger" : "unavailable",
      trustedClickBridge: {
        ready: trustedClickBridgeReady,
        error: trustedClickBridgeReady ? "" : trustedClickBridgeError,
      },
      visibleNames: Array.from(new Set(names)).slice(0, 80),
      navigationCandidates: navigationCandidates(),
      selectors: {
        battleBox: Boolean(battleBox && isVisible(battleBox)),
        adventure: Boolean(namedElement("野外探险")),
        map: Boolean(namedElement(configuredMap())),
        fight: Boolean(namedElement("战斗")),
        autoAttack: Boolean(namedElement("自动攻击")),
        capture: Boolean(namedElement("捕捉")),
        captureControlsReady: captureControlsReady(namedElement("捕捉")),
        continueAdventure: Boolean(exactText("继续探险")),
        skillMenuItems: visibleElements(".jineng-list .li,.jineng-list button,.jineng-list uni-button").length,
        captureMenus: visibleElements(".jineng-list").length,
        captureBallOptions: captureBallCandidates().slice(0, 8).map((item) => item.text),
      },
      battle: battleBox && isVisible(battleBox)
        ? {
            targetMatch: detectTargetInBattle(battleBox),
            enemyCandidates: enemyTextCandidates(battleBox).slice(0, 12).map((item) => ({
              text: item.text,
              xRatio: Number(item.xRatio.toFixed(3)),
              yRatio: Number(item.yRatio.toFixed(3)),
            })),
            textLength: normalize(battleBox.textContent).length,
          }
        : null,
      state: {
        running: runtime.running,
        phase: runtime.phase,
        phaseDeadline: runtime.phaseDeadline ? new Date(runtime.phaseDeadline).toISOString() : null,
        phaseMaxDeadline: runtime.phaseMaxDeadline ? new Date(runtime.phaseMaxDeadline).toISOString() : null,
        phaseProgressNameCount: runtime.phaseProgressNameCount,
        phaseRetryCount: runtime.phaseRetryCount,
        autoAttackEnabled: runtime.autoAttackEnabled,
        captureAttemptedThisBattle: runtime.captureAttemptedThisBattle,
        captureClickAttempts: runtime.captureClickAttempts,
        lastCaptureClickAt: runtime.lastCaptureClickAt
          ? new Date(runtime.lastCaptureClickAt).toISOString()
          : null,
        targetLostAt: runtime.targetLostAt ? new Date(runtime.targetLostAt).toISOString() : null,
        lastCaptureFeedback: runtime.lastCaptureFeedback,
        ballUsedThisBattle: runtime.ballUsedThisBattle,
        captureState: runtime.captureState,
        captureOutcome: runtime.captureOutcome,
        captureResolvedAt: runtime.captureResolvedAt
          ? new Date(runtime.captureResolvedAt).toISOString()
          : null,
        captureResultDeadline: runtime.captureResultDeadline
          ? new Date(runtime.captureResultDeadline).toISOString()
          : null,
        targetName: runtime.targetName,
        unknownTicks: runtime.unknownTicks,
      },
    };
  }

  function recordEvent(level, phase, message, data = null) {
    runtime.events.push({
      time: new Date().toISOString(),
      elapsedMs: runtime.startedAt ? Date.now() - runtime.startedAt : 0,
      level,
      phase,
      message,
      data,
    });
    if (runtime.events.length > MAX_DIAGNOSTIC_EVENTS) runtime.events.shift();
    scheduleDiagnosticPersistence();
  }

  function recordError(phase, error, extra = null) {
    const item = {
      time: new Date().toISOString(),
      phase,
      name: String(error?.name || "Error"),
      message: String(error?.message || error || "未知异常"),
      stack: String(error?.stack || "").split("\n").slice(0, 8).join("\n"),
      extra,
      snapshot: pageSnapshot(),
    };
    runtime.errors.push(item);
    recordEvent("error", phase, item.message, { extra, snapshot: item.snapshot });
    console.error("[PK Auto Capture]", item);
    setStatus(`执行异常：${item.message}`, "error");
  }

  function scheduleDiagnosticPersistence() {
    clearTimeout(runtime.persistTimer);
    if (!runtime.startedAt) return;
    runtime.persistTimer = window.setTimeout(persistDiagnostics, 250);
  }

  function persistDiagnostics() {
    clearTimeout(runtime.persistTimer);
    runtime.persistTimer = 0;
    if (!runtime.startedAt) return;
    try {
      sessionStorage.setItem(SESSION_LAST_DIAGNOSTIC, JSON.stringify(diagnosticReport()));
    } catch (error) {
      console.warn("[PK Auto Capture] 无法保存诊断记录", error);
    }
  }

  async function probeTrustedClickBridge() {
    if (!HAS_EXTENSION_RUNTIME) {
      trustedClickBridgeReady = false;
      trustedClickBridgeError = "未检测到 Chrome 扩展运行环境";
      renderBridgeStatus();
      return false;
    }
    try {
      const response = await globalThis.chrome.runtime.sendMessage({ type: TRUSTED_CLICK_PING });
      trustedClickBridgeReady = Boolean(response?.ok && response?.version === SCRIPT_VERSION);
      trustedClickBridgeError = trustedClickBridgeReady
        ? ""
        : response?.error
          || `扩展后台版本不一致（页面 ${SCRIPT_VERSION} / 后台 ${response?.version || "无响应"}）`;
    } catch (error) {
      trustedClickBridgeReady = false;
      trustedClickBridgeError = String(error?.message || error || "扩展后台连接失败");
    }
    renderBridgeStatus();
    return trustedClickBridgeReady;
  }

  function renderBridgeStatus() {
    if (!bridgeNode) return;
    bridgeNode.textContent = trustedClickBridgeReady
      ? "点击通道：Chrome 浏览器级输入（后台握手通过）"
      : `点击通道：不可用（${trustedClickBridgeError}）`;
  }

  function safeClick(element, action) {
    const now = Date.now();
    if (!runtime.running || !isInteractable(element)) {
      recordEvent("warning", "click", `跳过点击：${action}`, { reason: "not-running-or-not-visible" });
      return false;
    }
    if (now - runtime.lastActionAt < CLICK_GUARD_MS) {
      recordEvent("debug", "click", `点击防抖：${action}`);
      return false;
    }
    try {
      runtime.lastActionAt = now;
      const rect = element.getBoundingClientRect();
      const clickData = {
        name: element.getAttribute?.("name") || "",
        text: normalize(element.textContent).slice(0, 80),
        x: Math.round((rect.left + rect.width / 2) * 100) / 100,
        y: Math.round((rect.top + rect.height / 2) * 100) / 100,
      };
      if (trustedClickBridgeReady) {
        const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        globalThis.chrome.runtime.sendMessage({
          type: TRUSTED_CLICK_MESSAGE,
          requestId,
          x: clickData.x,
          y: clickData.y,
        }).then((response) => {
          if (response?.ok) {
            recordEvent("debug", "trusted-click-ack", "浏览器级点击已确认", {
              requestId,
              method: response.method || "chrome-debugger",
              details: response.details || null,
              ...clickData,
            });
            return;
          }
          const message = response?.error || "扩展后台未确认浏览器级点击";
          recordError("trusted-click", new Error(message), { requestId, action, ...clickData });
          if (runtime.running) stop(`浏览器级点击失败：${message}`);
        }).catch((error) => {
          recordError("trusted-click", error, { requestId, action, ...clickData });
          if (runtime.running) stop(`浏览器级点击失败：${error?.message || error}`);
        });
      } else {
        element.click();
      }
      recordEvent("action", "click", action, {
        ...clickData,
        method: trustedClickBridgeReady ? "chrome-debugger" : "dom-untrusted",
      });
      log(action);
      return true;
    } catch (error) {
      recordError("click", error, { action });
      return false;
    }
  }

  function safeNavigationClick(element, key, action, lockMs = 4_000) {
    const now = Date.now();
    if (runtime.navigationKey === key && now < runtime.navigationLockUntil) {
      setStatus(`${action}后等待页面变化`, "waiting");
      return false;
    }
    if (!safeClick(element, action)) return false;
    runtime.navigationKey = key;
    runtime.navigationLockUntil = now + lockMs;
    recordEvent("debug", "navigation-lock", "已设置导航点击锁", { key, lockMs });
    return true;
  }

  function enterPhase(phase, timeoutMs, message, maxTimeoutMs = timeoutMs) {
    const now = Date.now();
    runtime.phase = phase;
    runtime.phaseDeadline = timeoutMs ? now + timeoutMs : 0;
    runtime.phaseMaxDeadline = maxTimeoutMs ? now + Math.max(timeoutMs, maxTimeoutMs) : 0;
    runtime.phaseProgressNameCount = visibleElements("[name]").length;
    runtime.phaseRetryCount = 0;
    recordEvent("info", "phase", `进入阶段：${phase}`, {
      timeoutMs,
      maxTimeoutMs,
      deadline: runtime.phaseDeadline ? new Date(runtime.phaseDeadline).toISOString() : null,
      visibleNameCount: runtime.phaseProgressNameCount,
    });
    if (message) setStatus(message, "waiting");
  }

  function waitForPhase(phase, timeoutMessage) {
    if (runtime.phase !== phase) return false;
    if (phase === "adventure-loading") {
      const visibleNameCount = visibleElements("[name]").length;
      if (visibleNameCount > runtime.phaseProgressNameCount) {
        const previousCount = runtime.phaseProgressNameCount;
        runtime.phaseProgressNameCount = visibleNameCount;
        const extendedDeadline = Math.min(runtime.phaseMaxDeadline, Date.now() + 15_000);
        if (extendedDeadline > runtime.phaseDeadline) runtime.phaseDeadline = extendedDeadline;
        recordEvent("debug", "phase-progress", "地图项目仍在异步加载，已延长等待", {
          previousCount,
          visibleNameCount,
          deadline: new Date(runtime.phaseDeadline).toISOString(),
        });
      }
    }
    if (runtime.phaseDeadline && Date.now() >= runtime.phaseDeadline) {
      recordEvent("error", "phase-timeout", timeoutMessage, { phase, snapshot: pageSnapshot() });
      stop(timeoutMessage);
      return true;
    }
    const remaining = runtime.phaseDeadline ? Math.max(0, runtime.phaseDeadline - Date.now()) : 0;
    setStatus(`等待页面加载：${phase}（剩余约 ${Math.ceil(remaining / 1000)} 秒）`, "waiting");
    return true;
  }

  function retryPhaseNavigation(phase, element, key, action, maxRetries = 5) {
    if (runtime.phase !== phase || !element || runtime.phaseRetryCount >= maxRetries) return false;
    if (Date.now() < runtime.navigationLockUntil) return false;
    const attempt = runtime.phaseRetryCount + 1;
    if (!safeNavigationClick(element, key, `${action}（自动重试 ${attempt}/${maxRetries}）`, 5_000)) return false;
    runtime.phaseRetryCount = attempt;
    recordEvent("warning", "phase-retry", "页面未切换，已自动重试入口点击", {
      phase,
      attempt,
      maxRetries,
      key,
    });
    return true;
  }

  function setStatus(message, level = "normal") {
    if (statusNode) {
      statusNode.textContent = message;
      statusNode.dataset.level = level;
    }
    renderStats();
  }

  function log(message) {
    const line = `${new Date().toLocaleTimeString()} ${message}`;
    runtime.logs.push(line);
    if (runtime.logs.length > MAX_LOG_LINES) runtime.logs.shift();
    recordEvent("info", "runtime", message);
    setStatus(message);
  }

  function renderStats() {
    const end = runtime.running ? Date.now() : runtime.stoppedAt;
    const elapsed = runtime.startedAt && end ? Math.max(0, end - runtime.startedAt) : 0;
    const seconds = Math.floor(elapsed / 1000);
    const hh = String(Math.floor(seconds / 3600)).padStart(2, "0");
    const mm = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
    const ss = String(seconds % 60).padStart(2, "0");
    if (runtimeNode) runtimeNode.textContent = `${hh}:${mm}:${ss}`;
    if (ballsNode) ballsNode.textContent = String(runtime.stats.ballsUsed);
    if (successesNode) successesNode.textContent = String(runtime.stats.captureSuccesses);
    if (battlesNode) battlesNode.textContent = `${runtime.stats.targetBattles}/${runtime.stats.battles}`;
    if (startButton) startButton.disabled = runtime.running;
    if (stopButton) stopButton.disabled = !runtime.running;
  }

  function resetBattleState(battleBox = null) {
    runtime.battleBox = battleBox;
    runtime.captureAttemptedThisBattle = false;
    runtime.ballUsedThisBattle = false;
    runtime.successCountedThisBattle = false;
    runtime.continueClicked = false;
    runtime.ballMenuDeadline = 0;
    runtime.captureClickAttempts = 0;
    runtime.lastCaptureClickAt = 0;
    runtime.targetLostAt = 0;
    runtime.lastCaptureFeedback = "";
    runtime.lastCaptureFeedbackAt = 0;
    runtime.captureResultDeadline = 0;
    runtime.captureState = "idle";
    runtime.targetName = "";
    runtime.captureOutcome = "";
    runtime.captureResolvedAt = 0;
  }

  async function start() {
    if (runtime.running) return;
    if (!(await probeTrustedClickBridge())) {
      const message = `扩展后台未连接：${trustedClickBridgeError}。请重新加载 v${SCRIPT_VERSION} 扩展并刷新游戏页`;
      recordEvent("error", "startup", message, { clickTransport: "unavailable" });
      setStatus(message, "error");
      return;
    }
    runtime.testMaxBattles = boundedNumber(testBattlesNode, 20, 1, 999);
    const testMinutes = boundedNumber(testMinutesNode, 30, 1, 480);
    localStorage.setItem(STORAGE_MAP, configuredMap());
    localStorage.setItem(STORAGE_TARGETS, configuredTargets().join(","));
    localStorage.setItem(STORAGE_TEST_BATTLES, String(runtime.testMaxBattles));
    localStorage.setItem(STORAGE_TEST_MINUTES, String(testMinutes));
    runtime.running = true;
    runtime.startedAt = Date.now();
    runtime.stoppedAt = 0;
    runtime.testDeadline = runtime.startedAt + testMinutes * 60_000;
    runtime.lastActionAt = 0;
    runtime.autoAttackEnabled = false;
    runtime.unknownTicks = 0;
    runtime.navigationKey = "";
    runtime.navigationLockUntil = 0;
    runtime.phase = "starting";
    runtime.phaseDeadline = 0;
    runtime.phaseMaxDeadline = 0;
    runtime.phaseProgressNameCount = 0;
    runtime.phaseRetryCount = 0;
    runtime.stats = freshStats();
    runtime.logs = [];
    runtime.events = [];
    runtime.errors = [];
    sessionStorage.removeItem(SESSION_LAST_DIAGNOSTIC);
    resetBattleState();
    recordEvent("info", "test", "试运行开始", {
      maxBattles: runtime.testMaxBattles,
      maxMinutes: testMinutes,
      snapshot: pageSnapshot(),
    });
    log(`试运行开始：最多 ${runtime.testMaxBattles} 场/${testMinutes} 分钟；地图 ${configuredMap()}；目标 ${configuredTargets().join(" / ")}`);
    schedule(50);
  }

  function stop(reason = "用户停止") {
    if (!runtime.running) return;
    runtime.running = false;
    runtime.stoppedAt = Date.now();
    clearTimeout(runtime.timer);
    runtime.timer = 0;
    runtime.ticking = false;
    log(`${reason}；本轮使用精灵球 ${runtime.stats.ballsUsed} 个，捕捉成功 ${runtime.stats.captureSuccesses} 次`);
    recordEvent("info", "test", "试运行停止", {
      reason,
      stats: { ...runtime.stats },
      snapshot: pageSnapshot(),
    });
    persistDiagnostics();
    renderStats();
  }

  function schedule(delay = POLL_INTERVAL_MS) {
    clearTimeout(runtime.timer);
    if (!runtime.running) return;
    runtime.timer = window.setTimeout(tick, delay);
  }

  async function tick() {
    if (!runtime.running || runtime.ticking) return;
    if (runtime.testDeadline && Date.now() >= runtime.testDeadline) {
      stop("达到试运行时间上限，已自动停止");
      return;
    }
    runtime.ticking = true;
    try {
      runStep();
    } catch (error) {
      recordError("tick", error);
    } finally {
      runtime.ticking = false;
      renderStats();
      schedule();
    }
  }

  function runStep() {
    if (!runtime.running) return;

    detectCaptureOutcome();

    const continueButton = exactText("继续探险");
    if (continueButton) {
      runtime.unknownTicks = 0;
      if (runtime.ballUsedThisBattle && !runtime.captureOutcome) {
        if (!runtime.captureResultDeadline || Date.now() < runtime.captureResultDeadline) {
          setStatus("精灵球已使用，正在确认捕捉结果", "waiting");
          return;
        }
        runtime.captureOutcome = "unknown";
        runtime.captureState = "resolved";
        runtime.captureResolvedAt = Date.now();
        recordEvent("warning", "capture-result", "捕捉结果等待超时，未计为成功，继续下一场", {
          snapshot: pageSnapshot(),
        });
      }
      if (!runtime.continueClicked && safeClick(continueButton, "战斗结束，已点击继续探险")) {
        resetBattleState();
        runtime.continueClicked = true;
        enterPhase("battle-loading", BATTLE_LOAD_TIMEOUT_MS, "已继续探险，等待下一场战斗页面");
      }
      return;
    }

    const battleBox = document.querySelector(".battle-box");
    const autoButton = namedElement("自动攻击");
    const captureButton = namedElement("捕捉");
    if (battleBox && isVisible(battleBox) && autoButton && captureButton) {
      runtime.unknownTicks = 0;
      if (runtime.phase !== "battle-ready") enterPhase("battle-ready", 0, "战斗页面已就绪");
      handleBattle(battleBox, autoButton, captureButton);
      return;
    }

    const fightButton = namedElement("战斗") || labeledElement("战斗");
    if (runtime.phase === "battle-loading") {
      if (fightButton && retryPhaseNavigation(
        "battle-loading",
        fightButton,
        "fight",
        "战斗页面尚未进入，重新点击战斗",
      )) return;
      if (waitForPhase("battle-loading", "点击战斗后 30 秒仍未出现战斗控件，已安全停止")) return;
    }

    if (fightButton) {
      runtime.unknownTicks = 0;
      resetBattleState();
      if (safeNavigationClick(fightButton, "fight", "已点击战斗，等待战斗页面", 5_000)) {
        enterPhase("battle-loading", BATTLE_LOAD_TIMEOUT_MS, "已点击战斗，等待战斗控件加载");
      }
      return;
    }

    const map = configuredMap();
    const mapButton = namedElement(map) || labeledElement(map);
    if (runtime.phase === "map-detail-loading") {
      if (mapButton && retryPhaseNavigation(
        "map-detail-loading",
        mapButton,
        `map:${canonicalLabel(map)}`,
        `地图详情尚未进入，重新选择${map}`,
      )) return;
      if (waitForPhase("map-detail-loading", "选择地图后 30 秒仍未出现战斗入口，已安全停止")) return;
    }

    if (mapButton) {
      runtime.unknownTicks = 0;
      runtime.autoAttackEnabled = false;
      resetBattleState();
      if (safeNavigationClick(mapButton, `map:${canonicalLabel(map)}`, `已选择地图：${map}`, 5_000)) {
        enterPhase("map-detail-loading", MAP_DETAIL_LOAD_TIMEOUT_MS, `已选择${map}，等待战斗入口`);
      }
      return;
    }

    const adventureButton = namedElement("野外探险")
      || visibleElements(".nav-btn.bg1").find((element) => normalize(element.textContent).includes("野外探险"));
    if (runtime.phase === "adventure-loading") {
      const mapPageLoaded = Boolean(document.querySelector(".map-bor,.wild-adventure-page"));
      if (!mapPageLoaded && adventureButton && retryPhaseNavigation(
        "adventure-loading",
        adventureButton,
        "adventure",
        "地图页面尚未进入，重新点击野外探险",
      )) return;
      if (waitForPhase("adventure-loading", "进入野外探险后在等待上限内仍未加载出目标地图，已安全停止")) return;
    }

    if (adventureButton) {
      runtime.unknownTicks = 0;
      runtime.autoAttackEnabled = false;
      resetBattleState();
      if (safeNavigationClick(adventureButton, "adventure", "已进入野外探险", 5_000)) {
        enterPhase(
          "adventure-loading",
          ADVENTURE_LOAD_TIMEOUT_MS,
          "已点击野外探险，等待地图页面",
          ADVENTURE_LOAD_MAX_MS,
        );
      }
      return;
    }

    runtime.unknownTicks += 1;
    if (runtime.unknownTicks >= MAX_UNKNOWN_TICKS) {
      stop("连续约 24 秒无法识别页面，已安全停止");
    } else if (runtime.unknownTicks === 1 || runtime.unknownTicks % 5 === 0) {
      setStatus(`等待页面就绪（${runtime.unknownTicks}/${MAX_UNKNOWN_TICKS}）`, "waiting");
    }
  }

  function finishCaptureWithoutBall(reason, data = null) {
    runtime.ballMenuDeadline = 0;
    runtime.captureState = "no-ball";
    runtime.captureOutcome = "no-ball";
    recordEvent("warning", "capture-ball", reason, data);
    log(`目标 ${runtime.targetName || "宠物"} 未使用精灵球：${reason}`);
  }

  function handleCaptureTransaction(battleBox, captureButton) {
    const target = runtime.targetName || "目标宠物";
    if (runtime.captureOutcome) {
      setStatus(`目标 ${target}：本场捕捉已结束（${runtime.captureOutcome}）`, "waiting");
      return;
    }
    const ball = findCaptureBall();
    if (ball) {
      const ballText = normalize(ball.textContent).slice(0, 100);
      const nextBallNumber = runtime.stats.ballsUsed + 1;
      if (safeClick(ball, `已点击精灵球：${ballText}（本轮第 ${nextBallNumber} 个）`)) {
        runtime.ballUsedThisBattle = true;
        runtime.stats.ballsUsed = nextBallNumber;
        runtime.captureState = "waiting-result";
        runtime.captureResultDeadline = Date.now() + CAPTURE_RESULT_TIMEOUT_MS;
        runtime.ballMenuDeadline = 0;
        runtime.targetLostAt = 0;
        recordEvent("info", "capture-ball", "已点击可用精灵球，等待捕捉结果", {
          target,
          ballText,
          deadline: new Date(runtime.captureResultDeadline).toISOString(),
        });
      }
      return;
    }

    const now = Date.now();
    const stillTarget = detectTargetInBattle(battleBox)?.target === runtime.targetName;
    const captureMenuVisible = visibleElements(".jineng-list").length > 0;
    if (stillTarget || captureMenuVisible) {
      runtime.targetLostAt = 0;
    } else if (!runtime.targetLostAt) {
      runtime.targetLostAt = now;
    }

    if (runtime.targetLostAt && now - runtime.targetLostAt >= 2_500) {
      finishCaptureWithoutBall("目标已离开战斗画面，停止本场捕捉事务", {
        attempts: runtime.captureClickAttempts,
        snapshot: pageSnapshot(),
      });
      return;
    }

    if (runtime.ballMenuDeadline && now >= runtime.ballMenuDeadline) {
      finishCaptureWithoutBall("等待捕捉菜单超时，未找到可用精灵球", {
        attempts: runtime.captureClickAttempts,
        captureMenuVisible,
        controlsReady: captureControlsReady(captureButton),
        candidates: captureBallCandidates().map((item) => item.text),
        snapshot: pageSnapshot(),
      });
      return;
    }

    if (captureMenuVisible) {
      runtime.captureState = "waiting-ball-menu";
      setStatus(`目标 ${target}：捕捉菜单已出现，等待精灵球可用`, "waiting");
      return;
    }

    const controlsReady = captureControlsReady(captureButton);
    const mayRetry = runtime.captureClickAttempts < MAX_CAPTURE_CLICK_ATTEMPTS
      && now - runtime.lastCaptureClickAt >= CAPTURE_RETRY_INTERVAL_MS;
    if (controlsReady && mayRetry) {
      const attempt = runtime.captureClickAttempts + 1;
      if (safeClick(captureButton, `目标 ${target}：请求打开捕捉菜单（第 ${attempt} 次）`)) {
        runtime.captureClickAttempts = attempt;
        runtime.lastCaptureClickAt = now;
        runtime.captureState = "waiting-ball-menu";
        recordEvent("info", "capture", "已请求打开捕捉菜单，等待页面确认", {
          target,
          attempt,
          deadline: new Date(runtime.ballMenuDeadline).toISOString(),
        });
      }
      return;
    }

    runtime.captureState = controlsReady ? "waiting-ball-menu" : "target-locked";
    setStatus(
      controlsReady
        ? `目标 ${target}：等待捕捉菜单响应`
        : `目标 ${target}：已锁定，等待战斗操作栏可捕捉`,
      "waiting",
    );
  }

  function handleBattle(battleBox, autoButton, captureButton) {
    if (runtime.battleBox !== battleBox) {
      if (runtime.stats.battles >= runtime.testMaxBattles) {
        stop(`达到 ${runtime.testMaxBattles} 场试运行上限，已自动停止`);
        return;
      }
      runtime.stats.battles += 1;
      resetBattleState(battleBox);
      recordEvent("info", "battle", "检测到新战斗", {
        battleNumber: runtime.stats.battles,
        snapshot: pageSnapshot(),
      });
      log(`检测到第 ${runtime.stats.battles} 场战斗`);
    }

    const menuItems = visibleElements(".jineng-list .li,.jineng-list button,.jineng-list uni-button");

    if (!runtime.autoAttackEnabled) {
      const enableAuto = menuItems.find((element) => /^自动攻击/.test(normalize(element.textContent)));
      if (enableAuto) {
        if (safeClick(enableAuto, "已开启自动攻击，本次进入地图不再重复开启")) {
          runtime.autoAttackEnabled = true;
        }
      } else {
        safeClick(autoButton, "正在打开自动攻击菜单");
      }
      return;
    }

    if (runtime.ballUsedThisBattle) {
      detectCaptureOutcome();
      if (runtime.captureOutcome) {
        const resultPanelVisible = visibleElements(".jieshu").length > 0;
        if (!resultPanelVisible && runtime.captureResolvedAt && Date.now() - runtime.captureResolvedAt >= 1_200) {
          recordEvent("info", "capture-result", "游戏已自动进入下一场，重置本场捕捉状态", {
            outcome: runtime.captureOutcome,
          });
          resetBattleState();
          setStatus("捕捉结果已记录，等待识别下一场", "waiting");
          return;
        }
        runtime.captureState = "resolved";
        setStatus(`捕捉${runtime.captureOutcome === "success" ? "成功" : "结束"}，等待继续探险`, "waiting");
      } else {
        if (runtime.captureResultDeadline && Date.now() >= runtime.captureResultDeadline) {
          runtime.captureState = "resolved";
          runtime.captureOutcome = "unknown";
          runtime.captureResolvedAt = Date.now();
          recordEvent("warning", "capture-result", "等待捕捉结果超时，未计为成功", {
            snapshot: pageSnapshot(),
          });
          return;
        }
        runtime.captureState = "waiting-result";
        setStatus(`目标 ${runtime.targetName || "宠物"}：精灵球已使用，等待捕捉结果`, "waiting");
      }
      return;
    }

    if (runtime.captureAttemptedThisBattle) {
      handleCaptureTransaction(battleBox, captureButton);
      return;
    }

    const targetMatch = detectTargetInBattle(battleBox);
    const target = targetMatch?.target || "";
    if (!targetMatch) {
      setStatus("非目标宠物，保持自动战斗", "normal");
      return;
    }

    if (!runtime.targetName) {
      runtime.targetName = target;
      runtime.stats.targetBattles += 1;
      recordEvent("info", "target-detection", "敌方状态栏识别到目标宠物", targetMatch);
      log(`识别到目标宠物：${target}`);
    }

    runtime.captureAttemptedThisBattle = true;
    runtime.captureState = "target-locked";
    runtime.ballMenuDeadline = Date.now() + BALL_MENU_TIMEOUT_MS;
    runtime.captureClickAttempts = 0;
    runtime.lastCaptureClickAt = 0;
    runtime.targetLostAt = 0;
    recordEvent("info", "capture", "已锁定目标，开始捕捉事务", {
      target,
      deadline: new Date(runtime.ballMenuDeadline).toISOString(),
      controlsReady: captureControlsReady(captureButton),
    });
    handleCaptureTransaction(battleBox, captureButton);
  }

  function mutationText(node) {
    if (!node) return "";
    if (node.nodeType === Node.TEXT_NODE) return normalize(node.nodeValue);
    if (node.nodeType === Node.ELEMENT_NODE) return normalize(node.textContent);
    return "";
  }

  function handleCaptureFeedback(text) {
    if (!runtime.running || !runtime.captureAttemptedThisBattle || runtime.ballUsedThisBattle) return;
    const normalized = normalize(text);
    const match = normalized.match(
      /战斗进行中[^，。]*无法捕捉|没有可用的?捕捉球|该怪物不可捕捉|本场已捕捉|获取捕捉球失败|获取捕捉道具失败/,
    );
    if (!match) return;
    const feedback = match[0];
    const now = Date.now();
    if (runtime.lastCaptureFeedback === feedback && now - runtime.lastCaptureFeedbackAt < 2_000) return;
    runtime.lastCaptureFeedback = feedback;
    runtime.lastCaptureFeedbackAt = now;
    if (/战斗进行中/.test(feedback)) {
      runtime.captureState = "target-locked";
      recordEvent("warning", "capture-rejected", "游戏暂时拒绝捕捉，将等待操作栏可用后重试", {
        feedback,
        attempt: runtime.captureClickAttempts,
      });
      return;
    }
    finishCaptureWithoutBall(feedback, {
      feedback,
      attempts: runtime.captureClickAttempts,
    });
  }

  function countCaptureSuccess(text) {
    if (!runtime.running || !runtime.ballUsedThisBattle || runtime.successCountedThisBattle) return;
    if (!/捕捉成功|成功捕捉|捕获成功|成功捕获|抓捕成功|成功抓捕/.test(text)) return;
    runtime.successCountedThisBattle = true;
    runtime.captureState = "resolved";
    runtime.captureOutcome = "success";
    runtime.captureResolvedAt = Date.now();
    runtime.stats.captureSuccesses += 1;
    log(`捕捉成功（本轮累计 ${runtime.stats.captureSuccesses} 次）`);
  }

  function detectCaptureOutcome() {
    if (!runtime.running || !runtime.ballUsedThisBattle || runtime.captureOutcome) return;
    const panel = visibleElements(".jieshu")[0];
    if (!panel) return;
    const title = normalize(panel.querySelector(".title")?.textContent);
    const text = normalize(panel.textContent);
    const looksLikeNormalBattleReward = /获取经验|获取金币|获得物品/.test(text);
    if (/战斗胜利/.test(title) && !looksLikeNormalBattleReward) {
      runtime.successCountedThisBattle = true;
      runtime.captureState = "resolved";
      runtime.captureOutcome = "success";
      runtime.captureResolvedAt = Date.now();
      runtime.stats.captureSuccesses += 1;
      recordEvent("info", "capture-result", "通过捕捉结果弹窗确认捕捉成功", {
        title,
        text: text.slice(0, 200),
      });
      log(`捕捉成功（本轮累计 ${runtime.stats.captureSuccesses} 次）`);
      return;
    }
    if (/战斗结束/.test(title) || /捕捉失败|捕获失败|抓捕失败/.test(text)) {
      runtime.captureState = "resolved";
      runtime.captureOutcome = "failed";
      runtime.captureResolvedAt = Date.now();
      recordEvent("info", "capture-result", "捕捉结果为失败，本轮成功数不增加", {
        title,
        text: text.slice(0, 200),
      });
    }
  }

  const successObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "characterData") {
        const text = mutationText(mutation.target);
        countCaptureSuccess(text);
        handleCaptureFeedback(text);
      }
      for (const node of mutation.addedNodes || []) {
        const text = mutationText(node);
        countCaptureSuccess(text);
        handleCaptureFeedback(text);
      }
      detectCaptureOutcome();
    }
  });
  successObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  window.addEventListener("error", (event) => {
    if (!runtime.running) return;
    recordError("window-error", event.error || new Error(event.message || "页面脚本异常"), {
      filename: String(event.filename || "").split("/").pop(),
      line: event.lineno || 0,
      column: event.colno || 0,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    if (!runtime.running) return;
    const reason = event.reason instanceof Error ? event.reason : new Error(String(event.reason || "未处理的 Promise 异常"));
    recordError("unhandled-rejection", reason);
  });

  async function selfCheck() {
    await probeTrustedClickBridge();
    const snapshot = pageSnapshot();
    const checks = {
      userscriptLoaded: true,
      secureStorageAvailable: (() => {
        try {
          const key = "pk_windows_capture_selfcheck";
          localStorage.setItem(key, "1");
          localStorage.removeItem(key);
          return true;
        } catch (_) {
          return false;
        }
      })(),
      mutationObserverAvailable: typeof MutationObserver === "function",
      trustedClickBridge: trustedClickBridgeReady,
      gameHostMatched: location.hostname === "sgplay.cc" || location.hostname.endsWith(".sgplay.cc"),
      pageReady: document.readyState === "interactive" || document.readyState === "complete",
      loginPage: /\/pages\/login\/index/.test(location.hash),
      recognizablePage: Object.values(snapshot.selectors).some((value) => value === true || Number(value) > 0),
    };
    const failed = Object.entries(checks)
      .filter(([name, value]) => name !== "loginPage" && !value)
      .map(([name]) => name);
    const message = checks.loginPage
      ? "页面自检完成：当前是登录页，请登录后再次自检"
      : !checks.trustedClickBridge
        ? `页面自检发现：${trustedClickBridgeError}。请重新加载 v${SCRIPT_VERSION} Chrome 扩展`
      : failed.length
        ? `页面自检发现待确认项：${failed.join("、")}`
        : "页面自检通过：已识别可自动化的游戏页面";
    recordEvent(failed.length ? "warning" : "info", "self-check", message, { checks, snapshot });
    setStatus(message, failed.length ? "waiting" : "normal");
    return { checks, snapshot, message };
  }

  function diagnosticReport() {
    return {
      schema: "play-keeper-windows-auto-capture-diagnostic/v1",
      scriptVersion: SCRIPT_VERSION,
      generatedAt: new Date().toISOString(),
      browser: {
        userAgent: navigator.userAgent,
        language: navigator.language,
        platform: navigator.platform,
        visibilityState: document.visibilityState,
        documentHidden: Boolean(document.hidden),
        documentHasFocus: Boolean(document.hasFocus()),
      },
      config: {
        map: configuredMap(),
        targets: configuredTargets(),
        testMaxBattles: runtime.testMaxBattles,
        testDeadline: runtime.testDeadline ? new Date(runtime.testDeadline).toISOString() : null,
      },
      run: {
        running: runtime.running,
        startedAt: runtime.startedAt ? new Date(runtime.startedAt).toISOString() : null,
        stoppedAt: runtime.stoppedAt ? new Date(runtime.stoppedAt).toISOString() : null,
        stats: { ...runtime.stats },
      },
      finalSnapshot: pageSnapshot(),
      errors: runtime.errors,
      events: runtime.events,
      privacy: "不包含 Cookie、Token、localStorage 内容、密码或输入框值",
    };
  }

  function downloadDiagnostics() {
    let reportObject = diagnosticReport();
    if (!runtime.startedAt) {
      try {
        const previous = JSON.parse(sessionStorage.getItem(SESSION_LAST_DIAGNOSTIC) || "null");
        if (previous?.schema === "play-keeper-windows-auto-capture-diagnostic/v1") reportObject = previous;
      } catch (_) {
        // Ignore a corrupt previous diagnostic and export the current page state.
      }
    }
    const report = JSON.stringify(reportObject, null, 2);
    const blob = new Blob([report], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    anchor.href = url;
    anchor.download = `pk-auto-capture-diagnostic-${stamp}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    setStatus("诊断包已下载，可用于后续优化");
  }

  function copyReport() {
    const report = [
      `Play Keeper Windows 浏览器自动捕捉 v${SCRIPT_VERSION}`,
      `开始：${runtime.startedAt ? new Date(runtime.startedAt).toLocaleString() : "未开始"}`,
      `停止：${runtime.stoppedAt ? new Date(runtime.stoppedAt).toLocaleString() : runtime.running ? "运行中" : "未停止"}`,
      `地图：${configuredMap()}`,
      `目标：${configuredTargets().join(" / ")}`,
      `战斗：${runtime.stats.battles}`,
      `目标战斗：${runtime.stats.targetBattles}`,
      `使用精灵球：${runtime.stats.ballsUsed}`,
      `捕捉成功：${runtime.stats.captureSuccesses}`,
      "",
      ...runtime.logs,
    ].join("\n");
    navigator.clipboard.writeText(report).then(
      () => setStatus("本轮统计与日志已复制"),
      () => setStatus("浏览器未允许复制，请在开发者工具查看日志", "error"),
    );
  }

  function emitPanelVisibility(visible) {
    window.dispatchEvent(new CustomEvent("pk-auto-capture-visibility", { detail: { visible } }));
  }

  function isPanelVisible() {
    return Boolean(panel && panel.style.display !== "none");
  }

  function showPanel() {
    if (!panel) return;
    panel.style.display = "block";
    emitPanelVisibility(true);
  }

  function hidePanel() {
    if (!panel) return;
    panel.style.display = "none";
    emitPanelVisibility(false);
    console.info("[PK Auto Capture] 面板已隐藏，运行状态不变；可从神宠规划器重新打开。");
  }

  function togglePanel() {
    if (isPanelVisible()) hidePanel();
    else showPanel();
  }

  function installPanelDrag(host, handle) {
    let drag = null;
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_PANEL_POSITION) || "null");
      if (Number.isFinite(saved?.left) && Number.isFinite(saved?.top)) {
        host.style.left = `${Math.max(0, Math.min(innerWidth - 80, saved.left))}px`;
        host.style.top = `${Math.max(0, Math.min(innerHeight - 40, saved.top))}px`;
        host.style.right = "auto";
      }
    } catch (_) {}
    handle.addEventListener("pointerdown", (event) => {
      if (event.target.closest("button,input")) return;
      const rect = host.getBoundingClientRect();
      drag = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      handle.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    });
    handle.addEventListener("pointermove", (event) => {
      if (!drag) return;
      host.style.left = `${Math.max(0, Math.min(innerWidth - 80, event.clientX - drag.x))}px`;
      host.style.top = `${Math.max(0, Math.min(innerHeight - 40, event.clientY - drag.y))}px`;
      host.style.right = "auto";
    });
    const finish = () => {
      if (!drag) return;
      drag = null;
      const rect = host.getBoundingClientRect();
      localStorage.setItem(STORAGE_PANEL_POSITION, JSON.stringify({ left: Math.round(rect.left), top: Math.round(rect.top) }));
    };
    handle.addEventListener("pointerup", finish);
    handle.addEventListener("pointercancel", finish);
  }

  function createPanel() {
    const host = document.createElement("div");
    host.id = "pk-windows-auto-capture-host";
    host.style.cssText = "all:initial;position:fixed;right:14px;top:14px;z-index:2147483647;display:none";
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        .panel { width: 304px; box-sizing: border-box; padding: 14px; border-radius: 12px;
          color: #eef5ff; background: rgba(13,20,31,.96); border: 1px solid #34445a;
          box-shadow: 0 10px 30px rgba(0,0,0,.4); font: 13px/1.45 system-ui,"Microsoft YaHei",sans-serif; }
        .panel-head { display:flex; align-items:center; justify-content:space-between; gap:8px; margin:0 0 10px;
          cursor:move; touch-action:none; user-select:none; }
        h3 { margin: 0; font-size: 15px; color: #54d585; }
        label { display: block; margin: 7px 0 3px; color: #aebed3; }
        input { width: 100%; box-sizing: border-box; padding: 7px 8px; border-radius: 7px;
          border: 1px solid #3b4c63; color: #fff; background: #080d14; font: inherit; }
        .limits { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; }
        .stats { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin: 10px 0; }
        .stat { padding: 7px; border-radius: 7px; background: #080d14; }
        .stat b { display: block; color: #54d585; font-size: 16px; }
        .buttons { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; }
        button { padding: 8px; border: 0; border-radius: 7px; color: #07100a; background: #54d585;
          font: 600 13px system-ui,"Microsoft YaHei",sans-serif; cursor: pointer; }
        button.secondary { color: #eef5ff; background: #293446; }
        button:disabled { opacity: .45; cursor: default; }
        .status { min-height: 37px; margin: 9px 0; padding: 7px; border-radius: 7px; color: #bdd0e8;
          background: #111a27; word-break: break-all; }
        .status[data-level="waiting"] { color: #ffd479; }
        .status[data-level="error"] { color: #ff8c8c; }
        .hint { margin-top: 8px; color: #8193aa; font-size: 11px; }
      </style>
      <section class="panel">
        <div class="panel-head"><h3>自动捕捉 · v${SCRIPT_VERSION}</h3><button class="hide secondary">隐藏</button></div>
        <label>地图</label>
        <input class="map" maxlength="30" value="${localStorage.getItem(STORAGE_MAP) || DEFAULT_MAP}">
        <label>目标宠物（逗号分隔）</label>
        <input class="targets" maxlength="100" value="${localStorage.getItem(STORAGE_TARGETS) || DEFAULT_TARGETS.join(",")}">
        <div class="limits">
          <div><label>最多运行场数</label><input class="test-battles" type="number" min="1" max="999" value="${localStorage.getItem(STORAGE_TEST_BATTLES) || "20"}"></div>
          <div><label>最长运行分钟</label><input class="test-minutes" type="number" min="1" max="480" value="${localStorage.getItem(STORAGE_TEST_MINUTES) || "30"}"></div>
        </div>
        <div class="stats">
          <div class="stat">运行时间<b class="runtime">00:00:00</b></div>
          <div class="stat">目标/总战斗<b class="battles">0/0</b></div>
          <div class="stat">使用精灵球<b class="balls">0</b></div>
          <div class="stat">捕捉成功<b class="successes">0</b></div>
        </div>
        <div class="status">等待用户开始</div>
        <div class="buttons">
          <button class="self-check secondary">页面自检</button>
          <button class="start">开始运行</button>
          <button class="stop secondary" disabled>停止</button>
          <button class="copy secondary">复制统计/日志</button>
          <button class="download secondary">下载诊断包</button>
        </div>
        <div class="hint bridge">点击通道：正在检测扩展后台……</div>
        <div class="hint">请勿与同账号的其他自动脚本同时运行。</div>
      </section>`;
    document.documentElement.appendChild(host);

    panel = host;
    mapNode = shadow.querySelector(".map");
    targetsNode = shadow.querySelector(".targets");
    statusNode = shadow.querySelector(".status");
    runtimeNode = shadow.querySelector(".runtime");
    ballsNode = shadow.querySelector(".balls");
    successesNode = shadow.querySelector(".successes");
    battlesNode = shadow.querySelector(".battles");
    startButton = shadow.querySelector(".start");
    stopButton = shadow.querySelector(".stop");
    testBattlesNode = shadow.querySelector(".test-battles");
    testMinutesNode = shadow.querySelector(".test-minutes");
    bridgeNode = shadow.querySelector(".bridge");

    if (sessionStorage.getItem(SESSION_LAST_DIAGNOSTIC)) {
      setStatus("检测到刷新前的试运行记录，可下载诊断包", "waiting");
    }

    shadow.querySelector(".self-check").addEventListener("click", selfCheck);
    startButton.addEventListener("click", start);
    stopButton.addEventListener("click", () => stop());
    shadow.querySelector(".copy").addEventListener("click", copyReport);
    shadow.querySelector(".download").addEventListener("click", downloadDiagnostics);
    shadow.querySelector(".hide").addEventListener("click", hidePanel);
    installPanelDrag(host, shadow.querySelector(".panel-head"));
    window.setInterval(renderStats, 1_000);
  }

  createPanel();
  probeTrustedClickBridge();
  Object.defineProperty(window, "PlayKeeperAutoCaptureTest", {
    configurable: true,
    value: Object.freeze({
      version: SCRIPT_VERSION,
      start,
      stop,
      selfCheck,
      getDiagnosticReport: diagnosticReport,
      downloadDiagnostics,
      showPanel,
      hidePanel,
      togglePanel,
      isPanelVisible,
    }),
  });
  console.info(`[PK Auto Capture] v${SCRIPT_VERSION} 已加载，等待用户点击开始。`);
})();
