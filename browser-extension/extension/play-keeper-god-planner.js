"use strict";

(() => {
  if (window.__PK_GOD_PLANNER_V150__) return;
  window.__PK_GOD_PLANNER_V150__ = true;

  const VERSION = "1.8.8";
  const core = globalThis.PlayKeeperGodPlannerCore;
  if (!core) {
    console.error("[PK God Planner] core 未加载");
    return;
  }

  const STORAGE_KEY = "pk_god_planner_v110_state";
  const CONFIG_KEY = "pk_god_planner_v110_config";
  const DOCK_KEY = "pk_god_planner_dock_side";
  const POSITION_KEY = "pk_god_planner_position_v1";
  const state = loadJson(sessionStorage, STORAGE_KEY, {
    mainPet: null,
    deputyPet: null,
    pasturePets: [],
    inventory: null,
    scans: {},
    lastPlan: null,
  });

  const config = loadJson(localStorage, CONFIG_KEY, {
    mode: "full",
    targetCc: 57.6,
    fullQualificationCc: 60,
    level1To40ExpW: 563.3,
    useEvolutionMaterial: true,
    allowDirectEvolution: true,
    useSupremeStone: false,
    pastureUpgradeCount: 1,
    pastureMaxTier: 8,
    pastureUpgradeMinTier: 1,
    pastureUpgradeMaxTier: 8,
    rankUpMinTier: 8,
    rankUpMaxTier: 9,
    evolutionPerCycle: 1,
    evolutionVerifyBatchSize: 5,
    verifyCcDuringEvolutionBatch: true,
    allowBackgroundAttempt: false,
    guardMaterialName: "天神之石",
    auxiliaryMaterialName: "★★★成长魂石",
  });
  // v1.2.4 默认值 564W 是向上取整；迁移到实测累计阈值显示值 563.3W。
  if (Number(config.level1To40ExpW) === 564) config.level1To40ExpW = 563.3;

  let panelHost;
  let statusNode;
  let scanSummaryNode;
  let planNode;
  let modeNode;
  let targetCcNode;
  let qualificationCcNode;
  let expTargetNode;
  let evolutionMaterialNode;
  let directEvolutionNode;
  let supremeNode;
  let pastureUpgradeCountNode;
  let pastureMaxTierNode;
  let pastureUpgradeMinTierNode;
  let pastureUpgradeMaxTierNode;
  let rankUpMinTierNode;
  let rankUpMaxTierNode;
  let evolutionPerCycleNode;
  let evolutionVerifyBatchSizeNode;
  let verifyCcDuringEvolutionBatchNode;
  let allowBackgroundAttemptNode;
  let guardMaterialNode;
  let auxiliaryMaterialNode;

  function loadJson(storage, key, fallback) {
    try {
      const value = JSON.parse(storage.getItem(key) || "null");
      return value && typeof value === "object" ? { ...fallback, ...value } : { ...fallback };
    } catch (_) {
      return { ...fallback };
    }
  }

  function saveState() {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function saveConfig() {
    Object.assign(config, readConfig());
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  }

  function isVisible(element) {
    if (!element?.isConnected) return false;
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function bodyText() {
    return String(document.body?.innerText || "");
  }

  function smallestVisibleMatching(predicate, selector = "div,section,main,aside,article,table,tbody,tr,li") {
    return Array.from(document.querySelectorAll(selector))
      .filter(isVisible)
      .map((element) => ({ element, text: String(element.innerText || element.textContent || "").trim() }))
      .filter(({ text }) => text && predicate(text))
      .sort((a, b) => a.text.length - b.text.length)[0] || null;
  }

  function portraitKeyFromElement(element) {
    if (!element) return "";
    const values = [
      element.getAttribute?.("src"),
      element.getAttribute?.("style"),
      element.style?.backgroundImage,
      element.querySelector?.("img")?.getAttribute?.("src"),
    ].filter(Boolean).join(" ");
    return values.match(/\/(?:k|z)(\d+)\.(?:gif|png|jpe?g)(?:[?#]|\b)/i)?.[1] || "";
  }

  function readCurrentPortraitKey() {
    const candidates = Array.from(document.querySelectorAll(
      ".shuxing .img,.shuxing img,.user-right .image-box .img,.user-left .li.active img,.user-left .li.active uni-image",
    )).filter(isVisible).map(portraitKeyFromElement).filter(Boolean);
    const unique = Array.from(new Set(candidates));
    return unique.length === 1 ? unique[0] : "";
  }

  function readOwnerName() {
    const match = bodyText().match(/(?:^|\n)\s*([^\n：:]{1,32})\s*\n\s*性别\s*[：:]/);
    return match?.[1]?.trim() || "";
  }

  function readSelectedPetName() {
    const card = Array.from(document.querySelectorAll(".user-left .ul .li.active,.user-left .li.active"))
      .find(isVisible);
    const text = String(card?.innerText || card?.textContent || "").trim();
    return text.match(/^([\s\S]*?)\s*Lv\s*\d+/i)?.[1]?.trim() || "";
  }

  function mergePetSnapshot(previous, observed) {
    const same = previous?.name && observed?.name && previous.name === observed.name;
    const base = same ? previous : {};
    return {
      ...base,
      ...observed,
      tier: observed.tier ?? base.tier ?? null,
      tierText: observed.tierText || base.tierText || "",
      evolutionCount: observed.evolutionCount ?? base.evolutionCount ?? null,
      portraitKey: readCurrentPortraitKey() || base.portraitKey || "",
      ownerName: readOwnerName() || base.ownerName || "",
    };
  }

  function scanMainPet() {
    const stats = smallestVisibleMatching((text) => /等级\s*[：:]?\s*\d+/.test(text)
      && (/阶(?:级|数)?\s*[：:]?\s*[一二三四五六七八九十\d]+阶?/.test(text) || /进化次数\s*[：:]?\s*\d+/.test(text))
      && /成长\s*[：:]?\s*\d/.test(text));
    const source = stats?.text || bodyText();
    const observed = core.parseMainPetText(source);
    if (!observed) throw new Error("当前页面未识别到“等级 / 成长 / 阶级或进化次数”主宠资料");
    observed.name = readSelectedPetName() || observed.name;
    const pet = mergePetSnapshot(state.mainPet, observed);
    state.mainPet = pet;
    state.scans.mainPet = new Date().toISOString();
    saveState();
    const levelLabel = pet.effectiveLevel === 0 ? "脚本Lv0（页面Lv1/经验0）" : `Lv${pet.level}`;
    const expLabel = pet.currentExp != null && pet.upgradeExp != null && pet.level < 40 ? ` / 经验 ${pet.currentExp}/${pet.upgradeExp}` : "";
    const tierLabel = pet.tier ? ` / ${pet.tierText || pet.tier + "阶"}` : "";
    const evolutionLabel = pet.evolutionCount != null ? ` / 进化 ${pet.evolutionCount}/10` : "";
    setStatus(`已记录主宠：${pet.name || "未识别名称"} ${levelLabel}${expLabel}${tierLabel}${evolutionLabel} / CC ${pet.cc}`);
    renderAll();
    autoBuildPlanIfReady();
    return pet;
  }

  function storeMainPet(pet) {
    if (!pet?.name || !Number.isFinite(Number(pet.level)) || !Number.isInteger(Number(pet.tier))) {
      throw new Error("主宠快照缺少名称、等级或阶数");
    }
    const stored = mergePetSnapshot(state.mainPet, pet);
    state.mainPet = stored;
    state.scans.mainPet = new Date().toISOString();
    saveState();
    setStatus(`已保存主宠：${stored.name} Lv${stored.level} / ${stored.tier}阶 / CC ${stored.cc ?? "?"}`);
    renderAll();
    autoBuildPlanIfReady();
    return JSON.parse(JSON.stringify(stored));
  }

  function scanDeputyPet() {
    const stats = smallestVisibleMatching((text) => /等级\s*[：:]?\s*\d+/.test(text)
      && (/阶(?:级|数)?\s*[：:]?\s*[一二三四五六七八九十\d]+阶?/.test(text) || /进化次数\s*[：:]?\s*\d+/.test(text))
      && /成长\s*[：:]?\s*\d/.test(text));
    const source = stats?.text || bodyText();
    const observed = core.parseMainPetText(source);
    if (!observed) throw new Error("当前页面未识别到“等级 / 成长 / 阶级或进化次数”副宠资料");
    observed.name = readSelectedPetName() || observed.name;
    const pet = mergePetSnapshot(state.deputyPet, observed);
    state.deputyPet = pet;
    state.scans.deputyPet = new Date().toISOString();
    saveState();
    const levelLabel = pet.effectiveLevel === 0 ? "脚本Lv0（页面Lv1/经验0）" : `Lv${pet.level}`;
    const tierLabel = pet.tier ? ` / ${pet.tierText || pet.tier + "阶"}` : "";
    const evolutionLabel = pet.evolutionCount != null ? ` / 进化 ${pet.evolutionCount}/10` : "";
    setStatus(`已记录副宠：${pet.name || "未识别名称"} ${levelLabel}${tierLabel}${evolutionLabel} / CC ${pet.cc}`);
    renderAll();
    autoBuildPlanIfReady();
    return pet;
  }

  function storeDeputyPet(pet) {
    if (!pet?.name || !Number.isFinite(Number(pet.level))) throw new Error("副宠快照缺少名称或等级");
    state.deputyPet = JSON.parse(JSON.stringify(pet));
    state.scans.deputyPet = new Date().toISOString();
    saveState();
    setStatus(`已保存副宠：${pet.name} Lv${pet.level} / ${pet.tier || "?"}阶 / CC ${pet.cc ?? "?"}`);
    renderAll();
    autoBuildPlanIfReady();
    return JSON.parse(JSON.stringify(state.deputyPet));
  }

  function clearDeputyPet(reason = "副宠事务已结束") {
    const previous = state.deputyPet ? JSON.parse(JSON.stringify(state.deputyPet)) : null;
    state.deputyPet = null;
    state.scans.deputyPet = null;
    saveState();
    setStatus(`${reason}，已清除旧副宠快照。`);
    renderAll();
    return previous;
  }

  function scanPasture() {
    const directRows = Array.from(document.querySelectorAll(
      ".page-box .cont-box:first-child .ul .li,.page-box .page_left .ul .li",
    )).filter(isVisible);
    if (directRows.length) {
      const pets = directRows.map((element, pastureIndex) => {
        const pet = core.parsePastureRow(String(element.innerText || element.textContent || "").trim());
        return pet ? { ...pet, pastureIndex } : null;
      }).filter(Boolean);
      if (!pets.length) throw new Error("牧场列表已显示，但未解析到任何宠物行");
      state.pasturePets = pets;
      state.scans.pasture = new Date().toISOString();
      saveState();
      setStatus(`已记录牧场：识别 ${pets.length} 只宠物`);
      renderAll();
      autoBuildPlanIfReady();
      return pets;
    }
    const pets = [];
    const candidates = Array.from(document.querySelectorAll("tr,li,div,view,uni-view"))
      .filter(isVisible)
      .map((element) => String(element.innerText || element.textContent || "").trim())
      .filter((text) => text.length > 0 && text.length <= 180 && /[（(].*阶.*[)）]/.test(text) && /Lv\s*\d+/i.test(text));
    for (const text of candidates) {
      const pet = core.parsePastureRow(text);
      if (pet) pets.push(pet);
    }
    const unique = core.dedupePets(pets);
    if (!unique.length) throw new Error("当前页面未识别到牧场列表；请打开“中心城镇 → 牧场”并保持宠物表格可见");
    state.pasturePets = unique;
    state.scans.pasture = new Date().toISOString();
    saveState();
    setStatus(`已记录牧场：识别 ${unique.length} 只宠物`);
    renderAll();
    autoBuildPlanIfReady();
    return unique;
  }

  function leafMatchesAlias(element, aliases) {
    const text = String(element.innerText || element.textContent || "");
    return aliases.some((alias) => text.includes(alias));
  }

  function rowForItemLeaf(leaf, aliases) {
    let current = leaf;
    for (let depth = 0; current && depth < 7; depth += 1, current = current.parentElement) {
      if (!isVisible(current)) continue;
      const text = String(current.innerText || current.textContent || "").trim();
      if (!aliases.some((alias) => text.includes(alias)) || text.length > 260) continue;
      let stripped = text;
      for (const alias of aliases) stripped = stripped.split(alias).join(" ");
      stripped = stripped.replace(/【绑定】|\[绑定\]|\(绑定\)|（绑定）/g, " ");
      const numbers = stripped.match(/\b\d+\b/g)?.map(Number) || [];
      if (numbers.length) return { element: current, text, count: numbers[numbers.length - 1] };
    }
    return null;
  }

  function visibleBagRoot() {
    return Array.from(document.querySelectorAll("uni-view,div,section"))
      .filter(isVisible)
      .filter((element) => /当前背包空间/.test(String(element.textContent || ""))
        && /物品名称/.test(String(element.textContent || "")))
      .sort((a, b) => {
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        return ar.width * ar.height - br.width * br.height;
      })[0] || null;
  }

  function countInventoryAliases(aliases, root) {
    const leaves = Array.from(root.querySelectorAll("td,span,p,label,div,view,uni-view"))
      .filter(isVisible)
      .filter((element) => leafMatchesAlias(element, aliases))
      .filter((element) => !Array.from(element.children || []).some((child) => leafMatchesAlias(child, aliases)));
    const rows = new Map();
    for (const leaf of leaves) {
      const row = rowForItemLeaf(leaf, aliases);
      if (row) rows.set(row.element, row);
    }
    return Array.from(rows.values()).reduce((sum, row) => sum + row.count, 0);
  }

  function readVisibleBagInventory() {
    const root = visibleBagRoot();
    if (!root) {
      throw new Error("当前页面不像背包页；请打开右上角“背包”并保持物品列表可见");
    }
    const inventory = {};
    for (const item of core.EXP_ITEMS) inventory[item.id] = countInventoryAliases(item.aliases, root);
    for (const item of core.KEY_ITEMS) inventory[item.id] = countInventoryAliases(item.aliases, root);

    const interesting = Array.from(root.querySelectorAll("tr,li,div,view,uni-view"))
      .filter(isVisible)
      .map((element) => ({ element, text: String(element.innerText || element.textContent || "").trim() }))
      .filter(({ text }) => /进化/.test(text) && /\d+/.test(text) && text.length <= 260)
      .sort((a, b) => {
        const ar = a.element.getBoundingClientRect();
        const br = b.element.getBoundingClientRect();
        return ar.width * ar.height - br.width * br.height;
      })[0];
    inventory.evolutionMaterialDetected = interesting?.text || "";
    return inventory;
  }

  function storeBagInventory(inventory) {
    state.inventory = JSON.parse(JSON.stringify(inventory || {}));
    state.scans.bag = new Date().toISOString();
    saveState();
    const expTotal = core.EXP_ITEMS.reduce((sum, item) => sum + (state.inventory[item.id] || 0) * item.expW, 0);
    setStatus(`已记录背包：白名单经验总量约 ${expTotal}W，强化丹 A=${state.inventory.strengthA || 0}/B=${state.inventory.strengthB || 0}，至尊神石=${state.inventory.supremeStone || 0}`);
    renderAll();
    autoBuildPlanIfReady();
    return JSON.parse(JSON.stringify(state.inventory));
  }

  function scanBag() {
    return storeBagInventory(readVisibleBagInventory());
  }

  function autoScan() {
    const text = bodyText();
    const results = [];
    if (/等级\s*[：:]?\s*\d+/.test(text) && /成长\s*[：:]?\s*\d/.test(text) && !state.mainPet) {
      try { scanMainPet(); results.push("主宠"); } catch (_) {}
    }
    if (/牧场宠物数量|当前携带宠物数量|我的宝贝/.test(text)) {
      try { scanPasture(); results.push("牧场"); } catch (_) {}
    }
    if (/当前背包空间|我的背包|物品名称/.test(text)) {
      try { scanBag(); results.push("背包"); } catch (_) {}
    }
    if (!results.length) setStatus("当前页面未自动识别；请使用对应的“记录主宠/牧场/背包”按钮", "warn");
    else setStatus(`自动扫描完成：${results.join("、")}`);
  }

  function readConfig() {
    const selectedMode = modeNode?.value;
    const pastureUpgradeMinTier = Math.max(1, Math.min(10, Math.floor(Number(pastureUpgradeMinTierNode?.value) || 1)));
    const pastureUpgradeMaxTier = Math.max(pastureUpgradeMinTier, Math.min(10, Math.floor(Number(pastureUpgradeMaxTierNode?.value) || 8)));
    const rankUpMinTier = Math.max(2, Math.min(9, Math.floor(Number(rankUpMinTierNode?.value) || 8)));
    const rankUpMaxTier = Math.max(rankUpMinTier + 1, Math.min(10, Math.floor(Number(rankUpMaxTierNode?.value) || 9)));
    return {
      mode: ["partial", "formula", "rankup"].includes(selectedMode) ? selectedMode : "full",
      targetCc: Number(targetCcNode?.value || 57.6),
      fullQualificationCc: Number(qualificationCcNode?.value || 60),
      level1To40ExpW: Number(expTargetNode?.value || 563.3),
      useEvolutionMaterial: Boolean(evolutionMaterialNode?.checked),
      allowDirectEvolution: Boolean(directEvolutionNode?.checked),
      useSupremeStone: Boolean(supremeNode?.checked),
      pastureUpgradeCount: Math.max(1, Math.floor(Number(pastureUpgradeCountNode?.value) || 1)),
      pastureMaxTier: Math.max(1, Math.min(10, Math.floor(Number(pastureMaxTierNode?.value) || 8))),
      pastureUpgradeMinTier,
      pastureUpgradeMaxTier,
      rankUpMinTier,
      rankUpMaxTier,
      evolutionPerCycle: Math.max(0, Math.min(10, Math.floor(Number(evolutionPerCycleNode?.value) || 0))),
      evolutionVerifyBatchSize: Math.max(1, Math.min(10, Math.floor(Number(evolutionVerifyBatchSizeNode?.value) || 5))),
      verifyCcDuringEvolutionBatch: Boolean(verifyCcDuringEvolutionBatchNode?.checked),
      allowBackgroundAttempt: Boolean(allowBackgroundAttemptNode?.checked),
      guardMaterialName: String(guardMaterialNode?.value || "天神之石").trim() || "天神之石",
      auxiliaryMaterialName: String(auxiliaryMaterialNode?.value || "★★★成长魂石").trim() || "★★★成长魂石",
    };
  }

  function buildPlan() {
    saveConfig();
    const plan = core.buildPlan({
      mainPet: state.mainPet,
      deputyPet: state.deputyPet,
      pasturePets: state.pasturePets,
      inventory: state.inventory,
      config,
    });
    state.lastPlan = plan;
    saveState();
    renderPlan(plan);
    return plan;
  }

  function autoBuildPlanIfReady() {
    if (!state.mainPet || !state.inventory || !state.pasturePets?.length) return null;
    try {
      const plan = buildPlan();
      setStatus(`自动规划已更新：${plan.candidates.length} 只副宠候选，${plan.blockers.length} 项阻断，${plan.warnings.length} 项提醒`);
      return plan;
    } catch (_) {
      return null;
    }
  }

  function formatExp(exp) {
    if (!exp?.ok) return exp?.reason || "无方案";
    const target = Number(exp.targetW).toFixed(1);
    const overshoot = Number(exp.overshootW).toFixed(1);
    return exp.uses.map((item) => `${item.name}×${item.count}`).join(" + ")
      + ` = ${exp.totalW}W（目标 ≥${target}W，超出 ${overshoot}W）`;
  }

  function renderPlan(plan = state.lastPlan) {
    if (!planNode) return;
    if (!plan) {
      planNode.innerHTML = '<div class="muted">尚未生成规划。</div>';
      return;
    }
    const candidatePreview = plan.candidates.slice(0, 12).map((pet) => (
      `<li>${escapeHtml(pet.name)} · ${pet.tier}阶 · Lv${pet.level} · CC ${pet.cc}</li>`
    )).join("");
    const expLine = plan.lv1CandidateExp ? `<div class="box"><b>Lv1 副宠经验组合</b><br>${escapeHtml(formatExp(plan.lv1CandidateExp))}</div>` : "";
    const pastureLine = plan.pastureUpgradePlan ? `<div class="box"><b>牧场副宠预升级</b><br>
      ${plan.pastureUpgradePlan.maxTier}阶及以下候选 ${plan.pastureUpgradePlan.candidates.length} 只；
      当前白名单经验可供 ${plan.pastureUpgradePlan.capacity} 只升到 Lv40；本次计划 ${Math.min(plan.pastureUpgradePlan.requested, plan.pastureUpgradePlan.capacity)} 只。
    </div>` : "";
    const blockers = plan.blockers.length
      ? `<div class="box bad"><b>阻断</b><ul>${plan.blockers.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>`
      : '<div class="box good"><b>只读规划检查：未发现硬阻断</b></div>';
    const warnings = plan.warnings.length
      ? `<div class="box warn"><b>提醒</b><ul>${plan.warnings.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>`
      : "";
    planNode.innerHTML = `
      ${blockers}${warnings}
      <div class="box"><b>预计流程</b><ol>${plan.steps.map((item) => `<li>${escapeHtml(item.text)}</li>`).join("")}</ol></div>
      ${expLine}${pastureLine}
      <div class="box"><b>符合当前模式的副宠</b>：${plan.candidates.length} 只
        ${candidatePreview ? `<ul>${candidatePreview}</ul>` : ""}
        ${plan.candidates.length > 12 ? `<div class="muted">仅显示前 12 只</div>` : ""}
      </div>`;
  }

  function renderScanSummary() {
    if (!scanSummaryNode) return;
    const main = state.mainPet
      ? `${escapeHtml(state.mainPet.name || "主宠")} ${state.mainPet.effectiveLevel === 0 ? "脚本Lv0（页面Lv1/经验0）" : `Lv${state.mainPet.level}`} / ${state.mainPet.tier}阶 / 进化 ${state.mainPet.evolutionCount == null ? "未记录" : `${state.mainPet.evolutionCount}/10`} / CC ${state.mainPet.cc}`
      : "未记录";
    const deputy = state.deputyPet
      ? `${escapeHtml(state.deputyPet.name || "副宠")} ${state.deputyPet.effectiveLevel === 0 ? "脚本Lv0（页面Lv1/经验0）" : `Lv${state.deputyPet.level}`} / ${state.deputyPet.tier}阶 / CC ${state.deputyPet.cc}`
      : "未记录";
    const bag = state.inventory
      ? `经验道具已扫描；A=${state.inventory.strengthA || 0} / B=${state.inventory.strengthB || 0} / 至尊=${state.inventory.supremeStone || 0}`
      : "未记录";
    scanSummaryNode.innerHTML = `
      <div><b>主宠：</b>${main}</div>
      <div><b>副宠：</b>${deputy}</div>
      <div><b>牧场：</b>${state.pasturePets?.length || 0} 只</div>
      <div><b>背包：</b>${bag}</div>`;
  }

  function renderAll() {
    renderScanSummary();
    renderPlan();
  }

  function setStatus(text, level = "normal") {
    if (statusNode) {
      statusNode.textContent = text;
      statusNode.dataset.level = level;
    }
    window.dispatchEvent(new CustomEvent("pk-god-status", { detail: { text, level } }));
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[char]);
  }

  async function copyPlan() {
    const plan = state.lastPlan || buildPlan();
    const lines = [
      `Play Keeper 神宠规划器 v${VERSION}`,
      `模式：${plan.config.mode === "full" ? "满神" : (plan.config.mode === "partial" ? "残神" : "公式神宠")}`,
      state.mainPet ? `主宠：${state.mainPet.name} ${state.mainPet.effectiveLevel === 0 ? "脚本Lv0(页面Lv1/经验0)" : `Lv${state.mainPet.level}`} ${state.mainPet.tier}阶 CC=${state.mainPet.cc}` : "主宠：未记录",
      state.deputyPet ? `副宠：${state.deputyPet.name} Lv${state.deputyPet.level} ${state.deputyPet.tier}阶 CC=${state.deputyPet.cc}` : "副宠：未记录",
      `副宠候选：${plan.candidates.length} 只`,
      ...plan.steps.map((item, index) => `${index + 1}. ${item.text}`),
      ...plan.warnings.map((item) => `提醒：${item}`),
      ...plan.blockers.map((item) => `阻断：${item}`),
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setStatus("规划已复制");
    } catch (_) {
      setStatus("浏览器未允许复制", "warn");
    }
  }

  function clearSnapshots() {
    state.mainPet = null;
    state.deputyPet = null;
    state.pasturePets = [];
    state.inventory = null;
    state.scans = {};
    state.lastPlan = null;
    saveState();
    renderAll();
    setStatus("已清空本轮只读快照");
  }

  function safeAction(fn) {
    try { fn(); } catch (error) { setStatus(error?.message || String(error), "error"); }
  }

  function applyDock(side) {
    if (!panelHost) return;
    const normalized = side === "left" ? "left" : "right";
    localStorage.setItem(DOCK_KEY, normalized);
    panelHost.style.left = "auto";
    panelHost.style.right = "auto";
    if (normalized === "left") {
      panelHost.style.left = "14px";
    } else {
      const capturePanel = document.getElementById("pk-windows-auto-capture-host");
      const captureVisible = capturePanel && getComputedStyle(capturePanel).display !== "none";
      panelHost.style.right = captureVisible ? "332px" : "14px";
    }
    const dockButton = panelHost.shadowRoot?.querySelector(".dock");
    if (dockButton) dockButton.textContent = normalized === "right" ? "切到左侧" : "切到右侧";
  }

  function applySavedPosition() {
    const position = loadJson(localStorage, POSITION_KEY, null);
    if (!position || !Number.isFinite(Number(position.left)) || !Number.isFinite(Number(position.top))) return false;
    panelHost.style.right = "auto";
    panelHost.style.left = `${Math.max(0, Math.min(innerWidth - 80, Number(position.left)))}px`;
    panelHost.style.top = `${Math.max(0, Math.min(innerHeight - 44, Number(position.top)))}px`;
    return true;
  }

  function installPanelDrag(handle) {
    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.target.closest("button,input,select")) return;
      const rect = panelHost.getBoundingClientRect();
      const startX = event.clientX;
      const startY = event.clientY;
      const originLeft = rect.left;
      const originTop = rect.top;
      const move = (next) => {
        panelHost.style.right = "auto";
        panelHost.style.left = `${Math.max(0, Math.min(innerWidth - 80, originLeft + next.clientX - startX))}px`;
        panelHost.style.top = `${Math.max(0, Math.min(innerHeight - 44, originTop + next.clientY - startY))}px`;
      };
      const up = () => {
        document.removeEventListener("pointermove", move, true);
        document.removeEventListener("pointerup", up, true);
        const finalRect = panelHost.getBoundingClientRect();
        localStorage.setItem(POSITION_KEY, JSON.stringify({ left: finalRect.left, top: finalRect.top }));
      };
      document.addEventListener("pointermove", move, true);
      document.addEventListener("pointerup", up, true);
      event.preventDefault();
    });
  }

  function createPanel() {
    panelHost = document.createElement("div");
    panelHost.id = "pk-god-planner-host";
    panelHost.style.cssText = "all:initial;position:fixed;right:14px;top:14px;z-index:2147483646";
    const shadow = panelHost.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        :host{all:initial}.panel{width:330px;max-height:calc(100vh - 20px);overflow:auto;box-sizing:border-box;padding:11px;border-radius:14px;color:#eef5ff;background:rgba(15,22,32,.96);backdrop-filter:blur(10px);border:1px solid #42536a;box-shadow:0 10px 30px rgba(0,0,0,.42);font:12px/1.5 system-ui,"Microsoft YaHei",sans-serif;overscroll-behavior:contain}
        h3{margin:0 0 4px;font-size:15px;color:#ffd479}.sub{color:#8da1ba;margin-bottom:8px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:7px}.row{margin:6px 0}.row label{display:block;color:#aebed3;margin-bottom:3px}input,select{width:100%;box-sizing:border-box;padding:7px;border-radius:7px;border:1px solid #42536a;background:#0a1018;color:#fff;font:inherit}.checks label{display:flex;gap:6px;align-items:flex-start;margin:5px 0;color:#c8d5e5}.checks input{width:auto;margin-top:2px}.buttons{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:8px 0}.buttons button{min-height:34px}button{padding:7px;border:0;border-radius:7px;background:#ffd479;color:#241b08;font:600 12px system-ui,"Microsoft YaHei",sans-serif;cursor:pointer}button.secondary{background:#2d394b;color:#edf4ff}.status,.summary{margin-top:8px;padding:8px;border-radius:7px;background:#0d1520}.status[data-level=warn]{color:#ffd479}.status[data-level=error]{color:#ff9191}.plan-section,.ui-section{margin-top:8px;border:1px solid #314158;border-radius:9px;background:#0b131e}.plan-section>summary,.ui-section>summary{cursor:pointer;padding:9px 10px;color:#ffd479;font-weight:700;user-select:none}.ui-content{padding:0 9px 9px}.plan-output{max-height:280px;overflow:auto;padding:0 8px 8px;color:#eef5ff}.box{margin:7px 0;padding:7px;border-radius:6px;background:#111d2b;color:#eef5ff}.box.good{border-left:3px solid #54d585}.box.warn{border-left:3px solid #ffd479}.box.bad{border-left:3px solid #ff7979}.box ul,.box ol{margin:5px 0 0;padding-left:18px}.muted{color:#8295ac}.phase{padding:6px 8px;border-radius:7px;background:#281f0d;color:#ffd479;margin-bottom:8px}.danger-note{color:#ffb2b2;font-size:11px;margin-top:7px}.compact .panel-body{display:none}.panel-head{display:flex;justify-content:space-between;gap:8px;align-items:center;cursor:move;user-select:none}.panel-head button{padding:5px 8px;cursor:pointer}.tx-section{margin-top:8px}.rankup-only{display:none}.rankup-mode .rankup-only{display:block}.rankup-mode .cultivation-only{display:none}
      </style>
      <section class="panel">
        <div class="panel-head"><h3>神宠规划器 v${VERSION}</h3><button class="compact-toggle secondary">收起</button></div>
        <div class="panel-body">
        <div class="sub">v1.8.8 · 同身份宠物合成恢复</div>
        <div class="phase">常用模块按需展开；先准备快照，再启动自动循环。</div>
        <details class="ui-section" open><summary>核心设置</summary><div class="ui-content">
        <div class="grid">
          <div class="row"><label>模式</label><select class="mode"><option value="full">满神</option><option value="partial">残神</option><option value="formula">公式神宠</option><option value="rankup">合成升阶</option></select></div>
          <div class="row"><label>Lv1→40 经验(W)</label><input class="exp-target" type="number" min="1" step="0.1"></div>
          <div class="row cultivation-only"><label>普通培养停止 CC</label><input class="target-cc" type="number" step="0.1"></div>
          <div class="row cultivation-only"><label>满神资格 CC &gt;</label><input class="qualification-cc" type="number" step="0.1"></div>
          <div class="row rankup-only"><label>目标起始阶</label><input class="rankup-min-tier" type="number" min="2" max="9" step="1"></div>
          <div class="row rankup-only"><label>本轮中止阶</label><input class="rankup-max-tier" type="number" min="2" max="10" step="1"></div>
        </div></div></details>
        <details class="ui-section"><summary>高级设置</summary><div class="ui-content"><div class="grid">
          <div class="row"><label>普通模式副宠最高阶</label><input class="pasture-max-tier" type="number" min="1" max="10" step="1"></div>
          <div class="row"><label>每周期主宠进化次数</label><input class="evolution-per-cycle" type="number" min="0" max="10" step="1"></div>
          <div class="row"><label>连续进化核验间隔</label><input class="evolution-verify-batch-size" type="number" min="1" max="10" step="1"></div>
          <div class="row"><label>守护材料</label><input class="guard-material" maxlength="30"></div>
          <div class="row"><label>辅助材料</label><input class="auxiliary-material" maxlength="30"></div>
        </div>
        <div class="checks">
          <label><input class="evolution-material" type="checkbox">规划中允许使用进化材料</label>
          <label><input class="direct-evolution" type="checkbox">无进化材料时允许直接进化</label>
          <label><input class="supreme" type="checkbox">满足最终条件时规划使用至尊神石</label>
          <label><input class="verify-cc-batch" type="checkbox">连续进化期间核验 CC</label>
          <label><input class="allow-background" type="checkbox">允许尝试后台运行（实验，默认关闭）</label>
        </div></div></details>
        <details class="ui-section"><summary>牧场副宠补级</summary><div class="ui-content">
        <div class="grid">
          <div class="row"><label>补级数量</label><input class="pasture-upgrade-count" type="number" min="1" max="60" step="1"></div>
          <div class="row"><label>补级最低阶</label><input class="pasture-upgrade-min-tier" type="number" min="1" max="10" step="1"></div>
          <div class="row"><label>补级最高阶</label><input class="pasture-upgrade-max-tier" type="number" min="1" max="10" step="1"></div>
        </div><div class="buttons"><button class="pasture-prelevel">执行牧场副宠补级</button><button class="pasture secondary">记录牧场</button></div>
        </div></details>
        <details class="ui-section"><summary>自动规划</summary><div class="ui-content">
        <div class="buttons">
          <button class="auto-scan">扫描当前页</button><button class="main secondary">锁定主宠</button>
          <button class="deputy secondary">记录当前为副宠</button><button class="pasture secondary">记录牧场</button>
          <button class="bag secondary">记录背包</button><button class="plan-button">生成规划</button>
          <button class="copy secondary">复制规划</button><button class="clear secondary">清空快照</button>
          <button class="capture-toggle secondary">显示自动捕捉</button><button class="dock secondary">复位/换侧</button>
          <button class="hide secondary">隐藏规划器</button>
        </div>
        <div class="status" style="display:none">请手动打开宠物资料、牧场、背包并分别扫描一次。</div>
        <div class="summary"></div>
        <div class="plan-output"></div>
        </div></details>
        <div class="danger-note">自动循环运行前必须锁定主宠、记录背包和牧场，并勾选确认项。</div>
        </div>
      </section>`;
    document.documentElement.appendChild(panelHost);

    statusNode = shadow.querySelector(".status");
    scanSummaryNode = shadow.querySelector(".summary");
    planNode = shadow.querySelector(".plan-output");
    modeNode = shadow.querySelector(".mode");
    targetCcNode = shadow.querySelector(".target-cc");
    qualificationCcNode = shadow.querySelector(".qualification-cc");
    expTargetNode = shadow.querySelector(".exp-target");
    evolutionMaterialNode = shadow.querySelector(".evolution-material");
    directEvolutionNode = shadow.querySelector(".direct-evolution");
    supremeNode = shadow.querySelector(".supreme");
    pastureUpgradeCountNode = shadow.querySelector(".pasture-upgrade-count");
    pastureMaxTierNode = shadow.querySelector(".pasture-max-tier");
    pastureUpgradeMinTierNode = shadow.querySelector(".pasture-upgrade-min-tier");
    pastureUpgradeMaxTierNode = shadow.querySelector(".pasture-upgrade-max-tier");
    rankUpMinTierNode = shadow.querySelector(".rankup-min-tier");
    rankUpMaxTierNode = shadow.querySelector(".rankup-max-tier");
    evolutionPerCycleNode = shadow.querySelector(".evolution-per-cycle");
    evolutionVerifyBatchSizeNode = shadow.querySelector(".evolution-verify-batch-size");
    verifyCcDuringEvolutionBatchNode = shadow.querySelector(".verify-cc-batch");
    allowBackgroundAttemptNode = shadow.querySelector(".allow-background");
    guardMaterialNode = shadow.querySelector(".guard-material");
    auxiliaryMaterialNode = shadow.querySelector(".auxiliary-material");

    modeNode.value = config.mode;
    targetCcNode.value = String(config.targetCc);
    qualificationCcNode.value = String(config.fullQualificationCc);
    expTargetNode.value = String(config.level1To40ExpW);
    evolutionMaterialNode.checked = Boolean(config.useEvolutionMaterial);
    directEvolutionNode.checked = Boolean(config.allowDirectEvolution);
    supremeNode.checked = Boolean(config.useSupremeStone);
    pastureUpgradeCountNode.value = String(config.pastureUpgradeCount || 1);
    pastureMaxTierNode.value = String(config.pastureMaxTier || 8);
    pastureUpgradeMinTierNode.value = String(config.pastureUpgradeMinTier || 1);
    pastureUpgradeMaxTierNode.value = String(config.pastureUpgradeMaxTier ?? config.pastureMaxTier ?? 8);
    rankUpMinTierNode.value = String(config.rankUpMinTier || 8);
    rankUpMaxTierNode.value = String(config.rankUpMaxTier || 9);
    evolutionPerCycleNode.value = String(config.evolutionPerCycle ?? 1);
    evolutionVerifyBatchSizeNode.value = String(config.evolutionVerifyBatchSize ?? 5);
    verifyCcDuringEvolutionBatchNode.checked = config.verifyCcDuringEvolutionBatch !== false;
    allowBackgroundAttemptNode.checked = Boolean(config.allowBackgroundAttempt);
    guardMaterialNode.value = String(config.guardMaterialName || "天神之石");
    auxiliaryMaterialNode.value = String(config.auxiliaryMaterialName || "★★★成长魂石");

    const syncModeUi = () => shadow.querySelector(".panel").classList.toggle("rankup-mode", modeNode.value === "rankup");
    syncModeUi();
    modeNode.addEventListener("change", syncModeUi);
    shadow.querySelector(".auto-scan").addEventListener("click", () => safeAction(autoScan));
    shadow.querySelector(".main").addEventListener("click", () => safeAction(scanMainPet));
    shadow.querySelector(".deputy").addEventListener("click", () => safeAction(scanDeputyPet));
    shadow.querySelectorAll(".pasture").forEach((node) => node.addEventListener("click", () => safeAction(scanPasture)));
    shadow.querySelector(".bag").addEventListener("click", () => safeAction(scanBag));
    shadow.querySelector(".plan-button").addEventListener("click", () => safeAction(buildPlan));
    shadow.querySelector(".copy").addEventListener("click", copyPlan);
    shadow.querySelector(".clear").addEventListener("click", clearSnapshots);
    shadow.querySelector(".dock").addEventListener("click", () => {
      localStorage.removeItem(POSITION_KEY);
      const current = localStorage.getItem(DOCK_KEY) === "left" ? "left" : "right";
      applyDock(current === "right" ? "left" : "right");
    });
    const captureToggle = shadow.querySelector(".capture-toggle");
    const syncCaptureLabel = () => {
      const visible = Boolean(window.PlayKeeperAutoCaptureTest?.isPanelVisible?.());
      captureToggle.textContent = visible ? "隐藏自动捕捉" : "显示自动捕捉";
    };
    captureToggle.addEventListener("click", () => {
      window.PlayKeeperAutoCaptureTest?.togglePanel?.();
      if (!localStorage.getItem(POSITION_KEY)) applyDock(localStorage.getItem(DOCK_KEY) || "right");
      syncCaptureLabel();
    });
    window.addEventListener("pk-auto-capture-visibility", syncCaptureLabel);
    shadow.querySelector(".compact-toggle").addEventListener("click", () => {
      const panel = shadow.querySelector(".panel");
      const compact = panel.classList.toggle("compact");
      shadow.querySelector(".compact-toggle").textContent = compact ? "展开" : "收起";
    });
    shadow.querySelector(".hide").addEventListener("click", () => { panelHost.style.display = "none"; });
    for (const node of [modeNode, targetCcNode, qualificationCcNode, expTargetNode, pastureUpgradeCountNode,
      pastureMaxTierNode, pastureUpgradeMinTierNode, pastureUpgradeMaxTierNode, rankUpMinTierNode, rankUpMaxTierNode, evolutionPerCycleNode, evolutionVerifyBatchSizeNode, guardMaterialNode, auxiliaryMaterialNode,
      evolutionMaterialNode, directEvolutionNode, supremeNode, verifyCcDuringEvolutionBatchNode, allowBackgroundAttemptNode]) {
      node.addEventListener("change", () => { saveConfig(); if (state.lastPlan) buildPlan(); });
    }
    if (!applySavedPosition()) applyDock(localStorage.getItem(DOCK_KEY) || "right");
    installPanelDrag(shadow.querySelector(".panel-head"));
    syncCaptureLabel();
    renderAll();
  }

  createPanel();
  Object.defineProperty(window, "PlayKeeperGodPlanner", {
    configurable: true,
    value: Object.freeze({
      version: VERSION,
      scanMainPet,
      storeMainPet,
      scanDeputyPet,
      storeDeputyPet,
      clearDeputyPet,
      scanPasture,
      scanBag,
      readVisibleBagInventory,
      storeBagInventory,
      autoScan,
      buildPlan,
      getState: () => JSON.parse(JSON.stringify(state)),
      getConfig: () => ({ ...config }),
      core,
    }),
  });
  console.info(`[PK God Planner] v${VERSION} 已加载：只读规划器；单次事务由独立模块提供。`);
})();
