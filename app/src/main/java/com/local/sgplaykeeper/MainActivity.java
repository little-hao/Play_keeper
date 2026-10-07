package com.local.sgplaykeeper;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageInfo;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Insets;
import android.graphics.drawable.GradientDrawable;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.text.InputType;
import android.util.Base64;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import org.json.JSONTokener;

import java.io.ByteArrayOutputStream;
import java.util.Locale;

public final class MainActivity extends Activity {
    private static final String START_URL = "http://sgplay.cc/home.html#/";
    private static final String AFK_URL = "http://sgplay.cc/AFK.html#/hang";
    private static final String PREFS = "sgplay_keeper";
    private static final String PREF_ACTIVE_ACCOUNT = "active_account";
    private static final String PREF_DESKTOP_PREFIX = "desktop_mode_";
    private static final String PREF_LAST_URL_PREFIX = "last_url_";
    private static final String PREF_ACCOUNT_OPENED_PREFIX = "account_opened_";
    private static final String PREF_LANDSCAPE_PREFIX = "landscape_mode_";
    private static final String PREF_ACCOUNT_LABEL_PREFIX = "account_label_";
    private static final String PREF_ACCOUNT_LABEL_MANUAL_PREFIX = "account_label_manual_";
    private static final int MAX_ACCOUNTS = 4;
    private static final long PAGE_LOAD_TIMEOUT_MS = 60_000L;
    private static final long[] RETRY_DELAYS_MS = {3_000L, 10_000L, 30_000L, 60_000L};
    private static final String DESKTOP_USER_AGENT =
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                    + "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 "
                    + "PlayKeeper/1.2";
    private static final int PREVIEW_DEFAULT_WIDTH = 720;
    private static final int PREVIEW_MAX_WIDTH = 2_560;
    private static final int PREVIEW_MAX_ENCODED_BYTES = 2_500 * 1024;
    private static final long PREVIEW_MIN_INTERVAL_MS = 1_000L;
    private static final String USERNAME_DETECTION_SCRIPT =
            "(function(){const clean=v=>(v||'').replace(/\\s+/g,' ').trim();"
                    + "const blocked=/^(用户名|账号|昵称|登录|未登录|user|username|运行中|待机|进入主游戏|曙光口袋助手|Lv\\d+)$/i;"
                    + "const extract=v=>{v=clean(v);if(!v||v.length>80)return null;"
                    + "const all=v.match(/[\\p{L}\\p{N}_.-]{2,32}/gu)||[];"
                    + "return all.find(x=>!blocked.test(x)&&!/^[_.-]+$/.test(x))||null;};"
                    + "const inspect=root=>{let queue=[root],seen=new Set();for(let depth=0;depth<5;depth++){"
                    + "const next=[];for(let o of queue){if(typeof o==='string'){try{o=JSON.parse(o);}catch(e){"
                    + "const v=extract(o);if(v)return v;continue;}}if(!o||typeof o!=='object'||seen.has(o))continue;"
                    + "seen.add(o);for(const k of ['username','userName','account','nickname']){"
                    + "const v=extract(o[k]);if(v)return v;}for(const k of ['value','data','userInfo','playerInfo'])"
                    + "if(o[k]!=null)next.push(o[k]);}queue=next;}return null;};"
                    + "const preferred=['app_user_info','app_active_session','active_session','vuex_userInfo'];"
                    + "for(const k of preferred){try{const v=inspect(localStorage.getItem(k));if(v)return v;}catch(e){}}"
                    + "for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i)||'';"
                    + "if(!/user.?info|active.?session|vuex_userInfo/i.test(k))continue;"
                    + "try{const v=inspect(localStorage.getItem(k));if(v)return v;}catch(e){}}"
                    + "const s=['[data-username]','[data-user-name]','#username','#userName',"
                    + "'.username','.user-name','.user_name','.nickname','.nick-name',"
                    + "'#nickname','#nickName','[class*=user-name]','[class*=username]',"
                    + "'[class*=userInfo]','[class*=user-info]'];"
                    + "for(const q of s){const e=document.querySelector(q);if(!e)continue;"
                    + "const v=extract(e.getAttribute('data-username')||e.getAttribute('data-user-name')"
                    + "||e.value||e.textContent);if(v)return v;}"
                    + "const w=innerWidth,h=innerHeight,scored=[];"
                    + "for(const e of document.querySelectorAll('body *')){const r=e.getBoundingClientRect();"
                    + "if(!r.width||!r.height||r.top<0||r.top>h*.3||r.left<w*.48)continue;"
                    + "const v=extract(e.textContent);if(!v)continue;"
                    + "const hint=(String(e.id||'')+' '+String(e.className||'')).toLowerCase();"
                    + "let score=r.left/w*2-r.top/h;"
                    + "if(/user|name|nick|account|profile/.test(hint))score+=5;"
                    + "if(/^[A-Za-z0-9_.-]{2,32}$/.test(v))score+=2;scored.push({v,score});}"
                    + "scored.sort((a,b)=>b.score-a.score);return scored[0]?.v||null;})()";

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final Session[] sessions = new Session[MAX_ACCOUNTS];
    private final Button[] accountButtons = new Button[MAX_ACCOUNTS];

    private FrameLayout root;
    private LinearLayout pageColumn;
    private LinearLayout toolbarHost;
    private FrameLayout webContainer;
    private BlackOverlayView blackOverlay;
    private ProgressBar progressBar;
    private Button blackButton;
    private Button homeButton;
    private Button refreshButton;
    private Button desktopButton;
    private Button orientationButton;
    private Button batteryButton;
    private Button remoteButton;
    private Button automationButton;
    private ConnectivityManager connectivityManager;
    private ConnectivityManager.NetworkCallback networkCallback;
    private SharedPreferences preferences;
    private BatteryMonitor batteryMonitor;
    private BatteryMonitor.Snapshot latestBatterySnapshot;
    private RemoteConfigStore remoteConfigStore;
    private RemoteConnectionManager remoteConnectionManager;
    private AutomationCoordinator automationCoordinator;
    private RemoteConnectionManager.State remoteState = RemoteConnectionManager.State.DISABLED;

    private int activeAccount;
    private boolean blackMode;
    private boolean activityDestroyed;
    private boolean multiProfileSupported;
    private boolean previewEnabled;
    private int previewAccount = -1;
    private int previewMaxWidth = PREVIEW_DEFAULT_WIDTH;
    private long previewIntervalMs = PREVIEW_MIN_INTERVAL_MS;
    private long previewSequence;
    private Runnable previewRunnable;
    private float brightnessBeforeBlack = WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE;
    private long lastBackPressedAt;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        configureWindowForEdgeToEdge();

        preferences = getSharedPreferences(PREFS, MODE_PRIVATE);
        activeAccount = savedInstanceState != null
                ? savedInstanceState.getInt(PREF_ACTIVE_ACCOUNT, 0)
                : preferences.getInt(PREF_ACTIVE_ACCOUNT, 0);
        activeAccount = Math.max(0, Math.min(activeAccount, MAX_ACCOUNTS - 1));
        applyPreferredOrientation(activeAccount);

        buildUi();
        multiProfileSupported = WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE);
        if (activeAccount > 0 && !multiProfileSupported) {
            activeAccount = 0;
        }
        registerNetworkRecovery();
        restoreOpenedAccounts();
        selectAccount(activeAccount, false);
        startMonitoringAndRemoteConnection();

        if (!multiProfileSupported) {
            showToast("当前系统网页组件不支持账号隔离，请更新 Android System WebView");
        }
    }

    private void configureWindowForEdgeToEdge() {
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.BLACK);
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
        } else {
            getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        }
        if (Build.VERSION.SDK_INT >= 28) {
            WindowManager.LayoutParams attributes = getWindow().getAttributes();
            attributes.layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            getWindow().setAttributes(attributes);
        }
    }

    private void buildUi() {
        root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);

        pageColumn = new LinearLayout(this);
        pageColumn.setOrientation(LinearLayout.VERTICAL);
        pageColumn.setBackgroundColor(Color.BLACK);
        root.addView(pageColumn, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));

        toolbarHost = new LinearLayout(this);
        toolbarHost.setOrientation(LinearLayout.VERTICAL);
        toolbarHost.setBackgroundColor(Color.rgb(18, 20, 23));
        pageColumn.addView(toolbarHost, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(44)));

        for (int i = 0; i < MAX_ACCOUNTS; i++) {
            final int accountIndex = i;
            accountButtons[i] = makeButton("账号" + (i + 1),
                    view -> selectAccount(accountIndex, true));
            accountButtons[i].setOnLongClickListener(view -> {
                showAccountNameDialog(accountIndex);
                return true;
            });
        }

        blackButton = makeButton("黑屏", view -> enterBlackMode());
        homeButton = makeButton("首页", view -> loadHome());
        refreshButton = makeButton("刷新", view -> manualReload());
        desktopButton = makeButton("桌面", view -> toggleDesktopMode());
        orientationButton = makeButton("横屏", view -> toggleOrientation());
        batteryButton = makeButton("电量 --", view -> showBatteryDetails());
        remoteButton = makeButton("远程", view -> showRemoteSettings());
        automationButton = makeButton("脚本", view -> showAutomationSettings(activeAccount));
        rebuildToolbar();

        progressBar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progressBar.setMax(100);
        progressBar.setProgress(0);
        progressBar.setVisibility(View.INVISIBLE);
        pageColumn.addView(progressBar, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(3)));

        webContainer = new FrameLayout(this);
        webContainer.setBackgroundColor(Color.rgb(9, 11, 20));
        pageColumn.addView(webContainer, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        blackOverlay = new BlackOverlayView(this);
        blackOverlay.setBackgroundColor(Color.BLACK);
        blackOverlay.setVisibility(View.GONE);
        blackOverlay.setClickable(true);
        blackOverlay.setFocusable(true);
        blackOverlay.setFocusableInTouchMode(true);
        blackOverlay.setContentDescription("黑屏保护，连续点击五次退出");
        blackOverlay.setOnClickListener(view -> {
            // Accessibility click target; the five-tap gesture is handled below.
        });
        blackOverlay.setOnTouchListener(new FiveTapExitListener());
        root.addView(blackOverlay, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));

        root.setOnApplyWindowInsetsListener((view, windowInsets) -> {
            int left;
            int top;
            int right;
            int bottom;
            if (Build.VERSION.SDK_INT >= 30) {
                Insets insets = windowInsets.getInsets(
                        WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                left = insets.left;
                top = insets.top;
                right = insets.right;
                bottom = insets.bottom;
            } else {
                left = windowInsets.getSystemWindowInsetLeft();
                top = windowInsets.getSystemWindowInsetTop();
                right = windowInsets.getSystemWindowInsetRight();
                bottom = windowInsets.getSystemWindowInsetBottom();
            }
            pageColumn.setPadding(left, top, right, bottom);
            return windowInsets;
        });

        setContentView(root);
        root.requestApplyInsets();
    }

    private LinearLayout.LayoutParams weightedButtonParams(float weight) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                0, ViewGroup.LayoutParams.MATCH_PARENT, weight);
        params.setMargins(dp(1), dp(2), dp(1), dp(2));
        return params;
    }

    private void rebuildToolbar() {
        if (toolbarHost == null || orientationButton == null) {
            return;
        }
        for (Button button : accountButtons) {
            detachFromParent(button);
        }
        detachFromParent(blackButton);
        detachFromParent(homeButton);
        detachFromParent(refreshButton);
        detachFromParent(desktopButton);
        detachFromParent(orientationButton);
        detachFromParent(batteryButton);
        detachFromParent(remoteButton);
        detachFromParent(automationButton);
        toolbarHost.removeAllViews();

        boolean landscape = getResources().getConfiguration().orientation
                == Configuration.ORIENTATION_LANDSCAPE;
        if (landscape) {
            LinearLayout row = makeToolbarRow();
            for (Button button : accountButtons) {
                row.addView(button, weightedButtonParams(1.05f));
            }
            row.addView(blackButton, weightedButtonParams(0.78f));
            row.addView(homeButton, weightedButtonParams(0.72f));
            row.addView(refreshButton, weightedButtonParams(0.72f));
            row.addView(orientationButton, weightedButtonParams(0.82f));
            row.addView(batteryButton, weightedButtonParams(1.05f));
            row.addView(remoteButton, weightedButtonParams(0.82f));
            row.addView(automationButton, weightedButtonParams(0.82f));
            toolbarHost.addView(row, new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, dp(44)));
            toolbarHost.getLayoutParams().height = dp(44);
        } else {
            LinearLayout accountRow = makeToolbarRow();
            for (Button button : accountButtons) {
                accountRow.addView(button, weightedButtonParams(1f));
            }
            LinearLayout actionRow = makeToolbarRow();
            actionRow.addView(blackButton, weightedButtonParams(1f));
            actionRow.addView(homeButton, weightedButtonParams(1f));
            actionRow.addView(refreshButton, weightedButtonParams(1f));
            actionRow.addView(orientationButton, weightedButtonParams(1f));
            actionRow.addView(batteryButton, weightedButtonParams(1.15f));
            actionRow.addView(remoteButton, weightedButtonParams(1f));
            actionRow.addView(automationButton, weightedButtonParams(1f));
            toolbarHost.addView(accountRow, new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, dp(38)));
            toolbarHost.addView(actionRow, new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, dp(38)));
            toolbarHost.getLayoutParams().height = dp(76);
        }
        toolbarHost.requestLayout();
    }

    private LinearLayout makeToolbarRow() {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(dp(3), 0, dp(3), 0);
        return row;
    }

    private void detachFromParent(View view) {
        if (view != null && view.getParent() instanceof ViewGroup) {
            ((ViewGroup) view.getParent()).removeView(view);
        }
    }

    private Button makeButton(String text, View.OnClickListener listener) {
        Button button = new Button(this);
        button.setText(text);
        button.setTextColor(Color.rgb(245, 247, 250));
        button.setTextSize(11);
        button.setAllCaps(false);
        button.setGravity(Gravity.CENTER);
        button.setPadding(dp(1), 0, dp(1), 0);
        button.setMinWidth(0);
        button.setMinimumWidth(0);
        button.setStateListAnimator(null);
        button.setBackground(buttonBackground(false));
        button.setOnClickListener(listener);
        return button;
    }

    private GradientDrawable buttonBackground(boolean active) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(active ? Color.rgb(82, 210, 115) : Color.rgb(43, 47, 53));
        drawable.setCornerRadius(dp(5));
        return drawable;
    }

    private GradientDrawable coloredButtonBackground(int color) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(color);
        drawable.setCornerRadius(dp(5));
        return drawable;
    }

    private void startMonitoringAndRemoteConnection() {
        automationCoordinator = new AutomationCoordinator(preferences,
                new AutomationCoordinator.Host() {
                    @Override
                    public WebView requireWebView(int accountIndex) {
                        return getOrCreateSession(accountIndex).webView;
                    }

                    @Override
                    public void openHome(int accountIndex) {
                        getOrCreateSession(accountIndex).webView.loadUrl(START_URL);
                    }

                    @Override
                    public void openAfk(int accountIndex) {
                        getOrCreateSession(accountIndex).webView.loadUrl(AFK_URL);
                    }

                    @Override
                    public void activateAccount(int accountIndex) {
                        selectAccount(accountIndex, false);
                    }

                    @Override
                    public void prepareAutomation(int accountIndex, boolean landscape) {
                        Session session = getOrCreateSession(accountIndex);
                        selectAccount(accountIndex, false);
                        boolean modeChanged = session.desktopMode != landscape;
                        session.desktopMode = landscape;
                        preferences.edit()
                                .putBoolean(landscapeModeKey(accountIndex), landscape)
                                .putBoolean(desktopModeKey(accountIndex), landscape)
                                .apply();
                        applyUserAgent(session);
                        applyPreferredOrientation(accountIndex);
                        updateToolbarState();
                        pushTelemetry();
                        // Main-game automation depends on the fixed desktop layout.  Reload the
                        // home page whenever the profile was still using the mobile user agent;
                        // otherwise the site keeps the portrait-only overlay in the current DOM.
                        if (landscape && modeChanged) {
                            session.webView.loadUrl(START_URL);
                        }
                    }

                    @Override
                    public boolean isAccountOpened(int accountIndex) {
                        return sessions[accountIndex] != null
                                || preferences.getBoolean(accountOpenedKey(accountIndex),
                                accountIndex == 0);
                    }

                    @Override
                    public int findOpenedAccountByLabel(String accountLabel,
                                                        int excludingAccountIndex) {
                        if (accountLabel == null || accountLabel.isBlank()) return -1;
                        for (int i = 0; i < MAX_ACCOUNTS; i++) {
                            if (i == excludingAccountIndex || sessions[i] == null) continue;
                            if (accountDisplayName(i).equalsIgnoreCase(accountLabel.trim())) {
                                return i;
                            }
                        }
                        return -1;
                    }

                    @Override
                    public void onAutomationChanged() {
                        pushTelemetry();
                    }

                    @Override
                    public void showMessage(String message) {
                        showToast(message);
                    }

                    @Override
                    public void requestTempleConfirmation(int accountIndex, String message,
                                                          long deadlineAt) {
                        showTempleConfirmationDialog(accountIndex, message, deadlineAt);
                    }
                }, MAX_ACCOUNTS);
        automationCoordinator.start();

        batteryMonitor = new BatteryMonitor(this, snapshot -> {
            latestBatterySnapshot = snapshot;
            batteryButton.setText(snapshot.compactLabel());
            if (snapshot.thermalStatus >= android.os.PowerManager.THERMAL_STATUS_SEVERE) {
                batteryButton.setBackground(coloredButtonBackground(Color.rgb(184, 76, 59)));
            } else if (!Double.isNaN(snapshot.temperatureC) && snapshot.temperatureC >= 42d) {
                batteryButton.setBackground(coloredButtonBackground(Color.rgb(180, 124, 40)));
            } else {
                batteryButton.setBackground(buttonBackground(false));
            }
            pushTelemetry();
        });
        batteryMonitor.start();

        remoteConfigStore = new RemoteConfigStore(this);
        remoteConnectionManager = new RemoteConnectionManager(
                new RemoteConnectionManager.Listener() {
                    @Override
                    public void onRemoteStateChanged(RemoteConnectionManager.State state,
                                                     String message) {
                        remoteState = state;
                        if (state != RemoteConnectionManager.State.CONNECTED) {
                            stopPreview();
                        }
                        updateRemoteButton();
                    }

                    @Override
                    public void onRemoteCommand(String commandId, String command,
                                                JSONObject parameters) {
                        executeRemoteCommand(commandId, command, parameters);
                    }

                    @Override
                    public JSONObject createTelemetry() {
                        return buildTelemetry();
                    }
                });
        remoteConnectionManager.start(remoteConfigStore.load());
    }

    private void showTempleConfirmationDialog(int accountIndex, String message,
                                              long deadlineAt) {
        if (activityDestroyed || isFinishing()) return;
        AlertDialog dialog = new AlertDialog.Builder(this)
                .setTitle(accountDisplayName(accountIndex) + " · 后续挂机")
                .setMessage(message + "\n60秒内未选择将自动进入圣兽云殿。")
                .setNegativeButton("保持当前页", (ignored, which) ->
                        automationCoordinator.resolveTempleConfirmation(accountIndex, false))
                .setPositiveButton("进入圣兽云殿", (ignored, which) ->
                        automationCoordinator.resolveTempleConfirmation(accountIndex, true))
                .create();
        dialog.show();
        long remaining = Math.max(0L, deadlineAt - System.currentTimeMillis());
        mainHandler.postDelayed(() -> {
            if (dialog.isShowing()) dialog.dismiss();
        }, remaining + 500L);
    }

    private void updateRemoteButton() {
        switch (remoteState) {
            case CONNECTED:
                remoteButton.setText("远程在线");
                remoteButton.setBackground(coloredButtonBackground(Color.rgb(42, 143, 80)));
                break;
            case CONNECTING:
                remoteButton.setText("连接中");
                remoteButton.setBackground(coloredButtonBackground(Color.rgb(39, 108, 174)));
                break;
            case ERROR:
                remoteButton.setText("远程异常");
                remoteButton.setBackground(coloredButtonBackground(Color.rgb(174, 92, 42)));
                break;
            default:
                remoteButton.setText("远程");
                remoteButton.setBackground(buttonBackground(false));
                break;
        }
    }

    private void showBatteryDetails() {
        String details = latestBatterySnapshot == null
                ? "正在读取电池信息……"
                : latestBatterySnapshot.detailText();
        new AlertDialog.Builder(this)
                .setTitle("耗电与温度监控")
                .setMessage(details)
                .setPositiveButton("关闭", null)
                .show();
    }

    private void showAutomationSettings(int accountIndex) {
        ScrollView scroll = new ScrollView(this);
        LinearLayout form = new LinearLayout(this);
        form.setOrientation(LinearLayout.VERTICAL);
        form.setPadding(dp(20), dp(8), dp(20), dp(8));
        scroll.addView(form, new ScrollView.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        CheckBox auctionEnabled = new CheckBox(this);
        auctionEnabled.setText("每隔固定时间自动拍卖（保留1个）");
        auctionEnabled.setChecked(automationCoordinator.isAuctionEnabled(accountIndex));
        form.addView(auctionEnabled);

        form.addView(formLabel("拍卖道具（逗号分隔，可自行修改）"));
        EditText auctionItems = new EditText(this);
        auctionItems.setText(automationCoordinator.auctionItemsText(accountIndex));
        auctionItems.setHint("进化宝石,曙光印记");
        auctionItems.setSingleLine(true);
        form.addView(auctionItems, formFieldParams());
        Button auctionPresetOne = makeButton("组合1：曙光印记 + 进化宝石",
                view -> auctionItems.setText(AutomationCoordinator.AUCTION_PRESET_ONE));
        form.addView(auctionPresetOne, automationActionParams());
        Button auctionPresetTwo = makeButton("组合2：强化丹/雨露类",
                view -> auctionItems.setText(AutomationCoordinator.AUCTION_PRESET_TWO));
        form.addView(auctionPresetTwo, automationActionParams());
        Button auctionPresetThree = makeButton("组合3：黑暗系列",
                view -> auctionItems.setText(AutomationCoordinator.AUCTION_PRESET_THREE));
        form.addView(auctionPresetThree, automationActionParams());

        form.addView(formLabel("指定买家"));
        EditText buyer = new EditText(this);
        buyer.setSingleLine(true);
        buyer.setText(automationCoordinator.auctionBuyer(accountIndex));
        buyer.setHint("hao");
        form.addView(buyer, formFieldParams());

        form.addView(formLabel("拍卖单价（默认920金币）"));
        EditText auctionPrice = new EditText(this);
        auctionPrice.setSingleLine(true);
        auctionPrice.setInputType(InputType.TYPE_CLASS_NUMBER);
        auctionPrice.setText(String.valueOf(automationCoordinator.auctionPrice(accountIndex)));
        form.addView(auctionPrice, formFieldParams());

        form.addView(formLabel("拍卖/金币券卖出间隔（小时，默认12）"));
        EditText hours = new EditText(this);
        hours.setSingleLine(true);
        hours.setInputType(InputType.TYPE_CLASS_NUMBER);
        hours.setText(String.valueOf(automationCoordinator.auctionIntervalHours(accountIndex)));
        form.addView(hours, formFieldParams());

        CheckBox storeEnabled = new CheckBox(this);
        storeEnabled.setText("每隔固定时间自动卖出金币券（全部数量）");
        storeEnabled.setChecked(automationCoordinator.isStoreSellEnabled(accountIndex));
        form.addView(storeEnabled);

        form.addView(formLabel("道具商店匹配规则（名称包含“金币券”）"));
        CheckBox coinVoucher = new CheckBox(this);
        coinVoucher.setText("*金币券*（包括1W/5W/10W金币券）");
        coinVoucher.setChecked(automationCoordinator.storeSellItemsText(accountIndex)
                .contains("金币券"));
        coinVoucher.setEnabled(false);
        form.addView(coinVoucher);

        CheckBox templeEnabled = new CheckBox(this);
        templeEnabled.setText("圣兽云殿守护（每1小时检查）");
        templeEnabled.setChecked(automationCoordinator.isTempleEnabled(accountIndex));
        form.addView(templeEnabled);

        CheckBox warehouseEnabled = new CheckBox(this);
        warehouseEnabled.setText("每10分钟检查背包并存入仓库");
        warehouseEnabled.setChecked(automationCoordinator.isWarehouseEnabled(accountIndex));
        form.addView(warehouseEnabled);

        CheckBox warehouseStoreAll = new CheckBox(this);
        warehouseStoreAll.setText("存仓时全选背包（挂机/副本前也执行）");
        warehouseStoreAll.setChecked(automationCoordinator.isWarehouseStoreAll(accountIndex));
        form.addView(warehouseStoreAll);

        form.addView(formLabel("自动存入仓库的道具组合（逗号分隔）"));
        EditText warehouseItem = new EditText(this);
        warehouseItem.setSingleLine(true);
        warehouseItem.setHint("护宠仙石,其他道具");
        warehouseItem.setText(automationCoordinator.warehouseItemsText(accountIndex));
        form.addView(warehouseItem, formFieldParams());

        form.addView(formLabel("副本挂机组合（按填写顺序执行）"));
        EditText dungeonItems = new EditText(this);
        dungeonItems.setSingleLine(true);
        dungeonItems.setText(automationCoordinator.dungeonItemsText(accountIndex));
        form.addView(dungeonItems, formFieldParams());
        Button defaultDungeons = makeButton("恢复默认四副本组合",
                view -> dungeonItems.setText(String.join(",",
                        AutomationCoordinator.DEFAULT_DUNGEON_SEQUENCE)));
        form.addView(defaultDungeons, automationActionParams());

        CheckBox prestigeEnabled = new CheckBox(this);
        prestigeEnabled.setText("圣兽云殿挂机时定时使用威望道具（每1小时）");
        prestigeEnabled.setChecked(automationCoordinator.isPrestigeEnabled(accountIndex));
        form.addView(prestigeEnabled);
        form.addView(formLabel("威望道具组合（逗号分隔）"));
        EditText prestigeItems = new EditText(this);
        prestigeItems.setSingleLine(true);
        prestigeItems.setText(automationCoordinator.prestigeItemsText(accountIndex));
        form.addView(prestigeItems, formFieldParams());

        form.addView(formLabel("装备定向转移（最多10件，每5件自动分批）"));
        EditText equipmentItems = new EditText(this);
        equipmentItems.setSingleLine(true);
        equipmentItems.setHint(AutomationCoordinator.DEFAULT_EQUIPMENT_ITEMS);
        equipmentItems.setText(automationCoordinator.equipmentItemsText(accountIndex));
        form.addView(equipmentItems, formFieldParams());

        form.addView(formLabel("装备单价（默认920金币）"));
        EditText equipmentPrice = new EditText(this);
        equipmentPrice.setSingleLine(true);
        equipmentPrice.setInputType(InputType.TYPE_CLASS_NUMBER);
        equipmentPrice.setText(String.valueOf(automationCoordinator.equipmentPrice(accountIndex)));
        form.addView(equipmentPrice, formFieldParams());

        form.addView(formLabel("装备指定买家ID（上架必填）"));
        EditText equipmentBuyer = new EditText(this);
        equipmentBuyer.setSingleLine(true);
        equipmentBuyer.setHint("支持字母、数字和 @ _ . -");
        equipmentBuyer.setText(automationCoordinator.equipmentBuyer(accountIndex));
        form.addView(equipmentBuyer, formFieldParams());

        TextView equipmentNotice = formLabel("卖方首批最多上架5件，20秒后会按用户名"
                + "自动启动同一 APP 内的买方账号；确认成交后重新进入交易所继续下一批。"
                + "不同设备时不会无限等待本机买方。");
        equipmentNotice.setTextColor(Color.rgb(160, 166, 178));
        form.addView(equipmentNotice);

        TextView notice = formLabel("脚本仅在 Play Keeper 前台或常亮黑屏模式运行；"
                + "关屏或被 HyperOS 清理后无法保证定时执行。");
        notice.setTextColor(Color.rgb(160, 166, 178));
        form.addView(notice);

        java.util.function.BooleanSupplier saveAll = () -> saveAutomationForm(
                accountIndex, auctionEnabled, auctionItems, buyer, auctionPrice, hours,
                storeEnabled, templeEnabled, warehouseEnabled, warehouseItem,
                warehouseStoreAll,
                dungeonItems, prestigeEnabled, prestigeItems, equipmentItems,
                equipmentPrice, equipmentBuyer);

        Button auctionNow = makeButton("保存并立即拍卖", view -> {
            if (saveAll.getAsBoolean()) {
                automationCoordinator.runAuctionNow(accountIndex);
            }
        });
        form.addView(auctionNow, automationActionParams());
        Button auctionBuyNow = makeButton("保存并立即购买拍卖道具", view -> {
            if (saveAll.getAsBoolean()) {
                automationCoordinator.runAuctionBuyNow(accountIndex);
            }
        });
        form.addView(auctionBuyNow, automationActionParams());
        Button storeSellNow = makeButton("保存并立即卖出金币券", view -> {
            if (saveAll.getAsBoolean()) {
                automationCoordinator.runStoreSellNow(accountIndex);
            }
        });
        form.addView(storeSellNow, automationActionParams());
        Button templeNow = makeButton("保存并立即检查圣殿挂机", view -> {
            if (saveAll.getAsBoolean()) {
                automationCoordinator.runTempleNow(accountIndex);
            }
        });
        form.addView(templeNow, automationActionParams());

        Button warehouseNow = makeButton("保存并立即检查仓库存放", view -> {
            if (saveAll.getAsBoolean()) {
                automationCoordinator.runWarehouseNow(accountIndex);
            }
        });
        form.addView(warehouseNow, automationActionParams());

        Button dungeonNow = makeButton("保存并立即执行副本组合", view -> {
            if (saveAll.getAsBoolean()) automationCoordinator.runDungeonNow(accountIndex);
        });
        form.addView(dungeonNow, automationActionParams());

        Button prestigeNow = makeButton("保存并立即检查威望道具", view -> {
            if (saveAll.getAsBoolean()) automationCoordinator.runPrestigeNow(accountIndex);
        });
        form.addView(prestigeNow, automationActionParams());

        Button equipmentSellNow = makeButton("保存并立即上架装备", view -> {
            if (saveAll.getAsBoolean()) {
                automationCoordinator.runEquipmentSellNow(accountIndex);
            }
        });
        form.addView(equipmentSellNow, automationActionParams());
        Button equipmentBuyNow = makeButton("保存并立即购买装备", view -> {
            if (saveAll.getAsBoolean()) {
                automationCoordinator.runEquipmentBuyNow(accountIndex);
            }
        });
        form.addView(equipmentBuyNow, automationActionParams());

        Button cancelAutomation = makeButton("中断当前脚本", view ->
                automationCoordinator.cancelCurrent(accountIndex));
        form.addView(cancelAutomation, automationActionParams());

        AlertDialog dialog = new AlertDialog.Builder(this)
                .setTitle(accountDisplayName(accountIndex) + " · 一键脚本")
                .setView(scroll)
                .setNegativeButton("取消", null)
                .setPositiveButton("保存", null)
                .create();
        dialog.setOnShowListener(ignored -> dialog.getButton(AlertDialog.BUTTON_POSITIVE)
                .setOnClickListener(view -> {
                    if (saveAll.getAsBoolean()) {
                        dialog.dismiss();
                        showToast("脚本设置已保存");
                    }
                }));
        dialog.show();
    }

    private boolean saveAutomationForm(int accountIndex, CheckBox auctionEnabled,
                                       EditText auctionItems,
                                       EditText buyer, EditText auctionPrice, EditText hours,
                                       CheckBox storeEnabled, CheckBox templeEnabled,
                                       CheckBox warehouseEnabled, EditText warehouseItem,
                                       CheckBox warehouseStoreAll,
                                       EditText dungeonItems, CheckBox prestigeEnabled,
                                       EditText prestigeItems,
                                       EditText equipmentItems, EditText equipmentPrice,
                                       EditText equipmentBuyer) {
        try {
            int intervalHours = Integer.parseInt(hours.getText().toString().trim());
            int itemAuctionPrice = Integer.parseInt(
                    auctionPrice.getText().toString().trim());
            String auctionItemText = auctionItems.getText().toString();
            String storeItems = "金币券";
            automationCoordinator.configureAuction(accountIndex, auctionEnabled.isChecked(),
                    auctionItemText, buyer.getText().toString(), intervalHours,
                    itemAuctionPrice);
            automationCoordinator.configureStoreSell(accountIndex, storeEnabled.isChecked(),
                    storeItems, intervalHours);
            automationCoordinator.configureTemple(accountIndex, templeEnabled.isChecked());
            automationCoordinator.configureWarehouse(accountIndex,
                    warehouseEnabled.isChecked(), warehouseItem.getText().toString(),
                    warehouseStoreAll.isChecked());
            automationCoordinator.configureDungeonSequence(accountIndex,
                    dungeonItems.getText().toString());
            automationCoordinator.configurePrestige(accountIndex,
                    prestigeEnabled.isChecked(), prestigeItems.getText().toString());
            int transferPrice = Integer.parseInt(equipmentPrice.getText().toString().trim());
            automationCoordinator.configureEquipmentTransfer(accountIndex,
                    equipmentItems.getText().toString(), transferPrice,
                    equipmentBuyer.getText().toString());
            return true;
        } catch (RuntimeException error) {
            showToast(error.getMessage() == null ? "脚本设置无效" : error.getMessage());
            return false;
        }
    }

    private TextView formLabel(String text) {
        TextView label = new TextView(this);
        label.setText(text);
        label.setTextColor(Color.rgb(45, 48, 54));
        label.setTextSize(14);
        label.setPadding(0, dp(10), 0, dp(3));
        return label;
    }

    private LinearLayout.LayoutParams formFieldParams() {
        return new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
    }

    private LinearLayout.LayoutParams automationActionParams() {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(46));
        params.setMargins(0, dp(8), 0, 0);
        return params;
    }

    private void showAccountNameDialog(int accountIndex) {
        EditText input = new EditText(this);
        input.setSingleLine(true);
        input.setSelectAllOnFocus(true);
        input.setText(accountDisplayName(accountIndex));
        input.setHint("登录用户名或自定义名称");
        int padding = dp(20);
        FrameLayout holder = new FrameLayout(this);
        holder.setPadding(padding, 0, padding, 0);
        holder.addView(input, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        new AlertDialog.Builder(this)
                .setTitle("账号" + (accountIndex + 1) + "名称")
                .setMessage("网页会尝试自动识别登录用户名；识别不准时可在这里手动设置。留空会恢复自动识别。")
                .setView(holder)
                .setNegativeButton("取消", null)
                .setPositiveButton("保存", (dialog, which) -> {
                    String label = sanitizeAccountLabel(input.getText().toString());
                    SharedPreferences.Editor editor = preferences.edit();
                    if (label.isBlank()) {
                        editor.remove(accountLabelKey(accountIndex));
                        editor.remove(accountLabelManualKey(accountIndex));
                    } else {
                        editor.putString(accountLabelKey(accountIndex), label);
                        editor.putBoolean(accountLabelManualKey(accountIndex), true);
                    }
                    editor.apply();
                    updateToolbarState();
                    Session session = sessions[accountIndex];
                    if (label.isBlank() && session != null) {
                        detectAccountName(session);
                    }
                    pushTelemetry();
                })
                .show();
    }

    private void showRemoteSettings() {
        RemoteConfigStore.Config config = remoteConfigStore.load();
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(20), dp(8), dp(20), 0);

        TextView deviceId = new TextView(this);
        deviceId.setText(getString(R.string.remote_device_id, config.deviceId));
        deviceId.setTextIsSelectable(true);
        deviceId.setTextSize(14);
        content.addView(deviceId, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        EditText endpoint = new EditText(this);
        endpoint.setHint("wss://你的域名/device");
        endpoint.setSingleLine(true);
        endpoint.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        endpoint.setText(config.endpoint);
        content.addView(endpoint, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        EditText token = new EditText(this);
        token.setHint("设备连接密钥");
        token.setSingleLine(true);
        token.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        token.setText(config.token);
        content.addView(token, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        CheckBox enabled = new CheckBox(this);
        enabled.setText("启用远程连接");
        enabled.setChecked(config.enabled);
        content.addView(enabled, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        TextView notice = new TextView(this);
        notice.setText(R.string.remote_security_notice);
        notice.setTextSize(12);
        notice.setTextColor(Color.GRAY);
        content.addView(notice, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        AlertDialog dialog = new AlertDialog.Builder(this)
                .setTitle("远程连接设置")
                .setView(content)
                .setNegativeButton("取消", null)
                .setPositiveButton("保存", null)
                .create();
        dialog.setOnShowListener(ignored -> dialog.getButton(AlertDialog.BUTTON_POSITIVE)
                .setOnClickListener(view -> {
                    String endpointValue = endpoint.getText().toString().trim();
                    String tokenValue = token.getText().toString().trim();
                    if (enabled.isChecked()
                            && (!endpointValue.startsWith("wss://") || tokenValue.isBlank())) {
                        showToast("启用远程连接需要 WSS 地址和设备密钥");
                        return;
                    }
                    if (!remoteConfigStore.save(enabled.isChecked(), endpointValue, tokenValue)) {
                        showToast("连接密钥加密保存失败");
                        return;
                    }
                    remoteConnectionManager.start(remoteConfigStore.load());
                    dialog.dismiss();
                }));
        dialog.show();
    }

    private void executeRemoteCommand(String commandId, String command,
                                      JSONObject parameters) {
        boolean success = false;
        String resultMessage;
        try {
            switch (command) {
                case "switch_account": {
                    int index = requiredAccountIndex(parameters);
                    selectAccount(index, false);
                    success = sessions[index] != null && activeAccount == index;
                    resultMessage = success ? "账号已切换" : "账号切换失败";
                    break;
                }
                case "reload_account": {
                    int index = requiredAccountIndex(parameters);
                    Session session = getOrCreateSession(index);
                    reloadSession(session);
                    success = true;
                    resultMessage = "账号页面已刷新";
                    break;
                }
                case "open_home": {
                    int index = requiredAccountIndex(parameters);
                    Session session = getOrCreateSession(index);
                    session.webView.loadUrl(START_URL);
                    success = true;
                    resultMessage = "账号已返回首页";
                    break;
                }
                case "set_browser_mode": {
                    int index = requiredAccountIndex(parameters);
                    String mode = parameters.optString("mode");
                    if (!"desktop".equals(mode) && !"mobile".equals(mode)) {
                        throw new IllegalArgumentException("浏览器模式无效");
                    }
                    Session session = getOrCreateSession(index);
                    boolean desktop = "desktop".equals(mode);
                    session.desktopMode = desktop;
                    preferences.edit().putBoolean(desktopModeKey(index), desktop).apply();
                    applyUserAgent(session);
                    session.webView.reload();
                    if (index == activeAccount) {
                        updateToolbarState();
                    }
                    success = true;
                    resultMessage = "浏览器模式已更新";
                    break;
                }
                case "set_orientation": {
                    int index = requiredAccountIndex(parameters);
                    String orientation = parameters.optString("orientation");
                    if (!"landscape".equals(orientation) && !"portrait".equals(orientation)) {
                        throw new IllegalArgumentException("屏幕方向无效");
                    }
                    preferences.edit().putBoolean(
                            landscapeModeKey(index), "landscape".equals(orientation)).apply();
                    if (index == activeAccount) {
                        updateToolbarState();
                        applyPreferredOrientation(index);
                    }
                    success = true;
                    resultMessage = "屏幕方向已更新";
                    break;
                }
                case "enter_black_screen":
                    enterBlackMode();
                    success = true;
                    resultMessage = "黑屏保护已开启";
                    break;
                case "exit_black_screen":
                    exitBlackMode();
                    success = true;
                    resultMessage = "黑屏保护已关闭";
                    break;
                case "request_status":
                    for (Session session : sessions) {
                        if (session != null) {
                            detectAccountName(session);
                        }
                    }
                    success = true;
                    resultMessage = "状态已更新";
                    break;
                case "preview_start": {
                    int index = requiredAccountIndex(parameters);
                    int maxWidth = parameters.optInt("maxWidth", PREVIEW_DEFAULT_WIDTH);
                    double fps = parameters.optDouble("fps", 1d);
                    startPreview(index, maxWidth, fps);
                    success = true;
                    resultMessage = "页面预览已启动";
                    break;
                }
                case "preview_stop":
                    stopPreview();
                    success = true;
                    resultMessage = "页面预览已停止";
                    break;
                case "pointer_tap": {
                    handlePreviewTap(commandId, parameters);
                    return;
                }
                case "select_option":
                    handleSelectOption(commandId, parameters);
                    return;
                case "configure_auto_auction":
                case "configure_auto_sell": {
                    int index = requiredAccountIndex(parameters);
                    JSONArray itemArray = parameters.optJSONArray("items");
                    if (itemArray == null) {
                        throw new IllegalArgumentException("拍卖道具列表无效");
                    }
                    StringBuilder itemText = new StringBuilder();
                    for (int i = 0; i < itemArray.length(); i++) {
                        if (i > 0) itemText.append(',');
                        itemText.append(itemArray.optString(i));
                    }
                    automationCoordinator.configureAuction(index,
                            parameters.optBoolean("enabled", false), itemText.toString(),
                            parameters.optString("buyer", "hao"),
                            parameters.optInt("intervalHours", 12),
                            parameters.optInt("price", 920));
                    success = true;
                    resultMessage = "定时拍卖设置已更新";
                    break;
                }
                case "run_auto_auction":
                case "run_auto_sell": {
                    int index = requiredAccountIndex(parameters);
                    automationCoordinator.runAuctionNow(index);
                    success = true;
                    resultMessage = "已启动拍卖检查";
                    break;
                }
                case "run_auction_buy": {
                    int index = requiredAccountIndex(parameters);
                    automationCoordinator.runAuctionBuyNow(index);
                    success = true;
                    resultMessage = "已启动拍卖道具购买";
                    break;
                }
                case "configure_store_sell": {
                    int index = requiredAccountIndex(parameters);
                    JSONArray itemArray = parameters.optJSONArray("items");
                    if (itemArray == null) {
                        throw new IllegalArgumentException("商店卖出道具列表无效");
                    }
                    StringBuilder itemText = new StringBuilder();
                    for (int i = 0; i < itemArray.length(); i++) {
                        if (i > 0) itemText.append(',');
                        itemText.append(itemArray.optString(i));
                    }
                    automationCoordinator.configureStoreSell(index,
                            parameters.optBoolean("enabled", false), itemText.toString(),
                            parameters.optInt("intervalHours", 12));
                    success = true;
                    resultMessage = "道具商店卖出设置已更新";
                    break;
                }
                case "run_store_sell": {
                    int index = requiredAccountIndex(parameters);
                    automationCoordinator.runStoreSellNow(index);
                    success = true;
                    resultMessage = "已启动道具商店卖出";
                    break;
                }
                case "configure_warehouse_sync": {
                    int index = requiredAccountIndex(parameters);
                    JSONArray itemArray = parameters.optJSONArray("items");
                    StringBuilder itemText = new StringBuilder();
                    if (itemArray != null) {
                        for (int i = 0; i < itemArray.length(); i++) {
                            if (i > 0) itemText.append(',');
                            itemText.append(itemArray.optString(i));
                        }
                    } else {
                        String legacyItem = parameters.optString("item", "").trim();
                        if (legacyItem.isEmpty()) {
                            throw new IllegalArgumentException("存仓道具列表无效");
                        }
                        itemText.append(legacyItem);
                    }
                    automationCoordinator.configureWarehouse(index,
                            parameters.optBoolean("enabled", false),
                            itemText.toString(), parameters.optBoolean("storeAll", true));
                    success = true;
                    resultMessage = "仓库自动存放设置已更新";
                    break;
                }
                case "run_warehouse_sync": {
                    int index = requiredAccountIndex(parameters);
                    automationCoordinator.runWarehouseNow(index);
                    success = true;
                    resultMessage = "已启动仓库存放检查";
                    break;
                }
                case "configure_dungeon_sequence": {
                    int index = requiredAccountIndex(parameters);
                    JSONArray itemArray = parameters.optJSONArray("items");
                    if (itemArray == null) throw new IllegalArgumentException("副本列表无效");
                    StringBuilder itemText = new StringBuilder();
                    for (int i = 0; i < itemArray.length(); i++) {
                        if (i > 0) itemText.append(',');
                        itemText.append(itemArray.optString(i));
                    }
                    automationCoordinator.configureDungeonSequence(index, itemText.toString());
                    success = true;
                    resultMessage = "副本组合已更新";
                    break;
                }
                case "run_dungeon_sequence": {
                    int index = requiredAccountIndex(parameters);
                    automationCoordinator.runDungeonNow(index);
                    success = true;
                    resultMessage = "已启动副本组合";
                    break;
                }
                case "configure_prestige_items": {
                    int index = requiredAccountIndex(parameters);
                    JSONArray itemArray = parameters.optJSONArray("items");
                    if (itemArray == null) throw new IllegalArgumentException("威望道具列表无效");
                    StringBuilder itemText = new StringBuilder();
                    for (int i = 0; i < itemArray.length(); i++) {
                        if (i > 0) itemText.append(',');
                        itemText.append(itemArray.optString(i));
                    }
                    automationCoordinator.configurePrestige(index,
                            parameters.optBoolean("enabled", false), itemText.toString());
                    success = true;
                    resultMessage = "威望道具设置已更新";
                    break;
                }
                case "run_prestige_items": {
                    int index = requiredAccountIndex(parameters);
                    automationCoordinator.runPrestigeNow(index);
                    success = true;
                    resultMessage = "已启动威望道具检查";
                    break;
                }
                case "configure_equipment_transfer": {
                    int index = requiredAccountIndex(parameters);
                    JSONArray itemArray = parameters.optJSONArray("items");
                    if (itemArray == null) {
                        throw new IllegalArgumentException("装备列表无效");
                    }
                    StringBuilder itemText = new StringBuilder();
                    for (int i = 0; i < itemArray.length(); i++) {
                        if (i > 0) itemText.append(',');
                        itemText.append(itemArray.optString(i));
                    }
                    automationCoordinator.configureEquipmentTransfer(index,
                            itemText.toString(), parameters.optInt("price", 920),
                            parameters.optString("buyer", ""));
                    success = true;
                    resultMessage = "装备定向转移设置已更新";
                    break;
                }
                case "run_equipment_sell": {
                    int index = requiredAccountIndex(parameters);
                    automationCoordinator.runEquipmentSellNow(index);
                    success = true;
                    resultMessage = "已启动装备上架";
                    break;
                }
                case "run_equipment_buy": {
                    int index = requiredAccountIndex(parameters);
                    automationCoordinator.runEquipmentBuyNow(index);
                    success = true;
                    resultMessage = "已启动装备购买";
                    break;
                }
                case "cancel_automation": {
                    int index = requiredAccountIndex(parameters);
                    automationCoordinator.cancelCurrent(index);
                    success = true;
                    resultMessage = "已中断当前脚本";
                    break;
                }
                case "configure_temple_guard": {
                    int index = requiredAccountIndex(parameters);
                    automationCoordinator.configureTemple(index,
                            parameters.optBoolean("enabled", false));
                    success = true;
                    resultMessage = "圣殿挂机守护设置已更新";
                    break;
                }
                case "run_temple_guard": {
                    int index = requiredAccountIndex(parameters);
                    automationCoordinator.runTempleNow(index);
                    success = true;
                    resultMessage = "已启动圣殿挂机检查";
                    break;
                }
                case "resolve_temple_confirmation": {
                    int index = requiredAccountIndex(parameters);
                    automationCoordinator.resolveTempleConfirmation(index,
                            parameters.optBoolean("enterTemple", true));
                    success = true;
                    resultMessage = parameters.optBoolean("enterTemple", true)
                            ? "已确认进入圣兽云殿" : "已保持当前页";
                    break;
                }
                default:
                    resultMessage = "不支持的远程命令";
                    break;
            }
        } catch (RuntimeException error) {
            resultMessage = error.getMessage() == null ? "命令执行失败" : error.getMessage();
        }
        remoteConnectionManager.sendCommandResult(commandId, success, resultMessage);
        pushTelemetry();
    }

    private int requiredAccountIndex(JSONObject parameters) {
        int index = parameters.optInt("accountIndex", -1);
        if (index < 0 || index >= MAX_ACCOUNTS) {
            throw new IllegalArgumentException("账号索引无效");
        }
        return index;
    }

    private void startPreview(int accountIndex, int requestedMaxWidth, double requestedFps) {
        getOrCreateSession(accountIndex);
        previewAccount = accountIndex;
        previewMaxWidth = Math.max(360, Math.min(requestedMaxWidth, PREVIEW_MAX_WIDTH));
        double fps = Math.max(0.1d, Math.min(requestedFps, 1d));
        previewIntervalMs = Math.max(PREVIEW_MIN_INTERVAL_MS, Math.round(1_000d / fps));
        previewEnabled = true;
        if (previewRunnable != null) {
            mainHandler.removeCallbacks(previewRunnable);
        }
        previewRunnable = new Runnable() {
            @Override
            public void run() {
                if (!previewEnabled || activityDestroyed) {
                    return;
                }
                capturePreviewFrame();
                mainHandler.postDelayed(this, previewIntervalMs);
            }
        };
        mainHandler.post(previewRunnable);
        pushTelemetry();
    }

    private void stopPreview() {
        previewEnabled = false;
        previewAccount = -1;
        if (previewRunnable != null) {
            mainHandler.removeCallbacks(previewRunnable);
            previewRunnable = null;
        }
        pushTelemetry();
    }

    private void capturePreviewFrame() {
        if (!previewEnabled || previewAccount < 0 || previewAccount >= MAX_ACCOUNTS) {
            return;
        }
        Session session = sessions[previewAccount];
        if (session == null || session.webView.getWidth() <= 0 || session.webView.getHeight() <= 0) {
            return;
        }
        WebView view = session.webView;
        int sourceWidth = view.getWidth();
        int sourceHeight = view.getHeight();
        int targetWidth = Math.min(previewMaxWidth, sourceWidth);
        int targetHeight = Math.max(1, Math.round(sourceHeight * targetWidth / (float) sourceWidth));
        Bitmap bitmap = null;
        try {
            bitmap = Bitmap.createBitmap(targetWidth, targetHeight, Bitmap.Config.RGB_565);
            Canvas canvas = new Canvas(bitmap);
            canvas.drawColor(Color.WHITE);
            canvas.scale(targetWidth / (float) sourceWidth, targetHeight / (float) sourceHeight);
            view.draw(canvas);

            int initialQuality = targetWidth > 1_280 ? 72 : targetWidth > 720 ? 64 : 55;
            byte[] encoded = compressPreview(bitmap, initialQuality);
            if (encoded.length > PREVIEW_MAX_ENCODED_BYTES) {
                encoded = compressPreview(bitmap, 42);
            }
            if (encoded.length > PREVIEW_MAX_ENCODED_BYTES) {
                return;
            }
            long sequence = ++previewSequence;
            JSONObject frame = new JSONObject();
            frame.put("accountIndex", previewAccount);
            frame.put("accountLabel", accountDisplayName(previewAccount));
            frame.put("sequence", sequence);
            frame.put("width", targetWidth);
            frame.put("height", targetHeight);
            frame.put("mime", "image/jpeg");
            frame.put("blackOverlay", blackMode);
            frame.put("imageBase64", Base64.encodeToString(encoded, Base64.NO_WRAP));
            remoteConnectionManager.sendPreviewFrame(frame);
        } catch (RuntimeException | JSONException ignored) {
            // A failed frame must not interrupt the local挂机 session.
        } finally {
            if (bitmap != null) {
                bitmap.recycle();
            }
        }
    }

    private byte[] compressPreview(Bitmap bitmap, int quality) {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        bitmap.compress(Bitmap.CompressFormat.JPEG, quality, output);
        return output.toByteArray();
    }

    private void handlePreviewTap(String commandId, JSONObject parameters) {
        try {
            int accountIndex = requiredAccountIndex(parameters);
            double normalizedX = parameters.optDouble("x", -1d);
            double normalizedY = parameters.optDouble("y", -1d);
            long frameSequence = parameters.optLong("frameSequence", -1L);
            validatePreviewTap(accountIndex, normalizedX, normalizedY, frameSequence);
            Session session = getOrCreateSession(accountIndex);
            WebView view = session.webView;
            String script = String.format(Locale.US,
                    "(function(){const e=document.elementFromPoint(%1$.8f*window.innerWidth,"
                            + "%2$.8f*window.innerHeight);const s=e&&e.closest?e.closest('select'):null;"
                            + "if(!s)return null;let t=s.dataset.pkRemoteToken;if(!t){t='pk_'"
                            + "+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,10);"
                            + "s.dataset.pkRemoteToken=t;}const o=Array.from(s.options).slice(0,200)"
                            + ".map((v,i)=>({index:i,label:(v.textContent||v.label||v.value||'')"
                            + ".replace(/\\s+/g,' ').trim().slice(0,120),selected:v.selected,"
                            + "disabled:v.disabled}));return JSON.stringify({elementToken:t,"
                            + "title:(s.getAttribute('aria-label')||s.name||'请选择').slice(0,80),"
                            + "selectedIndex:s.selectedIndex,options:o});})()",
                    normalizedX, normalizedY);
            view.evaluateJavascript(script, encodedResult -> {
                try {
                    JSONObject interaction = decodeSelectInteraction(encodedResult);
                    if (interaction != null) {
                        interaction.put("accountIndex", accountIndex);
                        interaction.put("accountLabel", accountDisplayName(accountIndex));
                        remoteConnectionManager.sendSelectInteraction(interaction);
                        remoteConnectionManager.sendCommandResult(
                                commandId, true, "选择项已发送到控制台");
                    } else {
                        dispatchTap(view, normalizedX, normalizedY);
                        remoteConnectionManager.sendCommandResult(
                                commandId, true, "远程点击已执行");
                    }
                } catch (RuntimeException | JSONException error) {
                    remoteConnectionManager.sendCommandResult(
                            commandId, false, "点击处理失败");
                }
                pushTelemetry();
            });
        } catch (RuntimeException error) {
            remoteConnectionManager.sendCommandResult(commandId, false,
                    error.getMessage() == null ? "点击处理失败" : error.getMessage());
        }
    }

    private void validatePreviewTap(int accountIndex, double normalizedX,
                                    double normalizedY, long frameSequence) {
        if (!previewEnabled || previewAccount != accountIndex) {
            throw new IllegalStateException("页面预览未开启或账号已变化");
        }
        if (normalizedX < 0d || normalizedX > 1d || normalizedY < 0d || normalizedY > 1d) {
            throw new IllegalArgumentException("点击坐标无效");
        }
        if (frameSequence < 0L || frameSequence > previewSequence
                || previewSequence - frameSequence > 5L) {
            throw new IllegalArgumentException("预览画面已过期，请等待刷新");
        }
    }

    private JSONObject decodeSelectInteraction(String encodedResult) throws JSONException {
        if (encodedResult == null || "null".equals(encodedResult)) {
            return null;
        }
        Object decoded = new JSONTokener(encodedResult).nextValue();
        if (!(decoded instanceof String) || ((String) decoded).isBlank()) {
            return null;
        }
        JSONObject interaction = new JSONObject((String) decoded);
        if (interaction.optJSONArray("options") == null
                || interaction.optString("elementToken").isBlank()) {
            return null;
        }
        return interaction;
    }

    private void dispatchTap(WebView view, double normalizedX, double normalizedY) {
        if (view.getWidth() <= 0 || view.getHeight() <= 0) {
            throw new IllegalStateException("网页尚未完成布局");
        }
        float x = (float) (normalizedX * view.getWidth());
        float y = (float) (normalizedY * view.getHeight());
        long downTime = SystemClock.uptimeMillis();
        MotionEvent down = MotionEvent.obtain(
                downTime, downTime, MotionEvent.ACTION_DOWN, x, y, 0);
        MotionEvent up = MotionEvent.obtain(
                downTime, downTime + 70L, MotionEvent.ACTION_UP, x, y, 0);
        try {
            view.requestFocus();
            view.dispatchTouchEvent(down);
            view.dispatchTouchEvent(up);
        } finally {
            down.recycle();
            up.recycle();
        }
    }

    private void handleSelectOption(String commandId, JSONObject parameters) {
        try {
            int accountIndex = requiredAccountIndex(parameters);
            String elementToken = parameters.optString("elementToken");
            int optionIndex = parameters.optInt("optionIndex", -1);
            if (!elementToken.matches("[A-Za-z0-9_-]{1,80}")
                    || optionIndex < 0 || optionIndex >= 200) {
                throw new IllegalArgumentException("选择参数无效");
            }
            Session session = getOrCreateSession(accountIndex);
            String script = "(function(){const t=" + JSONObject.quote(elementToken)
                    + ";const i=" + optionIndex
                    + ";const s=Array.from(document.querySelectorAll('select'))"
                    + ".find(v=>v.dataset.pkRemoteToken===t);"
                    + "if(!s||i<0||i>=s.options.length||s.options[i].disabled)return false;"
                    + "s.selectedIndex=i;s.dispatchEvent(new Event('input',{bubbles:true}));"
                    + "s.dispatchEvent(new Event('change',{bubbles:true}));return true;})()";
            session.webView.evaluateJavascript(script, result -> {
                boolean updated = "true".equals(result);
                remoteConnectionManager.sendCommandResult(commandId, updated,
                        updated ? "选择项已更新" : "选择项已失效，请重新点击");
                if (updated && previewEnabled) {
                    mainHandler.postDelayed(this::capturePreviewFrame, 250L);
                }
                pushTelemetry();
            });
        } catch (RuntimeException error) {
            remoteConnectionManager.sendCommandResult(commandId, false,
                    error.getMessage() == null ? "选择失败" : error.getMessage());
        }
    }

    private Session getOrCreateSession(int index) {
        if (index > 0 && !multiProfileSupported) {
            throw new IllegalStateException("系统 WebView 不支持账号隔离");
        }
        if (sessions[index] == null && !createSession(index)) {
            throw new IllegalStateException("账号容器创建失败");
        }
        return sessions[index];
    }

    private JSONObject buildTelemetry() {
        JSONObject telemetry = new JSONObject();
        try {
            JSONObject device = new JSONObject();
            device.put("manufacturer", Build.MANUFACTURER);
            device.put("model", Build.MODEL);
            device.put("androidVersion", Build.VERSION.RELEASE);
            device.put("sdkInt", Build.VERSION.SDK_INT);
            PackageInfo webViewPackage = WebView.getCurrentWebViewPackage();
            device.put("webViewVersion", webViewPackage == null
                    ? JSONObject.NULL : webViewPackage.versionName);
            telemetry.put("device", device);

            JSONObject app = new JSONObject();
            app.put("versionCode", 12);
            app.put("versionName", "1.5.0");
            app.put("activeAccount", activeAccount);
            app.put("blackScreen", blackMode);
            app.put("executionMode", blackMode
                    ? "foreground_black_overlay" : "foreground_visible");
            app.put("keepScreenOn", true);
            app.put("previewEnabled", previewEnabled);
            app.put("previewAccount", previewAccount);
            app.put("remoteState", remoteState.name().toLowerCase(Locale.ROOT));
            telemetry.put("app", app);

            telemetry.put("battery", latestBatterySnapshot == null
                    ? JSONObject.NULL : latestBatterySnapshot.toJson());

            JSONArray accounts = new JSONArray();
            for (int i = 0; i < MAX_ACCOUNTS; i++) {
                Session session = sessions[i];
                JSONObject account = new JSONObject();
                account.put("index", i);
                account.put("label", accountDisplayName(i));
                account.put("labelManual", preferences.getBoolean(
                        accountLabelManualKey(i), false));
                account.put("opened", preferences.getBoolean(accountOpenedKey(i), i == 0));
                account.put("loaded", session != null);
                account.put("active", i == activeAccount);
                account.put("desktopMode", session != null
                        ? session.desktopMode
                        : preferences.getBoolean(desktopModeKey(i), true));
                account.put("orientation", preferences.getBoolean(landscapeModeKey(i), true)
                        ? "landscape" : "portrait");
                if (session != null) {
                    account.put("loading", session.loading);
                    account.put("failed", session.failedForCurrentLoad);
                    account.put("retryAttempt", session.retryAttempt);
                    String url = session.webView.getUrl();
                    account.put("url", isAllowedUrl(url) ? url : JSONObject.NULL);
                }
                if (automationCoordinator != null) {
                    automationCoordinator.appendAccountTelemetry(account, i);
                }
                accounts.put(account);
            }
            telemetry.put("accounts", accounts);
        } catch (JSONException ignored) {
            // All telemetry values are controlled by the app.
        }
        return telemetry;
    }

    private void pushTelemetry() {
        if (remoteConnectionManager != null) {
            remoteConnectionManager.sendTelemetry();
        }
    }

    private void selectAccount(int accountIndex, boolean userInitiated) {
        if (accountIndex > 0 && !multiProfileSupported) {
            showToast("多账号需要更新 Android System WebView 后使用");
            return;
        }
        if (sessions[accountIndex] == null && !createSession(accountIndex)) {
            return;
        }

        activeAccount = accountIndex;
        preferences.edit().putInt(PREF_ACTIVE_ACCOUNT, accountIndex).apply();
        applyPreferredOrientation(accountIndex);
        Session session = sessions[accountIndex];
        session.webView.bringToFront();
        session.webView.requestFocus();
        updateToolbarState();
        updateProgress(session.progress);
        if (previewEnabled && previewAccount != accountIndex) {
            startPreview(accountIndex, previewMaxWidth, 1_000d / previewIntervalMs);
        }

        if (userInitiated) {
            showToast("已切换到账号" + (accountIndex + 1));
        }
        pushTelemetry();
    }

    private void restoreOpenedAccounts() {
        for (int i = 0; i < MAX_ACCOUNTS; i++) {
            if (i == activeAccount || (i > 0 && !multiProfileSupported)) {
                continue;
            }
            boolean wasOpened = preferences.getBoolean(accountOpenedKey(i), i == 0);
            if (wasOpened) {
                createSession(i);
            }
        }
    }

    @SuppressLint({"SetJavaScriptEnabled", "RequiresFeature"})
    private boolean createSession(int accountIndex) {
        WebView view;
        try {
            view = new WebView(this);
            if (accountIndex > 0) {
                if (!WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE)) {
                    view.destroy();
                    showToast("多账号需要更新 Android System WebView 后使用");
                    return false;
                }
                WebViewCompat.setProfile(view, profileName(accountIndex));
            }
        } catch (RuntimeException error) {
            showToast("账号" + (accountIndex + 1) + "创建失败，请更新系统网页组件");
            return false;
        }

        Session session = new Session(accountIndex, view);
        sessions[accountIndex] = session;
        webContainer.addView(view, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));

        view.setBackgroundColor(Color.WHITE);
        view.setKeepScreenOn(true);

        WebSettings settings = view.getSettings();
        session.defaultUserAgent = settings.getUserAgentString();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setSupportZoom(true);
        settings.setBuiltInZoomControls(true);
        settings.setDisplayZoomControls(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setTextZoom(100);
        applyUserAgent(session);

        try {
            if (accountIndex == 0) {
                session.cookieManager = CookieManager.getInstance();
            } else if (WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE)) {
                session.cookieManager = WebViewCompat.getProfile(view).getCookieManager();
            } else {
                throw new UnsupportedOperationException("WebView multi-profile unavailable");
            }
            session.cookieManager.setAcceptCookie(true);
            session.cookieManager.setAcceptThirdPartyCookies(view, true);
        } catch (RuntimeException error) {
            removeAndDestroySession(session);
            showToast("账号存储初始化失败，请更新系统网页组件");
            return false;
        }

        view.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView currentView, int newProgress) {
                session.progress = newProgress;
                if (session.index == activeAccount) {
                    updateProgress(newProgress);
                }
            }
        });

        view.setWebViewClient(new SessionWebViewClient(session));
        String savedUrl = preferences.getString(lastUrlKey(accountIndex), START_URL);
        view.loadUrl(isAllowedUrl(savedUrl) ? savedUrl : START_URL);
        preferences.edit().putBoolean(accountOpenedKey(accountIndex), true).apply();
        return true;
    }

    private final class SessionWebViewClient extends WebViewClient {
        private final Session session;

        SessionWebViewClient(Session session) {
            this.session = session;
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return shouldBlockNavigation(request.getUrl());
        }

        @Override
        @SuppressWarnings("deprecation")
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            return shouldBlockNavigation(Uri.parse(url));
        }

        @Override
        public void onPageStarted(WebView view, String url, Bitmap favicon) {
            session.loading = true;
            session.failedForCurrentLoad = false;
            session.loadToken++;
            cancelRetry(session);
            scheduleLoadWatchdog(session, session.loadToken);
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            session.loading = false;
            if (!session.failedForCurrentLoad) {
                session.retryAttempt = 0;
                saveLastUrl(session);
            }
            if (session.cookieManager != null) {
                session.cookieManager.flush();
            }
            scheduleAccountNameDetection(session);
            pushTelemetry();
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request,
                                    WebResourceError error) {
            if (request.isForMainFrame()) {
                session.loading = false;
                session.failedForCurrentLoad = true;
                scheduleRetry(session, "页面连接失败");
                pushTelemetry();
            }
        }

        @Override
        public void onReceivedHttpError(WebView view, WebResourceRequest request,
                                        WebResourceResponse errorResponse) {
            if (request.isForMainFrame() && errorResponse.getStatusCode() >= 500) {
                session.loading = false;
                session.failedForCurrentLoad = true;
                scheduleRetry(session, "服务器异常 " + errorResponse.getStatusCode());
                pushTelemetry();
            }
        }

        @Override
        public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
            recoverSession(session, detail.didCrash()
                    ? "网页进程崩溃，正在恢复"
                    : "网页进程已被系统回收，正在恢复");
            return true;
        }
    }

    private void scheduleLoadWatchdog(Session session, int token) {
        mainHandler.postDelayed(() -> {
            if (activityDestroyed || sessions[session.index] != session) {
                return;
            }
            if (session.loading && session.loadToken == token) {
                session.loading = false;
                session.failedForCurrentLoad = true;
                session.webView.stopLoading();
                scheduleRetry(session, "页面加载超时");
            }
        }, PAGE_LOAD_TIMEOUT_MS);
    }

    private void scheduleRetry(Session session, String reason) {
        if (activityDestroyed || sessions[session.index] != session) {
            return;
        }
        cancelRetry(session);
        int delayIndex = Math.min(session.retryAttempt, RETRY_DELAYS_MS.length - 1);
        long delay = RETRY_DELAYS_MS[delayIndex];
        session.retryAttempt++;
        session.retryRunnable = () -> {
            session.retryRunnable = null;
            if (!activityDestroyed && sessions[session.index] == session) {
                reloadSession(session);
            }
        };
        mainHandler.postDelayed(session.retryRunnable, delay);
        if (session.index == activeAccount) {
            showToast(reason + "，" + (delay / 1000) + "秒后自动重载");
        }
    }

    private void cancelRetry(Session session) {
        if (session.retryRunnable != null) {
            mainHandler.removeCallbacks(session.retryRunnable);
            session.retryRunnable = null;
        }
    }

    private void reloadSession(Session session) {
        String currentUrl = session.webView.getUrl();
        if (isAllowedUrl(currentUrl)) {
            session.webView.reload();
        } else {
            session.webView.loadUrl(START_URL);
        }
    }

    private void recoverSession(Session session, String message) {
        if (activityDestroyed || sessions[session.index] != session) {
            return;
        }
        cancelRetry(session);
        int accountIndex = session.index;
        removeAndDestroySession(session);
        showToast("账号" + (accountIndex + 1) + "：" + message);
        pushTelemetry();
        mainHandler.postDelayed(() -> {
            if (!activityDestroyed && sessions[accountIndex] == null) {
                if (createSession(accountIndex) && accountIndex == activeAccount) {
                    sessions[accountIndex].webView.bringToFront();
                    updateToolbarState();
                }
            }
        }, 700L);
    }

    private void removeAndDestroySession(Session session) {
        if (sessions[session.index] == session) {
            sessions[session.index] = null;
        }
        webContainer.removeView(session.webView);
        session.webView.destroy();
    }

    private void loadHome() {
        Session session = activeSession();
        if (session != null) {
            session.retryAttempt = 0;
            cancelRetry(session);
            session.webView.loadUrl(START_URL);
        }
    }

    private void manualReload() {
        Session session = activeSession();
        if (session != null) {
            session.retryAttempt = 0;
            cancelRetry(session);
            reloadSession(session);
        }
    }

    private void toggleDesktopMode() {
        Session session = activeSession();
        if (session == null) {
            return;
        }
        session.desktopMode = !session.desktopMode;
        preferences.edit()
                .putBoolean(desktopModeKey(session.index), session.desktopMode)
                .apply();
        applyUserAgent(session);
        updateToolbarState();
        session.webView.reload();
        showToast(session.desktopMode ? "已切换为桌面模式" : "已切换为手机模式");
        pushTelemetry();
    }

    private void toggleOrientation() {
        boolean landscape = preferences.getBoolean(landscapeModeKey(activeAccount), true);
        boolean nextLandscape = !landscape;
        preferences.edit()
                .putBoolean(landscapeModeKey(activeAccount), nextLandscape)
                .apply();
        updateToolbarState();
        applyPreferredOrientation(activeAccount);
        showToast(nextLandscape ? "账号已切换为横屏" : "账号已切换为竖屏");
        pushTelemetry();
    }

    private void applyPreferredOrientation(int accountIndex) {
        boolean landscape = preferences.getBoolean(landscapeModeKey(accountIndex), true);
        int requestedOrientation = landscape
                ? ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
                : ActivityInfo.SCREEN_ORIENTATION_SENSOR_PORTRAIT;
        if (getRequestedOrientation() != requestedOrientation) {
            setRequestedOrientation(requestedOrientation);
        }
    }

    private void applyUserAgent(Session session) {
        session.webView.getSettings().setUserAgentString(
                session.desktopMode ? DESKTOP_USER_AGENT : session.defaultUserAgent);
    }

    private void updateToolbarState() {
        for (int i = 0; i < MAX_ACCOUNTS; i++) {
            boolean active = i == activeAccount;
            accountButtons[i].setText(compactAccountDisplayName(i));
            accountButtons[i].setBackground(buttonBackground(active));
            accountButtons[i].setTextColor(active ? Color.rgb(10, 30, 16) : Color.WHITE);
            accountButtons[i].setAlpha(i == 0 || multiProfileSupported ? 1f : 0.45f);
        }
        Session session = activeSession();
        desktopButton.setText(session != null && session.desktopMode ? "桌面" : "手机");
        boolean landscape = preferences.getBoolean(landscapeModeKey(activeAccount), true);
        orientationButton.setText(landscape ? "横屏" : "竖屏");
    }

    private void updateProgress(int progress) {
        progressBar.setProgress(progress);
        progressBar.setVisibility(progress > 0 && progress < 100 ? View.VISIBLE : View.INVISIBLE);
    }

    private boolean shouldBlockNavigation(Uri uri) {
        if (uri == null) {
            return true;
        }
        String scheme = uri.getScheme();
        String host = uri.getHost();
        if ("about".equalsIgnoreCase(scheme)) {
            return false;
        }
        if (("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme))
                && host != null
                && (host.equalsIgnoreCase("sgplay.cc")
                || host.toLowerCase(Locale.ROOT).endsWith(".sgplay.cc"))) {
            return false;
        }
        showToast("已阻止跳转到外部网站");
        return true;
    }

    private boolean isAllowedUrl(String url) {
        if (url == null || url.isBlank()) {
            return false;
        }
        Uri uri = Uri.parse(url);
        String scheme = uri.getScheme();
        String host = uri.getHost();
        return ("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme))
                && host != null
                && (host.equalsIgnoreCase("sgplay.cc")
                || host.toLowerCase(Locale.ROOT).endsWith(".sgplay.cc"));
    }

    private void registerNetworkRecovery() {
        connectivityManager = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        networkCallback = new ConnectivityManager.NetworkCallback() {
            @Override
            public void onAvailable(Network network) {
                mainHandler.postDelayed(() -> {
                    if (activityDestroyed) {
                        return;
                    }
                    for (Session session : sessions) {
                        if (session != null && session.failedForCurrentLoad) {
                            cancelRetry(session);
                            reloadSession(session);
                        }
                    }
                }, 1_500L);
            }
        };
        connectivityManager.registerDefaultNetworkCallback(networkCallback);
    }

    private void enterBlackMode() {
        if (blackMode) {
            return;
        }
        showToast("前台常亮黑屏已开启；连点屏幕5次或按音量键恢复");
        blackMode = true;
        WindowManager.LayoutParams attributes = getWindow().getAttributes();
        brightnessBeforeBlack = attributes.screenBrightness;
        attributes.screenBrightness = 0f;
        getWindow().setAttributes(attributes);
        blackOverlay.setVisibility(View.VISIBLE);
        blackOverlay.bringToFront();
        blackOverlay.requestFocus();
        hideSystemBars();
        pushTelemetry();
    }

    private void exitBlackMode() {
        if (!blackMode) {
            return;
        }
        blackMode = false;
        blackOverlay.setVisibility(View.GONE);
        WindowManager.LayoutParams attributes = getWindow().getAttributes();
        attributes.screenBrightness = brightnessBeforeBlack;
        getWindow().setAttributes(attributes);
        showSystemBars();
        root.requestApplyInsets();
        showToast("已退出黑屏保护");
        pushTelemetry();
    }

    private void hideSystemBars() {
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) {
                controller.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                controller.setSystemBarsBehavior(
                        WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                            | View.SYSTEM_UI_FLAG_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        }
    }

    private void showSystemBars() {
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) {
                controller.show(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        }
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (blackMode && event.getAction() == KeyEvent.ACTION_DOWN
                && (event.getKeyCode() == KeyEvent.KEYCODE_VOLUME_UP
                || event.getKeyCode() == KeyEvent.KEYCODE_VOLUME_DOWN)) {
            exitBlackMode();
            return true;
        }
        return super.dispatchKeyEvent(event);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus && blackMode) {
            hideSystemBars();
        }
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        rebuildToolbar();
        root.requestApplyInsets();
        if (blackMode) {
            hideSystemBars();
        }
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (blackMode) {
            exitBlackMode();
            return;
        }
        Session session = activeSession();
        if (session != null && session.webView.canGoBack()) {
            session.webView.goBack();
            return;
        }
        long now = System.currentTimeMillis();
        if (now - lastBackPressedAt < 2_000L) {
            super.onBackPressed();
        } else {
            lastBackPressedAt = now;
            showToast("再按一次返回键退出挂机");
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        outState.putInt(PREF_ACTIVE_ACCOUNT, activeAccount);
        for (Session session : sessions) {
            if (session != null) {
                saveLastUrl(session);
            }
        }
        super.onSaveInstanceState(outState);
    }

    @Override
    protected void onPause() {
        for (Session session : sessions) {
            if (session != null) {
                saveLastUrl(session);
                if (session.cookieManager != null) {
                    session.cookieManager.flush();
                }
            }
        }
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        activityDestroyed = true;
        stopPreview();
        if (batteryMonitor != null) {
            batteryMonitor.stop();
        }
        if (automationCoordinator != null) {
            automationCoordinator.stop();
        }
        if (remoteConnectionManager != null) {
            remoteConnectionManager.destroy();
        }
        if (connectivityManager != null && networkCallback != null) {
            try {
                connectivityManager.unregisterNetworkCallback(networkCallback);
            } catch (RuntimeException ignored) {
                // Callback may already be unregistered during process shutdown.
            }
        }
        for (int i = 0; i < sessions.length; i++) {
            Session session = sessions[i];
            if (session != null) {
                cancelRetry(session);
                webContainer.removeView(session.webView);
                session.webView.destroy();
                sessions[i] = null;
            }
        }
        mainHandler.removeCallbacksAndMessages(null);
        super.onDestroy();
    }

    private Session activeSession() {
        return sessions[activeAccount];
    }

    private void saveLastUrl(Session session) {
        String url = session.webView.getUrl();
        if (isAllowedUrl(url)) {
            preferences.edit().putString(lastUrlKey(session.index), url).apply();
        }
    }

    private String profileName(int accountIndex) {
        return "sgplay_account_" + (accountIndex + 1);
    }

    private String desktopModeKey(int accountIndex) {
        return PREF_DESKTOP_PREFIX + accountIndex;
    }

    private String lastUrlKey(int accountIndex) {
        return PREF_LAST_URL_PREFIX + accountIndex;
    }

    private String accountOpenedKey(int accountIndex) {
        return PREF_ACCOUNT_OPENED_PREFIX + accountIndex;
    }

    private String landscapeModeKey(int accountIndex) {
        return PREF_LANDSCAPE_PREFIX + accountIndex;
    }

    private String accountLabelKey(int accountIndex) {
        return PREF_ACCOUNT_LABEL_PREFIX + accountIndex;
    }

    private String accountLabelManualKey(int accountIndex) {
        return PREF_ACCOUNT_LABEL_MANUAL_PREFIX + accountIndex;
    }

    private String accountDisplayName(int accountIndex) {
        String fallback = "账号" + (accountIndex + 1);
        String saved = preferences.getString(accountLabelKey(accountIndex), fallback);
        String sanitized = sanitizeAccountLabel(saved);
        return sanitized.isBlank() ? fallback : sanitized;
    }

    private String compactAccountDisplayName(int accountIndex) {
        String label = accountDisplayName(accountIndex);
        return label.length() > 8 ? label.substring(0, 7) + "…" : label;
    }

    private String sanitizeAccountLabel(String value) {
        if (value == null) {
            return "";
        }
        String sanitized = value.replaceAll("[\\r\\n\\t]", " ")
                .replaceAll("\\s{2,}", " ")
                .trim();
        if (sanitized.length() > 24) {
            sanitized = sanitized.substring(0, 24);
        }
        return sanitized;
    }

    private void detectAccountName(Session session) {
        if (preferences.getBoolean(accountLabelManualKey(session.index), false)) {
            return;
        }
        session.webView.evaluateJavascript(USERNAME_DETECTION_SCRIPT, encodedResult -> {
            if (activityDestroyed || sessions[session.index] != session
                    || encodedResult == null || "null".equals(encodedResult)) {
                return;
            }
            try {
                Object decoded = new JSONTokener(encodedResult).nextValue();
                if (!(decoded instanceof String)) {
                    return;
                }
                String label = sanitizeAccountLabel((String) decoded);
                if (label.isBlank()) {
                    return;
                }
                String current = preferences.getString(accountLabelKey(session.index), "");
                if (!label.equals(current)) {
                    preferences.edit().putString(accountLabelKey(session.index), label).apply();
                    updateToolbarState();
                    pushTelemetry();
                }
            } catch (JSONException ignored) {
                // Page scripts can return null or non-string values; keep the fallback label.
            }
        });
    }

    private void scheduleAccountNameDetection(Session session) {
        detectAccountName(session);
        long[] delays = {2_000L, 8_000L};
        for (long delay : delays) {
            mainHandler.postDelayed(() -> {
                if (!activityDestroyed && sessions[session.index] == session) {
                    detectAccountName(session);
                }
            }, delay);
        }
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private void showToast(String message) {
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show();
    }

    private final class FiveTapExitListener implements View.OnTouchListener {
        private int tapCount;
        private long firstTapAt;

        @Override
        public boolean onTouch(View view, MotionEvent event) {
            if (event.getAction() != MotionEvent.ACTION_DOWN) {
                return true;
            }
            long now = System.currentTimeMillis();
            if (tapCount == 0 || now - firstTapAt > 3_000L) {
                tapCount = 1;
                firstTapAt = now;
            } else {
                tapCount++;
            }
            if (tapCount >= 5) {
                tapCount = 0;
                view.performClick();
                exitBlackMode();
            }
            return true;
        }
    }

    private final class BlackOverlayView extends FrameLayout {
        BlackOverlayView(Context context) {
            super(context);
        }

        @Override
        public boolean performClick() {
            super.performClick();
            return true;
        }
    }

    private final class Session {
        final int index;
        final WebView webView;
        boolean desktopMode;
        String defaultUserAgent;
        CookieManager cookieManager;
        boolean loading;
        boolean failedForCurrentLoad;
        int retryAttempt;
        int loadToken;
        int progress;
        Runnable retryRunnable;

        Session(int index, WebView webView) {
            this.index = index;
            this.webView = webView;
            this.desktopMode = preferences.getBoolean(desktopModeKey(index), true);
        }
    }
}
