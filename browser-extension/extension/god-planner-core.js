"use strict";

(function initGodPlannerCore(root, factory) {
  const core = factory();
  if (typeof module === "object" && module.exports) module.exports = core;
  if (root) root.PlayKeeperGodPlannerCore = core;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const TIER_DIGITS = {
    "一": 1, "二": 2, "三": 3, "四": 4, "五": 5,
    "六": 6, "七": 7, "八": 8, "九": 9, "十": 10,
  };

  const EXP_ITEMS = Object.freeze([
    { id: "exp500", name: "500W经验月饼", expW: 500, aliases: ["500W经验月饼"] },
    { id: "exp200", name: "200W经验月饼", expW: 200, aliases: ["200W经验月饼"] },
    { id: "bookLarge", name: "修炼秘籍（大）", expW: 20, aliases: ["修炼秘籍（大）", "修炼秘籍(大)"] },
    { id: "bookMedium", name: "修炼秘籍（中）", expW: 10, aliases: ["修炼秘籍（中）", "修炼秘籍(中)"] },
    { id: "bookSmall", name: "修炼秘籍（小）", expW: 5, aliases: ["修炼秘籍（小）", "修炼秘籍(小)"] },
  ]);

  const KEY_ITEMS = Object.freeze([
    { id: "strengthA", name: "强化丹A", aliases: ["强化丹A", "强化丹Ａ"] },
    { id: "strengthB", name: "强化丹B", aliases: ["强化丹B", "强化丹Ｂ"] },
    { id: "supremeStone", name: "至尊神石", aliases: ["至尊神石"] },
  ]);

  // 旧版《口袋精灵2》页面显示的 1→40 逐级经验。
  // 当前 sgplay.cc 实测 Lv1 的“升级经验”为 100，与该表一致。
  // 目标“到达 Lv40”只需要累加 Lv1→Lv39，共 5,633,436 经验。
  const EXP_TO_NEXT = Object.freeze({
    1: 100, 2: 170, 3: 328, 4: 535, 5: 790, 6: 1094, 7: 1447, 8: 1848, 9: 2298,
    10: 3816, 11: 5054, 12: 6402, 13: 7974, 14: 9644, 15: 11628, 16: 13710, 17: 16597,
    18: 19757, 19: 23080, 20: 35487, 21: 41332, 22: 49357, 23: 58546, 24: 68984, 25: 81343,
    26: 96033, 27: 113050, 28: 132574, 29: 155496, 30: 194438, 31: 254776, 32: 317532,
    33: 368684, 34: 414996, 35: 468892, 36: 535308, 37: 614733, 38: 700936, 39: 804667,
  });
  const CUMULATIVE_EXP_TO_NEXT = (() => {
    const result = {};
    let total = 0;
    for (let level = 1; level <= 39; level += 1) {
      total += Number(EXP_TO_NEXT[level] || 0);
      result[level] = total;
    }
    return Object.freeze(result);
  })();
  const TOTAL_EXP_LEVEL1_TO_40 = CUMULATIVE_EXP_TO_NEXT[39];
  const TOTAL_EXP_LEVEL1_TO_40_W = TOTAL_EXP_LEVEL1_TO_40 / 10000;
  const EXP_PER_W = 10000;
  const EXP_DISPLAY_TOLERANCE = 1000; // 页面以 0.1 万显示时的最大舍入误差。

  function parseExperienceValue(value) {
    const normalized = String(value ?? "").replace(/[，,\s]/g, "");
    const match = normalized.match(/^(\d+(?:\.\d+)?)(万|[Ww])?$/);
    if (!match) return null;
    const amount = Number(match[1]);
    if (!Number.isFinite(amount) || amount < 0) return null;
    return Math.round(amount * (match[2] ? EXP_PER_W : 1));
  }

  function extractExperienceValue(compactText, label) {
    const match = String(compactText ?? "").match(new RegExp(String.raw`${label}[：:]?([\d,]+(?:\.\d+)?(?:万|[Ww])?)`));
    return match ? parseExperienceValue(match[1]) : null;
  }

  function clean(value) {
    return String(value ?? "")
      .replace(/\u00a0/g, " ")
      .replace(/[\t\r]+/g, " ")
      .replace(/ +/g, " ")
      .trim();
  }

  function compact(value) {
    return clean(value).replace(/\s+/g, "");
  }

  function tierToNumber(value) {
    const text = compact(value).replace(/阶.*$/, "");
    if (/^\d+$/.test(text)) return Number(text);
    if (Object.prototype.hasOwnProperty.call(TIER_DIGITS, text)) return TIER_DIGITS[text];
    return null;
  }

  function extractEvolutionCount(value) {
    const match = String(value ?? "").match(/进化次数\s*[：:]?\s*(\d{1,2})/);
    if (!match) return null;
    const count = Number(match[1]);
    return Number.isInteger(count) && count >= 0 && count <= 10 ? count : null;
  }

  function extractPetName(raw) {
    const lines = String(raw ?? "").replace(/\u00a0/g, " ").split(/[\r\n]+/).map((line) => line.trim()).filter(Boolean);
    const index = lines.findIndex((line) => /^宝贝\s*[：:]/.test(line));
    if (index < 0) return "";
    const sameLine = lines[index].replace(/^宝贝\s*[：:]\s*/, "").trim();
    if (sameLine) return clean(sameLine);
    for (let i = index + 1; i < lines.length; i += 1) {
      const line = lines[i];
      if (/^(性别|宠物数量|金币|元宝|威望|VIP\s*等级|等级|当前经验|升级经验)\s*[：:]/.test(line)) continue;
      return clean(line);
    }
    return "";
  }

  function normalizedPetProgressText(text) {
    return String(text ?? "")
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      .replace(/\u00a0/g, " ")
      // 排除玩家资料中的 VIP等级，避免误把它识别成宠物等级。
      .replace(/VIP\s*等级\s*[：:]?\s*\d+/gi, " ");
  }

  function parseMainPetText(text) {
    const raw = normalizedPetProgressText(text);
    const compactRaw = raw.replace(/\s+/g, "");
    const levelMatches = [...compactRaw.matchAll(/等级[：:]?(\d{1,3})/g)];
    const currentIndex = compactRaw.indexOf("当前经验");
    const level = levelMatches.findLast
      ? levelMatches.findLast((match) => currentIndex < 0 || match.index < currentIndex)
      : levelMatches.filter((match) => currentIndex < 0 || match.index < currentIndex).at(-1);
    const tier = raw.match(/阶(?:级|数)?\s*[：:]?\s*([一二三四五六七八九十\d]+阶?)/);
    const growth = raw.match(/(?:成长|CC)\s*[：:]?\s*(\d+(?:\.\d+)?)/i);
    const element = raw.match(/五行\s*[：:]?\s*([金木水火土])/);
    const currentExpValue = extractExperienceValue(compactRaw, "当前经验");
    const upgradeExpValue = extractExperienceValue(compactRaw, "升级经验");
    const evolutionCount = extractEvolutionCount(raw);
    if (!level || !growth || (!tier && evolutionCount == null)) return null;
    const displayLevel = Number(level[1]);

    return {
      name: extractPetName(raw),
      level: displayLevel,
      displayLevel,
      effectiveLevel: displayLevel === 1 && currentExpValue === 0 ? 0 : displayLevel,
      currentExp: currentExpValue,
      upgradeExp: upgradeExpValue,
      tier: tier ? tierToNumber(tier[1]) : null,
      tierText: tier ? clean(tier[1]) : "",
      evolutionCount,
      cc: Number(growth[1]),
      element: clean(element?.[1] || ""),
    };
  }

  // 属性页字段在真实 DOM 中可能分属多个元素；innerText/textContent 的空白布局也不固定。
  // 先去掉 VIP等级，再在压缩文本中匹配等级/当前经验/升级经验，不依赖换行边界。
  function parsePetProgressText(text) {
    const raw = normalizedPetProgressText(text);
    const compactRaw = raw.replace(/\s+/g, "");
    const currentExpValue = extractExperienceValue(compactRaw, "当前经验");
    const upgradeExpValue = extractExperienceValue(compactRaw, "升级经验");
    const levelMatches = [...compactRaw.matchAll(/等级[：:]?(\d{1,3})/g)];
    const currentIndex = compactRaw.indexOf("当前经验");
    const level = levelMatches.findLast
      ? levelMatches.findLast((match) => currentIndex < 0 || match.index < currentIndex)
      : levelMatches.filter((match) => currentIndex < 0 || match.index < currentIndex).at(-1);
    if (!level || currentExpValue == null || upgradeExpValue == null) return null;
    const displayLevel = Number(level[1]);
    const tier = raw.match(/阶(?:级|数)?\s*[：:]?\s*([一二三四五六七八九十\d]+阶?)/);
    const growth = raw.match(/(?:成长|CC)\s*[：:]?\s*(\d+(?:\.\d+)?)/i);
    const element = raw.match(/五行\s*[：:]?\s*([金木水火土])/);
    const evolutionCount = extractEvolutionCount(raw);
    return {
      name: extractPetName(raw),
      level: displayLevel,
      displayLevel,
      effectiveLevel: displayLevel === 1 && currentExpValue === 0 ? 0 : displayLevel,
      currentExp: currentExpValue,
      upgradeExp: upgradeExpValue,
      tier: tier ? tierToNumber(tier[1]) : null,
      tierText: tier ? clean(tier[1]) : "",
      evolutionCount,
      cc: growth ? Number(growth[1]) : null,
      element: clean(element?.[1] || ""),
    };
  }

  function remainingExpToLevel40(pet) {
    if (!pet) return { ok: false, reason: "未读取到当前宠物资料" };
    const level = Number(pet.displayLevel ?? pet.level);
    if (!Number.isInteger(level) || level < 1) return { ok: false, reason: "当前宠物等级无效" };
    if (level >= 40) return { ok: true, remainingExp: 0, remainingW: 0, remainingWExact: 0, exact: true, level };

    const currentExp = Number(pet.currentExp);
    const liveUpgradeExp = Number(pet.upgradeExp);
    const expectedUpgradeThreshold = Number(CUMULATIVE_EXP_TO_NEXT[level]);
    const previousThreshold = level <= 1 ? 0 : Number(CUMULATIVE_EXP_TO_NEXT[level - 1]);
    if (!Number.isFinite(currentExp) || currentExp < 0 || !Number.isFinite(liveUpgradeExp) || liveUpgradeExp <= 0) {
      return { ok: false, reason: "当前页面缺少“当前经验 / 升级经验”，无法安全计算到 Lv40 的剩余经验", level };
    }
    if (!Number.isFinite(expectedUpgradeThreshold) || expectedUpgradeThreshold <= 0) {
      return { ok: false, reason: `缺少 Lv${level} 的累计升级经验阈值`, level };
    }

    // 游戏属性页显示的是累计经验阈值（如 Lv39：当前经验 500万 / 升级经验 563.3万），
    // 旧版误把“升级经验”当作单级增量（Lv39=804667），因此产生误报。
    // 页面以 0.1 万显示时会有最多约 500 点舍入差，按 1000 点容差核对。
    const thresholdDiff = Math.abs(liveUpgradeExp - expectedUpgradeThreshold);
    const level1ShowsLevel40Total = level === 1
      && currentExp <= EXP_DISPLAY_TOLERANCE
      && Math.abs(liveUpgradeExp - TOTAL_EXP_LEVEL1_TO_40) <= EXP_DISPLAY_TOLERANCE;
    if (thresholdDiff > EXP_DISPLAY_TOLERANCE && !level1ShowsLevel40Total) {
      return {
        ok: false,
        reason: `当前 Lv${level} 页面升级阈值 ${liveUpgradeExp} 与累计经验曲线 ${expectedUpgradeThreshold} 不一致；停止以避免误用道具`,
        level, currentExp, upgradeExp: liveUpgradeExp, expectedUpgradeExp: expectedUpgradeThreshold,
        thresholdDiff, exact: false,
      };
    }
    if (currentExp < previousThreshold - EXP_DISPLAY_TOLERANCE) {
      return {
        ok: false,
        reason: `当前 Lv${level} 的累计经验 ${currentExp} 低于该等级起点 ${previousThreshold}；可能页面未刷新，停止操作`,
        level, currentExp, upgradeExp: liveUpgradeExp, expectedUpgradeExp: expectedUpgradeThreshold,
      };
    }
    if (currentExp >= TOTAL_EXP_LEVEL1_TO_40) {
      return {
        ok: false,
        reason: `累计经验 ${currentExp} 已达到 Lv40 阈值 ${TOTAL_EXP_LEVEL1_TO_40}，但页面仍显示 Lv${level}；请刷新属性页确认等级`,
        level, currentExp, upgradeExp: liveUpgradeExp,
      };
    }

    const remainingExp = TOTAL_EXP_LEVEL1_TO_40 - currentExp;
    const remainingWExact = remainingExp / EXP_PER_W;
    return {
      ok: true,
      remainingExp,
      remainingW: Math.ceil(remainingWExact),
      remainingWExact,
      exact: true,
      level,
      currentExp,
      upgradeExp: liveUpgradeExp,
      expectedUpgradeExp: level1ShowsLevel40Total ? TOTAL_EXP_LEVEL1_TO_40 : expectedUpgradeThreshold,
      remainingToNext: Math.max(0, expectedUpgradeThreshold - currentExp),
    };
  }


  // 累计经验估算使用页面同一口径：当前经验与升级阈值均为累计经验。
  function estimateLevelProgressFromTotalExp(totalExp) {
    const total = Number(totalExp);
    if (!Number.isFinite(total) || total < 0) {
      return { ok: false, reason: "累计经验必须是非负数" };
    }

    let level = 1;
    while (level < 40 && total >= Number(CUMULATIVE_EXP_TO_NEXT[level])) level += 1;

    if (level >= 40) {
      return {
        ok: true,
        level: 40,
        displayLevel: 40,
        effectiveLevel: 40,
        currentExp: Math.floor(total),
        upgradeExp: null,
        remainingExp: 0,
        remainingW: 0,
        remainingWExact: 0,
        overflowExp: Math.floor(total) - TOTAL_EXP_LEVEL1_TO_40,
        totalAppliedExp: Math.floor(total),
      };
    }

    const upgradeExp = Number(CUMULATIVE_EXP_TO_NEXT[level]);
    const remainingExp = TOTAL_EXP_LEVEL1_TO_40 - Math.floor(total);
    const remainingWExact = remainingExp / EXP_PER_W;
    return {
      ok: true,
      level,
      displayLevel: level,
      effectiveLevel: level === 1 && total === 0 ? 0 : level,
      currentExp: Math.floor(total),
      upgradeExp,
      remainingExp,
      remainingW: Math.ceil(remainingWExact),
      remainingWExact,
      remainingToNext: upgradeExp - Math.floor(total),
      overflowExp: 0,
      totalAppliedExp: Math.floor(total),
    };
  }

  function parsePastureRow(text) {
    const raw = clean(text);
    const match = raw.match(/(.{1,30}?)[（(]\s*([一二三四五六七八九十\d]+阶)\s*([金木水火土]?)\s*[)）]\s*(?:Lv|LV|等级)?\s*(\d{1,3})\s+(\d+(?:\.\d+)?)(?:\s|$)/);
    if (!match) return null;
    const name = clean(match[1]).replace(/^(名称\(五行\)|名称|宠物名称)\s*/i, "");
    const tier = tierToNumber(match[2]);
    if (!name || !tier) return null;
    return {
      name,
      tier,
      tierText: clean(match[2]),
      element: clean(match[3]),
      level: Number(match[4]),
      cc: Number(match[5]),
      sourceText: raw,
    };
  }

  function dedupePets(pets) {
    const seen = new Set();
    return pets.filter((pet) => {
      if (!pet) return false;
      const key = [pet.name, pet.tier, pet.level, pet.cc, pet.element].join("|");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function planExperience(inventory, targetW = 563.3) {
    const target = Math.max(0, Number(targetW) || 0);
    const minimumWholeW = Math.ceil(target);
    if (target === 0) return { ok: true, totalW: 0, overshootW: 0, itemCount: 0, uses: [] };

    const available = EXP_ITEMS.map((item) => ({
      ...item,
      count: Math.max(0, Math.floor(Number(inventory?.[item.id]) || 0)),
    })).filter((item) => item.count > 0);

    if (!available.length) return { ok: false, reason: "没有可用的白名单经验道具", targetW: target, uses: [] };

    const maxExp = available.reduce((sum, item) => sum + item.expW * item.count, 0);
    if (maxExp < target) {
      return { ok: false, reason: `经验不足：库存最多 ${maxExp}W，需要至少 ${target.toFixed(1)}W`, targetW: target, maxExpW: maxExp, uses: [] };
    }

    const largest = Math.max(...available.map((item) => item.expW));
    const upper = Math.min(maxExp, minimumWholeW + largest - 1);
    const dp = Array(upper + 1).fill(null);
    dp[0] = { items: 0, counts: {} };

    for (const item of available) {
      let remaining = item.count;
      let chunk = 1;
      const bundles = [];
      while (remaining > 0) {
        const take = Math.min(chunk, remaining);
        bundles.push({ take, value: take * item.expW });
        remaining -= take;
        chunk *= 2;
      }
      for (const bundle of bundles) {
        for (let value = upper; value >= bundle.value; value -= 1) {
          const prev = dp[value - bundle.value];
          if (!prev) continue;
          const candidateItems = prev.items + bundle.take;
          const current = dp[value];
          if (!current || candidateItems < current.items) {
            dp[value] = {
              items: candidateItems,
              counts: { ...prev.counts, [item.id]: (prev.counts[item.id] || 0) + bundle.take },
            };
          }
        }
      }
    }

    let bestValue = null;
    for (let value = minimumWholeW; value <= upper; value += 1) {
      if (dp[value]) {
        bestValue = value;
        break;
      }
    }
    if (bestValue === null) return { ok: false, reason: "库存存在足够总经验，但无法在当前组合范围内找到方案", targetW: target, uses: [] };

    const best = dp[bestValue];
    const uses = EXP_ITEMS
      .map((item) => ({ id: item.id, name: item.name, expW: item.expW, count: best.counts[item.id] || 0 }))
      .filter((item) => item.count > 0);
    return {
      ok: true,
      targetW: target,
      totalW: bestValue,
      overshootW: Number((bestValue - target).toFixed(4)),
      itemCount: best.items,
      uses,
    };
  }

  function pastureRemainingW(level, fallbackW = TOTAL_EXP_LEVEL1_TO_40_W) {
    const safeLevel = Math.max(1, Math.min(40, Math.floor(Number(level) || 1)));
    if (safeLevel >= 40) return 0;
    if (safeLevel <= 1) return Math.max(0, Number(fallbackW) || TOTAL_EXP_LEVEL1_TO_40_W);
    const reachedLevelExp = Number(CUMULATIVE_EXP_TO_NEXT[safeLevel - 1] || 0);
    return Math.max(0, (TOTAL_EXP_LEVEL1_TO_40 - reachedLevelExp) / EXP_PER_W);
  }

  function pastureSafeInventory(inventory, level, targetW) {
    if (Number(level) <= 1) return { ...(inventory || {}) };
    const hardCeiling = Math.ceil(pastureRemainingW(level, TOTAL_EXP_LEVEL1_TO_40_W));
    const safeItems = EXP_ITEMS.filter((item) => item.expW <= hardCeiling
      && Math.max(0, Math.floor(Number(inventory?.[item.id]) || 0)) > 0);
    const minimumSafe = safeItems.length ? Math.min(...safeItems.map((item) => item.expW)) : 0;
    const ceiling = Math.max(minimumSafe, Math.ceil(Number(targetW) || 0));
    return Object.fromEntries(EXP_ITEMS.map((item) => [
      item.id,
      item.expW <= hardCeiling && item.expW <= ceiling
        ? Math.max(0, Math.floor(Number(inventory?.[item.id]) || 0)) : 0,
    ]));
  }

  function planPastureUpgrades({ pasturePets, inventory, maxTier = 8, count = 1, targetW = 563.3 } = {}) {
    const tierLimit = Math.max(1, Math.min(10, Math.floor(Number(maxTier) || 8)));
    const requested = Math.max(1, Math.floor(Number(count) || 1));
    const remainingInventory = Object.fromEntries(EXP_ITEMS.map((item) => [
      item.id,
      Math.max(0, Math.floor(Number(inventory?.[item.id]) || 0)),
    ]));
    const candidates = (Array.isArray(pasturePets) ? pasturePets : [])
      .filter((pet) => Number(pet?.tier) >= 1 && Number(pet.tier) <= tierLimit && Number(pet.level) < 40)
      .map((pet, index) => ({ ...pet, pastureIndex: Number.isInteger(pet.pastureIndex) ? pet.pastureIndex : index }))
      .sort((a, b) => Number(a.tier) - Number(b.tier)
        || Number(a.cc) - Number(b.cc)
        || Number(a.pastureIndex) - Number(b.pastureIndex));
    const plans = [];
    for (const pet of candidates) {
      const petTargetW = pastureRemainingW(pet.level, targetW);
      const safeInventory = pastureSafeInventory(remainingInventory, pet.level, petTargetW);
      const exp = planExperience(safeInventory, petTargetW);
      if (!exp.ok) continue;
      for (const use of exp.uses) {
        remainingInventory[use.id] = Math.max(0, Number(remainingInventory[use.id] || 0) - Number(use.count || 0));
      }
      plans.push({ pet, targetW: petTargetW, exp });
    }
    return {
      ok: candidates.length >= requested && plans.length >= requested,
      maxTier: tierLimit,
      requested,
      targetW: Number(targetW) || 563.3,
      candidates,
      capacity: plans.length,
      plans,
      selectedPlans: plans.slice(0, requested),
      remainingInventory,
      reason: candidates.length === 0
        ? `牧场没有 ${tierLimit} 阶及以下且低于 Lv40 的宠物`
        : (candidates.length < requested
          ? `符合条件的牧场宠物只有 ${candidates.length} 只，少于请求的 ${requested} 只`
          : (plans.length < requested ? `白名单经验道具最多可供 ${plans.length} 只候选宠物补到 Lv40` : "")),
    };
  }

  function selectCandidates(pets, mode) {
    const normalizedMode = mode === "partial" || mode === "formula" ? mode : "full";
    return dedupePets(Array.isArray(pets) ? pets : []).filter((pet) => {
      if (normalizedMode === "formula") return true;
      if (normalizedMode === "partial") return pet.tier === 10;
      return pet.tier <= 8;
    });
  }


  function planLevel40Transaction({ pet, inventory, targetW = 563.3 }) {
    if (!pet) return { ok: false, reason: "未读取到当前宠物资料" };
    if (Number(pet.level) >= 40) return { ok: true, alreadyDone: true, pet, uses: [], totalW: 0, targetW: 0 };

    const remaining = remainingExpToLevel40(pet);
    // 只读规划兼容旧快照；实际补级事务另行强制要求实时经验字段。
    const safeTargetW = remaining.ok
      ? (remaining.remainingWExact ?? remaining.remainingW)
      : (Number(pet.level) === 1 && pet.currentExp == null && pet.upgradeExp == null ? Number(targetW) || 563.3 : null);
    if (!Number.isFinite(safeTargetW)) return { ok: false, reason: remaining.reason, remaining };

    const exp = planExperience(inventory, safeTargetW);
    if (!exp.ok) return { ok: false, reason: exp.reason, exp, remaining };
    return {
      ok: true, alreadyDone: false, pet, exp, uses: exp.uses, totalW: exp.totalW, targetW: exp.targetW,
      remaining, effectiveLevel: pet.effectiveLevel ?? pet.level,
    };
  }

  function validateEvolutionTransaction({ pet }) {
    if (!pet) return { ok: false, reason: "未读取到当前宠物资料" };
    if (Number(pet.level) < 40) return { ok: false, reason: `当前宠物仅 Lv${pet.level}，必须先达到 Lv40` };
    if (pet.evolutionCount == null || pet.evolutionCount === "") {
      return { ok: false, reason: "尚未记录进化次数；请在宠物资料→属性页等待数据完整显示后重新锁定主宠" };
    }
    const evolutionCount = Number(pet.evolutionCount);
    if (!Number.isInteger(evolutionCount) || evolutionCount < 0 || evolutionCount > 10) {
      return { ok: false, reason: "无法确认属性页的进化次数；请在宠物资料→属性页重新锁定目标宠物" };
    }
    if (evolutionCount >= 10) return { ok: false, reason: "当前宠物进化次数已达到 10，不应继续进化" };
    return { ok: true, beforeEvolutionCount: evolutionCount, expectedEvolutionCount: evolutionCount + 1 };
  }

  function selectUniquePetOption(options, target) {
    if (!target?.name) return { ok: false, reason: "已记录宠物缺少名称，无法精确匹配下拉项" };
    const targetLevel = Number(target.level);
    const targetGrowth = Number(target.cc);
    const candidates = (Array.isArray(options) ? options : []).filter((option) => {
      if (clean(option?.name) !== clean(target.name)) return false;
      if (!Number.isFinite(targetLevel) || Number(option.level) !== targetLevel) return false;
      if (target.portraitKey && option.portraitKey && String(option.portraitKey) !== String(target.portraitKey)) return false;
      return true;
    });
    const exactGrowth = candidates.filter((option) => !Number.isFinite(targetGrowth) || Number(option.growth) === targetGrowth);
    const matches = exactGrowth.length === 1 ? exactGrowth : candidates;
    if (matches.length !== 1) {
      return {
        ok: false,
        reason: matches.length
          ? `宠物下拉中有 ${matches.length} 个与 ${target.name} / Lv${target.level} 身份一致的选项，无法唯一确认`
          : `宠物下拉中找不到与 ${target.name} / Lv${target.level} 身份一致的选项`,
      };
    }
    return {
      ok: true,
      option: matches[0],
      growthChanged: Number.isFinite(targetGrowth) && Number(matches[0].growth) !== targetGrowth,
      previousGrowth: Number.isFinite(targetGrowth) ? targetGrowth : null,
      observedGrowth: Number(matches[0].growth),
    };
  }

  function selectPreferredMaterial(options, preferredNames) {
    const available = (Array.isArray(options) ? options : []).filter((option) => Number(option?.quantity) > 0);
    for (const preferred of preferredNames || []) {
      const matches = available.filter((option) => clean(option.name) === clean(preferred));
      if (matches.length > 1) {
        return { ok: false, reason: `材料下拉中“${preferred}”出现 ${matches.length} 次，无法唯一确认` };
      }
      if (matches.length === 1) return { ok: true, option: matches[0] };
    }
    return { ok: false, reason: `材料下拉中找不到可用的 ${Array.from(preferredNames || []).join(" / ")}` };
  }

  function validateSynthesisTransaction({ mainPet, deputyPet, inventory, config }) {
    const mode = config?.mode === "partial" || config?.mode === "formula" ? config.mode : "full";
    const useSupremeStone = Boolean(config?.useSupremeStone);
    const qualificationCc = Number(config?.fullQualificationCc ?? 60);
    if (!mainPet) return { ok: false, reason: "未读取到锁定主宠资料" };
    if (!deputyPet) return { ok: false, reason: "尚未记录本次副宠；合成前必须先记录并确认副宠达到 Lv40" };
    if (Number(mainPet.level) < 40) return { ok: false, reason: `主宠仅 Lv${mainPet.level}，合成前必须达到 Lv40` };
    if (Number(deputyPet.level) < 40) return { ok: false, reason: `副宠仅 Lv${deputyPet.level}，合成前必须达到 Lv40` };
    if (mode !== "formula" && Number(mainPet.tier) !== 10) {
      return { ok: false, reason: `主宠当前 ${mainPet.tier || "?"}阶；${mode === "partial" ? "残神" : "满神"}合成要求主宠为十阶` };
    }
    if (mode === "full" && Number(deputyPet.tier) > 8) {
      return { ok: false, reason: `满神模式副宠必须八阶及以下；当前副宠为 ${deputyPet.tier || "?"}阶` };
    }
    if (mode === "partial" && Number(deputyPet.tier) !== 10) {
      return { ok: false, reason: `残神模式副宠必须十阶；当前副宠为 ${deputyPet.tier || "?"}阶` };
    }
    if (useSupremeStone) {
      const count = Number(inventory?.supremeStone || 0);
      if (count <= 0) return { ok: false, reason: "已配置使用至尊神石，但背包快照中没有至尊神石" };
      if (mode === "full" && !(Number(mainPet.cc) > qualificationCc)) {
        return { ok: false, reason: `满神模式只有主宠 CC>${qualificationCc} 时才允许规划使用至尊神石；当前 CC=${mainPet.cc}` };
      }
    }
    return {
      ok: true, mode, mainPet, deputyPet,
      deputyTierRule: mode === "formula" ? "公式神宠不限制副宠阶级，但必须 Lv40"
        : (mode === "partial" ? "副宠必须十阶且 Lv40" : "副宠必须八阶及以下且 Lv40"),
      useSupremeStone,
    };
  }

  function buildPlan({ mainPet, deputyPet, pasturePets, inventory, config }) {
    const cfg = {
      mode: config?.mode === "partial" || config?.mode === "formula" ? config.mode : "full",
      targetCc: Number(config?.targetCc ?? 57.6),
      fullQualificationCc: Number(config?.fullQualificationCc ?? 60),
      level1To40ExpW: Number(config?.level1To40ExpW ?? 563.3),
      useEvolutionMaterial: Boolean(config?.useEvolutionMaterial),
      allowDirectEvolution: Boolean(config?.allowDirectEvolution),
      useSupremeStone: Boolean(config?.useSupremeStone),
      pastureUpgradeCount: Math.max(1, Math.floor(Number(config?.pastureUpgradeCount) || 1)),
      pastureMaxTier: Math.max(1, Math.min(10, Math.floor(Number(config?.pastureMaxTier) || 8))),
      evolutionPerCycle: Math.max(0, Math.min(10, Math.floor(Number(config?.evolutionPerCycle) || 0))),
      guardMaterialName: String(config?.guardMaterialName || "天神之石").trim() || "天神之石",
      auxiliaryMaterialName: String(config?.auxiliaryMaterialName || "★★★成长魂石").trim() || "★★★成长魂石",
    };
    const warnings = [];
    const blockers = [];
    const steps = [];
    const candidates = selectCandidates(pasturePets, cfg.mode);

    if (!mainPet) blockers.push("尚未扫描到主宠资料");
    if (cfg.mode === "formula" && mainPet) steps.push({ type: "formula-main", text: `已锁定公式主宠：${mainPet.name || "未识别名称"} Lv${mainPet.level} / ${mainPet.tier}阶 / CC ${mainPet.cc}（公式模式不限制阶级）` });
    if (!Array.isArray(pasturePets) || !pasturePets.length) warnings.push("尚未扫描到牧场宠物，无法评估副宠库存");
    if (!inventory) warnings.push("尚未扫描背包，无法评估经验/强化丹/至尊神石库存");
    if (!deputyPet) warnings.push("尚未记录本次副宠；合成前必须记录副宠并确认达到 Lv40");
    else {
      const deputyRuleOk = cfg.mode === "formula" ? true
        : (cfg.mode === "partial" ? Number(deputyPet.tier) === 10 : Number(deputyPet.tier) <= 8);
      steps.push({
        type: "deputy",
        text: `已记录副宠：${deputyPet.name || "未识别名称"} Lv${deputyPet.level} / ${deputyPet.tier}阶 / CC ${deputyPet.cc}`,
      });
      if (Number(deputyPet.level) < 40) warnings.push(`副宠当前仅 Lv${deputyPet.level}，合成前必须补到 Lv40`);
      if (!deputyRuleOk) warnings.push(cfg.mode === "partial" ? "残神模式副宠必须十阶" : "满神模式副宠必须八阶及以下");
    }

    if (Number.isFinite(cfg.targetCc) && Number.isFinite(cfg.fullQualificationCc)
      && cfg.mode === "full" && cfg.targetCc < cfg.fullQualificationCc) {
      warnings.push(`参数冲突提醒：普通培养停止 CC=${cfg.targetCc} 低于满神资格 CC>${cfg.fullQualificationCc}；自动循环阶段必须把两段流程分开。`);
    }

    if (mainPet) {
      if (mainPet.level < 40) {
        const remaining = remainingExpToLevel40(mainPet);
        if (remaining.ok && inventory) {
          const exp = planExperience(inventory, remaining.remainingWExact ?? remaining.remainingW);
          if (exp.ok) {
            const levelLabel = mainPet.effectiveLevel === 0 ? "Lv0（页面 Lv1 / 经验0）" : `Lv${mainPet.level}`;
            const remainingWLabel = Number(remaining.remainingWExact ?? remaining.remainingW).toFixed(1);
            steps.push({ type: "level-main", text: `主宠 ${levelLabel}→40：剩余 ${remaining.remainingExp} 经验（约 ${remainingWLabel}W），当前库存最省方案 ${exp.totalW}W`, exp, remaining });
          } else blockers.push(`主宠升级计划失败：${exp.reason}`);
        } else if (!remaining.ok) {
          warnings.push(`主宠经验曲线暂无法安全计算：${remaining.reason}`);
        }
      } else {
        steps.push({ type: "main-level-ok", text: "主宠已达到 Lv40" });
      }

      if (cfg.mode === "full") {
        if (mainPet.tier !== 10) steps.push({ type: "evolve-main", text: `主宠当前 ${mainPet.tierText || mainPet.tier + "阶"}，需进化到十阶` });
        else steps.push({ type: "tier-ok", text: "主宠已为十阶" });
        if (mainPet.cc >= cfg.targetCc) steps.push({ type: "target-cc-reached", text: `主宠 CC=${mainPet.cc} 已达到普通培养停止值 ${cfg.targetCc}` });
        else steps.push({ type: "raise-cc", text: `主宠 CC=${mainPet.cc}，继续培养至 ≥ ${cfg.targetCc}` });
        if (mainPet.tier === 10 && mainPet.cc > cfg.fullQualificationCc) {
          steps.push({ type: "full-qualification", text: `已满足满神资格门槛：十阶且 CC>${cfg.fullQualificationCc}` });
        } else {
          warnings.push(`尚未满足满神最终资格：需要十阶且 CC>${cfg.fullQualificationCc}`);
        }
      } else if (cfg.mode === "partial" && mainPet.tier !== 10) {
        blockers.push("残神模式要求主宠为十阶");
      }
    }

    const readyCandidates = candidates.filter((pet) => pet.level >= 40);
    const lv1Candidates = candidates.filter((pet) => pet.level === 1);
    const midLevelCandidates = candidates.filter((pet) => pet.level > 1 && pet.level < 40);
    if (pasturePets?.length) {
      steps.push({
        type: "candidates",
        text: `${cfg.mode === "full" ? "满神" : (cfg.mode === "partial" ? "残神" : "公式神宠")}副宠候选 ${candidates.length} 只：Lv40 ${readyCandidates.length}，Lv1 ${lv1Candidates.length}，中间等级 ${midLevelCandidates.length}`,
      });
      if (!candidates.length) blockers.push(cfg.mode === "full" ? "牧场没有八阶及以下副宠候选"
        : (cfg.mode === "partial" ? "牧场没有十阶副宠候选" : "牧场没有可用副宠候选"));
    }

    let lv1CandidateExp = null;
    if (inventory && lv1Candidates.length) {
      lv1CandidateExp = planExperience(inventory, cfg.level1To40ExpW);
      if (!lv1CandidateExp.ok) warnings.push(`至少一只 Lv1 副宠需要升级，但当前背包：${lv1CandidateExp.reason}`);
    }

    const pastureUpgradePlan = planPastureUpgrades({
      pasturePets,
      inventory,
      maxTier: cfg.pastureMaxTier,
      count: cfg.pastureUpgradeCount,
      targetW: cfg.level1To40ExpW,
    });
    if (pasturePets?.length && inventory) {
      steps.push({
        type: "pasture-upgrade",
        text: `牧场预升级：${cfg.pastureMaxTier}阶及以下按低阶/低CC优先；请求 ${cfg.pastureUpgradeCount} 只，当前白名单经验可供 ${pastureUpgradePlan.capacity} 只`,
      });
      if (pastureUpgradePlan.capacity < cfg.pastureUpgradeCount) warnings.push(pastureUpgradePlan.reason);
    }

    if (inventory) {
      const a = Number(inventory.strengthA || 0);
      const b = Number(inventory.strengthB || 0);
      const supreme = Number(inventory.supremeStone || 0);
      steps.push({ type: "strength", text: `强化丹库存：A=${a}，B=${b}；执行顺序 A→B` });
      if (cfg.useSupremeStone) {
        if (supreme > 0) steps.push({ type: "supreme", text: `至尊神石库存 ${supreme}，配置为满足条件时使用` });
        else blockers.push("已勾选使用至尊神石，但背包未扫描到至尊神石");
      } else {
        steps.push({ type: "supreme-off", text: `至尊神石库存 ${supreme}，当前配置不自动使用` });
      }
    }

    return {
      config: cfg,
      mainPet: mainPet || null,
      deputyPet: deputyPet || null,
      candidates,
      readyCandidates,
      lv1Candidates,
      midLevelCandidates,
      lv1CandidateExp,
      pastureUpgradePlan,
      warnings,
      blockers,
      steps,
      executable: blockers.length === 0,
    };
  }

  return Object.freeze({
    EXP_ITEMS,
    KEY_ITEMS,
    EXP_TO_NEXT,
    CUMULATIVE_EXP_TO_NEXT,
    TOTAL_EXP_LEVEL1_TO_40,
    TOTAL_EXP_LEVEL1_TO_40_W,
    EXP_PER_W,
    parseExperienceValue,
    clean,
    compact,
    tierToNumber,
    extractEvolutionCount,
    parseMainPetText,
    parsePetProgressText,
    remainingExpToLevel40,
    estimateLevelProgressFromTotalExp,
    parsePastureRow,
    dedupePets,
    planExperience,
    pastureRemainingW,
    pastureSafeInventory,
    planPastureUpgrades,
    selectCandidates,
    planLevel40Transaction,
    validateEvolutionTransaction,
    validateSynthesisTransaction,
    selectUniquePetOption,
    selectPreferredMaterial,
    buildPlan,
  });
});
