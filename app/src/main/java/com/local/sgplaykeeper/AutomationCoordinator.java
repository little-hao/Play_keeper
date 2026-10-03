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
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Per-account, foreground-only automation for the Play Keeper WebViews.
 *
 * The coordinator intentionally operates through the visible page DOM. It does not call private
 * game APIs or retain account credentials. Every sell operation re-reads the backpack row, keeps
 * one item, preserves the site's default unit price, and verifies the confirmation dialog before
 * it clicks the final action.
 */
final class AutomationCoordinator {
    interface Host {
        WebView requireWebView(int accountIndex);

        void openHome(int accountIndex);

        void onAutomationChanged();

        void showMessage(String message);
    }

    static final long DEFAULT_SELL_INTERVAL_MS = 12L * 60L * 60L * 1000L;
    static final long TEMPLE_CHECK_INTERVAL_MS = 60L * 60L * 1000L;
    private static final long TICK_INTERVAL_MS = 60_000L;
    private static final String DEFAULT_ITEMS = "进化宝石,曙光印记";
    private static final String DEFAULT_BUYER = "hao";

    private static final String PREF_SELL_ENABLED = "automation_sell_enabled_";
    private static final String PREF_SELL_ITEMS = "automation_sell_items_";
    private static final String PREF_SELL_BUYER = "automation_sell_buyer_";
    private static final String PREF_SELL_INTERVAL = "automation_sell_interval_";
    private static final String PREF_SELL_LAST = "automation_sell_last_";
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

    boolean isSellEnabled(int accountIndex) {
        return preferences.getBoolean(PREF_SELL_ENABLED + accountIndex, false);
    }

    boolean isTempleEnabled(int accountIndex) {
        return preferences.getBoolean(PREF_TEMPLE_ENABLED + accountIndex, false);
    }

    String sellItemsText(int accountIndex) {
        return preferences.getString(PREF_SELL_ITEMS + accountIndex, DEFAULT_ITEMS);
    }

    String sellBuyer(int accountIndex) {
        return sanitizeBuyer(preferences.getString(
                PREF_SELL_BUYER + accountIndex, DEFAULT_BUYER));
    }

    int sellIntervalHours(int accountIndex) {
        long interval = preferences.getLong(
                PREF_SELL_INTERVAL + accountIndex, DEFAULT_SELL_INTERVAL_MS);
        return (int) Math.max(1L, Math.min(168L, interval / (60L * 60L * 1000L)));
    }

    void configureSell(int accountIndex, boolean enabled, String itemText,
                       String buyer, int intervalHours) {
        requireAccount(accountIndex);
        List<String> items = parseItems(itemText);
        if (items.isEmpty()) {
            throw new IllegalArgumentException("至少需要一种卖出道具");
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

    void configureTemple(int accountIndex, boolean enabled) {
        requireAccount(accountIndex);
        preferences.edit().putBoolean(PREF_TEMPLE_ENABLED + accountIndex, enabled).apply();
        host.onAutomationChanged();
    }

    void runSellNow(int accountIndex) {
        requireAccount(accountIndex);
        runAutoSell(accountIndex, true);
    }

    void runTempleNow(int accountIndex) {
        requireAccount(accountIndex);
        runTempleGuard(accountIndex, true, false);
    }

    void appendAccountTelemetry(JSONObject account, int accountIndex) throws JSONException {
        RuntimeState state = states[accountIndex];
        JSONObject automation = new JSONObject();
        automation.put("sellEnabled", isSellEnabled(accountIndex));
        automation.put("sellItems", new JSONArray(parseItems(sellItemsText(accountIndex))));
        automation.put("sellBuyer", sellBuyer(accountIndex));
        automation.put("sellIntervalHours", sellIntervalHours(accountIndex));
        automation.put("sellLastRunAt", preferences.getLong(PREF_SELL_LAST + accountIndex, 0L));
        automation.put("templeEnabled", isTempleEnabled(accountIndex));
        automation.put("templeLastCheckAt", preferences.getLong(
                PREF_TEMPLE_LAST + accountIndex, 0L));
        automation.put("busy", state.busy);
        automation.put("task", state.task);
        automation.put("status", state.status);
        automation.put("lastMessage", state.lastMessage);
        automation.put("updatedAt", state.updatedAt);
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
                if (states[i].busy) {
                    continue;
                }
                long sellInterval = preferences.getLong(
                        PREF_SELL_INTERVAL + i, DEFAULT_SELL_INTERVAL_MS);
                long sellLast = preferences.getLong(PREF_SELL_LAST + i, 0L);
                if (isSellEnabled(i) && now - sellLast >= sellInterval) {
                    runAutoSell(i, false);
                    continue;
                }
                long templeLast = preferences.getLong(PREF_TEMPLE_LAST + i, 0L);
                if (isTempleEnabled(i) && now - templeLast >= TEMPLE_CHECK_INTERVAL_MS) {
                    runTempleGuard(i, false, false);
                }
            }
            handler.postDelayed(this, TICK_INTERVAL_MS);
        }
    };

    private void runAutoSell(int accountIndex, boolean manual) {
        RuntimeState state = states[accountIndex];
        if (state.busy) {
            if (manual) host.showMessage(accountName(accountIndex) + "脚本正在执行");
            return;
        }
        List<String> items = parseItems(sellItemsText(accountIndex));
        if (items.isEmpty()) {
            finish(accountIndex, "sell", "error", "卖出道具列表为空", manual);
            return;
        }
        state.busy = true;
        state.task = "sell";
        state.status = "running";
        state.lastMessage = "正在打开道具交易所";
        state.updatedAt = System.currentTimeMillis();
        host.onAutomationChanged();
        WebView view;
        try {
            view = host.requireWebView(accountIndex);
        } catch (RuntimeException error) {
            finish(accountIndex, "sell", "error", "账号页面未就绪", manual);
            return;
        }
        navigateToAuction(accountIndex, view, items, manual, false);
    }

    private void navigateToAuction(int accountIndex, WebView view, List<String> items,
                                   boolean manual, boolean homeRetried) {
        String script = "(function(){"
                + "const visible=e=>e&&e.getClientRects().length>0;"
                + "const hasBackpack=Array.from(document.querySelectorAll('.cont-box'))"
                + ".some(e=>visible(e)&&/\u80cc\u5305\u9053\u5177\u6570/.test(e.textContent||''));"
                + "if(hasBackpack)return 'ready';"
                + "const all=Array.from(document.querySelectorAll('[name],button,[role=button],uni-button'));"
                + "const b=all.find(e=>visible(e)&&((e.getAttribute('name')||'')==='\u9053\u5177\u4ea4\u6613\u6240'"
                + "||(e.textContent||'').trim()==='\u9053\u5177\u4ea4\u6613\u6240'"
                + "||(e.textContent||'').trim()==='\u4ea4\u6613\u6240'));"
                + "if(!b)return 'missing';b.click();return 'clicked';})()";
        view.evaluateJavascript(script, encoded -> {
            String result = decodeString(encoded);
            if ("ready".equals(result)) {
                handler.postDelayed(() -> processSellItem(
                        accountIndex, view, items, 0, manual), 400L);
            } else if ("clicked".equals(result)) {
                handler.postDelayed(() -> processSellItem(
                        accountIndex, view, items, 0, manual), 3_000L);
            } else if (!homeRetried) {
                host.openHome(accountIndex);
                handler.postDelayed(() -> navigateToAuction(
                        accountIndex, view, items, manual, true), 4_000L);
            } else {
                finish(accountIndex, "sell", "error", "未找到道具交易所入口", manual);
            }
        });
    }

    private void processSellItem(int accountIndex, WebView view, List<String> items,
                                 int itemIndex, boolean manual) {
        if (stopped || !states[accountIndex].busy) return;
        if (itemIndex >= items.size()) {
            preferences.edit().putLong(PREF_SELL_LAST + accountIndex,
                    System.currentTimeMillis()).apply();
            finish(accountIndex, "sell", "ok", "定时卖出检查完成", manual);
            return;
        }
        String itemName = items.get(itemIndex);
        updateState(accountIndex, "正在检查 " + itemName);
        String script = "(function(){"
                + "const target=" + JSONObject.quote(itemName) + ";"
                + "const visible=e=>e&&e.getClientRects().length>0;"
                + "const boxes=Array.from(document.querySelectorAll('.cont-box')).filter(visible);"
                + "const box=boxes.find(e=>/\u80cc\u5305\u9053\u5177\u6570/.test(e.textContent||''));"
                + "if(!box)return JSON.stringify({status:'not_ready'});"
                + "const rows=Array.from(box.querySelectorAll('.ul .li')).filter(visible);"
                + "const row=rows.find(e=>{const c=Array.from(e.children);"
                + "return c.length>=4&&(c[1].textContent||'').trim()===target;});"
                + "if(!row)return JSON.stringify({status:'missing'});"
                + "const cells=Array.from(row.children).map(e=>(e.textContent||'').trim());"
                + "const count=parseInt((cells[3]||'').replace(/[^0-9-]/g,''),10);"
                + "if(!Number.isFinite(count))return JSON.stringify({status:'bad_count'});"
                + "if(count<=1)return JSON.stringify({status:'kept',count});"
                + "row.click();"
                + "const sell=Array.from(document.querySelectorAll('button,uni-button,[role=button]'))"
                + ".filter(visible).find(e=>(e.textContent||'').trim()==='\u5356\u51fa');"
                + "if(!sell)return JSON.stringify({status:'no_sell'});"
                + "sell.click();return JSON.stringify({status:'dialog',count,quantity:count-1});})()";
        view.evaluateJavascript(script, encoded -> {
            JSONObject result = decodeObject(encoded);
            String status = result == null ? "invalid" : result.optString("status");
            if ("kept".equals(status) || "missing".equals(status)) {
                String detail = "kept".equals(status) ? "已保留1个" : "背包无此道具";
                updateState(accountIndex, itemName + "：" + detail);
                handler.postDelayed(() -> processSellItem(
                        accountIndex, view, items, itemIndex + 1, manual), 350L);
                return;
            }
            if (!"dialog".equals(status)) {
                finish(accountIndex, "sell", "error",
                        itemName + "：页面结构不匹配，未提交", manual);
                return;
            }
            int quantity = result.optInt("quantity", 0);
            handler.postDelayed(() -> fillAndConfirmSell(accountIndex, view, items,
                    itemIndex, itemName, quantity, manual), 700L);
        });
    }

    private void fillAndConfirmSell(int accountIndex, WebView view, List<String> items,
                                    int itemIndex, String itemName, int quantity,
                                    boolean manual) {
        String buyer = sellBuyer(accountIndex);
        String script = "(function(){"
                + "const target=" + JSONObject.quote(itemName) + ",buyer="
                + JSONObject.quote(buyer) + ",qty=" + quantity + ";"
                + "const modal=Array.from(document.querySelectorAll('.sell-modal'))"
                + ".find(e=>e.getClientRects().length>0);"
                + "if(!modal)return JSON.stringify({status:'no_dialog'});"
                + "const name=(modal.querySelector('.item-name')?.textContent||'').trim();"
                + "if(name!==target)return JSON.stringify({status:'wrong_item',name});"
                + "const q=modal.querySelector('input[placeholder=\"\u8bf7\u8f93入\u6570\u91cf\"]');"
                + "const p=modal.querySelector('input[placeholder=\"单价\"]');"
                + "const b=modal.querySelector('input[placeholder=\"玩家ID\"]');"
                + "if(!q||!p||!b)return JSON.stringify({status:'inputs_missing'});"
                + "const set=(e,v)=>{const d=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');"
                + "d.set.call(e,String(v));e.dispatchEvent(new Event('input',{bubbles:true}));"
                + "e.dispatchEvent(new Event('change',{bubbles:true}));};"
                + "const price=parseInt(p.value,10);"
                + "if(!Number.isFinite(price)||price<=0)return JSON.stringify({status:'bad_price'});"
                + "set(q,qty);set(b,buyer);"
                + "const confirm=Array.from(modal.querySelectorAll('button,uni-button,[role=button]'))"
                + ".find(e=>(e.textContent||'').trim()==='\u786e\u8ba4\u4e0a\u67b6');"
                + "if(!confirm)return JSON.stringify({status:'no_confirm'});"
                + "if(parseInt(q.value,10)!==qty||b.value!==buyer)"
                + "return JSON.stringify({status:'verify_failed'});"
                + "confirm.click();return JSON.stringify({status:'submitted',price});})()";
        view.evaluateJavascript(script, encoded -> {
            JSONObject result = decodeObject(encoded);
            if (result == null || !"submitted".equals(result.optString("status"))) {
                String reason = result == null ? "未知错误" : result.optString("status");
                finish(accountIndex, "sell", "error",
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
                + ".find(e=>e.getClientRects().length>0);"
                + "return m?'open':'closed';})()";
        view.evaluateJavascript(script, encoded -> {
            if (!"closed".equals(decodeString(encoded))) {
                if (attempt < 4) {
                    handler.postDelayed(() -> verifySellAndContinue(accountIndex, view, items,
                            itemIndex, itemName, manual, attempt + 1), 2_000L);
                    return;
                }
                finish(accountIndex, "sell", "error",
                        itemName + "：上架对话框未关闭，请手动检查", manual);
                return;
            }
            handler.postDelayed(() -> processSellItem(
                    accountIndex, view, items, itemIndex + 1, manual), 1_000L);
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
        if (manual || "error".equals(status)) {
            host.showMessage(accountName(accountIndex) + "：" + message);
        }
    }

    private void requireAccount(int accountIndex) {
        if (accountIndex < 0 || accountIndex >= states.length) {
            throw new IllegalArgumentException("账号索引无效");
        }
    }

    private List<String> parseItems(String value) {
        Set<String> unique = new LinkedHashSet<>();
        if (value != null) {
            for (String item : value.split("[,，\\n]")) {
                String safe = item.replaceAll("[\\r\\t]", " ").trim();
                if (!safe.isBlank() && safe.length() <= 30) {
                    unique.add(safe);
                }
                if (unique.size() >= 10) break;
            }
        }
        return new ArrayList<>(unique);
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
    }
}
