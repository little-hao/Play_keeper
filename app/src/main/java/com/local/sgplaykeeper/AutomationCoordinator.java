package com.local.sgplaykeeper;

import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;
import android.webkit.WebView;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import org.json.JSONTokener;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Per-account, foreground-only automation for the Play Keeper WebViews.
 *
 * The coordinator intentionally operates through the visible page DOM. It does not call private
 * game APIs or retain account credentials. Auction operations keep one item and preserve the
 * site's default unit price. Store sell operations are kept separate because they use a different
 * page and confirmation dialog. Both flows re-read and verify the visible DOM before confirming.
 */
final class AutomationCoordinator {
    interface Host {
        WebView requireWebView(int accountIndex);

        void openHome(int accountIndex);

        void prepareAutomation(int accountIndex, boolean landscape);

        boolean isAccountOpened(int accountIndex);

        void onAutomationChanged();

        void showMessage(String message);
    }

    static final long DEFAULT_SELL_INTERVAL_MS = 12L * 60L * 60L * 1000L;
    static final long TEMPLE_CHECK_INTERVAL_MS = 60L * 60L * 1000L;
    static final long BATTLE_MONITOR_INTERVAL_MS = 30L * 60L * 1000L;
    private static final long TICK_INTERVAL_MS = 60_000L;
    static final String AUCTION_PRESET_ONE = "曙光印记,进化宝石";
    static final String AUCTION_PRESET_TWO = "强化丹A,强化丹B,天仙雨露,雨露结晶";
    static final String AUCTION_PRESET_THREE = "黑暗徽章,黑暗结晶,黑暗首领的勋章,黑暗宝石";
    private static final String DEFAULT_AUCTION_ITEMS = AUCTION_PRESET_ONE;
    private static final String DEFAULT_STORE_ITEMS = "金币券";
    private static final String DEFAULT_BUYER = "hao";
    static final String DEFAULT_EQUIPMENT_ITEMS = "柔情方巾·改,轻罗流萤衫·改,逢羡履·改,君我剑·改,佳人之恋·改,"
            + "三生戒·改,比翼·改,相望镯·改,尾生之泪·改,龙神印记·庆";
    private static final int DEFAULT_EQUIPMENT_PRICE = 920;
    private static final int EQUIPMENT_ACTIVE_LIMIT = 5;
    private static final long EQUIPMENT_WAIT_INTERVAL_MS = 30_000L;
    private static final long EQUIPMENT_WAIT_TIMEOUT_MS = 24L * 60L * 60L * 1000L;
    private static final long PAINTING_CHECK_INTERVAL_MS = 15_000L;
    private static final long PAINTING_TIMEOUT_MS = 3L * 60L * 60L * 1000L;
    private static final Set<String> ALLOWED_STORE_ITEMS = new LinkedHashSet<>(
            Arrays.asList("金币券"));

    private static final String PREF_SELL_ENABLED = "automation_sell_enabled_";
    private static final String PREF_SELL_ITEMS = "automation_sell_items_";
    private static final String PREF_SELL_BUYER = "automation_sell_buyer_";
    private static final String PREF_SELL_INTERVAL = "automation_sell_interval_";
    private static final String PREF_SELL_LAST = "automation_sell_last_";
    private static final String PREF_STORE_ITEMS = "automation_store_items_";
    private static final String PREF_STORE_ENABLED = "automation_store_enabled_";
    private static final String PREF_STORE_INTERVAL = "automation_store_interval_";
    private static final String PREF_STORE_LAST = "automation_store_last_";
    private static final String PREF_TEMPLE_ENABLED = "automation_temple_enabled_";
    private static final String PREF_TEMPLE_LAST = "automation_temple_last_";
    private static final String PREF_EQUIPMENT_ITEMS = "automation_equipment_items_";
    private static final String PREF_EQUIPMENT_PRICE = "automation_equipment_price_";
    private static final String PREF_EQUIPMENT_BUYER = "automation_equipment_buyer_";

    private final SharedPreferences preferences;
    private final Host host;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final RuntimeState[] states;
    private boolean stopped;

    AutomationCoordinator(SharedPreferences preferences, Host host, int accountCount) {
        this.preferences = preferences;
        this.host = host;
        states = new RuntimeState[accountCount];
        for (int i = 0; i < accountCount; i++) {
            states[i] = new RuntimeState();
        }
    }

    void start() {
        stopped = false;
        handler.removeCallbacks(tickRunnable);
        handler.postDelayed(tickRunnable, 10_000L);
    }

    void stop() {
        stopped = true;
        handler.removeCallbacksAndMessages(null);
    }

    boolean isAuctionEnabled(int accountIndex) {
        return preferences.getBoolean(PREF_SELL_ENABLED + accountIndex, false);
    }

    boolean isTempleEnabled(int accountIndex) {
        return preferences.getBoolean(PREF_TEMPLE_ENABLED + accountIndex, false);
    }

    boolean isStoreSellEnabled(int accountIndex) {
        return preferences.getBoolean(PREF_STORE_ENABLED + accountIndex, false);
    }

    String auctionItemsText(int accountIndex) {
        List<String> items = parseAuctionItems(preferences.getString(
                PREF_SELL_ITEMS + accountIndex, DEFAULT_AUCTION_ITEMS));
        return items.isEmpty() ? DEFAULT_AUCTION_ITEMS : String.join(",", items);
    }

    String auctionBuyer(int accountIndex) {
        return sanitizeBuyer(preferences.getString(
                PREF_SELL_BUYER + accountIndex, DEFAULT_BUYER));
    }

    int auctionIntervalHours(int accountIndex) {
        long interval = preferences.getLong(
                PREF_SELL_INTERVAL + accountIndex, DEFAULT_SELL_INTERVAL_MS);
        return (int) Math.max(1L, Math.min(168L, interval / (60L * 60L * 1000L)));
    }

    String storeSellItemsText(int accountIndex) {
        List<String> items = parseAllowedItems(preferences.getString(
                PREF_STORE_ITEMS + accountIndex, DEFAULT_STORE_ITEMS), ALLOWED_STORE_ITEMS);
        return items.isEmpty() ? DEFAULT_STORE_ITEMS : String.join(",", items);
    }

    int storeSellIntervalHours(int accountIndex) {
        long interval = preferences.getLong(
                PREF_STORE_INTERVAL + accountIndex, DEFAULT_SELL_INTERVAL_MS);
        return (int) Math.max(1L, Math.min(168L, interval / (60L * 60L * 1000L)));
    }

    String equipmentItemsText(int accountIndex) {
        List<String> items = parseEquipmentItems(preferences.getString(
                PREF_EQUIPMENT_ITEMS + accountIndex, DEFAULT_EQUIPMENT_ITEMS));
        return items.isEmpty() ? DEFAULT_EQUIPMENT_ITEMS : String.join(",", items);
    }

    int equipmentPrice(int accountIndex) {
        return Math.max(1, Math.min(9_999_999, preferences.getInt(
                PREF_EQUIPMENT_PRICE + accountIndex, DEFAULT_EQUIPMENT_PRICE)));
    }

    String equipmentBuyer(int accountIndex) {
        return sanitizePlayerId(preferences.getString(PREF_EQUIPMENT_BUYER + accountIndex, ""));
    }

    void configureAuction(int accountIndex, boolean enabled, String itemText,
                          String buyer, int intervalHours) {
        requireAccount(accountIndex);
        List<String> items = parseAuctionItems(itemText);
        if (items.isEmpty()) {
            throw new IllegalArgumentException("至少需要一种拍卖道具");
        }
        String safeBuyer = sanitizeBuyer(buyer);
        if (safeBuyer.isBlank()) {
            throw new IllegalArgumentException("指定买家不能为空");
        }
        int safeHours = Math.max(1, Math.min(168, intervalHours));
        preferences.edit()
                .putBoolean(PREF_SELL_ENABLED + accountIndex, enabled)
                .putString(PREF_SELL_ITEMS + accountIndex, String.join(",", items))
                .putString(PREF_SELL_BUYER + accountIndex, safeBuyer)
                .putLong(PREF_SELL_INTERVAL + accountIndex,
                        safeHours * 60L * 60L * 1000L)
                .apply();
        host.onAutomationChanged();
    }

    void configureStoreSell(int accountIndex, boolean enabled, String itemText,
                            int intervalHours) {
        requireAccount(accountIndex);
        List<String> items = requireAllowedItems(itemText, ALLOWED_STORE_ITEMS, "商店卖出");
        int safeHours = Math.max(1, Math.min(168, intervalHours));
        preferences.edit()
                .putBoolean(PREF_STORE_ENABLED + accountIndex, enabled)
                .putString(PREF_STORE_ITEMS + accountIndex, String.join(",", items))
                .putLong(PREF_STORE_INTERVAL + accountIndex,
                        safeHours * 60L * 60L * 1000L)
                .apply();
        host.onAutomationChanged();
    }

    void configureTemple(int accountIndex, boolean enabled) {
        requireAccount(accountIndex);
        preferences.edit().putBoolean(PREF_TEMPLE_ENABLED + accountIndex, enabled).apply();
        host.onAutomationChanged();
    }

    void configureEquipmentTransfer(int accountIndex, String itemText, int price,
                                    String buyer) {
        requireAccount(accountIndex);
        List<String> items = parseEquipmentItems(itemText);
        if (items.isEmpty()) {
            throw new IllegalArgumentException("至少需要一件装备");
        }
        if (price < 1 || price > 9_999_999) {
            throw new IllegalArgumentException("装备单价需为1–9999999金币");
        }
        String safeBuyer = sanitizePlayerId(buyer);
        preferences.edit()
                .putString(PREF_EQUIPMENT_ITEMS + accountIndex, String.join(",", items))
                .putInt(PREF_EQUIPMENT_PRICE + accountIndex, price)
                .putString(PREF_EQUIPMENT_BUYER + accountIndex, safeBuyer)
                .apply();
        host.onAutomationChanged();
    }

    void runAuctionNow(int accountIndex) {
        requireAccount(accountIndex);
        runAutoAuction(accountIndex, true);
    }

    void runStoreSellNow(int accountIndex) {
        requireAccount(accountIndex);
        runStoreSell(accountIndex, true);
    }

    void runTempleNow(int accountIndex) {
        requireAccount(accountIndex);
        runTempleGuard(accountIndex, true, false);
    }

    void runEquipmentSellNow(int accountIndex) {
        requireAccount(accountIndex);
        runEquipmentTransfer(accountIndex, true, true);
    }

    void runEquipmentBuyNow(int accountIndex) {
        requireAccount(accountIndex);
        runEquipmentTransfer(accountIndex, false, true);
    }

    void appendAccountTelemetry(JSONObject account, int accountIndex) throws JSONException {
        RuntimeState state = states[accountIndex];
        JSONObject automation = new JSONObject();
        List<String> auctionItems = parseAuctionItems(auctionItemsText(accountIndex));
        automation.put("auctionEnabled", isAuctionEnabled(accountIndex));
        automation.put("auctionItems", new JSONArray(auctionItems));
        automation.put("auctionBuyer", auctionBuyer(accountIndex));
        automation.put("auctionIntervalHours", auctionIntervalHours(accountIndex));
        automation.put("auctionLastRunAt", preferences.getLong(
                PREF_SELL_LAST + accountIndex, 0L));
        automation.put("storeSellItems", new JSONArray(parseAllowedItems(
                storeSellItemsText(accountIndex), ALLOWED_STORE_ITEMS)));
        automation.put("storeSellEnabled", isStoreSellEnabled(accountIndex));
        automation.put("storeSellIntervalHours", storeSellIntervalHours(accountIndex));
        automation.put("storeSellLastRunAt", preferences.getLong(
                PREF_STORE_LAST + accountIndex, 0L));
        // v1.0 Relay compatibility while the VPS is being upgraded.
        automation.put("sellEnabled", isAuctionEnabled(accountIndex));
        automation.put("sellItems", new JSONArray(auctionItems));
        automation.put("sellBuyer", auctionBuyer(accountIndex));
        automation.put("sellIntervalHours", auctionIntervalHours(accountIndex));
        automation.put("sellLastRunAt", preferences.getLong(PREF_SELL_LAST + accountIndex, 0L));
        automation.put("templeEnabled", isTempleEnabled(accountIndex));
        automation.put("templeLastCheckAt", preferences.getLong(
                PREF_TEMPLE_LAST + accountIndex, 0L));
        automation.put("equipmentItems", new JSONArray(parseEquipmentItems(
                equipmentItemsText(accountIndex))));
        automation.put("equipmentPrice", equipmentPrice(accountIndex));
        automation.put("equipmentBuyer", equipmentBuyer(accountIndex));
        automation.put("busy", state.busy);
        automation.put("task", state.task);
        automation.put("status", state.status);
        automation.put("lastMessage", state.lastMessage);
        automation.put("updatedAt", state.updatedAt);
        automation.put("monitorStatus", state.monitorStatus);
        automation.put("monitorMessage", state.monitorMessage);
        automation.put("lastBattleCount", state.lastBattleCount);
        automation.put("battleLastCheckAt", state.lastBattleCheckAt);
        account.put("automation", automation);
    }

    private final Runnable tickRunnable = new Runnable() {
        @Override
        public void run() {
            if (stopped) {
                return;
            }
            long now = System.currentTimeMillis();
            for (int i = 0; i < states.length; i++) {
                if (states[i].busy || !host.isAccountOpened(i)) {
                    continue;
                }
                long sellInterval = preferences.getLong(
                        PREF_SELL_INTERVAL + i, DEFAULT_SELL_INTERVAL_MS);
                long sellLast = preferences.getLong(PREF_SELL_LAST + i, 0L);
                if (isAuctionEnabled(i) && now - sellLast >= sellInterval) {
                    runAutoAuction(i, false);
                    continue;
                }
                long storeInterval = preferences.getLong(
                        PREF_STORE_INTERVAL + i, DEFAULT_SELL_INTERVAL_MS);
                long storeLast = preferences.getLong(PREF_STORE_LAST + i, 0L);
                if (isStoreSellEnabled(i) && now - storeLast >= storeInterval) {
                    runStoreSell(i, false);
                    continue;
                }
                long templeLast = preferences.getLong(PREF_TEMPLE_LAST + i, 0L);
                if (isTempleEnabled(i) && now - templeLast >= TEMPLE_CHECK_INTERVAL_MS) {
                    runTempleGuard(i, false, false);
                    continue;
                }
                if (now - states[i].lastBattleCheckAt >= BATTLE_MONITOR_INTERVAL_MS) {
                    monitorBattleProgress(i);
                }
            }
            handler.postDelayed(this, TICK_INTERVAL_MS);
        }
    };

    private void runEquipmentTransfer(int accountIndex, boolean selling, boolean manual) {
        RuntimeState state = states[accountIndex];
        if (state.busy) {
            if (manual) host.showMessage(accountName(accountIndex) + "脚本正在执行");
            return;
        }
        List<String> items = parseEquipmentItems(equipmentItemsText(accountIndex));
        if (items.isEmpty()) {
            finish(accountIndex, selling ? "equipment_sell" : "equipment_buy", "error",
                    "装备列表为空", manual);
            return;
        }
        if (selling && equipmentBuyer(accountIndex).isBlank()) {
            finish(accountIndex, "equipment_sell", "error", "上架前请先填写指定买家ID", manual);
            return;
        }
        state.busy = true;
        state.task = selling ? "equipment_sell" : "equipment_buy";
        state.status = "running";
        state.lastMessage = selling ? "正在一键脱下装备" : "正在打开装备交易所购买";
        state.updatedAt = System.currentTimeMillis();
        state.orientationRecoveryClicked = false;
        state.equipmentListedInBatch = 0;
        state.equipmentBatchNames.clear();
        state.equipmentBatchSeen = false;
        state.equipmentBatchEmptyChecks = 0;
        state.equipmentWaitStartedAt = System.currentTimeMillis();
        state.equipmentPurchasedNames.clear();
        state.paintingStarted = false;
        state.paintingStartedAt = 0L;
        host.onAutomationChanged();
        WebView view;
        try {
            view = host.requireWebView(accountIndex);
        } catch (RuntimeException error) {
            finish(accountIndex, state.task, "error", "账号页面未就绪", manual);
            return;
        }
        host.prepareAutomation(accountIndex, true);
        if (selling) {
            handler.postDelayed(() -> preparePetEquipment(
                    accountIndex, view, items, false, manual, 0), 1_800L);
        } else {
            handler.postDelayed(() -> navigateToEquipmentExchange(
                    accountIndex, view, items, false, manual, 0), 1_800L);
        }
    }

    private void preparePetEquipment(int accountIndex, WebView view, List<String> items,
                                     boolean equip, boolean manual, int attempt) {
        String action = equip ? "一键穿装备" : "一键脱装备";
        String script = "(function(){"
                + "const visible=e=>e&&e.getClientRects().length>0;"
                + "const clean=e=>(e?.textContent||'').replace(/\\s+/g,'');"
                + orientationRecoveryScript(accountIndex)
                + "const all=Array.from(document.querySelectorAll('[name],button,[role=button],uni-button,a,view,div')).filter(visible);"
                + "const exact=(e,label)=>(e.getAttribute('name')||'').trim()===label"
                + "||clean(e)===label;"
                + "const action=all.find(e=>exact(e," + JSONObject.quote(action) + "));"
                + "if(action){action.click();return 'action_clicked';}"
                + "const pet=all.find(e=>exact(e,'宠物资料'));"
                + "if(pet){pet.click();return 'pet_clicked';}"
                + "const game=all.find(e=>exact(e,'进入主游戏'));"
                + "if(game){game.click();return 'game_clicked';}return 'missing';})()";
        view.evaluateJavascript(script, encoded -> {
            String result = decodeString(encoded);
            if ("orientation_clicked".equals(result)) {
                states[accountIndex].orientationRecoveryClicked = true;
                updateState(accountIndex, "已点击横屏恢复，正在确认画面");
                handler.postDelayed(() -> preparePetEquipment(
                        accountIndex, view, items, equip, manual, attempt + 1), 1_800L);
            } else if ("orientation_failed".equals(result)
                    || "orientation_missing".equals(result)) {
                finish(accountIndex, equip ? "equipment_buy" : "equipment_sell", "error",
                        "横屏提示未恢复，已停止继续点击", manual);
            } else if ("action_clicked".equals(result)) {
                updateState(accountIndex, equip ? "已执行一键穿装备" : "已执行一键脱装备");
                if (equip) {
                    handler.postDelayed(() -> returnToAfkForPainting(
                            accountIndex, view, manual), 1_800L);
                } else {
                    handler.postDelayed(() -> navigateToEquipmentExchange(
                            accountIndex, view, items, true, manual, 0), 1_800L);
                }
            } else if (result.endsWith("_clicked") && attempt < 10) {
                handler.postDelayed(() -> preparePetEquipment(
                        accountIndex, view, items, equip, manual, attempt + 1), 1_500L);
            } else if (attempt == 0) {
                host.openHome(accountIndex);
                handler.postDelayed(() -> preparePetEquipment(
                        accountIndex, view, items, equip, manual, 1), 4_000L);
            } else {
                finish(accountIndex, equip ? "equipment_buy" : "equipment_sell", "error",
                        "未找到“宠物资料 → " + action + "”", manual);
            }
        });
    }

    private void navigateToEquipmentExchange(int accountIndex, WebView view, List<String> items,
                                               boolean selling, boolean manual, int attempt) {
        String script = "(function(){"
                + "const visible=e=>e&&e.getClientRects().length>0;"
                + "const clean=e=>(e?.textContent||'').replace(/\\s+/g,'');"
                + orientationRecoveryScript(accountIndex)
                + "const boxes=Array.from(document.querySelectorAll('.cont-box'));"
                + "const backpack=boxes.some(e=>visible(e)&&clean(e).includes('装备数：'));"
                + "const market=boxes.some(e=>visible(e)&&clean(e).includes('价格(金币)'));"
                + "if(backpack&&market)return 'ready';"
                + "const all=Array.from(document.querySelectorAll('[name],button,[role=button],uni-button,a,view,div'));"
                + "const exact=(e,label)=>(e.getAttribute('name')||'').trim()===label"
                + "||(e.textContent||'').trim()===label;"
                + "const exchange=all.find(e=>visible(e)&&exact(e,'装备交易所'));"
                + "if(exchange){exchange.click();return 'exchange_clicked';}"
                + "const town=all.find(e=>visible(e)&&exact(e,'中心城镇'));"
                + "if(town){town.click();return 'town_clicked';}"
                + "const game=all.find(e=>visible(e)&&exact(e,'进入主游戏'));"
                + "if(game){game.click();return 'game_clicked';}return 'missing';})()";
        view.evaluateJavascript(script, encoded -> {
            String result = decodeString(encoded);
            if ("ready".equals(result)) {
                handler.postDelayed(() -> processEquipmentItem(
                        accountIndex, view, items, 0, selling, manual), 500L);
            } else if ("orientation_clicked".equals(result)) {
                states[accountIndex].orientationRecoveryClicked = true;
                updateState(accountIndex, "已点击横屏恢复，正在确认画面");
                handler.postDelayed(() -> navigateToEquipmentExchange(
                        accountIndex, view, items, selling, manual, attempt + 1), 1_800L);
            } else if ("orientation_failed".equals(result)
                    || "orientation_missing".equals(result)) {
                finish(accountIndex, selling ? "equipment_sell" : "equipment_buy", "error",
                        "横屏提示未恢复，已停止继续点击", manual);
            } else if (result.endsWith("_clicked") && attempt < 10) {
                long delay = "exchange_clicked".equals(result) ? 2_500L : 1_500L;
                handler.postDelayed(() -> navigateToEquipmentExchange(
                        accountIndex, view, items, selling, manual, attempt + 1), delay);
            } else if (attempt == 0) {
                host.openHome(accountIndex);
                handler.postDelayed(() -> navigateToEquipmentExchange(
                        accountIndex, view, items, selling, manual, 1), 4_000L);
            } else {
                finish(accountIndex, selling ? "equipment_sell" : "equipment_buy", "error",
                        "未找到“中心城镇 → 装备交易所”入口", manual);
            }
        });
    }

    private void processEquipmentItem(int accountIndex, WebView view, List<String> items,
                                      int itemIndex, boolean selling, boolean manual) {
        if (stopped || !states[accountIndex].busy) return;
        if (itemIndex >= items.size()) {
            if (selling) {
                restoreAfkAfterOperation(accountIndex, view, manual, "装备上架检查完成");
            } else {
                updateState(accountIndex, "全部目标装备已购买，正在一键穿装备");
                preparePetEquipment(accountIndex, view, items, true, manual, 0);
            }
            return;
        }
        String itemName = items.get(itemIndex);
        updateState(accountIndex, (selling ? "正在上架 " : "正在查找 ") + itemName);
        if (selling) {
            openEquipmentSellDialog(accountIndex, view, items, itemIndex, itemName, manual);
        } else {
            openEquipmentBuyDialog(accountIndex, view, items, itemIndex, itemName, manual);
        }
    }

    private void openEquipmentSellDialog(int accountIndex, WebView view, List<String> items,
                                         int itemIndex, String itemName, boolean manual) {
        String script = "(function(){const target=" + JSONObject.quote(itemName) + ";"
                + "const visible=e=>e&&e.getClientRects().length>0;"
                + "const boxes=Array.from(document.querySelectorAll('.cont-box'));"
                + "const box=boxes.find(e=>(e.textContent||'').includes('装备数：'));"
                + "if(!box)return JSON.stringify({status:'not_ready'});"
                + "const rows=Array.from(box.querySelectorAll('.ul .li'));"
                + "const matches=rows.filter(e=>{const c=Array.from(e.children);"
                + "return c.length>=2&&(c[1].textContent||'').trim()===target;});"
                + "if(!matches.length){const refresh=Array.from(document.querySelectorAll('button,uni-button,[role=button],a,view'))"
                + ".find(e=>visible(e)&&(e.textContent||'').replace(/\\s+/g,'')==='点击刷新');"
                + "if(refresh)refresh.click();return JSON.stringify({status:'missing'});}"
                + "const row=matches[0];row.scrollIntoView({block:'nearest'});row.click();"
                + "const sell=Array.from(document.querySelectorAll('button,uni-button,[role=button]'))"
                + ".find(e=>visible(e)&&(e.textContent||'').trim()==='卖出');"
                + "if(!sell)return JSON.stringify({status:'no_sell'});sell.click();"
                + "return JSON.stringify({status:'dialog',before:matches.length});})()";
        view.evaluateJavascript(script, encoded -> {
            JSONObject result = decodeObject(encoded);
            String status = result == null ? "invalid" : result.optString("status");
            if ("missing".equals(status)) {
                updateState(accountIndex, itemName + "：背包无此装备");
                handler.postDelayed(() -> processEquipmentItem(
                        accountIndex, view, items, itemIndex + 1, true, manual), 350L);
                return;
            }
            if (!"dialog".equals(status)) {
                finish(accountIndex, "equipment_sell", "error",
                        itemName + "：无法打开上架弹窗（" + status + "）", manual);
                return;
            }
            int before = result.optInt("before", 1);
            handler.postDelayed(() -> fillAndConfirmEquipmentSell(accountIndex, view, items,
                    itemIndex, itemName, before, manual, 0), 700L);
        });
    }

    private void fillAndConfirmEquipmentSell(int accountIndex, WebView view, List<String> items,
                                             int itemIndex, String itemName, int before,
                                             boolean manual, int attempt) {
        int price = equipmentPrice(accountIndex);
        String buyer = equipmentBuyer(accountIndex);
        String script = "(function(){const target=" + JSONObject.quote(itemName)
                + ",buyer=" + JSONObject.quote(buyer) + ",price=" + price + ";"
                + "const modal=Array.from(document.querySelectorAll('.sell-modal'))"
                + ".find(e=>e.getClientRects().length>0"
                + "&&(e.querySelector('.modal-title')?.textContent||'').trim()==='上架装备拍卖');"
                + "if(!modal)return JSON.stringify({status:'no_dialog'});"
                + "const name=(modal.querySelector('.item-name')?.textContent||'').trim();"
                + "if(name!==target)return JSON.stringify({status:'wrong_item',name});"
                + "const inputs=Array.from(modal.querySelectorAll('input')).filter(e=>e.type!=='hidden'&&!e.disabled);"
                + "const p=inputs.find(e=>e.type==='number')||inputs[0];"
                + "const b=inputs.find(e=>e!==p&&(e.type==='text'||/ID|买家|玩家/i.test(e.placeholder||'')))||inputs[1];"
                + "if(!p||!b)return JSON.stringify({status:'inputs_missing',count:inputs.length});"
                + "const d=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');"
                + "const set=(e,v)=>{d.set.call(e,String(v));e.dispatchEvent(new Event('input',{bubbles:true}));"
                + "e.dispatchEvent(new Event('change',{bubbles:true}));};set(p,price);set(b,buyer);"
                + "const confirm=Array.from(modal.querySelectorAll('button,uni-button,[role=button]'))"
                + ".find(e=>(e.textContent||'').trim()==='确认上架');"
                + "if(!confirm)return JSON.stringify({status:'no_confirm'});"
                + "if(parseInt(p.value,10)!==price||b.value!==buyer)"
                + "return JSON.stringify({status:'verify_failed',pv:p.value,bv:b.value});"
                + "confirm.click();return JSON.stringify({status:'submitted'});})()";
        view.evaluateJavascript(script, encoded -> {
            JSONObject result = decodeObject(encoded);
            String status = result == null ? "invalid" : result.optString("status");
            if (!"submitted".equals(status)) {
                if (("no_dialog".equals(status) || "inputs_missing".equals(status)) && attempt < 4) {
                    handler.postDelayed(() -> fillAndConfirmEquipmentSell(accountIndex, view,
                            items, itemIndex, itemName, before, manual, attempt + 1), 500L);
                    return;
                }
                finish(accountIndex, "equipment_sell", "error",
                        itemName + "：上架前复核失败（" + status + "）", manual);
                return;
            }
            handler.postDelayed(() -> verifyEquipmentSell(accountIndex, view, items,
                    itemIndex, itemName, before, manual, 0), 2_500L);
        });
    }

    private void verifyEquipmentSell(int accountIndex, WebView view, List<String> items,
                                     int itemIndex, String itemName, int before,
                                     boolean manual, int attempt) {
        String script = "(function(){const target=" + JSONObject.quote(itemName) + ";"
                + "const modal=Array.from(document.querySelectorAll('.sell-modal')).find(e=>e.getClientRects().length>0);"
                + "const box=Array.from(document.querySelectorAll('.cont-box'))"
                + ".find(e=>(e.textContent||'').includes('装备数：'));"
                + "const count=box?Array.from(box.querySelectorAll('.ul .li')).filter(e=>{"
                + "const c=Array.from(e.children);return c.length>=2&&(c[1].textContent||'').trim()===target;}).length:-1;"
                + "return JSON.stringify({modal:!!modal,count});})()";
        view.evaluateJavascript(script, encoded -> {
            JSONObject result = decodeObject(encoded);
            boolean done = result != null && !result.optBoolean("modal", true)
                    && result.optInt("count", before) < before;
            if (!done && attempt < 4) {
                handler.postDelayed(() -> verifyEquipmentSell(accountIndex, view, items,
                        itemIndex, itemName, before, manual, attempt + 1), 1_500L);
                return;
            }
            if (!done) {
                finish(accountIndex, "equipment_sell", "error",
                        itemName + "：未检测到背包数量变化，请检查五件上架限制", manual);
                return;
            }
            updateState(accountIndex, itemName + "：已指定买家上架");
            RuntimeState state = states[accountIndex];
            state.equipmentListedInBatch++;
            state.equipmentBatchNames.add(itemName);
            int nextIndex = itemIndex + 1;
            if (state.equipmentListedInBatch >= EQUIPMENT_ACTIVE_LIMIT
                    && nextIndex < items.size()) {
                state.equipmentBatchSeen = false;
                state.equipmentBatchEmptyChecks = 0;
                state.equipmentWaitStartedAt = System.currentTimeMillis();
                updateState(accountIndex, "前5件已上架，等待买方完成后继续后续装备");
                handler.postDelayed(() -> waitForEquipmentBatchClear(
                        accountIndex, view, items, nextIndex, manual), 3_000L);
            } else {
                handler.postDelayed(() -> processEquipmentItem(
                        accountIndex, view, items, nextIndex, true, manual), 700L);
            }
        });
    }

    private void waitForEquipmentBatchClear(int accountIndex, WebView view, List<String> items,
                                            int nextIndex, boolean manual) {
        RuntimeState state = states[accountIndex];
        if (stopped || !state.busy) return;
        if (System.currentTimeMillis() - state.equipmentWaitStartedAt
                > EQUIPMENT_WAIT_TIMEOUT_MS) {
            finish(accountIndex, "equipment_sell", "error",
                    "等待前5件装备成交超时，已保留后续装备", manual);
            return;
        }
        int price = equipmentPrice(accountIndex);
        String names = new JSONArray(state.equipmentBatchNames).toString();
        String script = "(function(){const names=new Set(" + names + "),price=" + price + ";"
                + "const visible=e=>e&&e.getClientRects().length>0;"
                + "const box=Array.from(document.querySelectorAll('.cont-box'))"
                + ".find(e=>visible(e)&&(e.textContent||'').includes('价格(金币)'));"
                + "if(!box)return JSON.stringify({status:'not_ready'});"
                + "const rows=Array.from(box.querySelectorAll('.ul .li'));let count=0;"
                + "for(const row of rows){const c=Array.from(row.children);if(c.length<3)continue;"
                + "const n=(c[1].textContent||'').trim();"
                + "const p=parseInt((c[2].textContent||'').replace(/[^0-9]/g,''),10);"
                + "if(names.has(n)&&p===price)count++;}"
                + "const refresh=Array.from(document.querySelectorAll('button,uni-button,[role=button],a,view'))"
                + ".find(e=>visible(e)&&(e.textContent||'').replace(/\\s+/g,'')==='点击刷新');"
                + "if(refresh)refresh.click();return JSON.stringify({status:'ok',count});})()";
        view.evaluateJavascript(script, encoded -> {
            JSONObject result = decodeObject(encoded);
            if (result == null || !"ok".equals(result.optString("status"))) {
                handler.postDelayed(() -> waitForEquipmentBatchClear(
                        accountIndex, view, items, nextIndex, manual), EQUIPMENT_WAIT_INTERVAL_MS);
                return;
            }
            int count = result.optInt("count", 0);
            if (count > 0) {
                state.equipmentBatchSeen = true;
                state.equipmentBatchEmptyChecks = 0;
                updateState(accountIndex, "前5件剩余" + count + "件待买方购买");
            } else {
                state.equipmentBatchEmptyChecks++;
            }
            if (count == 0 && (state.equipmentBatchSeen || state.equipmentBatchEmptyChecks >= 3)) {
                state.equipmentListedInBatch = 0;
                state.equipmentBatchNames.clear();
                state.equipmentBatchSeen = false;
                state.equipmentBatchEmptyChecks = 0;
                updateState(accountIndex, "前5件已确认完成，开始上架后续装备");
                handler.postDelayed(() -> processEquipmentItem(
                        accountIndex, view, items, nextIndex, true, manual), 1_000L);
                return;
            }
            handler.postDelayed(() -> waitForEquipmentBatchClear(
                    accountIndex, view, items, nextIndex, manual), EQUIPMENT_WAIT_INTERVAL_MS);
        });
    }

    private void openEquipmentBuyDialog(int accountIndex, WebView view, List<String> items,
                                        int itemIndex, String itemName, boolean manual) {
        int price = equipmentPrice(accountIndex);
        String script = "(function(){const target=" + JSONObject.quote(itemName)
                + ",price=" + price + ";const visible=e=>e&&e.getClientRects().length>0;"
                + "const box=Array.from(document.querySelectorAll('.cont-box'))"
                + ".find(e=>(e.textContent||'').includes('价格(金币)'));"
                + "if(!box)return JSON.stringify({status:'not_ready'});"
                + "const rows=Array.from(box.querySelectorAll('.ul .li'));"
                + "const matches=rows.filter(e=>{const c=Array.from(e.children);if(c.length<3)return false;"
                + "const n=(c[1].textContent||'').trim();const p=parseInt((c[2].textContent||'').replace(/[^0-9]/g,''),10);"
                + "return n===target&&p===price;});"
                + "if(!matches.length){const refresh=Array.from(document.querySelectorAll('button,uni-button,[role=button],a,view'))"
                + ".find(e=>visible(e)&&(e.textContent||'').replace(/\\s+/g,'')==='点击刷新');"
                + "if(refresh)refresh.click();return JSON.stringify({status:'missing'});}"
                + "if(matches.length>1)return JSON.stringify({status:'ambiguous',count:matches.length});"
                + "matches[0].scrollIntoView({block:'nearest'});matches[0].click();"
                + "const buy=Array.from(box.querySelectorAll('button,uni-button,[role=button]'))"
                + ".find(e=>visible(e)&&(e.textContent||'').trim()==='购买')"
                + "||Array.from(document.querySelectorAll('button,uni-button,[role=button]'))"
                + ".find(e=>visible(e)&&(e.textContent||'').trim()==='购买');"
                + "if(!buy)return JSON.stringify({status:'no_buy'});buy.click();"
                + "return JSON.stringify({status:'dialog',before:matches.length});})()";
        view.evaluateJavascript(script, encoded -> {
            JSONObject result = decodeObject(encoded);
            String status = result == null ? "invalid" : result.optString("status");
            if ("missing".equals(status)) {
                RuntimeState state = states[accountIndex];
                if (System.currentTimeMillis() - state.equipmentWaitStartedAt
                        > EQUIPMENT_WAIT_TIMEOUT_MS) {
                    finish(accountIndex, "equipment_buy", "error",
                            itemName + "：等待指定单价的拍卖超时", manual);
                    return;
                }
                updateState(accountIndex, itemName + "：等待卖方上架");
                handler.postDelayed(() -> openEquipmentBuyDialog(
                        accountIndex, view, items, itemIndex, itemName, manual),
                        EQUIPMENT_WAIT_INTERVAL_MS);
                return;
            }
            if ("ambiguous".equals(status)) {
                finish(accountIndex, "equipment_buy", "error",
                        itemName + "：出现多条同名同价记录，已停止以避免误买", manual);
                return;
            }
            if (!"dialog".equals(status)) {
                finish(accountIndex, "equipment_buy", "error",
                        itemName + "：无法打开购买弹窗（" + status + "）", manual);
                return;
            }
            handler.postDelayed(() -> confirmEquipmentBuy(accountIndex, view, items,
                    itemIndex, itemName, manual, 0), 700L);
        });
    }

    private void confirmEquipmentBuy(int accountIndex, WebView view, List<String> items,
                                     int itemIndex, String itemName, boolean manual, int attempt) {
        int price = equipmentPrice(accountIndex);
        String script = "(function(){const target=" + JSONObject.quote(itemName)
                + ",price=" + price + ";const modal=Array.from(document.querySelectorAll('.sell-modal'))"
                + ".find(e=>e.getClientRects().length>0"
                + "&&(e.querySelector('.modal-title')?.textContent||'').trim()==='购买装备确认');"
                + "if(!modal)return JSON.stringify({status:'no_dialog'});"
                + "const name=(modal.querySelector('.item-name')?.textContent||'').trim();"
                + "const actual=parseInt((modal.querySelector('.pre')?.textContent||'').replace(/[^0-9]/g,''),10);"
                + "if(name!==target||actual!==price)return JSON.stringify({status:'verify_failed',name,actual});"
                + "const confirm=Array.from(modal.querySelectorAll('button,uni-button,[role=button]'))"
                + ".find(e=>(e.textContent||'').trim()==='确认购买');"
                + "if(!confirm)return JSON.stringify({status:'no_confirm'});confirm.click();"
                + "return JSON.stringify({status:'submitted'});})()";
        view.evaluateJavascript(script, encoded -> {
            JSONObject result = decodeObject(encoded);
            String status = result == null ? "invalid" : result.optString("status");
            if (!"submitted".equals(status)) {
                if ("no_dialog".equals(status) && attempt < 4) {
                    handler.postDelayed(() -> confirmEquipmentBuy(accountIndex, view, items,
                            itemIndex, itemName, manual, attempt + 1), 500L);
                    return;
                }
                finish(accountIndex, "equipment_buy", "error",
                        itemName + "：购买前复核失败（" + status + "）", manual);
                return;
            }
            updateState(accountIndex, itemName + "：已提交购买");
            handler.postDelayed(() -> verifyEquipmentBuy(accountIndex, view, items,
                    itemIndex, itemName, manual, 0), 2_000L);
        });
    }

    private void verifyEquipmentBuy(int accountIndex, WebView view, List<String> items,
                                    int itemIndex, String itemName, boolean manual, int attempt) {
        String script = "(function(){const m=Array.from(document.querySelectorAll('.sell-modal'))"
                + ".find(e=>e.getClientRects().length>0"
                + "&&(e.querySelector('.modal-title')?.textContent||'').trim()==='购买装备确认');"
                + "return m?'open':'closed';})()";
        view.evaluateJavascript(script, encoded -> {
            if (!"closed".equals(decodeString(encoded)) && attempt < 4) {
                handler.postDelayed(() -> verifyEquipmentBuy(accountIndex, view, items,
                        itemIndex, itemName, manual, attempt + 1), 1_500L);
                return;
            }
            if (!"closed".equals(decodeString(encoded))) {
                finish(accountIndex, "equipment_buy", "error",
                        itemName + "：购买弹窗未关闭，请手动检查", manual);
                return;
            }
            states[accountIndex].equipmentPurchasedNames.add(itemName);
            states[accountIndex].equipmentWaitStartedAt = System.currentTimeMillis();
            handler.postDelayed(() -> processEquipmentItem(
                    accountIndex, view, items, itemIndex + 1, false, manual), 700L);
        });
    }

    private void runAutoAuction(int accountIndex, boolean manual) {
        RuntimeState state = states[accountIndex];
        if (state.busy) {
            if (manual) host.showMessage(accountName(accountIndex) + "脚本正在执行");
            return;
        }
        List<String> items = parseAuctionItems(auctionItemsText(accountIndex));
        if (items.isEmpty()) {
            finish(accountIndex, "auction", "error", "拍卖道具列表为空", manual);
            return;
        }
        state.busy = true;
        state.task = "auction";
        state.status = "running";
        state.lastMessage = "正在打开道具交易所";
        state.updatedAt = System.currentTimeMillis();
        state.orientationRecoveryClicked = false;
        host.onAutomationChanged();
        WebView view;
        try {
            view = host.requireWebView(accountIndex);
        } catch (RuntimeException error) {
            finish(accountIndex, "auction", "error", "账号页面未就绪", manual);
            return;
        }
        host.prepareAutomation(accountIndex, true);
        handler.postDelayed(() -> navigateToAuction(
                accountIndex, view, items, manual, 0), 1_800L);
    }

    private void navigateToAuction(int accountIndex, WebView view, List<String> items,
                                   boolean manual, int attempt) {
        String script = "(function(){"
                + "const visible=e=>e&&e.getClientRects().length>0;"
                + "const clean=e=>(e?.textContent||'').replace(/\\s+/g,'');"
                + orientationRecoveryScript(accountIndex)
                + "const text=(document.body?.innerText||'').replace(/\\s+/g,'');"
                + "const hasBackpack=Array.from(document.querySelectorAll('.cont-box'))"
                + ".some(e=>visible(e)&&/背包道具数/.test(e.textContent||''));"
                + "if(hasBackpack&&text.includes('拍卖的道具'))return 'ready';"
                + "const all=Array.from(document.querySelectorAll('[name],button,[role=button],uni-button,a,view'));"
                + "const exact=(e,label)=>(e.getAttribute('name')||'').trim()===label"
                + "||(e.textContent||'').trim()===label;"
                + "const auction=all.find(e=>visible(e)&&(exact(e,'道具交易所')||exact(e,'交易所')));"
                + "if(auction){auction.click();return 'auction_clicked';}"
                + "const town=all.find(e=>visible(e)&&exact(e,'中心城镇'));"
                + "if(town){town.click();return 'town_clicked';}"
                + "const game=all.find(e=>visible(e)&&exact(e,'进入主游戏'));"
                + "if(game){game.click();return 'game_clicked';}return 'missing';})()";
        view.evaluateJavascript(script, encoded -> {
            String result = decodeString(encoded);
            if ("ready".equals(result)) {
                handler.postDelayed(() -> processAuctionItem(
                        accountIndex, view, items, 0, manual), 400L);
            } else if ("orientation_clicked".equals(result)) {
                states[accountIndex].orientationRecoveryClicked = true;
                updateState(accountIndex, "已点击横屏恢复，正在确认画面");
                handler.postDelayed(() -> navigateToAuction(
                        accountIndex, view, items, manual, attempt + 1), 1_800L);
            } else if ("orientation_failed".equals(result)
                    || "orientation_missing".equals(result)) {
                finish(accountIndex, "auction", "error",
                        "横屏提示未恢复，已停止继续点击", manual);
            } else if (result.endsWith("_clicked") && attempt < 9) {
                long delay = "auction_clicked".equals(result) ? 3_000L : 1_500L;
                handler.postDelayed(() -> navigateToAuction(
                        accountIndex, view, items, manual, attempt + 1), delay);
            } else if (attempt == 0) {
                host.openHome(accountIndex);
                handler.postDelayed(() -> navigateToAuction(
                        accountIndex, view, items, manual, 1), 4_000L);
            } else {
                finish(accountIndex, "auction", "error",
                        "未找到“中心城镇 → 道具交易所”入口", manual);
            }
        });
    }

    private void processAuctionItem(int accountIndex, WebView view, List<String> items,
                                    int itemIndex, boolean manual) {
        if (stopped || !states[accountIndex].busy) return;
        if (itemIndex >= items.size()) {
            preferences.edit().putLong(PREF_SELL_LAST + accountIndex,
                    System.currentTimeMillis()).apply();
            restoreAfkAfterOperation(accountIndex, view, manual, "拍卖检查完成");
            return;
        }
        String itemName = items.get(itemIndex);
        updateState(accountIndex, "正在检查 " + itemName);
        String script = "(function(){"
                + "const target=" + JSONObject.quote(itemName) + ";"
                + "const visible=e=>e&&e.getClientRects().length>0;"
                + "const boxes=Array.from(document.querySelectorAll('.cont-box'));"
                + "const box=boxes.find(e=>/\u80cc\u5305\u9053\u5177\u6570/.test(e.textContent||''));"
                + "if(!box)return JSON.stringify({status:'not_ready'});"
                + "const rows=Array.from(box.querySelectorAll('.ul .li'));"
                + "const row=rows.find(e=>{const c=Array.from(e.children);"
                + "return c.length>=4&&(c[1].textContent||'').trim()===target;});"
                + "if(!row)return JSON.stringify({status:'missing'});"
                + "const cells=Array.from(row.children).map(e=>(e.textContent||'').trim());"
                + "const count=parseInt((cells[3]||'').replace(/[^0-9-]/g,''),10);"
                + "if(!Number.isFinite(count))return JSON.stringify({status:'bad_count'});"
                + "if(count<=1)return JSON.stringify({status:'kept',count});"
                + "row.scrollIntoView({block:'nearest'});row.click();"
                + "const sell=Array.from(document.querySelectorAll('button,uni-button,[role=button]'))"
                + ".find(e=>(e.textContent||'').trim()==='\u5356\u51fa');"
                + "if(!sell)return JSON.stringify({status:'no_sell'});"
                + "sell.click();return JSON.stringify({status:'dialog',count,quantity:count-1});})()";
        view.evaluateJavascript(script, encoded -> {
            JSONObject result = decodeObject(encoded);
            String status = result == null ? "invalid" : result.optString("status");
            if ("kept".equals(status) || "missing".equals(status)) {
                String detail = "kept".equals(status) ? "已保留1个" : "背包无此道具";
                updateState(accountIndex, itemName + "：" + detail);
                handler.postDelayed(() -> processAuctionItem(
                        accountIndex, view, items, itemIndex + 1, manual), 350L);
                return;
            }
            if (!"dialog".equals(status)) {
                finish(accountIndex, "auction", "error",
                        itemName + "：页面结构不匹配，未提交", manual);
                return;
            }
            int quantity = result.optInt("quantity", 0);
            handler.postDelayed(() -> fillAndConfirmSell(accountIndex, view, items,
                    itemIndex, itemName, quantity, manual, 0), 900L);
        });
    }

    private void fillAndConfirmSell(int accountIndex, WebView view, List<String> items,
                                    int itemIndex, String itemName, int quantity,
                                    boolean manual, int attempt) {
        String buyer = auctionBuyer(accountIndex);
        String script = "(function(){"
                + "const target=" + JSONObject.quote(itemName) + ",buyer="
                + JSONObject.quote(buyer) + ",qty=" + quantity + ";"
                + "const modal=Array.from(document.querySelectorAll('.sell-modal'))"
                + ".find(e=>e.getClientRects().length>0"
                + "&&(e.querySelector('.modal-title')?.textContent||'').trim()==='上架拍卖');"
                + "if(!modal)return JSON.stringify({status:'no_dialog'});"
                + "const name=(modal.querySelector('.item-name')?.textContent||'').trim();"
                + "if(name!==target)return JSON.stringify({status:'wrong_item',name});"
                + "const inputs=Array.from(modal.querySelectorAll('input,textarea,[contenteditable=true]'))"
                + ".filter(e=>e.type!=='hidden'&&!e.disabled);"
                + "const attr=e=>{let p=e.parentElement,s='';for(let i=0;p&&i<3;i++,p=p.parentElement)"
                + "s+=' '+(p.textContent||'');return `${e.name||''} ${e.id||''} ${e.placeholder||''} ${s}`;};"
                + "const q=inputs.find(e=>/数量|quantity/i.test(attr(e)))"
                + "||inputs.find(e=>e.type==='number')||inputs[0];"
                + "const p=inputs.find(e=>/单价|price/i.test(attr(e))&&e!==q);"
                + "const b=inputs.find(e=>/指定买家|买家|玩家|buyer|target/i.test(attr(e)))"
                + "||inputs.find(e=>e!==q&&e!==p&&(e.type==='text'||e.tagName==='TEXTAREA'))"
                + "||inputs.find(e=>e!==q&&e!==p);"
                + "if(!q||!b)return JSON.stringify({status:'inputs_missing',count:inputs.length});"
                + "const set=(e,v)=>{if(e.isContentEditable)e.textContent=String(v);else{"
                + "const proto=e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;"
                + "const d=Object.getOwnPropertyDescriptor(proto,'value');d.set.call(e,String(v));}"
                + "e.dispatchEvent(new Event('input',{bubbles:true}));"
                + "e.dispatchEvent(new Event('change',{bubbles:true}));};"
                + "const get=e=>e.isContentEditable?e.textContent:e.value;"
                + "const price=p?parseInt(p.value,10):0;"
                + "if(p&&(!Number.isFinite(price)||price<=0))return JSON.stringify({status:'bad_price'});"
                + "set(q,qty);set(b,buyer);"
                + "const confirm=Array.from(modal.querySelectorAll('button,uni-button,[role=button]'))"
                + ".find(e=>(e.textContent||'').trim()==='\u786e\u8ba4\u4e0a\u67b6');"
                + "if(!confirm)return JSON.stringify({status:'no_confirm'});"
                + "if(parseInt(get(q),10)!==qty||get(b)!==buyer)"
                + "return JSON.stringify({status:'verify_failed'});"
                + "confirm.click();return JSON.stringify({status:'submitted',price});})()";
        view.evaluateJavascript(script, encoded -> {
            JSONObject result = decodeObject(encoded);
            if (result == null || !"submitted".equals(result.optString("status"))) {
                String reason = result == null ? "未知错误" : result.optString("status");
                if (("no_dialog".equals(reason) || "inputs_missing".equals(reason))
                        && attempt < 4) {
                    handler.postDelayed(() -> fillAndConfirmSell(accountIndex, view, items,
                            itemIndex, itemName, quantity, manual, attempt + 1), 600L);
                    return;
                }
                finish(accountIndex, "auction", "error",
                        itemName + "：提交前复核失败（" + reason + "）", manual);
                return;
            }
            updateState(accountIndex, String.format(Locale.ROOT,
                    "%s：已提交%d个，保留1个", itemName, quantity));
            handler.postDelayed(() -> verifySellAndContinue(accountIndex, view, items,
                    itemIndex, itemName, manual, 0), 3_000L);
        });
    }

    private void verifySellAndContinue(int accountIndex, WebView view, List<String> items,
                                       int itemIndex, String itemName, boolean manual,
                                       int attempt) {
        String script = "(function(){const m=Array.from(document.querySelectorAll('.sell-modal'))"
                + ".find(e=>e.getClientRects().length>0"
                + "&&(e.querySelector('.modal-title')?.textContent||'').trim()==='上架拍卖');"
                + "return m?'open':'closed';})()";
        view.evaluateJavascript(script, encoded -> {
            if (!"closed".equals(decodeString(encoded))) {
                if (attempt < 4) {
                    handler.postDelayed(() -> verifySellAndContinue(accountIndex, view, items,
                            itemIndex, itemName, manual, attempt + 1), 2_000L);
                    return;
                }
                finish(accountIndex, "auction", "error",
                        itemName + "：上架对话框未关闭，请手动检查", manual);
                return;
            }
            handler.postDelayed(() -> processAuctionItem(
                    accountIndex, view, items, itemIndex + 1, manual), 1_000L);
        });
    }

    private void runStoreSell(int accountIndex, boolean manual) {
        RuntimeState state = states[accountIndex];
        if (state.busy) {
            if (manual) host.showMessage(accountName(accountIndex) + "脚本正在执行");
            return;
        }
        List<String> items = parseAllowedItems(
                storeSellItemsText(accountIndex), ALLOWED_STORE_ITEMS);
        if (items.isEmpty()) {
            finish(accountIndex, "store_sell", "error", "商店卖出道具列表为空", manual);
            return;
        }
        state.busy = true;
        state.task = "store_sell";
        state.status = "running";
        state.lastMessage = "正在打开中心城镇道具商店";
        state.updatedAt = System.currentTimeMillis();
        state.orientationRecoveryClicked = false;
        host.onAutomationChanged();
        WebView view;
        try {
            view = host.requireWebView(accountIndex);
        } catch (RuntimeException error) {
            finish(accountIndex, "store_sell", "error", "账号页面未就绪", manual);
            return;
        }
        state.storeSoldNames.clear();
        host.prepareAutomation(accountIndex, true);
        handler.postDelayed(() -> navigateToStore(
                accountIndex, view, items, manual, 0), 1_800L);
    }

    private void navigateToStore(int accountIndex, WebView view, List<String> items,
                                 boolean manual, int attempt) {
        String script = "(function(){"
                + "const visible=e=>e&&e.getClientRects().length>0;"
                + "const clean=e=>(e?.textContent||'').replace(/\\s+/g,'');"
                + orientationRecoveryScript(accountIndex)
                + "const text=(document.body?.innerText||'').replace(/\\s+/g,'');"
                + "const hasBackpack=!!document.querySelector('#backpack-items')"
                + "||Array.from(document.querySelectorAll('.cont-box'))"
                + ".some(e=>visible(e)&&/背包道具数/.test(e.textContent||''));"
                + "if(hasBackpack&&text.includes('道具商店')&&text.includes('威望商店'))return 'ready';"
                + "const all=Array.from(document.querySelectorAll('[name],button,[role=button],uni-button,a,view'));"
                + "const exact=(e,label)=>(e.getAttribute('name')||'').trim()===label"
                + "||(e.textContent||'').trim()===label;"
                + "const store=all.find(e=>visible(e)&&exact(e,'道具商店'));"
                + "if(store){store.click();return 'store_clicked';}"
                + "const town=all.find(e=>visible(e)&&exact(e,'中心城镇'));"
                + "if(town){town.click();return 'town_clicked';}"
                + "const game=all.find(e=>visible(e)&&exact(e,'进入主游戏'));"
                + "if(game){game.click();return 'game_clicked';}return 'missing';})()";
        view.evaluateJavascript(script, encoded -> {
            String result = decodeString(encoded);
            if ("ready".equals(result)) {
                handler.postDelayed(() -> processStoreItem(
                        accountIndex, view, items, 0, manual), 400L);
            } else if ("orientation_clicked".equals(result)) {
                states[accountIndex].orientationRecoveryClicked = true;
                updateState(accountIndex, "已点击横屏恢复，正在确认画面");
                handler.postDelayed(() -> navigateToStore(
                        accountIndex, view, items, manual, attempt + 1), 1_800L);
            } else if ("orientation_failed".equals(result)
                    || "orientation_missing".equals(result)) {
                finish(accountIndex, "store_sell", "error",
                        "横屏提示未恢复，已停止继续点击", manual);
            } else if (result.endsWith("_clicked") && attempt < 9) {
                long delay = "store_clicked".equals(result) ? 3_000L : 1_500L;
                handler.postDelayed(() -> navigateToStore(
                        accountIndex, view, items, manual, attempt + 1), delay);
            } else if (attempt == 0) {
                host.openHome(accountIndex);
                handler.postDelayed(() -> navigateToStore(
                        accountIndex, view, items, manual, 1), 4_000L);
            } else {
                finish(accountIndex, "store_sell", "error",
                        "未找到“中心城镇 → 道具商店”入口", manual);
            }
        });
    }

    private void processStoreItem(int accountIndex, WebView view, List<String> items,
                                  int itemIndex, boolean manual) {
        if (stopped || !states[accountIndex].busy) return;
        if (itemIndex >= items.size()) {
            preferences.edit().putLong(PREF_STORE_LAST + accountIndex,
                    System.currentTimeMillis()).apply();
            restoreAfkAfterOperation(accountIndex, view, manual, "金币券卖出检查完成");
            return;
        }
        String itemName = items.get(itemIndex);
        updateState(accountIndex, "正在检查商店卖出：" + itemName);
        String skippedNames = new JSONArray(states[accountIndex].storeSoldNames).toString();
        String script = "(function(){"
                + "const target=" + JSONObject.quote(itemName) + ";"
                + "const skipped=new Set(" + skippedNames + ");"
                + "const visible=e=>e&&e.getClientRects().length>0;"
                + "const list=document.querySelector('#backpack-items')"
                + "||Array.from(document.querySelectorAll('.cont-box')).filter(visible)"
                + ".find(e=>/背包道具数/.test(e.textContent||''))?.querySelector('.ul');"
                + "if(!list)return JSON.stringify({status:'not_ready'});"
                + "const rows=Array.from(list.querySelectorAll('.li'));"
                + "const row=rows.find(e=>{const c=Array.from(e.children);"
                + "if(c.length<4)return false;const name=(c[1].textContent||'').trim();"
                + "const count=parseInt((c[3].textContent||'').replace(/[^0-9-]/g,''),10);"
                + "return name.includes(target)&&!skipped.has(name)&&Number.isFinite(count)&&count>0;});"
                + "if(!row)return JSON.stringify({status:'missing'});"
                + "const cells=Array.from(row.children).map(e=>(e.textContent||'').trim());"
                + "const actualName=cells[1]||target;"
                + "const count=parseInt((cells[3]||'').replace(/[^0-9-]/g,''),10);"
                + "if(!Number.isFinite(count)||count<=0)"
                + "return JSON.stringify({status:'bad_count',count});"
                + "row.scrollIntoView({block:'nearest'});row.click();"
                + "const sell=Array.from(document.querySelectorAll('button,uni-button,[role=button]'))"
                + ".find(e=>(e.textContent||'').trim()==='卖出');"
                + "if(!sell)return JSON.stringify({status:'no_sell'});"
                + "sell.click();return JSON.stringify({status:'dialog',actualName,count,quantity:count});})()";
        view.evaluateJavascript(script, encoded -> {
            JSONObject result = decodeObject(encoded);
            String status = result == null ? "invalid" : result.optString("status");
            if ("missing".equals(status)) {
                updateState(accountIndex, itemName + "：背包无此道具");
                handler.postDelayed(() -> processStoreItem(
                        accountIndex, view, items, itemIndex + 1, manual), 350L);
                return;
            }
            if (!"dialog".equals(status)) {
                finish(accountIndex, "store_sell", "error",
                        itemName + "：道具商店页面结构不匹配，未卖出", manual);
                return;
            }
            int quantity = result.optInt("quantity", 0);
            String actualName = result.optString("actualName", itemName);
            handler.postDelayed(() -> fillAndConfirmStoreSell(accountIndex, view, items,
                    itemIndex, actualName, quantity, manual, 0), 900L);
        });
    }

    private void fillAndConfirmStoreSell(int accountIndex, WebView view, List<String> items,
                                         int itemIndex, String itemName, int quantity,
                                         boolean manual, int attempt) {
        String script = "(function(){"
                + "const target=" + JSONObject.quote(itemName) + ",qty=" + quantity + ";"
                + "const modal=Array.from(document.querySelectorAll('.sell-modal,[role=dialog],.uni-popup__wrapper'))"
                + ".find(e=>e.getClientRects().length>0"
                + "&&/(卖出|出售)/.test(e.querySelector('.modal-title,.uni-popup__title')?.textContent||e.textContent||''));"
                + "if(!modal)return JSON.stringify({status:'no_dialog'});"
                + "const name=(modal.querySelector('.item-name')?.textContent||'').trim();"
                + "if(name!==target)return JSON.stringify({status:'wrong_item',name});"
                + "const inputs=Array.from(modal.querySelectorAll('input'))"
                + ".filter(e=>e.type!=='hidden'&&!e.disabled);"
                + "const q=inputs.find(e=>/数量|quantity/i.test(`${e.name||''} ${e.id||''} ${e.placeholder||''}`))"
                + "||inputs.find(e=>e.type==='number')||inputs[0];"
                + "if(!q)return JSON.stringify({status:'quantity_missing',count:inputs.length});"
                + "const d=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');"
                + "d.set.call(q,String(qty));q.dispatchEvent(new Event('input',{bubbles:true}));"
                + "q.dispatchEvent(new Event('change',{bubbles:true}));"
                + "const confirm=Array.from(modal.querySelectorAll('button,uni-button,[role=button],view'))"
                + ".find(e=>/^确认(卖出|出售)$/.test((e.textContent||'').replace(/\\s+/g,'')));"
                + "if(!confirm)return JSON.stringify({status:'no_confirm'});"
                + "if(parseInt(q.value,10)!==qty)return JSON.stringify({status:'verify_failed'});"
                + "confirm.click();return JSON.stringify({status:'submitted'});})()";
        view.evaluateJavascript(script, encoded -> {
            JSONObject result = decodeObject(encoded);
            if (result == null || !"submitted".equals(result.optString("status"))) {
                String reason = result == null ? "未知错误" : result.optString("status");
                if (("no_dialog".equals(reason) || "quantity_missing".equals(reason))
                        && attempt < 4) {
                    handler.postDelayed(() -> fillAndConfirmStoreSell(accountIndex, view, items,
                            itemIndex, itemName, quantity, manual, attempt + 1), 600L);
                    return;
                }
                finish(accountIndex, "store_sell", "error",
                        itemName + "：卖出前复核失败（" + reason + "）", manual);
                return;
            }
            updateState(accountIndex, String.format(Locale.ROOT,
                    "%s：已提交卖出%d个", itemName, quantity));
            states[accountIndex].storeSoldNames.add(itemName);
            handler.postDelayed(() -> verifyStoreSellAndContinue(accountIndex, view, items,
                    itemIndex, itemName, manual, 0), 3_000L);
        });
    }

    private void verifyStoreSellAndContinue(int accountIndex, WebView view, List<String> items,
                                            int itemIndex, String itemName, boolean manual,
                                            int attempt) {
        String script = "(function(){const m=Array.from(document.querySelectorAll('.sell-modal,[role=dialog],.uni-popup__wrapper'))"
                + ".find(e=>e.getClientRects().length>0"
                + "&&/(卖出|出售)/.test(e.querySelector('.modal-title,.uni-popup__title')?.textContent||e.textContent||''));"
                + "return m?'open':'closed';})()";
        view.evaluateJavascript(script, encoded -> {
            if (!"closed".equals(decodeString(encoded))) {
                if (attempt < 4) {
                    handler.postDelayed(() -> verifyStoreSellAndContinue(accountIndex, view,
                            items, itemIndex, itemName, manual, attempt + 1), 2_000L);
                    return;
                }
                finish(accountIndex, "store_sell", "error",
                        itemName + "：卖出对话框未关闭，请手动检查", manual);
                return;
            }
            handler.postDelayed(() -> processStoreItem(
                    accountIndex, view, items, itemIndex, manual), 1_500L);
        });
    }

    private String orientationRecoveryScript(int accountIndex) {
        boolean alreadyClicked = states[accountIndex].orientationRecoveryClicked;
        return "const orientationText=(document.body?.innerText||'').replace(/\\s+/g,'');"
                + "if(orientationText.includes('请将手机横屏使用')){"
                + (alreadyClicked
                ? "return 'orientation_failed';"
                : "const fallback=Array.from(document.querySelectorAll('button,[role=button],uni-button,a,view,div'))"
                + ".filter(visible).find(e=>{const t=clean(e);"
                + "return t.includes('手机转不动')&&t.includes('点这里继续');});"
                + "if(!fallback)return 'orientation_missing';fallback.click();return 'orientation_clicked';")
                + "}";
    }

    private void returnToAfkForPainting(int accountIndex, WebView view, boolean manual) {
        updateState(accountIndex, "正在返回挂机辅助并准备绘画小屋");
        String script = "(function(){const visible=e=>e&&e.getClientRects().length>0;"
                + "const clean=e=>(e?.textContent||'').replace(/\\s+/g,'');"
                + "const all=Array.from(document.querySelectorAll('[name],button,[role=button],uni-button,a,view,div'));"
                + "const target=all.filter(visible).find(e=>(e.getAttribute('name')||'').trim()==='挂机辅助'"
                + "||clean(e)==='挂机辅助');"
                + "if(!target)return 'missing';target.click();return 'clicked';})()";
        view.evaluateJavascript(script, encoded -> {
            if (!"clicked".equals(decodeString(encoded))) {
                finish(accountIndex, "equipment_buy", "error",
                        "装备已穿戴，但未找到“挂机辅助”入口", manual);
                return;
            }
            host.prepareAutomation(accountIndex, false);
            states[accountIndex].paintingStarted = false;
            states[accountIndex].paintingStartedAt = System.currentTimeMillis();
            handler.postDelayed(() -> runPaintingDungeon(
                    accountIndex, view, manual, 0), 4_000L);
        });
    }

    private void runPaintingDungeon(int accountIndex, WebView view, boolean manual, int attempt) {
        RuntimeState state = states[accountIndex];
        if (stopped || !state.busy) return;
        if (System.currentTimeMillis() - state.paintingStartedAt > PAINTING_TIMEOUT_MS) {
            finish(accountIndex, "equipment_buy", "error", "绘画小屋执行超时", manual);
            return;
        }
        String script = "(function(){const visible=e=>e&&e.getClientRects().length>0;"
                + "const clean=e=>(e?.textContent||'').replace(/\\s+/g,'');"
                + "const controls=Array.from(document.querySelectorAll('button,[role=button],uni-button,view')).filter(visible);"
                + "const stop=controls.find(e=>clean(e).includes('停止挂机'));"
                + "const start=controls.find(e=>clean(e).includes('开始挂机'));"
                + "if(" + state.paintingStarted + ")return stop?'running':(start?'completed':'waiting');"
                + "if(stop){stop.click();return 'stopping_previous';}"
                + "const select=Array.from(document.querySelectorAll('select')).find(s=>"
                + "Array.from(s.options).some(o=>(o.textContent||'').includes('绘画小屋')));"
                + "if(!select)return 'missing_controls';"
                + "const option=Array.from(select.options).find(o=>(o.textContent||'').includes('绘画小屋'));"
                + "select.value=option.value;select.selectedIndex=option.index;"
                + "select.dispatchEvent(new Event('input',{bubbles:true}));"
                + "select.dispatchEvent(new Event('change',{bubbles:true}));"
                + "const manualButton=controls.find(e=>clean(e).includes('手动挂机'));"
                + "if(manualButton)manualButton.click();return 'configured';})()";
        view.evaluateJavascript(script, encoded -> {
            String result = decodeString(encoded);
            if ("completed".equals(result)) {
                finish(accountIndex, "equipment_buy", "ok",
                        "全部装备已购买并穿戴，绘画小屋副本已完成", manual);
            } else if ("running".equals(result)) {
                updateState(accountIndex, "绘画小屋执行中，等待“停止挂机”退出");
                handler.postDelayed(() -> runPaintingDungeon(
                        accountIndex, view, manual, 0), PAINTING_CHECK_INTERVAL_MS);
            } else if ("configured".equals(result)) {
                handler.postDelayed(() -> clickPaintingStart(
                        accountIndex, view, manual, 0), 900L);
            } else if ("stopping_previous".equals(result)) {
                handler.postDelayed(() -> runPaintingDungeon(
                        accountIndex, view, manual, attempt + 1), 1_500L);
            } else if ("waiting".equals(result) && attempt < 12) {
                handler.postDelayed(() -> runPaintingDungeon(
                        accountIndex, view, manual, attempt + 1), 2_000L);
            } else if ("missing_controls".equals(result) && attempt < 5) {
                handler.postDelayed(() -> runPaintingDungeon(
                        accountIndex, view, manual, attempt + 1), 2_000L);
            } else {
                finish(accountIndex, "equipment_buy", "error",
                        "未找到绘画小屋挂机控件", manual);
            }
        });
    }

    private void clickPaintingStart(int accountIndex, WebView view, boolean manual, int attempt) {
        String script = "(function(){const visible=e=>e&&e.getClientRects().length>0;"
                + "const clean=e=>(e?.textContent||'').replace(/\\s+/g,'');"
                + "const controls=Array.from(document.querySelectorAll('button,[role=button],uni-button,view')).filter(visible);"
                + "if(controls.some(e=>clean(e).includes('停止挂机')))return 'running';"
                + "const start=controls.find(e=>clean(e).includes('开始挂机'));"
                + "if(!start)return 'missing';start.click();return 'clicked';})()";
        view.evaluateJavascript(script, encoded -> {
            String result = decodeString(encoded);
            if ("running".equals(result)) {
                markPaintingStarted(accountIndex, view, manual);
            } else if ("clicked".equals(result)) {
                handler.postDelayed(() -> verifyPaintingStarted(
                        accountIndex, view, manual, 0), 1_500L);
            } else if (attempt < 4) {
                handler.postDelayed(() -> clickPaintingStart(
                        accountIndex, view, manual, attempt + 1), 700L);
            } else {
                finish(accountIndex, "equipment_buy", "error",
                        "未找到绘画小屋“开始挂机”按钮", manual);
            }
        });
    }

    private void verifyPaintingStarted(int accountIndex, WebView view,
                                       boolean manual, int attempt) {
        String script = "(function(){const visible=e=>e&&e.getClientRects().length>0;"
                + "const clean=e=>(e?.textContent||'').replace(/\\s+/g,'');"
                + "return Array.from(document.querySelectorAll('button,[role=button],uni-button,view'))"
                + ".filter(visible).some(e=>clean(e).includes('停止挂机'))?'running':'waiting';})()";
        view.evaluateJavascript(script, encoded -> {
            if ("running".equals(decodeString(encoded))) {
                markPaintingStarted(accountIndex, view, manual);
            } else if (attempt < 6) {
                handler.postDelayed(() -> verifyPaintingStarted(
                        accountIndex, view, manual, attempt + 1), 1_500L);
            } else {
                finish(accountIndex, "equipment_buy", "error",
                        "绘画小屋未进入“停止挂机”状态", manual);
            }
        });
    }

    private void markPaintingStarted(int accountIndex, WebView view, boolean manual) {
        RuntimeState state = states[accountIndex];
        state.paintingStarted = true;
        state.paintingStartedAt = System.currentTimeMillis();
        updateState(accountIndex, "绘画小屋已开始，正在监控副本完成");
        handler.postDelayed(() -> runPaintingDungeon(
                accountIndex, view, manual, 0), PAINTING_CHECK_INTERVAL_MS);
    }

    private void restoreAfkAfterOperation(int accountIndex, WebView view, boolean manual,
                                          String completedMessage) {
        updateState(accountIndex, completedMessage + "，正在返回挂机辅助");
        String script = "(function(){const visible=e=>e&&e.getClientRects().length>0;"
                + "const all=Array.from(document.querySelectorAll('[name],button,[role=button],uni-button,view,div'));"
                + "const exact=e=>(e.getAttribute('name')||'').trim()==='挂机辅助'"
                + "||(e.textContent||'').replace(/\\s+/g,'').trim()==='挂机辅助';"
                + "const target=all.filter(visible).find(exact)||all.find(exact);"
                + "if(!target)return 'missing';target.click();return 'clicked';})()";
        view.evaluateJavascript(script, encoded -> {
            if (!"clicked".equals(decodeString(encoded))) {
                host.openHome(accountIndex);
            }
            host.prepareAutomation(accountIndex, false);
            handler.postDelayed(() -> runTempleGuard(
                    accountIndex, manual, true), 4_000L);
        });
    }

    private void monitorBattleProgress(int accountIndex) {
        RuntimeState state = states[accountIndex];
        state.lastBattleCheckAt = System.currentTimeMillis();
        WebView view;
        try {
            view = host.requireWebView(accountIndex);
        } catch (RuntimeException error) {
            state.monitorStatus = "unknown";
            state.monitorMessage = "账号页面未就绪";
            host.onAutomationChanged();
            return;
        }
        String script = "(function(){const clean=e=>(e?.textContent||'').replace(/\\s+/g,'');"
                + "const labels=Array.from(document.querySelectorAll('*')).filter(e=>clean(e)==='总场次');"
                + "for(const label of labels){let node=label;for(let depth=0;node&&depth<4;depth++,node=node.parentElement){"
                + "const text=clean(node);const m=text.match(/(\\d+)总场次|总场次[：:]?(\\d+)/);"
                + "if(m)return JSON.stringify({status:'ok',count:parseInt(m[1]||m[2],10)});}}"
                + "const section=Array.from(document.querySelectorAll('*')).find(e=>clean(e)==='战斗统计')?.parentElement;"
                + "const text=clean(section);const fallback=text.match(/(\\d+)总场次|总场次[：:]?(\\d+)/);"
                + "if(!fallback)return JSON.stringify({status:labels.length?'unreadable':'missing'});"
                + "return JSON.stringify({status:'ok',count:parseInt(fallback[1]||fallback[2],10)});})()";
        view.evaluateJavascript(script, encoded -> {
            JSONObject result = decodeObject(encoded);
            if (result == null || !"ok".equals(result.optString("status"))) {
                state.monitorStatus = "unknown";
                state.monitorMessage = "等待竖屏挂机统计页面";
                host.onAutomationChanged();
                return;
            }
            int count = result.optInt("count", -1);
            if (count < 0) {
                state.monitorStatus = "unknown";
                state.monitorMessage = "无法读取战斗场次";
            } else if (state.lastBattleCount < 0 || count < state.lastBattleCount) {
                state.monitorStatus = "monitoring";
                state.monitorMessage = "已记录战斗统计基线";
            } else if (count > state.lastBattleCount) {
                state.monitorStatus = "online";
                state.monitorMessage = "战斗统计正常增加";
            } else {
                state.monitorStatus = "offline";
                state.monitorMessage = "连续30分钟战斗场次未增加";
            }
            state.lastBattleCount = count;
            host.onAutomationChanged();
        });
    }

    private void runTempleGuard(int accountIndex, boolean manual, boolean homeRetried) {
        RuntimeState state = states[accountIndex];
        if (!homeRetried) {
            if (state.busy) {
                if (manual) host.showMessage(accountName(accountIndex) + "脚本正在执行");
                return;
            }
            state.busy = true;
            state.task = "temple";
            state.status = "running";
            state.lastMessage = "正在检查圣兽云殿挂机";
            state.updatedAt = System.currentTimeMillis();
            host.onAutomationChanged();
            host.prepareAutomation(accountIndex, false);
        }
        WebView view;
        try {
            view = host.requireWebView(accountIndex);
        } catch (RuntimeException error) {
            finish(accountIndex, "temple", "error", "账号页面未就绪", manual);
            return;
        }
        String script = "(function(){"
                + "const visible=e=>e&&e.getClientRects().length>0;"
                + "const candidates=Array.from(document.querySelectorAll('button,[role=button],uni-button,view')).filter(visible);"
                + "const stop=candidates.find(e=>(e.textContent||'').replace(/\\s+/g,'').includes('\u505c\u6b62\u6302\u673a'));"
                + "if(stop)return JSON.stringify({status:'running'});"
                + "const select=Array.from(document.querySelectorAll('select')).find(s=>"
                + "Array.from(s.options).some(o=>(o.textContent||'').includes('\u5723兽云殿')));"
                + "if(!select)return JSON.stringify({status:'missing_controls'});"
                + "const option=Array.from(select.options).find(o=>(o.textContent||'').includes('\u5723兽云殿'));"
                + "select.value=option.value;select.selectedIndex=option.index;"
                + "select.dispatchEvent(new Event('input',{bubbles:true}));"
                + "select.dispatchEvent(new Event('change',{bubbles:true}));"
                + "const manualButton=candidates.find(e=>{const t=(e.textContent||'').replace(/\\s+/g,'');"
                + "return t==='\u624b\u52a8\u6302\u673a'||t.includes('\u624b\u52a8\u6302\u673a');});"
                + "if(manualButton)manualButton.click();return JSON.stringify({status:'configured'});})()";
        view.evaluateJavascript(script, encoded -> {
            JSONObject result = decodeObject(encoded);
            String status = result == null ? "invalid" : result.optString("status");
            if ("running".equals(status)) {
                preferences.edit().putLong(PREF_TEMPLE_LAST + accountIndex,
                        System.currentTimeMillis()).apply();
                finish(accountIndex, "temple", "ok", "圣兽云殿正在挂机，无需操作", manual);
            } else if ("configured".equals(status)) {
                handler.postDelayed(() -> clickTempleStart(accountIndex, view, manual), 900L);
            } else if (!homeRetried) {
                host.openHome(accountIndex);
                handler.postDelayed(() -> runTempleGuard(
                        accountIndex, manual, true), 4_000L);
            } else {
                finish(accountIndex, "temple", "error", "未找到挂机配置控件", manual);
            }
        });
    }

    private void clickTempleStart(int accountIndex, WebView view, boolean manual) {
        String script = "(function(){const visible=e=>e&&e.getClientRects().length>0;"
                + "const all=Array.from(document.querySelectorAll('button,[role=button],uni-button,view')).filter(visible);"
                + "const stop=all.find(e=>(e.textContent||'').replace(/\\s+/g,'').includes('\u505c\u6b62\u6302\u673a'));"
                + "if(stop)return 'running';"
                + "const start=all.find(e=>(e.textContent||'').replace(/\\s+/g,'').includes('\u5f00\u59cb\u6302\u673a'));"
                + "if(!start)return 'missing';start.click();return 'started';})()";
        view.evaluateJavascript(script, encoded -> {
            String result = decodeString(encoded);
            preferences.edit().putLong(PREF_TEMPLE_LAST + accountIndex,
                    System.currentTimeMillis()).apply();
            if ("started".equals(result)) {
                finish(accountIndex, "temple", "ok", "已启动圣兽云殿手动挂机", manual);
            } else if ("running".equals(result)) {
                finish(accountIndex, "temple", "ok", "圣兽云殿正在挂机", manual);
            } else {
                finish(accountIndex, "temple", "error", "未找到“开始挂机”按钮", manual);
            }
        });
    }

    private void updateState(int accountIndex, String message) {
        RuntimeState state = states[accountIndex];
        state.lastMessage = message;
        state.updatedAt = System.currentTimeMillis();
        host.onAutomationChanged();
    }

    private void finish(int accountIndex, String task, String status,
                        String message, boolean manual) {
        RuntimeState state = states[accountIndex];
        state.busy = false;
        state.task = task;
        state.status = status;
        state.lastMessage = message;
        state.updatedAt = System.currentTimeMillis();
        host.onAutomationChanged();
        if ("error".equals(status)
                && ("auction".equals(task) || "store_sell".equals(task)
                || "equipment_sell".equals(task) || "equipment_buy".equals(task))) {
            host.prepareAutomation(accountIndex, false);
        }
        if (manual || "error".equals(status)) {
            host.showMessage(accountName(accountIndex) + "：" + message);
        }
    }

    private void requireAccount(int accountIndex) {
        if (accountIndex < 0 || accountIndex >= states.length) {
            throw new IllegalArgumentException("账号索引无效");
        }
    }

    private List<String> parseAllowedItems(String value, Set<String> allowed) {
        Set<String> unique = new LinkedHashSet<>();
        if (value != null) {
            for (String item : value.split("[,，\\n]")) {
                String safe = item.replaceAll("[\\r\\t]", " ").trim();
                if (allowed.contains(safe)) {
                    unique.add(safe);
                }
            }
        }
        return new ArrayList<>(unique);
    }

    private List<String> parseAuctionItems(String value) {
        Set<String> unique = new LinkedHashSet<>();
        if (value != null) {
            for (String item : value.split("[,，\\n]")) {
                String safe = item.replaceAll("[\\r\\t]", " ").trim();
                if (safe.isBlank()) continue;
                if (safe.length() > 30) {
                    throw new IllegalArgumentException("拍卖道具名称不能超过30个字符");
                }
                unique.add(safe);
                if (unique.size() > 10) {
                    throw new IllegalArgumentException("拍卖道具最多填写10种");
                }
            }
        }
        return new ArrayList<>(unique);
    }

    private List<String> parseEquipmentItems(String value) {
        Set<String> unique = new LinkedHashSet<>();
        if (value != null) {
            for (String item : value.split("[,，\\n]")) {
                String safe = item.replaceAll("[\\r\\t]", " ").trim();
                if (safe.isBlank()) continue;
                if (safe.length() > 30) {
                    throw new IllegalArgumentException("装备名称不能超过30个字符");
                }
                unique.add(safe);
                if (unique.size() > 10) {
                    throw new IllegalArgumentException("装备转移最多10件，将自动分两批处理");
                }
            }
        }
        return new ArrayList<>(unique);
    }

    private List<String> requireAllowedItems(String value, Set<String> allowed,
                                             String operationName) {
        List<String> items = parseAllowedItems(value, allowed);
        if (items.isEmpty()) {
            throw new IllegalArgumentException(operationName + "至少需要选择一种支持的道具");
        }
        Set<String> requested = new LinkedHashSet<>();
        if (value != null) {
            for (String item : value.split("[,，\\n]")) {
                String safe = item.replaceAll("[\\r\\t]", " ").trim();
                if (!safe.isBlank()) requested.add(safe);
            }
        }
        if (!allowed.containsAll(requested)) {
            throw new IllegalArgumentException(operationName + "包含暂不支持的道具");
        }
        return items;
    }

    private String sanitizeBuyer(String value) {
        if (value == null) return "";
        String safe = value.replaceAll("[^A-Za-z0-9_.-]", "").trim();
        return safe.length() > 30 ? safe.substring(0, 30) : safe;
    }

    private String sanitizePlayerId(String value) {
        if (value == null) return "";
        String safe = value.replaceAll("[^A-Za-z0-9@_.-]", "").trim();
        return safe.length() > 30 ? safe.substring(0, 30) : safe;
    }

    private String decodeString(String encoded) {
        if (encoded == null || "null".equals(encoded)) return "";
        try {
            Object decoded = new JSONTokener(encoded).nextValue();
            return decoded instanceof String ? (String) decoded : String.valueOf(decoded);
        } catch (JSONException error) {
            return "";
        }
    }

    private JSONObject decodeObject(String encoded) {
        String decoded = decodeString(encoded);
        if (decoded.isBlank()) return null;
        try {
            return new JSONObject(decoded);
        } catch (JSONException error) {
            return null;
        }
    }

    private String accountName(int accountIndex) {
        return "账号" + (accountIndex + 1);
    }

    private static final class RuntimeState {
        boolean busy;
        String task = "none";
        String status = "idle";
        String lastMessage = "尚未运行";
        long updatedAt;
        final Set<String> storeSoldNames = new LinkedHashSet<>();
        String monitorStatus = "unknown";
        String monitorMessage = "等待首次30分钟检查";
        int lastBattleCount = -1;
        long lastBattleCheckAt;
        boolean orientationRecoveryClicked;
        int equipmentListedInBatch;
        final Set<String> equipmentBatchNames = new LinkedHashSet<>();
        boolean equipmentBatchSeen;
        int equipmentBatchEmptyChecks;
        long equipmentWaitStartedAt;
        final Set<String> equipmentPurchasedNames = new LinkedHashSet<>();
        boolean paintingStarted;
        long paintingStartedAt;
    }
}
