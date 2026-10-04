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
    private static final String DEFAULT_AUCTION_ITEMS = "进化宝石,曙光印记";
    private static final String DEFAULT_STORE_ITEMS = "金币券";
    private static final String DEFAULT_BUYER = "hao";
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
                && ("auction".equals(task) || "store_sell".equals(task))) {
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
    }
}
