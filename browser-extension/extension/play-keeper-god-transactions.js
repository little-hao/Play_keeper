"use strict";

(() => {
  if (window.__PK_GOD_TRANSACTIONS_V150__) return;
  window.__PK_GOD_TRANSACTIONS_V150__ = true;

  const VERSION = "1.5.7";
  const TRUSTED_CLICK_MESSAGE = "pk-auto-capture/trusted-click-v1";
  const TRUSTED_CLICK_PING = "pk-auto-capture/ping-v1";
  const planner = window.PlayKeeperGodPlanner;
  const core = window.PlayKeeperGodPlannerCore;
  const license = window.PlayKeeperLicense;
  if (!planner || !core) {
    console.error("[PK God Transactions] 规划器或核心未加载");
    return;
  }

  const AUTO_CHECKPOINT_KEY = "pk-god-auto-checkpoint-v1";
  const STATUS_POSITION_KEY = "pk-god-status-position-v1";
  function readAutoCheckpoint() {
    try {
      const value = JSON.parse(localStorage.getItem(AUTO_CHECKPOINT_KEY) || "null");
      return value?.stage ? value : { stage: "start", deputy: null };
    } catch (_) {
      return { stage: "start", deputy: null };
    }
  }
  const runtime = { running: false, autoRunning: false, stopRequested: false, lastAction: "", startedAt: 0, lastResult: null, autoCycle: 0,
    autoCheckpoint: readAutoCheckpoint(), autoStats: null };
  const diagnosticLog = [];
  let txStatus;
  let statusFloatHost;
  let statusFloatText;
  let confirmNode;
  let autoPlanSignature = "";
  let lastAutomatedClick = null;
  const takeover = { active: false, startedAt: 0, reason: "" };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  class AutomationStopRequestedError extends Error {
    constructor() {
      super("用户请求停止");
      this.name = "AutomationStopRequestedError";
    }
  }
  const normalize = (value) => String(value ?? "").replace(/\s+/g, "").trim();
  const baseMaterialName = (value) => String(value ?? "")
    .replace(/【绑定】|\[绑定\]|（绑定）|\(绑定\)/g, "").trim();
  const boundFirstMaterialPreferences = (value) => {
    const base = baseMaterialName(value);
    return [`${base}【绑定】`, base];
  };

  function createAutoStats(maxCycles, maxSynthesisRetries) {
    return {
      startedAt: Date.now(), maxCycles, maxSynthesisRetries,
      cyclesStarted: 0, cyclesCompleted: 0,
      pasturePetsLeveled: 0, carriedMainPetsLeveled: 0, carriedDeputyPetsLeveled: 0,
      deputiesWithdrawn: 0,
      evolutionAttempts: 0, evolutionSuccesses: 0, evolutionMaterialSkips: 0,
      synthesisAttempts: 0, synthesisSuccesses: 0, synthesisFailures: 0,
      errors: 0,
    };
  }

  function bumpAutoStat(key, amount = 1) {
    if (runtime.autoStats && Object.hasOwn(runtime.autoStats, key)) runtime.autoStats[key] += amount;
  }

  function formatElapsed(ms) {
    const total = Math.max(0, Math.round(Number(ms || 0) / 1000));
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${minutes}分${String(seconds).padStart(2, "0")}秒`;
  }

  function formatAutoSummary(outcome, reason = "") {
    const stats = runtime.autoStats || createAutoStats(0, 0);
    const lines = [
      `自动循环${outcome}`,
      `周期：启动 ${stats.cyclesStarted}，完成 ${stats.cyclesCompleted}`,
      `补级：牧场副宠 ${stats.pasturePetsLeveled} 只，携带主宠 ${stats.carriedMainPetsLeveled} 只，携带副宠 ${stats.carriedDeputyPetsLeveled} 只`,
      `取出副宠：${stats.deputiesWithdrawn} 只`,
      `进化：提交 ${stats.evolutionAttempts} 次，成功 ${stats.evolutionSuccesses} 次，材料不足跳过 ${stats.evolutionMaterialSkips} 次`,
      `合成：提交 ${stats.synthesisAttempts} 次，成功 ${stats.synthesisSuccesses} 次，失败 ${stats.synthesisFailures} 次`,
      `耗时：${formatElapsed(Date.now() - stats.startedAt)}`,
    ];
    if (reason) lines.push(`结束原因：${reason}`);
    return lines.join("\n");
  }

  async function requireValidLicense(options = {}) {
    if (!license) throw new Error("许可证组件未加载，请重新加载扩展");
    return license.ensureValid(options);
  }

  function saveAutoCheckpoint(stage, deputy = null, details = {}) {
    const checkpoint = { stage, deputy, ...details, updatedAt: new Date().toISOString() };
    runtime.autoCheckpoint = checkpoint;
    localStorage.setItem(AUTO_CHECKPOINT_KEY, JSON.stringify(checkpoint));
    logEvent("automation/checkpoint-saved", checkpoint);
    return checkpoint;
  }

  function logEvent(event, details = {}) {
    diagnosticLog.push({
      at: new Date().toISOString(),
      version: VERSION,
      event,
      action: runtime.lastAction || "",
      details,
    });
    if (diagnosticLog.length > 1000) diagnosticLog.splice(0, diagnosticLog.length - 1000);
  }

  function elementDiagnostic(element) {
    return element ? {
      tag: String(element.tagName || "").toLowerCase(),
      className: String(element.className || "").slice(0, 160),
      name: String(element.getAttribute?.("name") || "").slice(0, 80),
      text: String(element.textContent || "").trim().replace(/\s+/g, " ").slice(0, 120),
    } : null;
  }

  function isVisible(element) {
    if (!element?.isConnected) return false;
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || style.pointerEvents === "none") return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.bottom > 0
      && rect.left < innerWidth && rect.top < innerHeight;
  }

  function isInteractable(element) {
    return isVisible(element) && !element.matches?.(":disabled,[disabled]");
  }

  function visibleIntersectionRect(element) {
    if (!isInteractable(element)) return null;
    const rect = element.getBoundingClientRect();
    let left = Math.max(0, rect.left);
    let top = Math.max(0, rect.top);
    let right = Math.min(innerWidth, rect.right);
    let bottom = Math.min(innerHeight, rect.bottom);
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      const parentRect = parent.getBoundingClientRect();
      if (/hidden|clip|auto|scroll/.test(style.overflowX)) {
        left = Math.max(left, parentRect.left);
        right = Math.min(right, parentRect.right);
      }
      if (/hidden|clip|auto|scroll/.test(style.overflowY)) {
        top = Math.max(top, parentRect.top);
        bottom = Math.min(bottom, parentRect.bottom);
      }
    }
    return right - left >= 6 && bottom - top >= 6 ? { left, top, right, bottom } : null;
  }

  function exposedClickPoint(element, allowPlannerOverlay = true) {
    const rect = visibleIntersectionRect(element);
    if (!rect) return null;
    const host = document.getElementById("pk-god-planner-host");
    const fractions = [0.5, 0.2, 0.8, 0.08, 0.92];
    for (const yFraction of fractions) {
      for (const xFraction of fractions) {
        const x = rect.left + (rect.right - rect.left) * xFraction;
        const y = rect.top + (rect.bottom - rect.top) * yFraction;
        const hit = document.elementFromPoint(x, y);
        if (hit && (hit === element || element.contains(hit))) return { x, y };
        if (allowPlannerOverlay && host && hit && (hit === host || host.contains(hit))) return { x, y };
      }
    }
    return null;
  }

  function isExposedInteractable(element) {
    return Boolean(exposedClickPoint(element, true));
  }

  function navigationElementSnapshot(name) {
    return Array.from(document.querySelectorAll(`uni-button[name="${name}"]`)).map((element) => {
      const rect = element.getBoundingClientRect();
      const clipped = visibleIntersectionRect(element);
      const point = exposedClickPoint(element, true);
      return {
        ...elementDiagnostic(element),
        interactable: isInteractable(element),
        exposed: Boolean(point),
        rect: {
          left: Math.round(rect.left),
          top: Math.round(rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
        clipped: clipped ? {
          left: Math.round(clipped.left),
          top: Math.round(clipped.top),
          right: Math.round(clipped.right),
          bottom: Math.round(clipped.bottom),
        } : null,
        point: point ? { x: Math.round(point.x), y: Math.round(point.y) } : null,
      };
    });
  }

  function navigationSnapshot() {
    return {
      centerTown: navigationElementSnapshot("中心城镇"),
      nextMap: navigationElementSnapshot("切换地图1"),
      previousMap: navigationElementSnapshot("切换地图2"),
      petTemple: navigationElementSnapshot("宠物神殿"),
      templeTabs: Array.from(document.querySelectorAll(".nav-box uni-button,.nav-box .btn1"))
        .filter((element) => ["进化", "合成"].includes(normalize(element.textContent)))
        .map((element) => ({
          ...elementDiagnostic(element),
          active: element.classList.contains("active"),
          interactable: isInteractable(element),
          exposed: isExposedInteractable(element),
        })),
    };
  }

  function isRendered(element) {
    if (!element?.isConnected) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  }

  function setTxStatus(text, level = "normal") {
    if (txStatus) {
      txStatus.textContent = text;
      txStatus.dataset.level = level;
    }
    if (statusFloatText) {
      statusFloatText.textContent = text;
      statusFloatText.dataset.level = level;
      statusFloatHost.style.display = "block";
    }
  }

  function installStatusFloat() {
    if (statusFloatHost?.isConnected) return;
    const host = document.createElement("div");
    host.id = "pk-god-status-float-host";
    host.style.cssText = "all:initial;position:fixed;left:24px;bottom:24px;z-index:2147483646";
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `<style>
      :host{all:initial}.float{width:min(420px,calc(100vw - 32px));box-sizing:border-box;border:1px solid rgba(130,160,196,.55);
        border-radius:12px;background:rgba(10,18,29,.72);backdrop-filter:blur(5px);box-shadow:0 8px 28px rgba(0,0,0,.28);
        color:#eef5ff;font:13px/1.55 system-ui,"Microsoft YaHei",sans-serif;overflow:hidden}
      .head{display:flex;align-items:center;justify-content:space-between;padding:7px 10px;background:rgba(18,31,48,.72);
        color:#ffd479;font-weight:700;cursor:move;touch-action:none;user-select:none}
      button{border:0;border-radius:6px;padding:3px 8px;color:#eef5ff;background:rgba(65,82,106,.72);cursor:pointer}
      .text{padding:10px 12px;white-space:pre-wrap;word-break:break-word}.text[data-level="success"]{color:#6ce8a0}
      .text[data-level="warn"]{color:#ffd479}.text[data-level="error"]{color:#ff9696}
    </style><section class="float"><div class="head"><span>运行提示</span><button>隐藏</button></div><div class="text">等待操作</div></section>`;
    document.documentElement.appendChild(host);
    statusFloatHost = host;
    statusFloatText = shadow.querySelector(".text");
    const head = shadow.querySelector(".head");
    try {
      const saved = JSON.parse(localStorage.getItem(STATUS_POSITION_KEY) || "null");
      if (Number.isFinite(saved?.left) && Number.isFinite(saved?.top)) {
        host.style.left = `${Math.max(0, Math.min(innerWidth - 80, saved.left))}px`;
        host.style.top = `${Math.max(0, Math.min(innerHeight - 40, saved.top))}px`;
        host.style.bottom = "auto";
      }
    } catch (_) {}
    let drag = null;
    head.addEventListener("pointerdown", (event) => {
      if (event.target.closest("button")) return;
      const rect = host.getBoundingClientRect();
      drag = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      head.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    });
    head.addEventListener("pointermove", (event) => {
      if (!drag) return;
      host.style.left = `${Math.max(0, Math.min(innerWidth - 80, event.clientX - drag.x))}px`;
      host.style.top = `${Math.max(0, Math.min(innerHeight - 40, event.clientY - drag.y))}px`;
      host.style.bottom = "auto";
    });
    const finishDrag = () => {
      if (!drag) return;
      drag = null;
      const rect = host.getBoundingClientRect();
      localStorage.setItem(STATUS_POSITION_KEY, JSON.stringify({ left: Math.round(rect.left), top: Math.round(rect.top) }));
    };
    head.addEventListener("pointerup", finishDrag);
    head.addEventListener("pointercancel", finishDrag);
    shadow.querySelector("button").addEventListener("click", () => { host.style.display = "none"; });
    window.addEventListener("pk-god-status", (event) => {
      const detail = event.detail || {};
      setTxStatus(String(detail.text || ""), detail.level || "normal");
    });
  }

  function bodyText() {
    return String(document.body?.innerText || "");
  }

  function petProgressTextCandidates() {
    const candidates = [];
    const seen = new Set();
    const add = (source, value) => {
      const text = String(value ?? "");
      if (!text || seen.has(text)) return;
      seen.add(text);
      candidates.push({ source, text });
    };

    add("body.innerText", document.body?.innerText);
    add("body.textContent", document.body?.textContent);

    const selector = "div,span,p,label,td,tr,li,section,article,view,uni-view";
    const nodes = Array.from(document.querySelectorAll(selector))
      .filter(isVisible)
      .map((element) => ({ element, text: String(element.innerText || element.textContent || "").trim() }))
      .filter(({ text }) => text.length > 0 && text.length <= 1600
        && /等级/.test(text) && /当前经验/.test(text) && /升级经验/.test(text))
      .sort((a, b) => a.text.length - b.text.length)
      .slice(0, 16);

    for (const { element, text } of nodes) {
      add("visible pet-stats element", text);
      add("visible pet-stats textContent", element.textContent);
      if (element.parentElement) add("visible pet-stats parent", element.parentElement.innerText || element.parentElement.textContent);
    }
    return candidates;
  }

  function currentPetRead() {
    const activeCard = Array.from(document.querySelectorAll(".user-left .ul .li.active,.user-left .li.active"))
      .find(isRendered);
    const activeText = String(activeCard?.innerText || activeCard?.textContent || "").trim();
    const activeName = activeText.match(/^([\s\S]*?)\s*Lv\s*\d+/i)?.[1]?.trim() || "";
    const candidates = petProgressTextCandidates();
    for (const candidate of candidates) {
      const progress = core.parsePetProgressText(candidate.text);
      if (!progress) continue;
      const full = core.parseMainPetText(candidate.text) || core.parseMainPetText(bodyText());
      return {
        pet: {
          ...(full || {}),
          ...progress,
          name: activeName || progress.name || full?.name || "",
          tier: progress.tier ?? full?.tier ?? null,
          tierText: progress.tierText || full?.tierText || "",
          cc: progress.cc ?? full?.cc ?? null,
          element: progress.element || full?.element || "",
        },
        source: candidate.source,
      };
    }

    const full = core.parseMainPetText(bodyText());
    return full ? { pet: { ...full, name: activeName || full.name || "" }, source: "body fallback (no live experience fields)" } : null;
  }

  function currentPet() {
    return currentPetRead()?.pet || null;
  }

  function progressDiagnostic() {
    const candidates = petProgressTextCandidates();
    const parsed = currentPetRead();
    const inner = String(document.body?.innerText || "");
    const content = String(document.body?.textContent || "");
    return {
      parsed: Boolean(parsed),
      source: parsed?.source || "未识别",
      pet: parsed?.pet || null,
      innerText: {
        level: /等级\s*[：:]?\s*\d+/.test(inner),
        currentExp: /当前经验\s*[：:]?\s*\d+/.test(inner),
        upgradeExp: /升级经验\s*[：:]?\s*\d+/.test(inner),
      },
      textContent: {
        level: /等级\s*[：:]?\s*\d+/.test(content),
        currentExp: /当前经验\s*[：:]?\s*\d+/.test(content),
        upgradeExp: /升级经验\s*[：:]?\s*\d+/.test(content),
      },
      candidateCount: candidates.length,
    };
  }

  function readPetProgressOnce() {
    const result = currentPetRead();
    if (!result?.pet) {
      const diag = progressDiagnostic();
      setTxStatus(`经验读取失败：未识别属性页。innerText=${JSON.stringify(diag.innerText)}；textContent=${JSON.stringify(diag.textContent)}；候选块=${diag.candidateCount}。请保持“属性”页可见。`, "error");
      return diag;
    }
    const pet = result.pet;
    if (pet.currentExp == null || pet.upgradeExp == null) {
      const diag = progressDiagnostic();
      setTxStatus(`识别到 ${pet.name || "当前宠物"} Lv${pet.level}，但经验字段不完整。来源=${result.source}；innerText=${JSON.stringify(diag.innerText)}；textContent=${JSON.stringify(diag.textContent)}。`, "error");
      return diag;
    }
    setTxStatus(`经验读取成功：${pet.name || "当前宠物"} Lv${pet.level}；当前经验 ${formatExperienceW(pet.currentExp)} / 升级阈值 ${formatExperienceW(pet.upgradeExp)}（已换算为实际经验值）；来源 ${result.source}。未执行任何游戏操作。`, "success");
    return { ok: true, pet, source: result.source };
  }


  async function ensureBridge() {
    if (!globalThis.chrome?.runtime?.id || typeof globalThis.chrome.runtime.sendMessage !== "function") {
      throw new Error("未检测到 Chrome 扩展可信点击通道");
    }
    const response = await globalThis.chrome.runtime.sendMessage({ type: TRUSTED_CLICK_PING });
    if (!response?.ok || response.version !== VERSION) {
      throw new Error(response?.error || `可信点击后台版本不一致：需要 ${VERSION}，当前 ${response?.version || "未知"}`);
    }
  }

  async function trustedClick(element, label) {
    if (!isInteractable(element)) throw new Error(`${label}：目标不可点击或已离开页面`);
    await requireValidLicense();
    logEvent("trusted-click/request", { label, target: elementDiagnostic(element) });
    await ensureBridge();
    const panelHost = document.getElementById("pk-god-planner-host");
    const previousPointerEvents = panelHost?.style.pointerEvents || "";
    if (panelHost) panelHost.style.pointerEvents = "none";
    await sleep(40);
    let response;
    try {
      const point = exposedClickPoint(element, false);
      if (!point) throw new Error(`${label}：目标仍在屏外、被裁切或被其他页面元素遮挡`);
      const x = Math.round(point.x * 100) / 100;
      const y = Math.round(point.y * 100) / 100;
      lastAutomatedClick = { x, y, label, until: Date.now() + 1200 };
      const requestId = `god-tx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      response = await globalThis.chrome.runtime.sendMessage({
        type: TRUSTED_CLICK_MESSAGE,
        requestId,
        x,
        y,
      });
      if (!response?.ok) throw new Error(`${label}：可信点击失败：${response?.error || "后台无确认"}`);
      logEvent("trusted-click/success", { label, requestId, x, y, method: response?.method || "" });
    } finally {
      if (panelHost) panelHost.style.pointerEvents = previousPointerEvents;
    }
    return response;
  }

  function exactAction(labels) {
    const wanted = new Set(labels.map(normalize));
    return Array.from(document.querySelectorAll("button,uni-button,[role=button],a,div,span,view,uni-view"))
      .filter(isInteractable)
      .filter((element) => wanted.has(normalize(element.textContent)))
      .sort((a, b) => {
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        return ar.width * ar.height - br.width * br.height;
      })[0] || null;
  }

  function uniqueInteractable(selector, label, root = document) {
    const matches = Array.from(root.querySelectorAll(selector)).filter(isInteractable);
    if (matches.length !== 1) throw new Error(`${label}：需要唯一可见选项，实际找到 ${matches.length} 个`);
    return matches[0];
  }

  function portraitKeyFromElement(element) {
    if (!element) return "";
    const values = [
      element.getAttribute?.("src"), element.getAttribute?.("style"), element.style?.backgroundImage,
      element.querySelector?.("img")?.getAttribute?.("src"),
    ].filter(Boolean).join(" ");
    return values.match(/\/(?:k|z)(\d+)\.(?:gif|png|jpe?g)(?:[?#]|\b)/i)?.[1] || "";
  }

  function parsePetPopupOptions(popup) {
    return Array.from(popup.querySelectorAll(".pet-item")).filter(isVisible).map((element) => {
      const name = String(element.querySelector(".pet-name")?.textContent || "").trim();
      const tags = Array.from(element.querySelectorAll(".pet-tag")).map((node) => String(node.textContent || "").trim());
      const level = Number(tags.find((text) => /等级/.test(text))?.match(/\d+/)?.[0]);
      const growth = Number(tags.find((text) => /成长/.test(text))?.match(/\d+(?:\.\d+)?/)?.[0]);
      return { element, name, level, growth, portraitKey: portraitKeyFromElement(element) };
    });
  }

  function parseMaterialPopupOptions(popup) {
    return Array.from(popup.querySelectorAll(".mat-item")).filter(isVisible).map((element) => ({
      element,
      name: String(element.querySelector(".mat-name")?.textContent || "").trim(),
      quantity: Number(String(element.querySelector(".mat-tag")?.textContent || "").match(/数量\s*(\d+)/)?.[1] || 0),
    }));
  }

  async function selectRecordedPet(slotIndex, target, roleLabel) {
    const triggers = Array.from(document.querySelectorAll(".content-bor2 .pet-trigger")).filter(isInteractable);
    if (triggers.length !== 2) throw new Error(`合成页宠物下拉结构不一致：应为 2 个，实际 ${triggers.length} 个`);
    await trustedClick(triggers[slotIndex], `打开${roleLabel}下拉`);
    const popup = await waitUntil(() => {
      const popups = Array.from(document.querySelectorAll(".content-bor2 .pet-popup"));
      const candidate = popups[slotIndex];
      const overlay = candidate?.querySelector(".pet-overlay");
      const optionCount = candidate?.querySelectorAll(".pet-item").length || 0;
      return overlay && isVisible(overlay) && optionCount > 0 ? candidate : null;
    }, 12000, 150);
    if (!popup) {
      const current = Array.from(document.querySelectorAll(".content-bor2 .pet-popup"))[slotIndex];
      const overlayVisible = Boolean(current?.querySelector(".pet-overlay") && isVisible(current.querySelector(".pet-overlay")));
      const optionCount = current?.querySelectorAll(".pet-item").length || 0;
      throw new Error(`${roleLabel}下拉${overlayVisible ? "已打开但没有可选宠物" : "未打开或页面结构已变化"}（选项 ${optionCount}）`);
    }
    const options = parsePetPopupOptions(popup);
    logEvent("synthesis/pet-options", {
      role: roleLabel,
      count: options.length,
      options: options.map(({ name, level, growth, portraitKey }) => ({ name, level, growth, portraitKey })),
    });
    const selected = core.selectUniquePetOption(options, target);
    if (!selected.ok) throw new Error(`${roleLabel}匹配失败：${selected.reason}`);
    if (selected.growthChanged) {
      logEvent("synthesis/pet-growth-refreshed", {
        role: roleLabel,
        name: target.name,
        previousGrowth: selected.previousGrowth,
        observedGrowth: selected.observedGrowth,
      });
      target.cc = selected.observedGrowth;
    }
    await trustedClick(selected.option.element, `选择${roleLabel} ${target.name}`);
    const confirmed = await waitUntil(() => {
      const popups = Array.from(document.querySelectorAll(".content-bor2 .pet-popup"));
      const current = popups[slotIndex];
      const text = String(current?.querySelector(".pet-text")?.textContent || "").trim();
      const overlayVisible = current?.querySelector(".pet-overlay") && isVisible(current.querySelector(".pet-overlay"));
      const expected = String(target.name || "").trim();
      return !overlayVisible && (text === expected || text === `${expected}-${target.level}`) ? text : null;
    }, 2600, 120);
    if (!confirmed) throw new Error(`${roleLabel}选择后页面没有显示“${target.name}”及其等级；停止`);
    logEvent("synthesis/pet-selected", { role: roleLabel, name: target.name });
    return { name: selected.option.name, level: selected.option.level, growth: selected.option.growth, portraitKey: selected.option.portraitKey, displayed: confirmed };
  }

  function synthesisPetSlotText(slotIndex) {
    const popups = Array.from(document.querySelectorAll(".content-bor2 .pet-popup"));
    const popupText = String(popups[slotIndex]?.querySelector(".pet-text")?.textContent || "").trim();
    if (popupText) return popupText;
    const triggers = Array.from(document.querySelectorAll(".content-bor2 .pet-trigger"));
    return String(triggers[slotIndex]?.textContent || "").trim();
  }

  async function activateSelectedSynthesisMain(target) {
    const slot = document.querySelector(".content-bor2 .left-box .li:first-child");
    const card = slot?.querySelector("img,uni-image") || slot;
    if (!card || !isInteractable(card)) throw new Error("合成页已选主宠卡片不可点击；无法设置为主战宠物");
    await trustedClick(card, `将 ${target.name} 设为合成主战宠物`);
    await sleep(500);
    let recoveredSelection = false;
    let selectedText = synthesisPetSlotText(0);
    if (!selectedText.startsWith(String(target.name || ""))) {
      const unassigned = !selectedText || /请选择主宠|未选择主宠|未指定/.test(selectedText);
      if (!unassigned) throw new Error(`点击主宠图标后，合成页主宠变为“${selectedText}”；不是未指定状态，停止`);
      logEvent("synthesis/main-selection-cleared-after-battle-change", { name: target.name, selectedText });
      await selectRecordedPet(0, target, "主宠");
      recoveredSelection = true;
      selectedText = synthesisPetSlotText(0);
      if (!selectedText.startsWith(String(target.name || ""))) throw new Error("主战切换后主宠曾变为未指定，重新选择仍未恢复目标主宠");
    }
    logEvent("synthesis/main-battle-selected", { name: target.name, selectedText, recoveredSelection });
  }

  async function selectMaterial(slotIndex, preferredNames, roleLabel) {
    const triggers = Array.from(document.querySelectorAll(".content-bor2 .mat-trigger")).filter(isInteractable);
    if (triggers.length !== 2) throw new Error(`合成页材料下拉结构不一致：应为 2 个，实际 ${triggers.length} 个`);
    await trustedClick(triggers[slotIndex], `打开${roleLabel}下拉`);
    const popupReady = () => {
      const popups = Array.from(document.querySelectorAll(".content-bor2 .mat-popup"));
      const candidate = popups[slotIndex];
      const overlay = candidate?.querySelector(".mat-overlay");
      const optionCount = candidate?.querySelectorAll(".mat-item").length || 0;
      return overlay && isVisible(overlay) && optionCount > 0 ? candidate : null;
    };
    let popup = await waitUntil(popupReady, 12000, 180);
    if (!popup) {
      const candidate = Array.from(document.querySelectorAll(".content-bor2 .mat-popup"))[slotIndex];
      const overlayVisible = Boolean(candidate?.querySelector(".mat-overlay") && isVisible(candidate.querySelector(".mat-overlay")));
      const optionCount = candidate?.querySelectorAll(".mat-item").length || 0;
      logEvent("synthesis/material-popup-delayed", { role: roleLabel, overlayVisible, optionCount });
      if (!overlayVisible) {
        const retryTriggers = Array.from(document.querySelectorAll(".content-bor2 .mat-trigger")).filter(isInteractable);
        if (retryTriggers.length === 2) await trustedClick(retryTriggers[slotIndex], `重新打开${roleLabel}下拉`);
      }
      popup = await waitUntil(popupReady, 18000, 180);
    }
    if (!popup) throw new Error(`${roleLabel}下拉等待并重试后仍未加载可选材料`);
    const options = parseMaterialPopupOptions(popup);
    logEvent("synthesis/material-options", {
      role: roleLabel,
      count: options.length,
      options: options.map(({ name, quantity }) => ({ name, quantity })),
    });
    const selected = core.selectPreferredMaterial(options, preferredNames);
    if (!selected.ok) throw new Error(`${roleLabel}匹配失败：${selected.reason}`);
    await trustedClick(selected.option.element, `选择${roleLabel} ${selected.option.name}`);
    const confirmed = await waitUntil(() => {
      const popups = Array.from(document.querySelectorAll(".content-bor2 .mat-popup"));
      const current = popups[slotIndex];
      const text = String(current?.querySelector(".mat-text")?.textContent || "").trim();
      const overlayVisible = current?.querySelector(".mat-overlay") && isVisible(current.querySelector(".mat-overlay"));
      return !overlayVisible && text === selected.option.name ? text : null;
    }, 2600, 120);
    if (!confirmed) throw new Error(`${roleLabel}选择后页面未显示“${selected.option.name}”；停止`);
    logEvent("synthesis/material-selected", { role: roleLabel, name: selected.option.name, quantityBefore: selected.option.quantity });
    return selected.option.name;
  }

  function outcomeSnapshot(pattern) {
    const result = new Map();
    const nodes = Array.from(document.querySelectorAll("uni-view,uni-text,span,p,div"));
    for (const node of nodes) {
      if (!isVisible(node)) continue;
      const text = String(node.innerText || node.textContent || "").trim().replace(/\s+/g, " ");
      if (!text || text.length > 260 || !pattern.test(text)) continue;
      if (Array.from(node.children || []).some((child) => pattern.test(String(child.innerText || child.textContent || "")))) continue;
      result.set(text, (result.get(text) || 0) + 1);
    }
    return result;
  }

  function newOutcomes(before, pattern) {
    const after = outcomeSnapshot(pattern);
    const added = [];
    for (const [text, count] of after) {
      if (count > (before.get(text) || 0)) added.push(text);
    }
    return added;
  }

  function readSynthesisResultMessage() {
    const pattern = /合成(?:成功|失败)[！!][^\n]{0,120}/;
    const matches = Array.from(document.querySelectorAll("uni-view,uni-text,span,p,div"))
      .filter(isVisible)
      .map((element) => String(element.innerText || element.textContent || "").trim().replace(/\s+/g, " "))
      .map((text) => text.match(pattern)?.[0] || "")
      .filter(Boolean)
      .sort((a, b) => a.length - b.length);
    return matches[0] || "";
  }

  function aliasesFor(itemId) {
    const item = [...core.EXP_ITEMS, ...core.KEY_ITEMS].find((entry) => entry.id === itemId);
    return item?.aliases || [];
  }

  function isBoundResourceText(text) {
    return /【绑定】|\[绑定\]|\(绑定\)|（绑定）/.test(String(text || ""));
  }

  function inventoryRows(aliases) {
    const root = bagRootElement();
    if (!root) return [];
    const rows = [];
    const seen = new Set();
    const leaves = Array.from(root.querySelectorAll("td,span,p,label,div,view,uni-view"))
      .filter(isRendered)
      .filter((element) => aliases.some((alias) => String(element.textContent || "").includes(alias)));
    for (const leaf of leaves) {
      let node = leaf;
      for (let depth = 0; node && depth < 8; depth += 1, node = node.parentElement) {
        if (!isRendered(node)) continue;
        const text = String(node.innerText || node.textContent || "").trim();
        if (text.length > 260 || !aliases.some((alias) => text.includes(alias))) continue;
        let stripped = text;
        for (const alias of aliases) stripped = stripped.split(alias).join(" ");
        stripped = stripped.replace(/【绑定】|\[绑定\]|\(绑定\)|（绑定）/g, " ");
        const numbers = stripped.match(/\b\d+\b/g)?.map(Number) || [];
        const count = numbers.at(-1);
        if (!Number.isFinite(count) || count <= 0 || seen.has(node)) continue;
        seen.add(node);
        rows.push({ element: node, text, count, bound: isBoundResourceText(text) });
        break;
      }
    }
    return rows.sort((a, b) => Number(b.bound) - Number(a.bound) || a.text.length - b.text.length);
  }

  function liveCount(itemId) {
    return inventoryRows(aliasesFor(itemId)).reduce((sum, row) => sum + row.count, 0);
  }

  async function waitUntil(check, timeoutMs = 4500, intervalMs = 180) {
    const deadline = Date.now() + timeoutMs;
    let last;
    while (Date.now() < deadline) {
      // 已提交的单步事务仍需完成验证；事务之间的页面等待可立即响应停止请求。
      if (runtime.autoRunning && runtime.stopRequested && !runtime.running) {
        throw new AutomationStopRequestedError();
      }
      try {
        last = check();
        if (last) return last;
      } catch (_) {}
      await sleep(intervalMs);
    }
    return null;
  }

  function requireConfirmation() {
    if (!runtime.autoRunning && !confirmNode?.checked) throw new Error("请先勾选“我已核对当前目标与页面”，单次事务才会执行");
  }

  function clearConfirmation() {
    if (confirmNode) confirmNode.checked = false;
  }

  function begin(name) {
    if (runtime.running) throw new Error(`已有事务执行中：${runtime.lastAction}`);
    runtime.running = true;
    runtime.lastAction = name;
    runtime.startedAt = Date.now();
    logEvent("transaction/begin", { name });
    setTxStatus(`${name}：预检中…`);
  }

  function finish(message, level = "normal") {
    logEvent("transaction/finish", { message, level, elapsedMs: runtime.startedAt ? Date.now() - runtime.startedAt : 0 });
    runtime.running = false;
    runtime.lastResult = { message, level, at: new Date().toISOString() };
    setTxStatus(message, level);
    if (!runtime.autoRunning) clearConfirmation();
  }

  function collectDomSelfTest() {
    const propertyPage = document.querySelector(".shuxing");
    const evolutionPage = document.querySelector(".content-bor1");
    const synthesisPage = document.querySelector(".content-bor2");
    const report = {
      page: propertyPage ? "pet-attributes" : (evolutionPage ? "evolution" : (synthesisPage ? "synthesis" : "other")),
      url: `${location.origin}${location.pathname}${location.hash}`,
      navigation: navigationSnapshot(),
      property: {
        visible: Boolean(propertyPage && isVisible(propertyPage)),
        parsedPet: currentPet(),
        evolutionCountFields: document.querySelectorAll(".shuxing .right-box .item").length,
      },
      evolution: {
        visible: Boolean(evolutionPage && isVisible(evolutionPage)),
        petOptions: evolutionPage ? evolutionPage.querySelectorAll(".left-box .li").length : 0,
        paths: evolutionPage ? Array.from(evolutionPage.querySelectorAll(".right-box > .item")).map((item) => ({
          material: String(item.querySelector(".le")?.textContent || "").match(/进化所需材料[：:]\s*([^\s]+)/)?.[1] || "",
          actionCount: item.querySelectorAll(".ri").length,
        })) : [],
      },
      synthesis: {
        visible: Boolean(synthesisPage && isVisible(synthesisPage)),
        petTriggers: synthesisPage?.querySelectorAll(".pet-trigger").length || 0,
        materialTriggers: synthesisPage?.querySelectorAll(".mat-trigger").length || 0,
        startButtons: synthesisPage?.querySelectorAll('uni-button[name="开始合成"]').length || 0,
        selectedPets: synthesisPage ? Array.from(synthesisPage.querySelectorAll(".pet-text")).map((node) => String(node.textContent || "").trim()) : [],
        selectedMaterials: synthesisPage ? Array.from(synthesisPage.querySelectorAll(".mat-text")).map((node) => String(node.textContent || "").trim()) : [],
      },
    };
    return report;
  }

  function runDomSelfTest() {
    const report = collectDomSelfTest();
    const issues = [];
    if (report.page === "pet-attributes" && (!report.property.parsedPet || report.property.parsedPet.evolutionCount == null)) {
      issues.push("属性页未解析到宠物或进化次数");
    }
    if (report.page === "evolution") {
      if (report.evolution.petOptions < 1) issues.push("进化页没有宠物选项");
      if (report.evolution.paths.length !== 2) issues.push(`进化路径应为 2 条，实际 ${report.evolution.paths.length}`);
      if (report.evolution.paths.some((path) => path.actionCount !== 1)) issues.push("进化路径右侧按钮不唯一");
    }
    if (report.page === "synthesis") {
      if (report.synthesis.petTriggers !== 2) issues.push(`宠物下拉应为 2 个，实际 ${report.synthesis.petTriggers}`);
      if (report.synthesis.materialTriggers !== 2) issues.push(`材料下拉应为 2 个，实际 ${report.synthesis.materialTriggers}`);
      if (report.synthesis.startButtons !== 1) issues.push(`开始合成按钮应为 1 个，实际 ${report.synthesis.startButtons}`);
    }
    if (report.page === "other") {
      const navigationVisible = report.navigation.nextMap.some((item) => item.exposed)
        || report.navigation.petTemple.some((item) => item.exposed)
        || report.navigation.templeTabs.length > 0;
      if (!navigationVisible) issues.push("当前不是属性、进化、合成或可识别的城镇导航页");
    }
    logEvent("dom-self-test", { report, issues });
    setTxStatus(issues.length ? `DOM 结构检查发现问题：${issues.join("；")}` : `DOM 结构检查通过：${report.page}`, issues.length ? "error" : "success");
    return { ok: issues.length === 0, report, issues };
  }

  function diagnosticReport() {
    let state = null;
    let config = null;
    try { state = planner.getState(); } catch (_) {}
    try { config = planner.getConfig(); } catch (_) {}
    return {
      schema: "play-keeper-god-transactions-diagnostic/v2",
      createdAt: new Date().toISOString(),
      version: VERSION,
      page: `${location.origin}${location.pathname}${location.hash}`,
      runtime: { ...runtime },
      planner: { state, config },
      domSelfTest: collectDomSelfTest(),
      events: diagnosticLog.slice(),
      privacy: "未包含聊天正文、输入内容、Cookie、令牌或完整页面 HTML。",
    };
  }

  function exportDiagnostics() {
    const report = diagnosticReport();
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    anchor.href = url;
    anchor.download = `pk-god-transactions-diagnostic-${stamp}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    logEvent("diagnostic/export", { file: anchor.download, eventCount: diagnosticLog.length });
    setTxStatus(`事务诊断已导出：${anchor.download}`, "success");
    return report;
  }

  async function refreshPlannerSnapshots({ refreshCurrentRole = false } = {}) {
    if (bagRootElement()) {
      try { planner.scanBag(); } catch (_) {}
    }
    if (refreshCurrentRole) {
      try {
        const current = currentPet();
        const state = planner.getState();
        const sameIdentity = (a, b) => a && b
          && String(a.name || "") === String(b.name || "")
          && Number(a.tier) === Number(b.tier)
          && String(a.element || "") === String(b.element || "");
        if (sameIdentity(current, state.deputyPet) && !sameIdentity(current, state.mainPet)) planner.scanDeputyPet();
        else if (sameIdentity(current, state.mainPet) && !sameIdentity(current, state.deputyPet)) planner.scanMainPet();
      } catch (_) {}
    }
    try {
      const state = planner.getState();
      if (state.mainPet && state.pasturePets?.length && state.inventory) planner.buildPlan();
    } catch (_) {}
  }

  function liveExpInventory() {
    const inventory = {};
    for (const item of core.EXP_ITEMS) inventory[item.id] = liveCount(item.id);
    return inventory;
  }

  function inventoryScrollContainers() {
    const root = bagRootElement();
    if (!root) return [];
    const exact = Array.from(root.querySelectorAll(".item-box"))
      .filter(isRendered)
      .filter((element) => element.scrollHeight > element.clientHeight + 24)
      .filter((element) => element.querySelectorAll(".item").length > 1)
      .sort((a, b) => (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight));
    if (exact.length) return [exact[0]];
    return Array.from(root.querySelectorAll("uni-scroll-view,.uni-scroll-view,scroll-view,uni-view,div"))
      .filter(isRendered)
      .filter((element) => element.scrollHeight > element.clientHeight + 24 && element.clientHeight >= 80)
      .filter((element) => element.querySelectorAll(".item").length > 1)
      .sort((a, b) => (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight))
      .slice(0, 1);
  }

  function bagRootElement() {
    return Array.from(document.querySelectorAll("uni-view,div,section"))
      .filter(isRendered)
      .filter((element) => /当前背包空间/.test(String(element.textContent || ""))
        && /物品名称/.test(String(element.textContent || "")))
      .sort((a, b) => (a.getBoundingClientRect().width * a.getBoundingClientRect().height)
        - (b.getBoundingClientRect().width * b.getBoundingClientRect().height))[0] || null;
  }

  async function closeBag() {
    const root = bagRootElement();
    if (!root) return;
    const candidates = Array.from(root.querySelectorAll("uni-button,button,uni-view,uni-text,span,div"))
      .filter(isInteractable)
      .filter((element) => {
        const text = normalize(element.textContent);
        const name = normalize(element.getAttribute?.("name"));
        const className = normalize(element.className).toLowerCase();
        return ["×", "✕", "关闭"].includes(text) || ["关闭", "close"].includes(name) || /(?:^|-)close(?:-|$)/.test(className);
      })
      .sort((a, b) => (a.getBoundingClientRect().width * a.getBoundingClientRect().height)
        - (b.getBoundingClientRect().width * b.getBoundingClientRect().height));
    if (!candidates.length) throw new Error("背包已打开，但未找到关闭按钮；停止以避免在遮罩页面误读宠物属性");
    await trustedClick(candidates[0], "关闭背包并返回宠物属性页");
    const closed = await waitUntil(() => bagRootElement() ? null : true, 5000, 150);
    if (!closed) throw new Error("点击背包关闭按钮后弹窗仍未关闭");
  }

  function rowIsExposed(row) {
    const rect = row?.getBoundingClientRect?.();
    if (!rect || rect.width <= 0 || rect.height <= 0) return false;
    const x = Math.max(0, Math.min(innerWidth - 1, rect.left + rect.width / 2));
    const y = Math.max(0, Math.min(innerHeight - 1, rect.top + rect.height / 2));
    const hit = document.elementFromPoint(x, y);
    return Boolean(hit && (row === hit || row.contains(hit) || hit.contains(row)));
  }

  async function moveInventoryScroll(container, top) {
    container.scrollTop = Math.max(0, Math.min(top, container.scrollHeight - container.clientHeight));
    container.dispatchEvent(new Event("scroll", { bubbles: true }));
    await sleep(180);
  }

  async function scanLiveExpInventory() {
    const inventory = liveExpInventory();
    const containers = inventoryScrollContainers();
    for (const container of containers.slice(0, 3)) {
      const originalTop = container.scrollTop;
      const maxTop = Math.max(0, container.scrollHeight - container.clientHeight);
      const step = Math.max(80, Math.floor(container.clientHeight * 0.72));
      for (let top = 0; top <= maxTop; top += step) {
        await moveInventoryScroll(container, top);
        const visible = liveExpInventory();
        for (const item of core.EXP_ITEMS) inventory[item.id] = Math.max(inventory[item.id] || 0, visible[item.id] || 0);
      }
      if (maxTop > 0) {
        await moveInventoryScroll(container, maxTop);
        const visible = liveExpInventory();
        for (const item of core.EXP_ITEMS) inventory[item.id] = Math.max(inventory[item.id] || 0, visible[item.id] || 0);
      }
      await moveInventoryScroll(container, originalTop);
      if (Object.values(inventory).some((count) => count > 0)) break;
    }
    logEvent("level/inventory-scroll-scan", {
      inventory,
      scrollContainers: containers.map((element) => ({ clientHeight: element.clientHeight, scrollHeight: element.scrollHeight })),
    });
    return inventory;
  }

  async function locateInventoryRows(itemId) {
    const aliases = aliasesFor(itemId);
    const immediate = inventoryRows(aliases).filter((row) => isInteractable(row.element) && rowIsExposed(row.element));
    if (immediate.length) return immediate;
    const containers = inventoryScrollContainers();
    for (const container of containers.slice(0, 3)) {
      const maxTop = Math.max(0, container.scrollHeight - container.clientHeight);
      const step = Math.max(70, Math.floor(container.clientHeight * 0.6));
      for (let top = 0; top <= maxTop; top += step) {
        await moveInventoryScroll(container, top);
        const rows = inventoryRows(aliases).filter((row) => isInteractable(row.element) && rowIsExposed(row.element));
        if (rows.length) return rows;
      }
      await moveInventoryScroll(container, maxTop);
      const rows = inventoryRows(aliases).filter((row) => isInteractable(row.element) && rowIsExposed(row.element));
      if (rows.length) return rows;
    }
    return [];
  }

  function formatExperienceW(value) {
    const number = Number(value);
    return Number.isFinite(number) ? `${(number / core.EXP_PER_W).toFixed(1)}W` : "未知";
  }

  function petProgressLabel(pet) {
    if (!pet) return "宠物状态未知";
    const level = pet.effectiveLevel === 0 ? "脚本Lv0（页面Lv1）" : `Lv${pet.level}`;
    if (pet.currentExp == null || pet.upgradeExp == null || pet.level >= 40) return level;
    return `${level} · 当前经验 ${formatExperienceW(pet.currentExp)}/${formatExperienceW(pet.upgradeExp)}`;
  }

  function petMatchesExpected(pet, expectedPet) {
    if (!pet) return false;
    if (!expectedPet?.name) return true;
    if (!pet.name) return false;
    if (normalize(expectedPet.name) !== normalize(pet.name)) return false;
    const expectedLevel = Number(expectedPet.level);
    if (Number.isInteger(expectedLevel) && expectedLevel >= 1
      && Number(pet.level) !== expectedLevel) return false;
    if (expectedPet.element && pet.element
      && normalize(expectedPet.element) !== normalize(pet.element)) return false;
    const expectedEvolution = Number(expectedPet.evolutionCount);
    const observedEvolution = Number(pet.evolutionCount);
    const expectedCc = Number(expectedPet.cc);
    const observedCc = Number(pet.cc);
    if (Number.isFinite(expectedCc) && Number.isFinite(observedCc)
      && Number.isFinite(expectedEvolution) && expectedEvolution === observedEvolution
      && Math.abs(expectedCc - observedCc) > 0.05) return false;
    return true;
  }

  function petProgressReady(pet) {
    return Boolean(pet && (Number(pet.level) >= 40
      || (pet.currentExp != null && pet.upgradeExp != null)));
  }

  async function waitForStableCurrentPet(expectedPet = null, timeout = 30000) {
    let signature = "";
    let stableHits = 0;
    return waitUntil(() => {
      const pet = currentPet();
      if (!petMatchesExpected(pet, expectedPet) || !petProgressReady(pet)) {
        signature = "";
        stableHits = 0;
        return null;
      }
      const next = [pet.name, pet.level, pet.currentExp, pet.upgradeExp, pet.evolutionCount].join("|");
      stableHits = next === signature ? stableHits + 1 : 1;
      signature = next;
      return stableHits >= 3 ? pet : null;
    }, timeout, 250);
  }

  async function levelTo40Once(expectedPet = null) {
    begin("补当前宠到 Lv40");
    try {
      requireConfirmation();
      await closeBag();
      let pet = currentPet();
      if (!petMatchesExpected(pet, expectedPet) || !petProgressReady(pet)) {
        await openPetAttributes(expectedPet);
        pet = await waitForStableCurrentPet(expectedPet);
      }
      if (!pet) throw new Error("未读取到当前带领宠物资料；请保持宠物资料的“属性”页可见");
      if (expectedPet?.name && pet.name && normalize(expectedPet.name) !== normalize(pet.name)) {
        throw new Error(`补级目标身份不一致：预期 ${expectedPet.name}，属性页为 ${pet.name}`);
      }
      if (pet.level < 40 && (pet.currentExp == null || pet.upgradeExp == null)) {
        const diag = progressDiagnostic();
        throw new Error(
          "属性页经验字段解析失败。当前页面应显示“等级 / 当前经验 / 升级经验”；"
          + `诊断：innerText=${JSON.stringify(diag.innerText)}，textContent=${JSON.stringify(diag.textContent)}，候选块=${diag.candidateCount}。`
          + "请勿使用经验道具，先点“读取经验状态”检查。",
        );
      }
      if (pet.level >= 40) return finish(`${pet.name || "当前宠物"} 已经 Lv${pet.level}，未使用任何经验道具`);

      await openBag();
      let inventory = await scanLiveExpInventory();

      let operations = 0;
      const maxOperations = 80;
      while (operations < maxOperations) {
        if (pet.level >= 40) break;
        if (pet.currentExp == null || pet.upgradeExp == null) {
          throw new Error("补级快照缺少当前经验/升级经验；停止，不会继续使用道具");
        }

        const config = planner.getConfig();
        const tx = core.planLevel40Transaction({ pet, inventory, targetW: config.level1To40ExpW });
        if (!tx.ok) throw new Error(tx.reason);
        if (!tx.uses?.length) throw new Error("剩余经验计划为空，但尚未达到 Lv40；停止");

        const use = tx.uses[0];
        let rows = await locateInventoryRows(use.id);
        if (!rows.length) {
          const previousCount = Number(inventory[use.id] || 0);
          const rescanned = await scanLiveExpInventory();
          inventory = { ...inventory, ...rescanned };
          logEvent("level/inventory-replanned", {
            missingItem: use.name,
            previousCount,
            rescannedCount: Number(inventory[use.id] || 0),
            inventory,
          });
          // 实际库存已经变化时返回循环顶部，让规划器基于完整新快照重新选道具。
          if (Number(inventory[use.id] || 0) < previousCount) continue;
          rows = await locateInventoryRows(use.id);
          if (!rows.length) {
            throw new Error(`完整重扫后仍未找到 ${use.name} 行；背包显示数量 ${inventory[use.id] || 0}，停止以避免误用道具`);
          }
        }
        const beforeCount = liveCount(use.id);
        const beforePet = pet;
        const remainingText = tx.remaining?.ok
          ? `距 Lv40 尚需 ${tx.remaining.remainingExp} 经验（约 ${(tx.remaining.remainingWExact ?? tx.remaining.remainingW).toFixed(1)}W）`
          : `计划目标 ${Number(tx.targetW).toFixed(1)}W`;
        setTxStatus(`${pet.name || "当前宠物"}：${petProgressLabel(pet)}；${remainingText}。本步使用 ${use.name}×1…`);

        rows[0].element.scrollIntoView({ block: "center", inline: "nearest" });
        await sleep(260);
        if (!isInteractable(rows[0].element)) throw new Error(`${use.name} 已定位但滚动后仍不可点击；停止`);
        await trustedClick(rows[0].element, `选择 ${use.name}`);
        await sleep(220);
        const useButton = exactAction(["使用"]);
        if (!useButton) throw new Error(`已选择 ${use.name}，但未找到唯一“使用”按钮；停止`);
        await trustedClick(useButton, `使用 ${use.name}`);

        const consumed = await waitUntil(() => {
          const afterCount = liveCount(use.id);
          if (afterCount < beforeCount) return { afterCount };
          return null;
        }, 12000, 250);

        let verificationSource = "inventory-decrement";
        let updated;
        if (consumed) {
          const estimated = core.estimateLevelProgressFromTotalExp(Number(beforePet.currentExp) + Number(use.expW) * core.EXP_PER_W);
          if (!estimated?.ok) throw new Error(`${use.name} 已扣除，但无法更新可信经验快照：${estimated?.reason || "未知错误"}`);
          updated = { ...beforePet, ...estimated, name: beforePet.name };
          inventory = { ...inventory, [use.id]: Math.max(0, Number(consumed.afterCount || 0)) };
        } else {
          verificationSource = "pet-progress";
          setTxStatus(`${use.name} 的背包数量暂未刷新；正在读取宠物属性核验等级/经验变化，不会重复使用…`);
          await closeBag();
          await openPetAttributes();
          let signature = "";
          let stableHits = 0;
          updated = await waitUntil(() => {
            const live = currentPet();
            const samePet = live?.name && normalize(live.name) === normalize(beforePet.name);
            const levelIncreased = samePet && Number(live.level) > Number(beforePet.level);
            const expIncreased = samePet
              && Number.isFinite(Number(live.currentExp))
              && Number.isFinite(Number(beforePet.currentExp))
              && Number(live.currentExp) > Number(beforePet.currentExp);
            if (!samePet || (!levelIncreased && !expIncreased)) {
              signature = "";
              stableHits = 0;
              return null;
            }
            const next = [live.name, live.level, live.currentExp, live.upgradeExp].join("|");
            stableHits = next === signature ? stableHits + 1 : 1;
            signature = next;
            return stableHits >= 3 ? live : null;
          }, 20000, 250);
          if (!updated) {
            throw new Error(`${use.name} 点击后既未确认库存减少，也未确认目标宠物等级/经验增加；事务停止且不会重试`);
          }
          inventory = { ...inventory, [use.id]: Math.max(0, Number(inventory[use.id] || beforeCount) - 1) };
          if (Number(updated.level) < 40) {
            await openBag();
            inventory = await scanLiveExpInventory();
          }
        }
        pet = updated;

        operations += 1;
        logEvent("level/consumption-verified", {
          item: use.name,
          verificationSource,
          before: beforePet,
          estimatedAfter: updated,
          remainingInventory: inventory[use.id],
        });
        setTxStatus(`第 ${operations} 次经验道具使用已验证（${verificationSource}）：${petProgressLabel(updated)}。最终等级将在返回属性页后核验…`);
        await sleep(1800);
      }

      await closeBag();
      await openPetAttributes();
      const findLevel40Card = () => {
        const matches = Array.from(document.querySelectorAll(".user-left .ul .li,.user-left .li"))
          .filter(isRendered)
          .filter((card) => normalize(card.textContent).includes(normalize(pet.name)))
          .filter((card) => Number(String(card.innerText || card.textContent || "").match(/Lv\s*(\d+)/i)?.[1]) >= 40);
        return matches.length === 1 ? matches[0] : null;
      };
      let level40Card = await waitUntil(findLevel40Card, 15000, 250);
      if (!level40Card) {
        logEvent("level/final-card-refresh", { pet: pet.name, reason: "15 秒内卡片等级未刷新" });
        const refresh = exactAction(["点击刷新"]);
        if (refresh) await trustedClick(refresh, "刷新宠物资料以核验补级结果");
        await sleep(1800);
        await openPetAttributes();
        level40Card = await waitUntil(findLevel40Card, 45000, 250);
      }
      const authoritativePet = await waitForStableCurrentPet({ name: pet.name, element: pet.element }, 8000);
      if (!level40Card && !(Number(authoritativePet?.level) >= 40)) {
        throw new Error("经验道具已扣除，刷新并等待 60 秒后仍未确认目标宠物达到 Lv40；停止，请人工核对");
      }
      if (!level40Card) logEvent("level/card-stale-attribute-confirmed", { observed: authoritativePet });
      const expectedLevel40 = { ...pet, level: undefined, displayLevel: undefined, effectiveLevel: undefined };
      await selectCarriedPet(expectedLevel40, "补级目标");
      const after = await waitForStableCurrentPet(expectedLevel40, 30000);
      if (!after || after.level < 40) {
        throw new Error(`经验道具扣除完成，但强制刷新属性页后 30 秒内仍未确认 Lv40；停止，请人工核对`);
      }
      await refreshPlannerSnapshots({ refreshCurrentRole: true });
      finish(`补级事务完成：${after.name || "当前宠物"} 已确认 Lv${after.level}。请将副宠重新记录后再进行合成，本版不会自动串联。`);
    } catch (error) {
      finish(`补级事务停止：${error?.message || error}`, "error");
    }
  }

  async function waitForExpectedEvolutionCount(target, expectedEvolutionCount, timeout = 18000) {
    let stableSignature = "";
    let stableHits = 0;
    let lastCount = null;
    let identityMismatch = "";
    const observed = await waitUntil(() => {
      const visibleTexts = Array.from(document.querySelectorAll("uni-view,uni-text,span,p,div"))
        .filter(isVisible)
        .map((element) => String(element.innerText || element.textContent || "").trim().replace(/\s+/g, " "))
        .filter((text) => text.length > 0 && text.length <= 180);
      const countValues = visibleTexts
        .map((text) => text.match(/进化次数\s*[：:]\s*(\d+)/)?.[1])
        .filter((value) => value != null)
        .map(Number);
      const uniqueCounts = [...new Set(countValues)];
      const parsed = currentPet();
      if (parsed?.name && normalize(parsed.name) !== normalize(target.name)) {
        identityMismatch = parsed.name;
        return null;
      }
      if (uniqueCounts.length !== 1 || !Number.isInteger(uniqueCounts[0])) {
        stableSignature = "";
        stableHits = 0;
        return null;
      }
      const rawCount = uniqueCounts[0];
      lastCount = rawCount;
      if (rawCount !== Number(expectedEvolutionCount)) {
        stableSignature = "";
        stableHits = 0;
        return null;
      }
      const level = parsed?.level ?? Number(visibleTexts.map((text) => text.match(/等级\s*[：:]\s*(\d+)/)?.[1]).find(Boolean));
      const signature = `${target.name}|${level}|${rawCount}`;
      if (signature === stableSignature) stableHits += 1;
      else {
        stableSignature = signature;
        stableHits = 1;
      }
      return stableHits >= 3
        ? { ...(parsed || {}), pagePetName: parsed?.name || "", name: target.name, level, evolutionCount: rawCount }
        : null;
    }, timeout, 350);
    return { observed, lastCount, identityMismatch };
  }

  async function returnToPetAttributes(target, expectedEvolutionCount) {
    await closeBag();
    const leave = uniqueInteractable('uni-button[name="离开"]', "离开宠物神殿");
    await trustedClick(leave, "离开宠物神殿并核验进化次数");
    await openPetAttributes(target);
    let verification = await waitForExpectedEvolutionCount(target, expectedEvolutionCount);
    if (!verification.observed && !verification.identityMismatch) {
      logEvent("evolution/verification-refresh", {
        expectedEvolutionCount,
        lastObservedEvolutionCount: verification.lastCount,
        reason: "属性页仍是旧值或尚未完成异步加载",
      });
      const refresh = exactAction(["点击刷新"]);
      if (refresh) {
        await trustedClick(refresh, "刷新宠物资料以重读进化次数");
        await sleep(1800);
        await openPetAttributes(target);
        verification = await waitForExpectedEvolutionCount(target, expectedEvolutionCount, 30000);
      }
    }
    if (verification.identityMismatch) {
      throw new Error(`进化后属性页宠物从“${target.name}”变为“${verification.identityMismatch}”；目标不一致，停止`);
    }
    const observed = verification.observed;
    if (!observed) {
      throw new Error(`进化后“${target.name}”的进化次数仍为 ${verification.lastCount ?? "未读到"}，预期 ${expectedEvolutionCount}；等待并刷新后仍未验证到恰好 +1，停止`);
    }
    logEvent("evolution/verified", {
      name: observed.name,
      expectedEvolutionCount,
      observedEvolutionCount: observed.evolutionCount,
    });
    return observed;
  }

  async function evolveOnce() {
    begin("进化一次");
    try {
      requireConfirmation();
      await refreshBagSnapshot("进化预检");
      const state = planner.getState();
      const pet = state.mainPet;
      logEvent("evolution/preflight-snapshot", { pet, page: currentPageKind() });
      const preflight = core.validateEvolutionTransaction({ pet });
      if (!preflight.ok) throw new Error(preflight.reason);
      if (!pet.portraitKey) throw new Error("主宠快照缺少头像标识；请在宠物资料→属性页重新“锁定主宠”后再进入进化页");
      const readReadyEvolutionPage = () => {
        const pages = Array.from(document.querySelectorAll(".content-bor1")).filter(isInteractable);
        if (pages.length !== 1) return null;
        const candidate = pages[0];
        const petCount = Array.from(candidate.querySelectorAll(".left-box .li")).filter(isInteractable).length;
        const readyPaths = Array.from(candidate.querySelectorAll(".right-box > .item")).filter(isInteractable)
          .filter((item) => /强化丹[ABＡＢ]/.test(String(item.querySelector(".le")?.textContent || ""))).length;
        return petCount > 0 && readyPaths === 2 ? candidate : null;
      };
      let page = await waitUntil(readReadyEvolutionPage, 20000, 250);
      if (!page) {
        logEvent("evolution/page-reload", { reason: "20 秒内宠物列表或 A/B 路径未完整加载" });
        await openGodTempleTab("合成");
        await waitUntil(() => Array.from(document.querySelectorAll(".content-bor2")).find(isInteractable), 8000, 200);
        await openGodTempleTab("进化");
        page = await waitUntil(readReadyEvolutionPage, 30000, 250);
      }
      if (!page) throw new Error("进化页面 30 秒内未完成加载（宠物列表或 A/B 路径不完整）；未点击任何进化按钮");

      const petOptions = Array.from(page.querySelectorAll(".left-box .li")).filter(isInteractable)
        .map((element) => ({ element, portraitKey: portraitKeyFromElement(element) }));
      const targetOptions = petOptions.filter((option) => option.portraitKey === String(pet.portraitKey));
      logEvent("evolution/pet-options", {
        target: { name: pet.name, level: pet.level, evolutionCount: pet.evolutionCount, portraitKey: pet.portraitKey },
        options: petOptions.map(({ portraitKey }) => ({ portraitKey })),
        matchCount: targetOptions.length,
      });
      if (targetOptions.length !== 1) {
        throw new Error(`进化页无法按头像精确匹配“${pet.name}”（标识 ${pet.portraitKey}）；找到 ${targetOptions.length} 个候选`);
      }
      await trustedClick(targetOptions[0].element, `选择并设为主战进化目标 ${pet.name}`);
      const active = await waitUntil(() => targetOptions[0].element.isConnected
        && targetOptions[0].element.classList.contains("active"), 2200, 100);
      if (!active) throw new Error(`点击“${pet.name}”后未验证到目标宠物已选中；停止`);
      logEvent("evolution/main-battle-selected", { name: pet.name, portraitKey: pet.portraitKey });

      const inventory = state.inventory;
      if (!inventory) throw new Error("尚未记录背包，无法判断强化丹 A/B 库存；请先记录背包");
      const materials = [];
      if (Number(inventory.strengthA || 0) > 0) materials.push("强化丹A");
      if (Number(inventory.strengthB || 0) > 0) materials.push("强化丹B");
      if (!materials.length) throw new Error("背包快照中强化丹 A/B 均不足；不会尝试直接进化");
      logEvent("evolution/material-policy", {
        strengthA: Number(inventory.strengthA || 0),
        strengthB: Number(inventory.strengthB || 0),
        attempts: materials,
      });
      const outcomePattern = /(?:恭喜您[，,]?\s*宝贝进化成功|进化道具不足)[！!]{0,2}/;
      let material = "";
      let outcome = null;
      for (let index = 0; index < materials.length; index += 1) {
        material = materials[index];
        const paths = Array.from(page.querySelectorAll(".right-box > .item")).filter(isInteractable)
          .filter((item) => normalize(item.querySelector(".le")?.textContent).includes(normalize(`进化所需材料：${material}`)));
        if (paths.length !== 1) throw new Error(`进化页“${material}”路径应唯一，实际找到 ${paths.length} 条`);
        const action = uniqueInteractable(".ri", `${material} 进化按钮`, paths[0]);
        logEvent("evolution/path-selected", { material, pathCount: paths.length, action: elementDiagnostic(action) });
        setTxStatus(`进化预检通过：${pet.name} Lv${pet.level}，进化次数 ${pet.evolutionCount}/10；尝试 ${material}…`);
        const beforeOutcome = outcomeSnapshot(outcomePattern);
        await trustedClick(action, `使用 ${material} 进化一次`);
        outcome = await waitUntil(() => {
          const added = newOutcomes(beforeOutcome, outcomePattern).sort((a, b) => a.length - b.length);
          const text = added[0] || "";
          return text ? { text, success: /进化成功/.test(text), insufficient: /进化道具不足/.test(text) } : null;
        }, 18000, 250);
        logEvent("evolution/result-message", { material, outcome });
        if (outcome?.success) break;
        if (outcome?.insufficient && material === "强化丹A" && materials[index + 1] === "强化丹B") {
          logEvent("evolution/material-fallback", { from: "强化丹A", to: "强化丹B", reason: outcome.text });
          setTxStatus("强化丹 A 被页面判定不足，按策略改用强化丹 B；只再尝试一次…");
          continue;
        }
        if (outcome?.insufficient) throw new Error(`${material} 被页面判定不足；未执行进化`);
        break;
      }
      await sleep(outcome?.success ? 2600 : 1200);
      const observed = await returnToPetAttributes(pet, preflight.expectedEvolutionCount);
      await refreshPlannerSnapshots({ refreshCurrentRole: true });
      finish(`进化一次已验证：${observed.name} 的进化次数 ${pet.evolutionCount} → ${observed.evolutionCount}（使用 ${material}）。未自动继续。`);
    } catch (error) {
      finish(`进化事务停止：${error?.message || error}`, "error");
    }
  }

  function synthesisSelectionSignature() {
    return [
      ...Array.from(document.querySelectorAll(".content-bor2 .pet-text")),
      ...Array.from(document.querySelectorAll(".content-bor2 .mat-text")),
    ].map((node) => String(node.textContent || "").trim()).join("|");
  }

  async function openGodTempleTab(label) {
    const tabs = Array.from(document.querySelectorAll(".nav-box uni-button.btn1, .nav-box .btn1"))
      .filter(isInteractable)
      .filter((element) => normalize(element.textContent) === normalize(label));
    if (tabs.length !== 1) throw new Error(`刷新合成页时“${label}”标签应唯一，实际 ${tabs.length} 个`);
    await trustedClick(tabs[0], `切换到${label}页`);
  }

  async function prepareSynthesisSelections(state, config) {
    const selectedMain = await selectRecordedPet(0, state.mainPet, "主宠");
    if (!Number.isFinite(selectedMain.level) || selectedMain.level < 40) throw new Error(`合成页实时主宠等级为 Lv${selectedMain.level || "未知"}，必须达到 Lv40`);
    await activateSelectedSynthesisMain(state.mainPet);
    const selectedDeputy = await selectRecordedPet(1, state.deputyPet, "副宠");
    if (!Number.isFinite(selectedDeputy.level) || selectedDeputy.level < 40) throw new Error(`合成页实时副宠等级为 Lv${selectedDeputy.level || "未知"}，必须达到 Lv40`);
    logEvent("synthesis/live-levels-confirmed", { main: selectedMain, deputy: selectedDeputy });
    const guardPreferences = boundFirstMaterialPreferences(config.useSupremeStone
      ? "至尊神石" : (config.guardMaterialName || "天神之石"));
    const guardName = await selectMaterial(0, guardPreferences, "守护材料");
    const auxiliaryName = await selectMaterial(1,
      boundFirstMaterialPreferences(config.auxiliaryMaterialName || "★★★成长魂石"), "辅助材料");
    return { guardName, auxiliaryName, selectedMain, selectedDeputy };
  }

  async function refreshSynthesisAfterFailure(state, config) {
    setTxStatus("已确认合成失败；等待 12 秒让失败页和服务器冷却完成，再重新进入神殿并恢复选择…", "warn");
    logEvent("synthesis/failure-cooldown-start", { milliseconds: 12000 });
    await sleep(12000);
    await openSynthesisPage();
    await sleep(1500);
    await prepareSynthesisSelections(state, config);
    logEvent("synthesis/failure-page-refreshed", {
      main: state.mainPet.name, deputy: state.deputyPet.name, cooldownMs: 12000,
    });
  }

  async function synthesizeOnce({ refreshInventory = true, reusePreparedPage = false } = {}) {
    begin("合成一次");
    try {
      requireConfirmation();
      if (refreshInventory) {
        await refreshBagSnapshot("合成预检");
        setTxStatus("背包预检完成，正在按“中心城镇→右箭头→宠物神殿→合成”重新进入合成页…");
      } else {
        logEvent("synthesis/inventory-refresh-skipped", { reason: "同一副宠合成失败后的安全重试" });
        setTxStatus("沿用本轮已核验的背包和材料快照，不重复扫描背包；正在恢复合成页…");
      }
      if (reusePreparedPage) {
        const ready = await waitForStableSynthesisPage(10000);
        if (!ready) await openSynthesisPage();
        else logEvent("synthesis/prepared-page-reused", { reason: "失败页已完成冷却并恢复选择" });
      } else await openSynthesisPage();
      const state = planner.getState();
      const config = planner.getConfig();
      uniqueInteractable(".content-bor2", "合成页面");
      const formulaMode = config.mode === "formula";
      const transactionMainPet = state.mainPet;
      const preflight = core.validateSynthesisTransaction({ mainPet: transactionMainPet, deputyPet: state.deputyPet, inventory: state.inventory, config });
      if (!preflight.ok) throw new Error(preflight.reason);
      const mainTierLabel = formulaMode ? `${transactionMainPet.tier}阶（公式模式不限阶）` : `${transactionMainPet.tier}阶`;
      setTxStatus(`合成预检通过：主宠 ${transactionMainPet.name} Lv${transactionMainPet.level}/${mainTierLabel}；副宠 ${state.deputyPet.name} Lv${state.deputyPet.level}/${state.deputyPet.tier}阶。正在核验页面下拉项…`);

      const { guardName, auxiliaryName } = await prepareSynthesisSelections(state, config);

      if (!config.useSupremeStone && /至尊神石/.test(guardName)) {
        throw new Error("至尊神石开关关闭，但页面选择结果为至尊神石；状态不一致，停止");
      }
      if (config.useSupremeStone && !/至尊神石/.test(guardName)) {
        throw new Error("至尊神石开关开启且资格预检通过，但页面未选中至尊神石；状态不一致，停止");
      }

      const action = uniqueInteractable('uni-button[name="开始合成"]', "开始合成按钮");
      const beforeResultMessage = readSynthesisResultMessage();
      const beforeSignature = synthesisSelectionSignature();
      setTxStatus(`已核验：主宠 ${transactionMainPet.name}；副宠 ${state.deputyPet.name}；守护 ${guardName}；辅助 ${auxiliaryName}。即将只点击一次“开始合成”…`);
      await trustedClick(action, "执行一次宠物合成");

      const result = await waitUntil(() => {
        const text = readSynthesisResultMessage();
        if (!text || text === beforeResultMessage) return null;
        return { text, success: /合成成功/.test(text) };
      }, 25000, 240);
      if (!result) throw new Error("已点击一次合成，但 25 秒内未读到唯一的“合成成功/合成失败”页面消息；停止且不会重试");
      logEvent("synthesis/verified", { ...result, selectionChanged: synthesisSelectionSignature() !== beforeSignature });
      if (!result.success) {
        setTxStatus(`已确认合成失败：${result.text}。正在按“进化→合成”刷新并恢复本次主副宠和材料选择…`, "warn");
        await refreshSynthesisAfterFailure(state, config);
      }
      await refreshPlannerSnapshots();
      finish(`合成一次结果已验证：${result.success ? "成功" : "失败"}；页面消息“${result.text}”。${result.success ? "未自动继续。" : "合成页已刷新并恢复选择，未自动再次合成。"}`, result.success ? "success" : "warn");
    } catch (error) {
      finish(`合成事务停止：${error?.message || error}`, "error");
    }
  }

  async function clickNamedButton(name, label = name) {
    const button = await waitUntil(() => {
      const matches = Array.from(document.querySelectorAll(`uni-button[name="${name}"]`)).filter(isInteractable);
      return matches.length === 1 ? matches[0] : null;
    }, 12000, 200);
    if (!button) throw new Error(`导航失败：未找到唯一可点击的“${label}”`);
    await trustedClick(button, `导航到${label}`);
  }

  async function openPetAttributes(expectedPet = null) {
    const alreadyOnPetPage = currentPageKind() === "pet-attributes"
      || Boolean(document.querySelector(".user-left .ul,.user-left")
        && Array.from(document.querySelectorAll('uni-button[name="属性"],[name="属性"]')).some(isVisible));
    if (!alreadyOnPetPage) await clickNamedButton("宠物资料");
    const page = await waitUntil(() => {
      const cards = Array.from(document.querySelectorAll(".user-left .ul .li,.user-left .li"))
        .filter(isRendered)
        .filter((card) => normalize(card.textContent).includes("Lv"));
      return document.querySelector(".user-right") && cards.length > 0 ? true : null;
    }, 30000, 250);
    if (!page) throw new Error("宠物资料页面 30 秒内未加载出宠物卡片");
    const attributeTab = await waitUntil(() => {
      const matches = Array.from(document.querySelectorAll('[name="属性"],uni-button,uni-view,uni-text,span,div'))
        .filter(isVisible)
        .filter((element) => {
          const text = normalize(element.textContent);
          return element.getAttribute?.("name") === "属性" || text === "属性";
        })
        .sort((a, b) => a.getBoundingClientRect().width * a.getBoundingClientRect().height
          - b.getBoundingClientRect().width * b.getBoundingClientRect().height);
      return matches[0] || null;
    }, 5000, 150);
    if (!attributeTab) {
      const nav = Array.from(document.querySelectorAll(".user-right *,.content *"))
        .filter(isVisible).map((element) => ({ tag: element.tagName, className: String(element.className || ""), name: element.getAttribute?.("name"), text: String(element.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40) }))
        .filter((item) => /属性|带领的宠物|技能/.test(item.text)).slice(0, 30);
      logEvent("automation/attribute-tab-not-found", { nav });
      throw new Error("宠物资料页未找到“属性”标签；已记录导航节点诊断");
    }
    logEvent("automation/attribute-tab-found", { element: elementDiagnostic(attributeTab) });
    await trustedClick(attributeTab, "打开宠物属性页");
    const attributesReady = await waitUntil(() => /等级\s*[：:]\s*\d+/.test(bodyText())
      && /成长\s*[：:]\s*\d/.test(bodyText())
      && /当前经验\s*[：:]/.test(bodyText())
      && /升级经验\s*[：:]/.test(bodyText()) ? true : null, 12000, 200);
    if (!attributesReady) throw new Error("宠物属性页 12 秒内未加载等级、成长和经验字段");
    const stablePet = await waitForStableCurrentPet(expectedPet, 30000);
    if (!stablePet) {
      logEvent("automation/pet-attributes-unstable", {
        expectedPet,
        observed: currentPet(),
        page: currentPageKind(),
      });
      throw new Error("宠物属性页已打开，但 30 秒内未稳定读取到目标宠物资料");
    }
    logEvent("automation/pet-attributes-ready", { expectedPet, observed: stablePet });
    return stablePet;
  }

  async function selectCarriedPet(target, roleLabel) {
    const cards = await waitUntil(() => {
      const values = Array.from(document.querySelectorAll(".user-left .ul .li,.user-left .li"))
        .filter(isRendered)
        .filter((card) => normalize(card.textContent).includes("Lv"));
      return values.length ? values : null;
    }, 30000, 250);
    if (!cards) throw new Error(`${roleLabel}主战切换：宠物卡片 30 秒内未加载`);
    const nameMatches = cards.filter((card) => normalize(card.textContent).includes(normalize(target.name)));
    const portraitMatches = nameMatches.filter((card) => {
      const text = normalize(card.textContent);
      const portrait = portraitKeyFromElement(card);
      return text.includes(normalize(target.name)) && target.portraitKey && portrait === String(target.portraitKey);
    });
    const identityMatches = portraitMatches.length ? portraitMatches : nameMatches;
    const levelMatches = identityMatches.filter((card) => normalize(card.textContent).includes(normalize(`Lv${target.level}`)));
    const matches = levelMatches.length === 1 ? levelMatches : identityMatches;
    if (matches.length !== 1) {
      const observed = cards.map((card) => ({ text: String(card.textContent || "").trim().replace(/\s+/g, " "), portraitKey: portraitKeyFromElement(card) }));
      logEvent("automation/carried-pet-match-failed", { role: roleLabel, target, observed, matchCount: matches.length });
      throw new Error(`${roleLabel}主战切换无法唯一匹配 ${target.name}，找到 ${matches.length} 张卡片；页面卡片：${observed.map((item) => `${item.text}[${item.portraitKey || "无头像标识"}]`).join("、")}`);
    }
    const card = matches[0];
    if (!card.classList.contains("active")) await trustedClick(card, `选中${roleLabel} ${target.name}`);
    const active = await waitUntil(() => card.isConnected && card.classList.contains("active") ? card : null, 5000, 150);
    if (!active) throw new Error(`${roleLabel} ${target.name} 点击后未成为当前选中宠物`);
    const currentMainName = () => bodyText().match(/宝贝\s*[：:]\s*([^\s]+)/)?.[1] || "";
    if (normalize(currentMainName()) !== normalize(target.name)) {
      const mainBattle = exactAction(["主战"]);
      if (!mainBattle) throw new Error(`${roleLabel} ${target.name} 已选中，但未找到唯一“主战”按钮`);
      await trustedClick(mainBattle, `将${roleLabel} ${target.name} 设为主战宠物`);
      const switched = await waitUntil(() => normalize(currentMainName()) === normalize(target.name) ? true : null, 8000, 200);
      if (!switched) throw new Error(`${roleLabel} ${target.name} 点击“主战”后，玩家宝贝字段未切换`);
    }
    const refreshedCard = await waitUntil(() => {
      const refreshed = Array.from(document.querySelectorAll(".user-left .ul .li,.user-left .li"))
        .filter(isRendered)
        .filter((item) => normalize(item.textContent).includes(normalize(target.name)));
      return refreshed.length === 1 ? refreshed[0] : null;
    }, 5000, 150);
    if (!refreshedCard) throw new Error(`${roleLabel} ${target.name} 主战切换后未重新加载唯一宠物卡片`);
    const refreshedLevel = Number(String(refreshedCard.innerText || refreshedCard.textContent || "").match(/Lv\s*(\d+)/i)?.[1]);
    const expectedLivePet = Number.isInteger(refreshedLevel)
      ? { ...target, level: refreshedLevel, displayLevel: refreshedLevel, cc: undefined, evolutionCount: undefined }
      : { ...target, cc: undefined, evolutionCount: undefined };
    if (!refreshedCard.classList.contains("active") || !petMatchesExpected(currentPet(), expectedLivePet)) {
      await trustedClick(refreshedCard, `重新选中${roleLabel} ${target.name} 以刷新属性`);
    }
    const stablePet = await waitForStableCurrentPet(expectedLivePet, 30000);
    if (!stablePet) throw new Error(`${roleLabel} ${target.name} 已选为主战，但属性区未与卡片名称和等级稳定一致`);
    logEvent("automation/main-battle-selected", {
      role: roleLabel,
      name: target.name,
      level: stablePet.level,
      portraitKey: portraitKeyFromElement(refreshedCard),
      observed: stablePet,
    });
    return refreshedCard;
  }

  async function readLockedMainLive(roleLabel = "培养停止值复核") {
    const locked = planner.getState().mainPet;
    await openPetAttributes();
    await selectCarriedPet(locked, roleLabel);
    const liveMain = planner.scanMainPet();
    if (!liveMain?.name || normalize(liveMain.name) !== normalize(locked?.name)) {
      throw new Error(`培养停止值复核失败：预期主宠 ${locked?.name || "未知"}，实际读取 ${liveMain?.name || "未知"}`);
    }
    return liveMain;
  }

  function targetCcReached(main, stopCc, phase, cycle = runtime.autoCycle) {
    const currentCc = Number(main?.cc);
    const reached = Number.isFinite(stopCc) && Number.isFinite(currentCc) && currentCc >= stopCc;
    logEvent("automation/target-cc-check", {
      phase,
      cycle,
      main: main?.name || "",
      currentCc,
      stopCc,
      reached,
    });
    return reached;
  }

  async function ensureLockedMainReady() {
    const locked = planner.getState().mainPet;
    await openPetAttributes();
    const selectedCard = await selectCarriedPet(locked, "主宠");
    const selectedCardLevel = Number(String(selectedCard.innerText || selectedCard.textContent || "").match(/Lv\s*(\d+)/i)?.[1]);
    const expectedLiveMain = Number.isInteger(selectedCardLevel)
      ? { ...locked, level: selectedCardLevel, displayLevel: selectedCardLevel, cc: undefined, evolutionCount: undefined }
      : { ...locked, cc: undefined, evolutionCount: undefined };
    let liveMain = await waitForStableCurrentPet(expectedLiveMain);
    if (!liveMain) throw new Error(`主宠 ${locked?.name || "未知"} 选中后属性资料未稳定加载`);
    planner.scanMainPet();
    if (Number(liveMain.level) < 40) {
      setTxStatus(`自动循环：锁定主宠 ${liveMain.name} 当前 Lv${liveMain.level}，先补到 Lv40，再继续当前检查点…`);
      runtime.lastResult = null;
      await levelTo40Once(liveMain);
      if (!transactionSucceeded()) throw new Error(runtime.lastResult?.message || "主宠补级失败");
      bumpAutoStat("carriedMainPetsLeveled");
      await openPetAttributes({ ...liveMain, level: 40 });
      await selectCarriedPet({ ...liveMain, level: 40 }, "主宠");
      liveMain = await waitForStableCurrentPet({ ...liveMain, level: 40 });
      planner.scanMainPet();
    }
    if (Number(liveMain?.level) < 40) throw new Error(`主宠补级后仍未确认至少达到 Lv40`);
    logEvent("automation/main-ready", { main: liveMain });
    return liveMain;
  }

  async function openPasture() {
    const alreadyInPasture = Boolean(document.querySelector(".page-box .cont-box .ul")
      && /牧场宠物数量\s*[：:]/.test(bodyText()));
    if (!alreadyInPasture) await clickNamedButton("中心城镇");
    if (!alreadyInPasture) {
      const town = await waitUntil(() => Array.from(document.querySelectorAll('uni-button[name="牧场"]'))
        .filter(isExposedInteractable).length === 1 ? true : null, 12000, 200);
      if (!town) throw new Error("中心城镇页面未加载牧场入口");
      await clickNamedButton("牧场");
    }
    const pasture = await waitUntil(() => {
      const count = Number(bodyText().match(/牧场宠物数量\s*[：:]\s*(\d+)\s*\/\s*\d+/)?.[1]);
      const rows = document.querySelectorAll(".page-box .cont-box:first-child .ul .li,.page-box .page_left .ul .li");
      const carried = carriedPetCount();
      return Number.isInteger(count) && count > 0 && rows.length > 0 && Number.isInteger(carried) && carried >= 1
        ? { count, rows: rows.length, carried }
        : null;
    }, 30000, 250);
    if (!pasture) throw new Error("牧场页面 30 秒内未完成异步加载（宠物数量、列表行或携带数量仍未就绪）");
    logEvent("automation/pasture-ready", pasture);
    await sleep(500);
  }

  function carriedPetCount() {
    return Number(bodyText().match(/当前携带宠物数量\s*[：:]\s*(\d+)\s*\/\s*\d+/)?.[1]);
  }

  function pastureRows() {
    const list = document.querySelectorAll(".page-box .cont-box")[0]?.querySelector(".ul");
    return Array.from(list?.querySelectorAll(".li") || []).filter(isRendered)
      .map((element, pastureIndex) => ({
        element,
        pastureIndex,
        pet: core.parsePastureRow(String(element.innerText || element.textContent || "").trim()),
      }))
      .filter((entry) => entry.pet)
      .map((entry) => ({ ...entry, pet: { ...entry.pet, pastureIndex: entry.pastureIndex } }));
  }

  function deputyEligibleForMode(pet, config) {
    const tier = Number(pet?.tier);
    if (!Number.isInteger(tier) || tier < 1 || tier > Number(config.pastureMaxTier || 8)) return false;
    if (config.mode === "partial") return tier === 10;
    if (config.mode === "full") return tier <= 8;
    return true;
  }

  function samePasturePet(a, b) {
    return a && b
      && normalize(a.name) === normalize(b.name)
      && Number(a.tier) === Number(b.tier)
      && Number(a.level) === Number(b.level)
      && Math.abs(Number(a.cc) - Number(b.cc)) < 0.001
      && normalize(a.element) === normalize(b.element);
  }

  function samePastureIdentity(a, b) {
    return a && b
      && normalize(a.name) === normalize(b.name)
      && Number(a.tier) === Number(b.tier)
      && Math.abs(Number(a.cc) - Number(b.cc)) < 0.001
      && normalize(a.element) === normalize(b.element);
  }

  function resolveCheckpointPastureEntry(rows, target) {
    const savedIndex = Number(target?.pastureIndex);
    const indexed = Number.isInteger(savedIndex)
      ? rows.find((entry) => entry.pastureIndex === savedIndex)
      : null;
    if (indexed && samePasturePet(indexed.pet, target)) {
      logEvent("automation/checkpoint-pasture-index-restored", {
        pastureIndex: savedIndex,
        identicalPetCount: rows.filter((entry) => samePasturePet(entry.pet, target)).length,
        pet: indexed.pet,
      });
      return indexed;
    }
    const exact = rows.filter((entry) => samePasturePet(entry.pet, target));
    if (exact.length === 1) {
      logEvent("automation/checkpoint-pasture-identity-restored", {
        previousPastureIndex: target?.pastureIndex,
        pastureIndex: exact[0].pastureIndex,
        pet: exact[0].pet,
      });
      return exact[0];
    }
    if (exact.length > 1) {
      throw new Error(`旧检查点副宠 ${target.name} 有 ${exact.length} 只完全相同宠物，且已保存索引 ${target?.pastureIndex ?? "无"} 不再对应目标，无法安全恢复`);
    }
    return null;
  }

  function choosePastureEntry(rows, config, target = null) {
    if (target) {
      const identity = rows.filter((entry) => samePastureIdentity(entry.pet, target));
      const byIndex = identity.find((entry) => entry.pastureIndex === Number(target.pastureIndex));
      if (byIndex) return byIndex;
      const exactLevel = identity.filter((entry) => Number(entry.pet.level) === Number(target.level));
      if (exactLevel.length === 1) return exactLevel[0];
      const progressed = identity.filter((entry) => Number(entry.pet.level) > Number(target.level));
      if (progressed.length === 1) return progressed[0];
      if (identity.length === 1) return identity[0];
      throw new Error(`牧场无法唯一恢复目标副宠 ${target.name}；稳定身份匹配到 ${identity.length} 行`);
    }
    return rows.filter((entry) => deputyEligibleForMode(entry.pet, config))
      .sort((a, b) => Number(a.pet.tier) - Number(b.pet.tier)
        || Number(a.pet.cc) - Number(b.pet.cc)
        || Number(a.pastureIndex) - Number(b.pastureIndex))[0] || null;
  }

  function pastureUpgradeModal() {
    return Array.from(document.querySelectorAll(".sell-modal")).filter(isRendered)[0] || null;
  }

  function pastureModalLevel(modal = pastureUpgradeModal()) {
    const text = String(modal?.innerText || modal?.textContent || "");
    return Number(text.match(/当前选中的升级宠物[\s\S]{0,80}?(?:LV|Lv|等级)\s*[：:]?\s*(\d{1,3})/i)?.[1]);
  }

  function pastureModalItemRows(itemId, modal = pastureUpgradeModal()) {
    const aliases = aliasesFor(itemId);
    return Array.from(modal?.querySelectorAll(".modal-content .li") || []).filter(isRendered)
      .filter((element) => aliases.some((alias) => String(element.textContent || "").includes(alias)))
      .map((element) => ({
        element,
        text: String(element.innerText || element.textContent || "").trim(),
        count: Number(String(element.innerText || element.textContent || "").match(/剩余\s*(\d+)/)?.[1]),
        bound: isBoundResourceText(element.innerText || element.textContent),
      }))
      .filter((row) => Number.isFinite(row.count))
      .sort((a, b) => Number(b.bound) - Number(a.bound) || a.text.length - b.text.length);
  }

  function sameBindingRows(rows, bound) {
    return rows.filter((row) => Boolean(row.bound) === Boolean(bound));
  }

  function pastureEntryForTarget(target) {
    return choosePastureEntry(pastureRows(), planner.getConfig(), target);
  }

  async function closePastureUpgradeModal() {
    const modal = pastureUpgradeModal();
    if (!modal) return;
    const close = Array.from(modal.querySelectorAll("button,uni-button,[role=button]"))
      .filter(isInteractable).find((element) => normalize(element.textContent) === normalize("关闭"));
    if (!close) throw new Error("牧场升级弹窗已打开，但未找到关闭按钮");
    await trustedClick(close, "关闭牧场升级弹窗");
    if (!await waitUntil(() => pastureUpgradeModal() ? null : true, 5000, 150)) throw new Error("牧场升级弹窗未关闭");
  }

  async function openPastureUpgradeModal(target) {
    await openPasture();
    let entry = choosePastureEntry(pastureRows(), planner.getConfig(), target);
    entry.element.scrollIntoView({ block: "center", inline: "nearest" });
    await sleep(220);
    await trustedClick(entry.element, `选择牧场待升级宠物 ${entry.pet.name}`);
    const upgrade = exactAction(["升级"]);
    if (!upgrade) throw new Error("牧场未找到唯一“升级”按钮");
    await trustedClick(upgrade, `打开 ${entry.pet.name} 的牧场升级弹窗`);
    const modal = await waitUntil(() => pastureUpgradeModal(), 8000, 180);
    if (!modal) throw new Error("牧场升级弹窗 8 秒内未出现");
    const footer = normalize(modal.textContent);
    if (!footer.includes(normalize(entry.pet.name))) throw new Error(`牧场升级弹窗目标不是 ${entry.pet.name}`);
    return { entry, modal };
  }

  async function upgradePasturePet(target, inventory) {
    const config = planner.getConfig();
    let { entry, modal } = await openPastureUpgradeModal(target);
    let liveLevel = pastureModalLevel(modal) || Number(entry.pet.level);
    const initialLevel = liveLevel;
    if (liveLevel >= 40) {
      await closePastureUpgradeModal();
      return {
        pet: { ...entry.pet, level: liveLevel, displayLevel: liveLevel },
        upgraded: false,
        initialLevel,
        verifiedUses: 0,
      };
    }
    const targetW = core.pastureRemainingW(liveLevel, config.level1To40ExpW);
    const safeInventory = core.pastureSafeInventory(inventory, liveLevel, targetW);
    const fixedPlan = core.planExperience(safeInventory, targetW);
    if (!fixedPlan.ok) throw new Error(`牧场副宠 ${entry.pet.name} Lv${liveLevel} 补级计划失败：${fixedPlan.reason}`);
    const fixedSteps = fixedPlan.uses.flatMap((use) => Array.from({ length: use.count }, () => ({ ...use, count: 1 })));
    logEvent("pasture-upgrade/pet-fixed-plan", { pet: entry.pet, liveLevel, targetW, fixedPlan });
    let operations = 0;
    while (liveLevel < 40 && operations < fixedSteps.length) {
      if (!pastureUpgradeModal()) ({ entry, modal } = await openPastureUpgradeModal(entry.pet));
      else modal = pastureUpgradeModal();
      const use = fixedSteps[operations];
      logEvent("pasture-upgrade/fixed-plan-step", {
        pet: entry.pet, liveLevel, step: operations + 1, totalSteps: fixedSteps.length, use,
      });
      const rows = pastureModalItemRows(use.id, modal);
      if (!rows.length) throw new Error(`牧场升级弹窗未找到 ${use.name}`);
      const chosen = rows[0];
      const sameVariant = sameBindingRows(rows, chosen.bound);
      if (sameVariant.length !== 1) {
        throw new Error(`牧场升级弹窗无法唯一定位${chosen.bound ? "绑定" : "非绑定"}${use.name}，找到 ${sameVariant.length} 项`);
      }
      const beforeCount = chosen.count;
      const beforeLevel = pastureModalLevel(modal) || liveLevel;
      chosen.element.scrollIntoView({ block: "center", inline: "nearest" });
      await sleep(260);
      const freshRows = sameBindingRows(pastureModalItemRows(use.id, pastureUpgradeModal()), chosen.bound);
      if (freshRows.length !== 1 || !isInteractable(freshRows[0].element)) {
        throw new Error(`${use.name} 滚动后目标行发生变化；已停止且不会误点其他道具`);
      }
      await trustedClick(freshRows[0].element, `牧场副宠使用${chosen.bound ? "绑定" : "非绑定"}${use.name}（单次）`);
      let verified = await waitUntil(() => {
        const currentModal = pastureUpgradeModal();
        if (!currentModal) return { modalClosed: true };
        const afterRows = sameBindingRows(pastureModalItemRows(use.id, currentModal), chosen.bound);
        const afterCount = afterRows.length === 0 ? 0 : afterRows.length === 1 ? afterRows[0].count : null;
        const afterLevel = pastureModalLevel(currentModal);
        if (Number.isFinite(afterCount) && afterCount === beforeCount - 1) return { afterCount, afterLevel };
        if (Number.isInteger(afterLevel) && afterLevel > beforeLevel) return { afterCount, afterLevel };
        return null;
      }, 9000, 180);
      if (verified?.modalClosed) {
        const refreshed = await waitUntil(() => {
          const current = pastureEntryForTarget(entry.pet);
          return Number(current?.pet.level) > beforeLevel ? current : null;
        }, 1500, 180);
        if (refreshed) {
          entry = refreshed;
          modal = null;
          verified = { modalClosed: true, afterLevel: Number(refreshed.pet.level), levelChanged: true };
        } else {
          ({ entry, modal } = await openPastureUpgradeModal(entry.pet));
          const afterRows = sameBindingRows(pastureModalItemRows(use.id, modal), chosen.bound);
          const afterCount = afterRows.length === 0 ? 0 : afterRows.length === 1 ? afterRows[0].count : null;
          const afterLevel = pastureModalLevel(modal);
          if (!(afterCount === beforeCount - 1 || (Number.isInteger(afterLevel) && afterLevel > beforeLevel))) {
            throw new Error(`${use.name} 点击后弹窗关闭，但等待并重开后仍无法验证${chosen.bound ? "绑定" : "非绑定"}库存 -1 或等级增加`);
          }
          verified = { afterCount, afterLevel, reopened: true };
        }
      }
      const inventoryDecrementVerified = Number.isFinite(Number(verified?.afterCount))
        && Number(verified.afterCount) === beforeCount - 1;
      if (!inventoryDecrementVerified && Number(verified?.afterLevel) <= beforeLevel && Number(use.expW) >= 20) {
        const synced = await waitUntil(() => {
          const modalLevel = pastureModalLevel();
          if (Number(modalLevel) > beforeLevel) return { afterLevel: Number(modalLevel), source: "modal" };
          const current = pastureEntryForTarget(entry.pet);
          return Number(current?.pet.level) > beforeLevel
            ? { afterLevel: Number(current.pet.level), source: "pasture-row", entry: current }
            : null;
        }, 6000, 220);
        if (synced) {
          verified = { ...verified, ...synced };
          if (synced.entry) entry = synced.entry;
        }
      }
      const nextLevel = Number.isInteger(verified?.afterLevel) ? verified.afterLevel : beforeLevel;
      if (nextLevel > liveLevel) liveLevel = nextLevel;
      inventory[use.id] = Math.max(0, Number(inventory[use.id] || 0) - 1);
      operations += 1;
      logEvent("pasture-upgrade/consumption-verified", {
        pet: entry.pet, item: use.name, bound: chosen.bound, beforeCount, beforeLevel, after: verified,
      });
      setTxStatus(`牧场补级：${entry.pet.name} Lv${liveLevel}；固定组合第 ${operations}/${fixedSteps.length} 步已验证…`);
    }
    await closePastureUpgradeModal();
    const level40 = await waitUntil(() => {
      const match = choosePastureEntry(pastureRows(), config, entry.pet);
      return Number(match?.pet.level) >= 40 ? match : null;
    }, 12000, 250);
    if (!level40) throw new Error(`牧场经验消耗完成，但 ${entry.pet.name} 的列表等级未确认达到 Lv40`);
    logEvent("pasture-upgrade/pet-complete", { before: entry.pet, after: level40.pet });
    return {
      pet: level40.pet,
      upgraded: initialLevel < 40 && operations > 0 && Number(level40.pet.level) >= 40,
      initialLevel,
      verifiedUses: operations,
    };
  }

  function pastureRowKey(pet) {
    return [pet?.pastureIndex, normalize(pet?.name), pet?.tier, pet?.element, pet?.cc].join("|");
  }

  async function upgradePastureDeputiesInternal(requestedCount) {
    await openPasture();
    const config = planner.getConfig();
    const inventory = { ...(planner.getState().inventory || {}) };
    const completed = [];
    const completedRows = new Set();
    for (let index = 0; index < requestedCount; index += 1) {
      const pets = planner.scanPasture().filter((pet) => !completedRows.has(pastureRowKey(pet)));
      const plan = core.planPastureUpgrades({
        pasturePets: pets,
        inventory,
        maxTier: config.pastureMaxTier,
        count: 1,
        targetW: config.level1To40ExpW,
      });
      const selected = plan.selectedPlans[0];
      if (!selected) throw new Error(plan.reason || `完成 ${completed.length} 只后，没有可执行的下一只牧场副宠补级计划`);
      try {
        const result = await upgradePasturePet(selected.pet, inventory);
        if (!result.upgraded) {
          throw new Error(
            `计划目标 ${selected.pet.name} 为 Lv${selected.pet.level}，但实际打开的牧场行已是 Lv${result.pet.level}；`
            + "本次未计入完成数，已停止以避免重复跳过",
          );
        }
        completed.push(result.pet);
        completedRows.add(pastureRowKey(result.pet));
        logEvent("pasture-upgrade/completed-counted", {
          requestedCount,
          completedCount: completed.length,
          pet: result.pet,
          initialLevel: result.initialLevel,
          verifiedUses: result.verifiedUses,
        });
      } catch (error) {
        planner.storeBagInventory(inventory);
        throw error;
      }
      planner.scanPasture();
      planner.storeBagInventory(inventory);
    }
    return completed;
  }

  async function upgradePastureDeputiesOnce() {
    begin("牧场副宠补级");
    try {
      requireConfirmation();
      if (!planner.getState().mainPet) throw new Error("请先在宠物资料属性页锁定主宠");
      await refreshBagSnapshot("pasture-upgrade/preflight");
      const count = planner.getConfig().pastureUpgradeCount;
      const completed = await upgradePastureDeputiesInternal(count);
      finish(`牧场副宠补级完成：请求 ${count} 只，实际完成 ${completed.length} 只从低于 Lv40 升至 Lv40。主战宠物未改变。`, "success");
    } catch (error) {
      try { await closePastureUpgradeModal(); } catch (_) {}
      finish(`牧场副宠补级停止：${error?.message || error}`, "error");
    }
  }

  async function withdrawNextDeputy(target = null) {
    const config = planner.getConfig();
    const rows = pastureRows();
    const entry = choosePastureEntry(rows, config, target);
    if (!entry) {
      logEvent("automation/pasture-candidates-empty", { mode: config.mode, rowCount: rows.length, rows: rows.slice(0, 12).map((entry) => entry.pet) });
      throw new Error(`牧场已加载 ${rows.length} 行，但没有符合当前模式的副宠候选`);
    }
    const chosen = entry.pet;
    const beforeCount = await waitUntil(() => {
      const value = carriedPetCount();
      return Number.isInteger(value) ? { value } : null;
    }, 15000, 250).then((result) => result?.value);
    const beforePastureCount = Number(bodyText().match(/牧场宠物数量\s*[：:]\s*(\d+)\s*\/\s*\d+/)?.[1]);
    const beforeRows = rows.length;
    const beforeIdentityCount = rows.filter((row) => samePasturePet(row.pet, chosen)).length;
    if (!Number.isInteger(beforeCount) || beforeCount < 1 || beforeCount >= 3) throw new Error(`当前携带宠物数量 ${Number.isInteger(beforeCount) ? beforeCount : "未知"}/3，不适合自动取出副宠`);
    entry.element.scrollIntoView({ block: "center", inline: "nearest" });
    await sleep(250);
    if (!isInteractable(entry.element)) throw new Error(`牧场候选 ${chosen.name} 滚动后仍不可点击`);
    await trustedClick(entry.element, `选择牧场副宠 ${chosen.name}`);
    await sleep(350);
    const detailPortraits = Array.from(document.querySelectorAll(".page-box .cont-box:nth-child(2) img,.page-box .cont-box:nth-child(2) uni-image"))
      .map(portraitKeyFromElement).filter(Boolean);
    if (detailPortraits.length === 1) chosen.portraitKey = detailPortraits[0];
    const withdraw = exactAction(["取出"]);
    if (!withdraw) throw new Error("牧场“取出”按钮不唯一或不可点击");
    await trustedClick(withdraw, `取出副宠 ${chosen.name}`);
    let stableSamples = 0;
    const confirmed = await waitUntil(() => {
      const liveRows = pastureRows();
      const livePastureCount = Number(bodyText().match(/牧场宠物数量\s*[：:]\s*(\d+)\s*\/\s*\d+/)?.[1]);
      const liveIdentityCount = liveRows.filter((row) => samePasturePet(row.pet, chosen)).length;
      const allChanged = carriedPetCount() === beforeCount + 1
        && liveRows.length === beforeRows - 1
        && (!Number.isInteger(beforePastureCount) || livePastureCount === beforePastureCount - 1)
        && liveIdentityCount === Math.max(0, beforeIdentityCount - 1);
      stableSamples = allChanged ? stableSamples + 1 : 0;
      return stableSamples >= 3 ? { liveRows: liveRows.length, livePastureCount, liveIdentityCount } : null;
    }, 20000, 300);
    if (!confirmed) {
      throw new Error(`点击取出 ${chosen.name} 后未通过三重验证（携带数量、牧场总数、目标行消失）；停止，避免使用错误副宠`);
    }
    logEvent("automation/deputy-withdrawal-list-verified", {
      pet: chosen, beforeCount, afterCount: beforeCount + 1, beforeRows,
      afterRows: confirmed.liveRows, beforePastureCount, afterPastureCount: confirmed.livePastureCount,
      beforeIdentityCount, afterIdentityCount: confirmed.liveIdentityCount,
    });
    const verified = await verifyCarriedDeputyLevel40(chosen);
    logEvent("automation/deputy-withdrawn", { pet: verified, beforeCount, afterCount: beforeCount + 1 });
    return verified;
  }

  async function openBag() {
    await clickNamedButton("背包");
    const ready = await waitUntil(() => {
      if (!bagRootElement()) return null;
      return inventoryScrollContainers().some((element) => element.scrollHeight > element.clientHeight + 200) ? true : null;
    }, 15000, 250);
    if (!ready) throw new Error("背包物品滚动列表 15 秒内未加载完成");
    await sleep(300);
  }

  async function refreshBagSnapshot(reason) {
    await openBag();
    const itemIds = [...core.EXP_ITEMS, ...core.KEY_ITEMS].map((item) => item.id);
    const inventory = Object.fromEntries(itemIds.map((id) => [id, 0]));
    const mergeVisible = () => {
      const visible = planner.readVisibleBagInventory();
      for (const id of itemIds) inventory[id] = Math.max(Number(inventory[id] || 0), Number(visible[id] || 0));
      if (visible.evolutionMaterialDetected) inventory.evolutionMaterialDetected = visible.evolutionMaterialDetected;
    };
    const containers = inventoryScrollContainers();
    mergeVisible();
    for (const container of containers.slice(0, 3)) {
      const originalTop = container.scrollTop;
      const maxTop = Math.max(0, container.scrollHeight - container.clientHeight);
      const step = Math.max(80, Math.floor(container.clientHeight * 0.7));
      for (let top = 0; top <= maxTop; top += step) {
        await moveInventoryScroll(container, top);
        mergeVisible();
      }
      if (maxTop > 0) {
        await moveInventoryScroll(container, maxTop);
        mergeVisible();
      }
      await moveInventoryScroll(container, originalTop);
    }
    const storedInventory = planner.storeBagInventory(inventory);
    logEvent("inventory/refreshed", {
      reason,
      strengthA: Number(storedInventory.strengthA || 0),
      strengthB: Number(storedInventory.strengthB || 0),
      supremeStone: Number(storedInventory.supremeStone || 0),
      scrollContainers: containers.map((element) => ({ clientHeight: element.clientHeight, scrollHeight: element.scrollHeight })),
    });
    await closeBag();
    return storedInventory;
  }

  function rectSample(element) {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    };
  }

  function rectWithinTolerance(previous, current, tolerance = 8) {
    return Boolean(previous && current
      && Math.abs(previous.left - current.left) <= tolerance
      && Math.abs(previous.top - current.top) <= tolerance
      && Math.abs(previous.width - current.width) <= tolerance
      && Math.abs(previous.height - current.height) <= tolerance);
  }

  function rectSignature(prefix, rect) {
    return `${prefix}:${Math.round(rect.left * 10) / 10}:${Math.round(rect.top * 10) / 10}:${Math.round(rect.width * 10) / 10}:${Math.round(rect.height * 10) / 10}`;
  }

  async function waitForStableExposedNamedButton(name, timeoutMs = 30000) {
    let stableSamples = 0;
    let stableAnchor = null;
    return waitUntil(() => {
      const matches = Array.from(document.querySelectorAll(`uni-button[name="${name}"]`)).filter(isExposedInteractable);
      if (matches.length !== 1) {
        stableSamples = 0;
        stableAnchor = null;
        return null;
      }
      const element = matches[0];
      const rect = rectSample(element);
      if (rectWithinTolerance(stableAnchor, rect)) stableSamples += 1;
      else {
        stableSamples = 1;
        stableAnchor = rect;
      }
      return stableSamples >= 4 ? { element, signature: rectSignature(name, rect), stableSamples, tolerancePx: 8 } : null;
    }, timeoutMs, 300);
  }

  async function waitForStableTempleNavigation(timeoutMs = 30000) {
    let stableSamples = 0;
    return waitUntil(() => {
      const nav = document.querySelector(".nav-box");
      const tabs = nav ? Array.from(nav.querySelectorAll("uni-button,.btn1")).filter(isInteractable) : [];
      const evolutionTabs = tabs.filter((element) => normalize(element.textContent) === normalize("进化"));
      const synthesisTabs = tabs.filter((element) => normalize(element.textContent) === normalize("合成"));
      const ready = Boolean(nav && isVisible(nav) && evolutionTabs.length === 1 && synthesisTabs.length === 1);
      stableSamples = ready ? stableSamples + 1 : 0;
      return stableSamples >= 3 ? { nav, evolutionTab: evolutionTabs[0], synthesisTab: synthesisTabs[0] } : null;
    }, timeoutMs, 250);
  }

  async function openPetTemple() {
    await clickNamedButton("中心城镇");
    let stableSamples = 0;
    let lastMode = "";
    let stableAnchor = null;
    const townReady = await waitUntil(() => {
      const temple = Array.from(document.querySelectorAll('uni-button[name="宠物神殿"]')).filter(isExposedInteractable);
      const next = Array.from(document.querySelectorAll('uni-button[name="切换地图1"]')).filter(isExposedInteractable);
      const mode = temple.length === 1 ? "temple" : (next.length === 1 ? "next" : "");
      const target = mode === "temple" ? temple[0] : mode === "next" ? next[0] : null;
      if (!target) {
        stableSamples = 0;
        lastMode = "";
        stableAnchor = null;
        return null;
      }
      const rect = rectSample(target);
      if (mode === lastMode && rectWithinTolerance(stableAnchor, rect)) stableSamples += 1;
      else {
        stableSamples = 1;
        stableAnchor = rect;
      }
      lastMode = mode;
      return stableSamples >= 4 ? {
        target,
        mode,
        signature: rectSignature(mode, rect),
        stableSamples,
        tolerancePx: 8,
      } : null;
    }, 30000, 300);
    if (!townReady) {
      logEvent("navigation/town-timeout", { snapshot: navigationSnapshot() });
      throw new Error("中心城镇 30 秒内未稳定显示右箭头或可点击的宠物神殿入口");
    }

    let templeTarget = townReady.target;
    if (townReady.mode === "next") {
      logEvent("navigation/town-page-stable", { mode: townReady.mode, signature: townReady.signature, snapshot: navigationSnapshot() });
      await trustedClick(townReady.target, "中心城镇第一页右箭头");
      const secondPage = await waitForStableExposedNamedButton("宠物神殿", 30000);
      if (!secondPage) {
        logEvent("navigation/town-second-page-timeout", { snapshot: navigationSnapshot() });
        throw new Error("点击中心城镇右箭头后，地图动画结束 30 秒内仍未出现可点击的宠物神殿入口");
      }
      templeTarget = secondPage.element;
      logEvent("navigation/town-second-page", {
        via: "切换地图1",
        signature: secondPage.signature,
        temple: elementDiagnostic(templeTarget),
        snapshot: navigationSnapshot(),
      });
    } else {
      logEvent("navigation/town-second-page", {
        via: "stable-already-visible",
        signature: townReady.signature,
        temple: elementDiagnostic(templeTarget),
        snapshot: navigationSnapshot(),
      });
    }
    await trustedClick(templeTarget, "进入宠物神殿");

    let templeReady = await waitForStableTempleNavigation(12000);
    if (!templeReady) {
      const retry = await waitForStableExposedNamedButton("宠物神殿", 3000);
      const retryTarget = retry?.element || null;
      if (!retryTarget) throw new Error("首次点击宠物神殿后页面未跳转，且无法唯一定位入口重试");
      logEvent("navigation/temple-retry", {
        reason: "首次点击后 12 秒内未加载神殿导航",
        target: elementDiagnostic(retryTarget),
      });
      await trustedClick(retryTarget, "重试进入宠物神殿");
      templeReady = await waitForStableTempleNavigation(30000);
    }
    if (!templeReady) throw new Error("宠物神殿入口重试后 30 秒内仍未加载完成");
    logEvent("navigation/temple-ready", { snapshot: navigationSnapshot() });
  }

  async function waitForStableSynthesisPage(timeoutMs = 30000) {
    let stableSamples = 0;
    return waitUntil(() => {
      const pages = Array.from(document.querySelectorAll(".content-bor2")).filter(isInteractable);
      const page = pages.length === 1 ? pages[0] : null;
      const ready = Boolean(page
        && page.querySelectorAll(".pet-trigger").length === 2
        && page.querySelectorAll(".mat-trigger").length === 2
        && Array.from(page.querySelectorAll('uni-button[name="开始合成"]')).filter(isInteractable).length === 1);
      stableSamples = ready ? stableSamples + 1 : 0;
      return stableSamples >= 3 ? page : null;
    }, timeoutMs, 350);
  }

  async function waitForStableEvolutionPage(timeoutMs = 30000) {
    let stableSamples = 0;
    return waitUntil(() => {
      const pages = Array.from(document.querySelectorAll(".content-bor1")).filter(isInteractable);
      const page = pages.length === 1 ? pages[0] : null;
      const tabs = Array.from(document.querySelectorAll(".nav-box uni-button,.nav-box .btn1")).filter(isInteractable)
        .filter((element) => normalize(element.textContent) === normalize("进化"));
      const ready = Boolean(page && tabs.length === 1 && tabs[0].classList.contains("active")
        && page.querySelectorAll(".left-box .li").length >= 1
        && page.querySelectorAll(".right-box > .item").length === 2);
      stableSamples = ready ? stableSamples + 1 : 0;
      return stableSamples >= 3 ? page : null;
    }, timeoutMs, 300);
  }

  async function openSynthesisPage() {
    await openPetTemple();
    const existingPage = await waitForStableSynthesisPage(1500);
    if (existingPage) {
      logEvent("navigation/synthesis-page-stable", { via: "already-active" });
      return;
    }
    const synthesisTab = await waitUntil(() => {
      const matches = Array.from(document.querySelectorAll(".nav-box uni-button,.nav-box .btn1")).filter(isInteractable)
        .filter((element) => normalize(element.textContent) === normalize("合成"));
      return matches.length === 1 ? matches[0] : null;
    }, 15000, 150);
    if (!synthesisTab) throw new Error("宠物神殿“合成”标签不唯一或不可点击");
    if (!synthesisTab.classList.contains("active")) await trustedClick(synthesisTab, "打开合成页面");
    let page = await waitForStableSynthesisPage(synthesisTab.classList.contains("active") ? 30000 : 12000);
    if (!page) {
      const retryTab = await waitUntil(() => {
        const matches = Array.from(document.querySelectorAll(".nav-box uni-button,.nav-box .btn1")).filter(isInteractable)
          .filter((element) => normalize(element.textContent) === normalize("合成"));
        return matches.length === 1 ? matches[0] : null;
      }, 3000, 150);
      if (!retryTab) throw new Error("首次点击合成标签后页面未切换，且无法唯一定位标签重试");
      logEvent("navigation/synthesis-tab-retry", {
        reason: "首次点击后 12 秒内未加载合成页面",
        target: elementDiagnostic(retryTab),
      });
      await trustedClick(retryTab, "重试打开合成页面");
      page = await waitForStableSynthesisPage(30000);
    }
    if (!page) throw new Error("合成标签重试后 30 秒内仍未稳定加载主副宠、材料和开始合成按钮");
    logEvent("navigation/synthesis-page-stable", {
      petTriggers: page.querySelectorAll(".pet-trigger").length,
      materialTriggers: page.querySelectorAll(".mat-trigger").length,
    });
  }

  async function openEvolutionPage() {
    await openPetTemple();
    const defaultPage = await waitForStableEvolutionPage(5000);
    if (defaultPage) {
      logEvent("navigation/evolution-page-stable", { via: "default-active" });
      return;
    }
    const evolutionTab = await waitUntil(() => {
      const matches = Array.from(document.querySelectorAll(".nav-box uni-button,.nav-box .btn1")).filter(isInteractable)
        .filter((element) => normalize(element.textContent) === normalize("进化"));
      return matches.length === 1 ? matches[0] : null;
    }, 15000, 150);
    if (!evolutionTab) throw new Error("宠物神殿“进化”标签不唯一或不可点击");
    const wasActive = evolutionTab.classList.contains("active");
    if (!wasActive) await trustedClick(evolutionTab, "打开进化页面");
    const page = await waitForStableEvolutionPage(30000);
    if (!page) {
      logEvent("navigation/evolution-page-timeout", { snapshot: navigationSnapshot() });
      throw new Error("进化标签已激活，但进化宠物与 A/B 两条路径 30 秒内未稳定加载");
    }
    logEvent("navigation/evolution-page-stable", { via: wasActive ? "active-wait" : "tab-click" });
  }

  function transactionSucceeded() {
    return runtime.lastResult && runtime.lastResult.level !== "error";
  }

  async function prepareNextPastureDeputy() {
    await openPasture();
    planner.scanPasture();
    const config = planner.getConfig();
    const entry = choosePastureEntry(pastureRows(), config);
    if (!entry) throw new Error(`牧场没有符合模式且不高于 ${config.pastureMaxTier} 阶的副宠候选`);
    let deputy = entry.pet;
    if (Number(deputy.level) < 40) {
      const inventory = { ...(planner.getState().inventory || {}) };
      const result = await upgradePasturePet(deputy, inventory);
      if (!result.upgraded) {
        throw new Error(`自动循环计划升级 ${deputy.name}，但实际选中行已是 Lv${result.pet.level}，已停止防止取错宠物`);
      }
      deputy = result.pet;
      planner.storeBagInventory(inventory);
      planner.scanPasture();
      bumpAutoStat("pasturePetsLeveled");
    }
    if (Number(deputy.level) < 40) throw new Error(`牧场副宠 ${deputy.name} 预升级后仍未达到 Lv40`);
    logEvent("automation/pasture-deputy-prepared", { deputy, config: {
      pastureMaxTier: config.pastureMaxTier,
      pastureUpgradeCount: config.pastureUpgradeCount,
    } });
    return deputy;
  }

  function carriedDeputyLevel40Matches(target) {
    return Array.from(document.querySelectorAll(".user-left .ul .li,.user-left .li"))
      .filter(isRendered)
      .filter((card) => {
        const text = String(card.innerText || card.textContent || "");
        const name = text.match(/^([\s\S]*?)\s*Lv\s*\d+/i)?.[1]?.trim() || "";
        const level = Number(text.match(/Lv\s*(\d+)/i)?.[1]);
        if (normalize(name) !== normalize(target.name) || !Number.isInteger(level) || level < 40) return false;
        const key = portraitKeyFromElement(card);
        return !target.portraitKey || !key || key === target.portraitKey;
      });
  }

  async function verifyCarriedDeputyLevel40(target) {
    await openPetAttributes();
    const matches = carriedDeputyLevel40Matches(target);
    if (matches.length !== 1) throw new Error(`携带宠物中无法唯一确认副宠 ${target.name} 为 Lv40，匹配到 ${matches.length} 张卡片`);
    const verifiedLevel = Number(String(matches[0].innerText || matches[0].textContent || "").match(/Lv\s*(\d+)/i)?.[1]);
    const verified = { ...target, level: verifiedLevel, displayLevel: verifiedLevel, effectiveLevel: verifiedLevel,
      portraitKey: target.portraitKey || portraitKeyFromElement(matches[0]) };
    planner.storeDeputyPet(verified);
    logEvent("automation/deputy-level-verified-without-main-switch", { deputy: verified });
    return verified;
  }

  async function runAutoCycle(maxSynthesisRetries) {
    let checkpoint = runtime.autoCheckpoint || { stage: "start", deputy: null };
    let deputy = checkpoint.deputy;
    if (checkpoint.stage === "deputy-evolved") {
      checkpoint = saveAutoCheckpoint("main-evolved", deputy);
      logEvent("automation/checkpoint-migrated", { from: "deputy-evolved", to: "main-evolved", deputy });
    }
    if (deputy?.name && ["deputy-levelled", "main-evolved", "synthesis-ready"].includes(checkpoint.stage)) {
      try {
        deputy = await verifyCarriedDeputyLevel40(deputy);
        checkpoint = saveAutoCheckpoint(checkpoint.stage, deputy, {
          evolutionsDone: checkpoint.evolutionsDone,
          requestedEvolutions: checkpoint.requestedEvolutions,
          reconciledAt: new Date().toISOString(),
        });
        logEvent("automation/checkpoint-reconciled", { stage: checkpoint.stage, deputy });
      } catch (error) {
        logEvent("automation/checkpoint-reset", {
          previous: checkpoint,
          reason: `已保存副宠不在当前携带栏：${error?.message || error}`,
        });
        deputy = null;
        checkpoint = saveAutoCheckpoint("start", null, { resetReason: "saved-deputy-not-carried" });
        setTxStatus("检测到旧检查点中的副宠并未实际取出，已安全回到牧场准备阶段。", "warn");
      }
    }
    if (deputy?.name) {
      const matches = Array.from(document.querySelectorAll(".user-left .ul .li,.user-left .li"))
        .filter(isRendered).filter((card) => normalize(card.textContent).includes(normalize(deputy.name)));
      if (matches.length === 1) {
        const liveLevel = Number(String(matches[0].innerText || matches[0].textContent || "").match(/Lv\s*(\d+)/i)?.[1]);
        if (Number.isInteger(liveLevel)) deputy = { ...deputy, level: liveLevel, displayLevel: liveLevel };
        if (liveLevel < 40 && ["deputy-levelled", "main-evolved", "synthesis-ready"].includes(checkpoint.stage)) {
          checkpoint = saveAutoCheckpoint("deputy-withdrawn", deputy);
          logEvent("automation/checkpoint-downgraded", { reason: "副宠卡片实时等级低于 Lv40", checkpoint });
        }
      }
    }
    if (checkpoint.stage === "start") {
      const knownDeputy = planner.getState().deputyPet;
      const carriedCards = Array.from(document.querySelectorAll(".user-left .ul .li,.user-left .li"))
        .filter(isRendered).filter((card) => normalize(card.textContent).includes("Lv"));
      const knownCarried = knownDeputy?.name && carriedCards.some((card) => normalize(card.textContent).includes(normalize(knownDeputy.name)));
      if (knownCarried) {
        deputy = knownDeputy;
        checkpoint = saveAutoCheckpoint(Number(deputy.level) >= 40 ? "deputy-levelled" : "deputy-withdrawn", deputy);
        logEvent("automation/checkpoint-recovered", { checkpoint, carriedCardCount: carriedCards.length });
      }
    }
    if (checkpoint.stage === "start") {
      logEvent("automation/checkpoint", { stage: "prepare-pasture-deputy/start" });
      deputy = await prepareNextPastureDeputy();
      checkpoint = saveAutoCheckpoint("pasture-prepared", deputy);
      logEvent("automation/checkpoint", { stage: checkpoint.stage, deputy });
    }

    if (checkpoint.stage === "pasture-prepared") {
      await openPasture();
      const checkpointEntry = resolveCheckpointPastureEntry(pastureRows(), deputy);
      if (!checkpointEntry) {
        await openPetAttributes();
        const carriedMatches = carriedDeputyLevel40Matches(deputy);
        if (carriedMatches.length === 1) {
          deputy = await verifyCarriedDeputyLevel40(deputy);
          checkpoint = saveAutoCheckpoint("deputy-levelled", deputy, {
            reconciledFrom: "pasture-prepared",
            reconciledAt: new Date().toISOString(),
          });
          logEvent("automation/pasture-prepared-reconciled", {
            result: "already-carried",
            deputy,
          });
          setTxStatus(`旧检查点的副宠 ${deputy.name} 已在携带栏，已跳过重复取出。`, "warn");
        } else if (carriedMatches.length === 0) {
          const previous = checkpoint;
          deputy = null;
          checkpoint = saveAutoCheckpoint("start", null, {
            resetReason: "pasture-prepared-target-missing",
            previousDeputy: previous.deputy,
          });
          logEvent("automation/checkpoint-reset", {
            previous,
            reason: "旧检查点副宠既不在牧场也不在携带栏",
          });
          setTxStatus(`旧检查点的副宠 ${previous.deputy?.name || "未知"} 已不存在，已重新扫描当前牧场。`, "warn");
          await openPasture();
          deputy = await prepareNextPastureDeputy();
          checkpoint = saveAutoCheckpoint("pasture-prepared", deputy, { recoveredFromStaleCheckpoint: true });
        } else {
          throw new Error(`旧检查点副宠 ${deputy.name} 在携带栏匹配到 ${carriedMatches.length} 张卡片，无法安全确定目标`);
        }
      } else {
        deputy = checkpointEntry.pet;
      }
      if (checkpoint.stage === "pasture-prepared") {
        deputy = await withdrawNextDeputy(deputy);
        if (Number(deputy.level) < 40) throw new Error(`取出前副宠 ${deputy.name} 仅 Lv${deputy.level}，停止`);
        bumpAutoStat("deputiesWithdrawn");
        planner.storeDeputyPet(deputy);
        checkpoint = saveAutoCheckpoint("deputy-levelled", deputy);
        logEvent("automation/checkpoint", { stage: checkpoint.stage, deputy });
      }
    }

    if (checkpoint.stage === "deputy-withdrawn") {
      await openPetAttributes();
      await selectCarriedPet(deputy, "副宠");
      logEvent("automation/checkpoint", { stage: "level-deputy/start", deputy });
      runtime.lastResult = null;
      await levelTo40Once(deputy);
      if (!transactionSucceeded()) throw new Error(runtime.lastResult?.message || "副宠补级失败");
      bumpAutoStat("carriedDeputyPetsLeveled");
      await openPetAttributes({ ...deputy, level: 40 });
      await selectCarriedPet({ ...deputy, level: 40 }, "副宠");
      deputy = planner.scanDeputyPet();
      if (Number(deputy.level) < 40) throw new Error(`副宠补级后属性页仍为 Lv${deputy.level}，未达到 Lv40`);
      checkpoint = saveAutoCheckpoint("deputy-levelled", deputy);
      logEvent("automation/checkpoint", { stage: checkpoint.stage, deputy });
    }

    if (checkpoint.stage === "deputy-levelled") {
      await openPetAttributes();
      const lockedMain = planner.getState().mainPet;
      await selectCarriedPet(lockedMain, "锁定公式主宠");
      const mainBeforeEvolution = planner.scanMainPet();
      if (Number(mainBeforeEvolution.level) < 40) {
        throw new Error(`进化前锁定公式主宠 ${mainBeforeEvolution.name || "未知"} 为 Lv${mainBeforeEvolution.level || "未知"}，必须至少达到 Lv40`);
      }
      const requestedEvolutions = Math.max(0, Math.min(10, Number(planner.getConfig().evolutionPerCycle) || 0));
      let evolutionsDone = Math.max(0, Number(checkpoint.evolutionsDone) || 0);
      while (evolutionsDone < requestedEvolutions && Number(mainBeforeEvolution.evolutionCount) < 10) {
        logEvent("automation/checkpoint", {
          stage: "evolution-main/start", main: mainBeforeEvolution, deputy,
          evolutionsDone, requestedEvolutions,
        });
        await openEvolutionPage();
        runtime.lastResult = null;
        bumpAutoStat("evolutionAttempts");
        await evolveOnce();
        if (!transactionSucceeded()) {
          const message = runtime.lastResult?.message || "锁定公式主宠进化失败";
          if (/强化丹\s*A\s*\/\s*B\s*均不足/.test(message)) {
            logEvent("automation/evolution-skipped-material-exhausted", {
              main: mainBeforeEvolution,
              evolutionsDone,
              requestedEvolutions,
              message,
            });
            bumpAutoStat("evolutionMaterialSkips");
            setTxStatus(`自动循环：强化丹 A/B 均不足，本轮停止继续进化，保留主宠当前状态并进入合成…`, "warn");
            break;
          }
          throw new Error(message);
        }
        bumpAutoStat("evolutionSuccesses");
        evolutionsDone += 1;
        await openPetAttributes();
        await selectCarriedPet(planner.getState().mainPet, "锁定公式主宠");
        Object.assign(mainBeforeEvolution, planner.scanMainPet());
        checkpoint = saveAutoCheckpoint("deputy-levelled", deputy, { evolutionsDone, requestedEvolutions });
      }
      checkpoint = saveAutoCheckpoint("main-evolved", deputy, { evolutionsDone, requestedEvolutions });
      logEvent("automation/checkpoint", { stage: checkpoint.stage, main: planner.getState().mainPet, deputy });
    }

    if (checkpoint.stage === "main-evolved") {
      await openPetAttributes();
      const main = planner.getState().mainPet;
      await selectCarriedPet(main, "锁定公式主宠");
      let refreshedMain = planner.scanMainPet();
      deputy = await verifyCarriedDeputyLevel40(deputy);
      if (Number(refreshedMain.level) < 40 || Number(deputy?.level) < 40) {
        throw new Error(`合成前实时等级不满足至少 Lv40：主宠 Lv${refreshedMain.level || "未知"}，副宠 Lv${deputy?.level || "未知"}`);
      }
      await selectCarriedPet(refreshedMain, "锁定公式主宠");
      refreshedMain = planner.scanMainPet();
      checkpoint = saveAutoCheckpoint("synthesis-ready", deputy);
      logEvent("automation/checkpoint", { stage: checkpoint.stage, main: refreshedMain, deputy });
    }

    for (let attempt = 1; attempt <= maxSynthesisRetries; attempt += 1) {
      if (runtime.stopRequested) return { stopped: true };
      runtime.lastResult = null;
      await synthesizeOnce({ refreshInventory: attempt === 1, reusePreparedPage: attempt > 1 });
      const result = runtime.lastResult;
      bumpAutoStat("synthesisAttempts");
      logEvent("automation/synthesis-attempt", { attempt, result });
      if (result?.level === "success") {
        bumpAutoStat("synthesisSuccesses");
        saveAutoCheckpoint("complete", null);
        return { success: true, attempt, result };
      }
      if (result?.level === "warn" && /合成.*失败/.test(result.message || "") && attempt < maxSynthesisRetries) {
        bumpAutoStat("synthesisFailures");
        setTxStatus(`自动循环：第 ${attempt} 次合成失败且副宠保留；冷却和页面恢复已完成，沿用背包快照继续…`, "warn");
        await sleep(1200);
        continue;
      }
      if (result?.level === "warn" && /合成.*失败/.test(result.message || "")) bumpAutoStat("synthesisFailures");
      throw new Error(result?.message || `第 ${attempt} 次合成未成功`);
    }
    throw new Error(`达到合成重试上限 ${maxSynthesisRetries} 次`);
  }

  async function startAutoLoop(maxCycles, maxSynthesisRetries) {
    if (runtime.autoRunning || runtime.running) return;
    requireConfirmation();
    const state = planner.getState();
    if (!state.mainPet || !state.inventory || !state.pasturePets?.length) throw new Error("自动循环前必须锁定主宠、记录牧场并记录背包");
    if (takeover.active) {
      logEvent("user-takeover/resume", {
        pausedForMs: Date.now() - takeover.startedAt,
        previousReason: takeover.reason,
        page: currentPageKind(),
      });
      takeover.active = false;
      takeover.startedAt = 0;
      takeover.reason = "";
    }
    runtime.autoRunning = true;
    runtime.stopRequested = false;
    runtime.autoCycle = 0;
    runtime.autoStats = createAutoStats(maxCycles, maxSynthesisRetries);
    let outcome = "正常结束";
    let finalReason = "";
    const stopCc = Number(planner.getConfig().targetCc);
    logEvent("automation/start", { maxCycles, maxSynthesisRetries, main: state.mainPet, config: planner.getConfig() });
    try {
      await requireValidLicense({ forceRefresh: true });
      const initialMain = await readLockedMainLive("启动前培养停止值复核");
      if (targetCcReached(initialMain, stopCc, "before-start", 0)) {
        outcome = "已达到培养目标";
        finalReason = `主宠 ${initialMain.name} CC ${initialMain.cc} 已达到培养停止值 ${stopCc}`;
        logEvent("automation/stop-cc-reached", { phase: "before-start", cycle: 0, main: initialMain, stopCc });
        return;
      }
      await ensureLockedMainReady();
      await refreshBagSnapshot("automation/preflight");
      await openPasture();
      planner.scanPasture();
      for (let cycle = 1; cycle <= maxCycles && !runtime.stopRequested; cycle += 1) {
        runtime.autoCycle = cycle;
        if (cycle > 1) {
          const beforeCycleMain = await readLockedMainLive("下一轮前培养停止值复核");
          if (targetCcReached(beforeCycleMain, stopCc, "before-cycle", cycle)) {
            outcome = "已达到培养目标";
            finalReason = `主宠 ${beforeCycleMain.name} CC ${beforeCycleMain.cc} 已达到培养停止值 ${stopCc}`;
            logEvent("automation/stop-cc-reached", {
              phase: "before-cycle", cycle, main: beforeCycleMain, stopCc,
            });
            break;
          }
        }
        if (runtime.autoCheckpoint?.stage === "complete") saveAutoCheckpoint("start", null);
        if (cycle > 1) {
          setTxStatus(`自动循环 ${cycle}/${maxCycles}：先复核上一轮合成后的主宠等级，必要时自动补到 Lv40…`);
          await ensureLockedMainReady();
        }
        setTxStatus(`自动循环 ${cycle}/${maxCycles}：主宠已确认 Lv40，准备从牧场取出下一只副宠…`);
        bumpAutoStat("cyclesStarted");
        logEvent("automation/cycle-begin", { cycle });
        const result = await runAutoCycle(maxSynthesisRetries);
        logEvent("automation/cycle-finish", { cycle, result });
        if (result?.stopped) break;
        if (result?.success) bumpAutoStat("cyclesCompleted");
        if (result?.success) {
          const afterSynthesisMain = await readLockedMainLive("合成后培养停止值复核");
          if (targetCcReached(afterSynthesisMain, stopCc, "after-synthesis", cycle)) {
            outcome = "已达到培养目标";
            finalReason = `主宠 ${afterSynthesisMain.name} CC ${afterSynthesisMain.cc} 已达到培养停止值 ${stopCc}`;
            logEvent("automation/stop-cc-reached", {
              phase: "after-synthesis", cycle, main: afterSynthesisMain, stopCc,
            });
            break;
          }
        }
        if (result?.success && cycle < maxCycles) saveAutoCheckpoint("start", null);
      }
      if (runtime.stopRequested) {
        outcome = "已安全停止";
        finalReason = "用户请求停止；已提交的单步已完成验证";
      }
    } catch (error) {
      const message = error?.message || String(error);
      if (error instanceof AutomationStopRequestedError) {
        outcome = "已安全停止";
        finalReason = "用户请求停止；未提交新的单步操作";
        logEvent("automation/stopped-by-user", { cycle: runtime.autoCycle, page: currentPageKind() });
      } else {
        outcome = "已中断";
        finalReason = message;
        bumpAutoStat("errors");
        logEvent("automation/paused", { cycle: runtime.autoCycle, message });
        takeover.active = true;
        takeover.startedAt = Date.now();
        takeover.reason = message;
        logEvent("user-takeover/started", { cycle: runtime.autoCycle, reason: message, page: currentPageKind() });
      }
    } finally {
      const summary = formatAutoSummary(outcome, finalReason);
      logEvent("automation/run-summary", { outcome, reason: finalReason, stats: runtime.autoStats, summary });
      setTxStatus(summary, outcome === "已中断" ? "error" : outcome === "已安全停止" ? "warn" : "success");
      runtime.autoRunning = false;
      runtime.stopRequested = false;
      clearConfirmation();
    }
  }

  function stopAutoLoop() {
    if (!runtime.autoRunning) return;
    runtime.stopRequested = true;
    logEvent("automation/stop-requested", { cycle: runtime.autoCycle, action: runtime.lastAction });
    setTxStatus("已请求停止：当前已提交的单步仍会完成验证，随后停止自动循环。", "warn");
  }

  function currentPageKind() {
    if (bagRootElement()) return "bag";
    if (document.querySelector(".content-bor2")) return "temple-synthesis";
    if (document.querySelector(".content-bor1")) return "temple-evolution";
    if (document.querySelector(".page-box .cont-box .ul")) return "pasture";
    if (/当前经验\s*[：:]/.test(bodyText()) && /升级经验\s*[：:]/.test(bodyText())) return "pet-attributes";
    if (Array.from(document.querySelectorAll('uni-button[name="切换地图1"]')).some(isInteractable)) return "town-page-1";
    if (Array.from(document.querySelectorAll('uni-button[name="宠物神殿"]')).some(isInteractable)) return "town-page-2";
    return "other";
  }

  function recordTakeoverClick(event) {
    if (!takeover.active || !event.isTrusted) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target || target === document.getElementById("pk-god-planner-host") || target.closest?.("#pk-god-planner-host")) return;
    if (target.matches?.("input,textarea,[contenteditable=true]") || target.closest?.("input,textarea,[contenteditable=true]")) return;
    const automated = lastAutomatedClick && Date.now() <= lastAutomatedClick.until
      && Math.abs(Number(event.clientX) - lastAutomatedClick.x) <= 8
      && Math.abs(Number(event.clientY) - lastAutomatedClick.y) <= 8;
    if (automated) return;
    const pageBefore = currentPageKind();
    const targetInfo = elementDiagnostic(target) || {};
    delete targetInfo.text;
    logEvent("user-takeover/click", {
      elapsedMs: Date.now() - takeover.startedAt,
      pageBefore,
      x: Math.round(Number(event.clientX) || 0),
      y: Math.round(Number(event.clientY) || 0),
      target: targetInfo,
    });
    setTimeout(() => {
      const pageAfter = currentPageKind();
      if (pageAfter !== pageBefore) logEvent("user-takeover/page-changed", { pageBefore, pageAfter });
    }, 700);
  }

  function installUi() {
    installStatusFloat();
    const host = document.getElementById("pk-god-planner-host");
    const shadow = host?.shadowRoot;
    const panel = shadow?.querySelector(".panel");
    if (!panel) return false;
    const pasturePrelevel = shadow.querySelector(".pasture-prelevel");
    if (pasturePrelevel && !pasturePrelevel.dataset.txBound) {
      pasturePrelevel.dataset.txBound = "1";
      pasturePrelevel.addEventListener("click", upgradePastureDeputiesOnce);
    }
    if (shadow.querySelector(".tx-section")) return false;
    const section = document.createElement("section");
    section.className = "tx-section";
    section.innerHTML = `
      <div class="box warn"><b>阶段 2 · 单次事务 v${VERSION}</b><br>
        每次只执行一个事务；不会自动串联下一步。进化会直接读取属性页“进化次数”并核验 +1；公式神宠使用已锁定主宠且不限制阶级；合成失败只刷新页面并恢复选择，不会自动重试。
      </div>
      <div class="box license-box"><b>许可证</b><br>
        <span class="license-status">正在读取授权状态…</span>
        <div class="row"><label>激活码</label><input class="license-code" type="password" autocomplete="off" placeholder="输入授权服务器发放的激活码"></div>
        <div class="buttons"><button class="license-activate">激活/换机授权</button><button class="license-refresh secondary">检查/续签</button></div>
        <button class="license-clear secondary" style="width:100%">清除本机许可证</button>
      </div>
      <div class="checks">
        <label><input class="tx-confirm" type="checkbox">我已核对当前目标宠物、页面和本次资源选择</label>
      </div>
      <div class="buttons tx-buttons">
        <button class="tx-read secondary">读取经验状态（只读）</button>
        <button class="tx-level">补当前宠到 Lv40</button>
        <button class="tx-evolve secondary">进化一次</button>
        <button class="tx-synth secondary">合成一次</button>
        <button class="tx-self-test secondary">DOM 结构检查（只读）</button>
        <button class="tx-diagnostics secondary">导出事务诊断</button>
      </div>
      <div class="box"><b>阶段 3 · 自动合宠循环</b><br>
        每次启动先复核锁定主宠、完整背包和牧场。每轮先在牧场把低阶/低CC优先副宠补到 Lv40，再取出；不会把副宠设为主战。随后按面板设置仅给锁定主宠进化 0–10 次；强化丹 A/B 耗尽时跳过剩余进化并进入合成。复核主副宠等级与身份后合成一次，其他无法验证的检查点仍会暂停并保留接管日志。
        <div class="row" style="margin-top:8px"><label>最多周期</label><input class="auto-cycles" type="number" min="1" max="50" value="10"></div>
        <div class="row"><label>单只合成上限</label><input class="auto-retries" type="number" min="1" max="10" value="3"></div>
        <div class="checks"><label><input class="auto-fresh-start" type="checkbox">清除旧检查点，从当前牧场重新开始</label></div>
        <div class="buttons"><button class="auto-start">开始自动循环</button><button class="auto-stop secondary" disabled>安全停止</button></div>
      </div>
      <div class="status tx-status" style="display:none">属性页经验按累计经验读取；Lv1 页面若直接显示约 563.3W 总阈值也可安全识别。背包会自动滚动到计划使用的经验道具。</div>`;
    const body = shadow.querySelector(".panel-body") || panel;
    const danger = shadow.querySelector(".danger-note");
    body.insertBefore(section, danger && danger.parentElement === body ? danger : null);
    txStatus = section.querySelector(".tx-status");
    confirmNode = section.querySelector(".tx-confirm");
    setTxStatus(txStatus.textContent, "normal");
    const licenseStatus = section.querySelector(".license-status");
    const renderLicenseStatus = async () => {
      const status = license ? await license.status() : { valid: false, message: "许可证组件未加载" };
      const expires = status.payload?.expiresAt ? new Date(Number(status.payload.expiresAt)).toLocaleString() : "";
      licenseStatus.textContent = `${status.message}${expires ? `；有效至 ${expires}` : ""}`;
      licenseStatus.style.color = status.valid ? "#6ce8a0" : "#ff9191";
      return status;
    };
    section.querySelector(".license-activate").addEventListener("click", async () => {
      try {
        const activation = await license.activate(section.querySelector(".license-code").value);
        section.querySelector(".license-code").value = "";
        await renderLicenseStatus();
        setTxStatus(activation?.disabled
          ? "授权检查当前处于配置/测试模式；部署服务器并启用 license-config.js 后才会强制验证。"
          : "许可证激活成功，短期签名令牌已保存到当前浏览器。", activation?.disabled ? "warn" : "success");
      } catch (error) { setTxStatus(`许可证激活失败：${error?.message || error}`, "error"); }
    });
    section.querySelector(".license-refresh").addEventListener("click", async () => {
      try {
        await license.ensureValid({ forceRefresh: true });
        await renderLicenseStatus();
        setTxStatus("许可证检查和续签完成。", "success");
      } catch (error) { await renderLicenseStatus(); setTxStatus(`许可证检查失败：${error?.message || error}`, "error"); }
    });
    section.querySelector(".license-clear").addEventListener("click", async () => {
      license?.clear();
      await renderLicenseStatus();
      setTxStatus("已清除当前浏览器保存的许可证。", "warn");
    });
    renderLicenseStatus().catch(() => {});
    section.querySelector(".tx-read").addEventListener("click", readPetProgressOnce);
    section.querySelector(".tx-level").addEventListener("click", levelTo40Once);
    section.querySelector(".tx-evolve").addEventListener("click", evolveOnce);
    section.querySelector(".tx-synth").addEventListener("click", synthesizeOnce);
    section.querySelector(".tx-self-test").addEventListener("click", runDomSelfTest);
    section.querySelector(".tx-diagnostics").addEventListener("click", exportDiagnostics);
    const autoStart = section.querySelector(".auto-start");
    const autoStop = section.querySelector(".auto-stop");
    autoStart.addEventListener("click", async () => {
      const cycles = Math.max(1, Math.min(50, Number(section.querySelector(".auto-cycles").value) || 10));
      const retries = Math.max(1, Math.min(10, Number(section.querySelector(".auto-retries").value) || 3));
      const freshStart = section.querySelector(".auto-fresh-start").checked;
      autoStart.disabled = true;
      autoStop.disabled = false;
      try {
        if (freshStart) {
          saveAutoCheckpoint("start", null, { resetReason: "user-requested-fresh-start" });
          section.querySelector(".auto-fresh-start").checked = false;
          setTxStatus("已按用户选择清除旧检查点，将以当前牧场快照开始。", "warn");
        }
        await startAutoLoop(cycles, retries);
      } catch (error) {
        setTxStatus(`自动循环未启动：${error?.message || error}`, "error");
      } finally {
        autoStart.disabled = false;
        autoStop.disabled = true;
      }
    });
    autoStop.addEventListener("click", stopAutoLoop);
    return true;
  }

  function maybeAutoPlan() {
    try {
      const state = planner.getState();
      if (!state.mainPet || !state.inventory || !state.pasturePets?.length) return;
      const signature = JSON.stringify(state.scans || {});
      if (signature === autoPlanSignature) return;
      autoPlanSignature = signature;
      planner.buildPlan();
    } catch (_) {}
  }

  const uiTimer = setInterval(() => {
    if (installUi()) console.info(`[PK God Transactions] v${VERSION} 单次事务 UI 已挂载`);
    maybeAutoPlan();
    if (document.getElementById("pk-god-planner-host")?.shadowRoot?.querySelector(".tx-section")) {
      // 保留轻量轮询用于扫描后自动生成规划。
    }
  }, 900);

  Object.defineProperty(window, "PlayKeeperGodTransactions", {
    configurable: true,
    value: Object.freeze({
      version: VERSION,
      levelTo40Once,
      upgradePastureDeputiesOnce,
      readPetProgressOnce,
      evolveOnce,
      synthesizeOnce,
      startAutoLoop,
      stopAutoLoop,
      runDomSelfTest,
      exportDiagnostics,
      getDiagnosticReport: diagnosticReport,
      getRuntime: () => ({ ...runtime }),
    }),
  });

  document.addEventListener("click", recordTakeoverClick, true);
  window.addEventListener("beforeunload", () => clearInterval(uiTimer), { once: true });
})();
