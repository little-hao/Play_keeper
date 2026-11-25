package com.local.sgplaykeeper;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.ActivityManager;
import android.app.AlertDialog;
import android.content.Context;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
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
import android.webkit.JsResult;
import android.webkit.PermissionRequest;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.ArrayAdapter;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;

import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import org.json.JSONTokener;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

public final class MainActivity extends Activity {
    private static final String START_URL = "http://sgplay.cc/home.html#/";
    private static final String AFK_URL = "http://sgplay.cc/AFK.html#/hang";
    private static final String PREFS = "sgplay_keeper";
    private static final String PREF_ACTIVE_ACCOUNT = "active_account";
    private static final String PREF_DESKTOP_PREFIX = "desktop_mode_";
    private static final String PREF_LAST_URL_PREFIX = "last_url_";
    private static final String PREF_START_URL_PREFIX = "start_url_";
    private static final String PREF_TOOLBAR_COLLAPSED = "toolbar_collapsed";
    private static final String PREF_ALLOW_HTTP_PREFIX = "allow_insecure_http_";
    private static final String PREF_ACCOUNT_OPENED_PREFIX = "account_opened_";
    private static final String PREF_LANDSCAPE_PREFIX = "landscape_mode_";
    private static final String PREF_ACCOUNT_LABEL_PREFIX = "account_label_";
    private static final String PREF_ACCOUNT_LABEL_MANUAL_PREFIX = "account_label_manual_";
    private static final String PREF_FAILURE_AT_PREFIX = "automation_failure_at_";
    private static final String PREF_FAILURE_TASK_PREFIX = "automation_failure_task_";
    private static final String PREF_FAILURE_MESSAGE_PREFIX = "automation_failure_message_";
    private static final String PREF_FAILURE_SCREENSHOT_PREFIX = "automation_failure_screenshot_";
    private static final String PREF_CONFIGURED_ACCOUNTS = "configured_accounts";
    private static final String PREF_HIGH_PERFORMANCE = "high_performance_accounts";
    private static final String PREF_ENVIRONMENT_PRESET = "environment_preset";
    private static final String PREF_IMPORTED_AUTOMATION = "imported_automation_manifests";
    private static final int REQUEST_IMPORT_AUTOMATION = 701;
    private static final int REQUEST_EXPORT_AUTOMATION = 702;
    private static final int MAX_MANIFEST_BYTES = 64 * 1024;
    private static final int LEGACY_ACCOUNT_COUNT = 4;
    private static final int MAX_ACCOUNTS = 8;
    private static final long PAGE_LOAD_TIMEOUT_MS = 60_000L;
    private static final long[] RETRY_DELAYS_MS = {3_000L, 10_000L, 30_000L, 60_000L};
    private static final String DESKTOP_USER_AGENT =
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                    + "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 "
                    + "PlayKeeper/1.2";
    private static final int PREVIEW_DEFAULT_WIDTH = 720;
    private static final int PREVIEW_MAX_WIDTH = 2_560;
    private static final int PREVIEW_MAX_ENCODED_BYTES = 2_500 * 1024;
    private static final long PREVIEW_MIN_INTERVAL_MS = 333L;
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
    private final long[] dailyTaskConfirmationUntil = new long[MAX_ACCOUNTS];
    private final int[] renderProcessGoneCounts = new int[MAX_ACCOUNTS];
    private final long[] lastRenderProcessGoneAt = new long[MAX_ACCOUNTS];

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
    private Button accountsButton;
    private Button urlButton;
    private Button collapseToolbarButton;
    private Button expandToolbarButton;
    private ConnectivityManager connectivityManager;
    private ConnectivityManager.NetworkCallback networkCallback;
    private SharedPreferences preferences;
    private BatteryMonitor batteryMonitor;
    private BatteryMonitor.Snapshot latestBatterySnapshot;
    private RemoteConfigStore remoteConfigStore;
    private RemoteConnectionManager remoteConnectionManager;
    private AutomationCoordinator automationCoordinator;
    private ReadOnlyWorkflowRunner activeReadOnlyWorkflow;
    private Session activeReadOnlyWorkflowSession;
    private AlertDialog readOnlyWorkflowDialog;
    private RemoteConnectionManager.State remoteState = RemoteConnectionManager.State.DISABLED;
    private String remoteStateMessage = "远程连接未启用";

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
    private int automationImportAccount = -1;
    private AutomationManifest automationExportManifest;

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
        activeAccount = Math.min(activeAccount, configuredAccountCount() - 1);
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
            accountButtons[i] = makeButton("实例" + (i + 1),
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
        automationButton = makeButton("自动化", view -> showAutomationHub(activeAccount));
        accountsButton = makeButton("实例", view -> showAccountManagement());
        urlButton = makeButton("网址", view -> showAccountNameDialog(activeAccount));
        collapseToolbarButton = makeButton("收起", view -> setToolbarCollapsed(true));
        expandToolbarButton = makeButton("展开工具", view -> setToolbarCollapsed(false));
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

        FrameLayout.LayoutParams expandParams = new FrameLayout.LayoutParams(
                dp(88), dp(36), Gravity.TOP | Gravity.END);
        expandParams.setMargins(0, dp(4), dp(4), 0);
        root.addView(expandToolbarButton, expandParams);
        applyToolbarVisibility();

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
            FrameLayout.LayoutParams expandLayout =
                    (FrameLayout.LayoutParams) expandToolbarButton.getLayoutParams();
            expandLayout.topMargin = top + dp(4);
            expandLayout.rightMargin = right + dp(4);
            expandToolbarButton.setLayoutParams(expandLayout);
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
        detachFromParent(accountsButton);
        detachFromParent(urlButton);
        detachFromParent(collapseToolbarButton);
        toolbarHost.removeAllViews();

        HorizontalScrollView accountScroller = new HorizontalScrollView(this);
        accountScroller.setHorizontalScrollBarEnabled(false);
        LinearLayout accountRow = makeToolbarRow();
        int configured = configuredAccountCount();
        for (int i = 0; i < configured; i++) {
            accountRow.addView(accountButtons[i], new LinearLayout.LayoutParams(dp(92), dp(38)));
        }
        accountScroller.addView(accountRow, new HorizontalScrollView.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, dp(38)));
        LinearLayout actionRow = makeToolbarRow();
        actionRow.addView(blackButton, weightedButtonParams(1f));
        actionRow.addView(homeButton, weightedButtonParams(1f));
        actionRow.addView(refreshButton, weightedButtonParams(1f));
        actionRow.addView(orientationButton, weightedButtonParams(1f));
        actionRow.addView(batteryButton, weightedButtonParams(1.15f));
        actionRow.addView(remoteButton, weightedButtonParams(1f));
        actionRow.addView(automationButton, weightedButtonParams(1f));
        actionRow.addView(urlButton, weightedButtonParams(1f));
        actionRow.addView(accountsButton, weightedButtonParams(1f));
        actionRow.addView(collapseToolbarButton, weightedButtonParams(1f));
        toolbarHost.addView(accountScroller, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(38)));
        toolbarHost.addView(actionRow, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(38)));
        toolbarHost.getLayoutParams().height = dp(76);
        toolbarHost.requestLayout();
        applyToolbarVisibility();
    }

    private void setToolbarCollapsed(boolean collapsed) {
        preferences.edit().putBoolean(PREF_TOOLBAR_COLLAPSED, collapsed).apply();
        applyToolbarVisibility();
    }

    private void applyToolbarVisibility() {
        if (toolbarHost == null || expandToolbarButton == null || preferences == null) return;
        boolean collapsed = preferences.getBoolean(PREF_TOOLBAR_COLLAPSED, false);
        toolbarHost.setVisibility(collapsed ? View.GONE : View.VISIBLE);
        expandToolbarButton.setVisibility(collapsed ? View.VISIBLE : View.GONE);
        expandToolbarButton.bringToFront();
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
                        // Automation may work in a background WebView.  Never replace the
                        // account that the user explicitly chose to watch.
                        getOrCreateSession(accountIndex);
                    }

                    @Override
                    public void prepareAutomation(int accountIndex, boolean landscape) {
                        Session session = getOrCreateSession(accountIndex);
                        boolean modeChanged = session.desktopMode != landscape;
                        session.desktopMode = landscape;
                        preferences.edit()
                                .putBoolean(landscapeModeKey(accountIndex), landscape)
                                .putBoolean(desktopModeKey(accountIndex), landscape)
                                .apply();
                        applyUserAgent(session);
                        if (accountIndex == activeAccount) {
                            applyPreferredOrientation(accountIndex);
                            updateToolbarState();
                        }
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
                    public void expectDailyTaskConfirmation(int accountIndex) {
                        dailyTaskConfirmationUntil[accountIndex] =
                                System.currentTimeMillis() + 10_000L;
                    }

                    @Override
                    public void captureAutomationFailure(int accountIndex, String task,
                                                         String message) {
                        captureAutomationFailureSnapshot(accountIndex, task, message);
                    }

                    @Override
                    public void clearAutomationFailure(int accountIndex, String task) {
                        clearAutomationFailureSnapshot(accountIndex, task);
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
        remoteConnectionManager = new RemoteConnectionManager(this,
                new RemoteConnectionManager.Listener() {
                    @Override
                    public void onRemoteStateChanged(RemoteConnectionManager.State state,
                                                     String message) {
                        remoteState = state;
                        remoteStateMessage = message == null || message.isBlank()
                                ? remoteStateLabel(state) : message;
                        if (state != RemoteConnectionManager.State.CONNECTED) {
                            stopPreview();
                        }
                        updateRemoteButton();
                    }

                    @Override
                    public void onRemoteCommand(String commandId, String stepId, String command,
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
                .setMessage(message + "\n30秒内未选择将自动进入设定的挂机副本。")
                .setNegativeButton("保持当前页", (ignored, which) ->
                        automationCoordinator.resolveTempleConfirmation(accountIndex, false))
                .setPositiveButton("进入设定挂机副本", (ignored, which) ->
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

    private String remoteStateLabel(RemoteConnectionManager.State state) {
        switch (state) {
            case CONNECTED:
                return "远程连接已上线";
            case CONNECTING:
                return "正在连接远程服务器";
            case ERROR:
                return "远程连接异常";
            default:
                return "远程连接未启用";
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

    private void showAutomationHub(int accountIndex) {
        ScrollView scroll = new ScrollView(this);
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(20), dp(8), dp(20), dp(12));
        scroll.addView(content, new ScrollView.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        TextView intro = formLabel("当前实例：" + accountDisplayName(accountIndex)
                + "\n脚本只在声明的网页来源和能力范围内运行。启用自定义脚本前会显示权限变化。");
        intro.setTextColor(Color.rgb(70, 74, 82));
        content.addView(intro);

        List<AutomationPackageDescriptor> displayedPackages = new ArrayList<>(
                AutomationPackageRegistry.packages());
        displayedPackages.addAll(importedAutomationPackages(accountIndex));
        for (AutomationPackageDescriptor descriptor : displayedPackages) {
            LinearLayout card = new LinearLayout(this);
            card.setOrientation(LinearLayout.VERTICAL);
            card.setPadding(dp(12), dp(8), dp(12), dp(10));
            card.setBackground(coloredButtonBackground(Color.rgb(238, 240, 244)));

            TextView title = formLabel(descriptor.name + "  v" + descriptor.version
                    + (descriptor.enabled ? "  · 已启用" : "  · 未启用"));
            title.setTextColor(descriptor.enabled
                    ? Color.rgb(31, 117, 63) : Color.rgb(91, 96, 105));
            card.addView(title);

            TextView details = formLabel("来源：" + descriptor.origin
                    + "\n能力：" + descriptor.capabilitySummary());
            details.setTextColor(Color.rgb(70, 74, 82));
            details.setTextSize(12);
            card.addView(details);

            Button action = makeButton(descriptor.configurable ? "配置现有自动化" : "查看脚本说明",
                    view -> {
                        if (descriptor.configurable) {
                            showAutomationSettings(accountIndex);
                        } else {
                            showAutomationPackageDetails(accountIndex, descriptor);
                        }
                    });
            card.addView(action, automationActionParams());

            LinearLayout.LayoutParams cardParams = new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            cardParams.setMargins(0, dp(8), 0, 0);
            content.addView(card, cardParams);
        }

        Button importButton = makeButton("导入自动化包 / JSON 清单",
                view -> launchAutomationManifestPicker(accountIndex));
        content.addView(importButton, automationActionParams());

        new AlertDialog.Builder(this)
                .setTitle("自动化中心")
                .setView(scroll)
                .setNegativeButton("关闭", null)
                .show();
    }

    private void showAutomationPackageDetails(int accountIndex,
                                              AutomationPackageDescriptor descriptor) {
        AlertDialog.Builder builder = new AlertDialog.Builder(this)
                .setTitle(descriptor.name)
                .setMessage("脚本 ID：" + descriptor.id
                        + "\n版本：" + descriptor.version
                        + "\n适用来源：" + descriptor.origin
                        + "\n所需能力：" + descriptor.capabilitySummary()
                        + (descriptor.removable
                        ? "\n\n带有 workflow 的导入清单可在逐次授权后运行固定只读动作；"
                        + "不接受任意 JavaScript。"
                        : "\n\n内置自动化沿用其独立配置与权限边界。"))
                .setPositiveButton(descriptor.removable ? "导出 .pkauto" : "确定",
                        descriptor.removable ? (dialog, which) -> {
                            AutomationManifest manifest = findImportedAutomation(descriptor.id);
                            if (manifest != null) launchAutomationPackageExporter(manifest);
                        } : null);
        AutomationManifest imported = descriptor.removable
                ? findImportedAutomation(descriptor.id) : null;
        if (imported != null && imported.workflow != null) {
            builder.setNeutralButton("运行只读流程", (dialog, which) ->
                    confirmReadOnlyWorkflow(accountIndex, imported));
        }
        if (descriptor.removable) {
            builder.setNegativeButton("删除清单", (dialog, which) ->
                    confirmDeleteImportedAutomation(descriptor));
        }
        builder.show();
    }

    private void confirmReadOnlyWorkflow(int accountIndex, AutomationManifest manifest) {
        Session session = sessions[accountIndex];
        String currentUrl = session == null ? "" : session.webView.getUrl();
        if (session == null || currentUrl == null || !manifest.supportsUrl(currentUrl)) {
            showToast("请先在该实例打开脚本授权来源内的页面");
            return;
        }
        new AlertDialog.Builder(this)
                .setTitle("授权本次只读运行")
                .setMessage("脚本：" + manifest.name
                        + "\n当前页面：" + currentUrl
                        + "\n步骤数：" + manifest.workflow.steps.size()
                        + "\n\n本次只读取标题和指定元素文本，不点击、不输入、不读取 Cookie。"
                        + "页面跳转时会立即停止。")
                .setNegativeButton("取消", null)
                .setPositiveButton("运行一次", (dialog, which) ->
                        runReadOnlyWorkflow(session, manifest))
                .show();
    }

    private void runReadOnlyWorkflow(Session session, AutomationManifest manifest) {
        if (activeReadOnlyWorkflow != null) {
            showToast("已有只读流程正在运行");
            return;
        }
        final ReadOnlyWorkflowRunner[] holder = new ReadOnlyWorkflowRunner[1];
        ReadOnlyWorkflowRunner runner = new ReadOnlyWorkflowRunner(manifest,
                new ReadOnlyWorkflowRunner.Bridge() {
            @Override public String currentUrl() {
                String url = session.webView.getUrl();
                return url == null ? "" : url;
            }

            @Override public void evaluateJavascript(String script,
                                                     ReadOnlyWorkflowRunner.EvaluationCallback callback) {
                session.webView.evaluateJavascript(script, callback::onResult);
            }

            @Override public void postDelayed(Runnable action, long delayMs) {
                mainHandler.postDelayed(action, delayMs);
            }

            @Override public void removeCallbacks(Runnable action) {
                mainHandler.removeCallbacks(action);
            }
        }, result -> {
            if (activeReadOnlyWorkflow != holder[0]) return;
            activeReadOnlyWorkflow = null;
            activeReadOnlyWorkflowSession = null;
            if (readOnlyWorkflowDialog != null) {
                readOnlyWorkflowDialog.dismiss();
                readOnlyWorkflowDialog = null;
            }
            if (!activityDestroyed) showReadOnlyWorkflowResult(manifest, result);
        });
        holder[0] = runner;
        activeReadOnlyWorkflow = runner;
        activeReadOnlyWorkflowSession = session;
        runner.start();
        if (activeReadOnlyWorkflow == runner) {
            readOnlyWorkflowDialog = new AlertDialog.Builder(this)
                    .setTitle(manifest.name + " · 正在运行")
                    .setMessage("只读流程最长运行 2 分钟。可随时取消，不会继续处理迟到的网页回调。")
                    .setNegativeButton("取消运行", (dialog, which) ->
                            cancelReadOnlyWorkflow("用户已取消只读流程"))
                    .create();
            readOnlyWorkflowDialog.setCanceledOnTouchOutside(false);
            readOnlyWorkflowDialog.show();
        }
    }

    private void cancelReadOnlyWorkflow(String reason) {
        ReadOnlyWorkflowRunner runner = activeReadOnlyWorkflow;
        if (runner != null) runner.cancel(reason);
    }

    private void showReadOnlyWorkflowResult(AutomationManifest manifest,
                                            ReadOnlyWorkflowRunner.Result result) {
        StringBuilder details = new StringBuilder(result.message);
        for (ReadOnlyWorkflowRunner.StepResult step : result.steps) {
            details.append("\n\n")
                    .append(step.passed ? "✓ " : "✗ ")
                    .append(step.id).append(" · ").append(step.action);
            if (!step.detail.isEmpty()) details.append("\n").append(step.detail);
        }
        new AlertDialog.Builder(this)
                .setTitle(manifest.name + (result.passed ? " · 已完成" : " · 已停止"))
                .setMessage(details.toString())
                .setPositiveButton("关闭", null)
                .show();
    }

    private void launchAutomationManifestPicker(int accountIndex) {
        automationImportAccount = accountIndex;
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{
                "application/json", "text/json", "application/zip", "application/octet-stream"});
        startActivityForResult(intent, REQUEST_IMPORT_AUTOMATION);
    }

    private void launchAutomationPackageExporter(AutomationManifest manifest) {
        automationExportManifest = manifest;
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/zip");
        intent.putExtra(Intent.EXTRA_TITLE, manifest.id + "-" + manifest.version + ".pkauto");
        startActivityForResult(intent, REQUEST_EXPORT_AUTOMATION);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQUEST_EXPORT_AUTOMATION) {
            AutomationManifest manifest = automationExportManifest;
            automationExportManifest = null;
            if (resultCode != RESULT_OK || data == null || data.getData() == null
                    || manifest == null) return;
            try (OutputStream output = getContentResolver().openOutputStream(data.getData())) {
                if (output == null) throw new IOException("无法创建导出文件");
                output.write(AutomationPackageFile.create(manifest));
                showToast("自动化包已导出");
            } catch (IOException | RuntimeException error) {
                showAutomationImportError(error);
            }
            return;
        }
        if (requestCode != REQUEST_IMPORT_AUTOMATION || resultCode != RESULT_OK
                || data == null || data.getData() == null) return;
        int accountIndex = automationImportAccount;
        automationImportAccount = -1;
        if (accountIndex < 0 || accountIndex >= configuredAccountCount()) {
            showToast("导入目标实例已失效");
            return;
        }
        try (InputStream input = getContentResolver().openInputStream(data.getData())) {
            if (input == null) throw new IllegalArgumentException("无法读取脚本清单");
            byte[] bytes = readAutomationBytes(input);
            AutomationManifest manifest;
            if (AutomationPackageFile.looksLikePackage(bytes)) {
                manifest = AutomationPackageFile.parse(bytes);
            } else {
                if (bytes.length > MAX_MANIFEST_BYTES) {
                    throw new IllegalArgumentException("脚本清单不能超过 64KB");
                }
                manifest = AutomationManifest.parse(new String(bytes, StandardCharsets.UTF_8));
            }
            if (!manifest.supportsUrl(instanceStartUrl(accountIndex))) {
                throw new IllegalArgumentException("脚本允许来源与当前实例首页不匹配");
            }
            confirmAutomationImport(manifest);
        } catch (IOException | RuntimeException error) {
            showAutomationImportError(error);
        }
    }

    private void confirmAutomationImport(AutomationManifest imported) {
        AutomationManifest existing = findImportedAutomation(imported.id);
        boolean downgrade = existing != null && imported.compareVersion(existing) < 0;
        String title = existing == null ? "确认导入脚本清单"
                : downgrade ? "确认降级脚本清单" : "确认更新脚本清单";
        String versionChange = existing == null ? imported.version
                : existing.version + " → " + imported.version;
        String message = "脚本：" + imported.name
                + "\nID：" + imported.id
                + "\n版本：" + versionChange
                + "\n来源：" + String.join(", ", imported.allowedOrigins)
                + "\n权限 ID：" + String.join(", ", imported.capabilities)
                + "\n权限说明：" + imported.toDescriptor().capabilitySummary()
                + "\n只读流程：" + (imported.workflow == null ? "未提供"
                : imported.workflow.steps.size() + " 个步骤（仅校验，不执行）")
                + (downgrade ? "\n\n警告：这是版本降级，旧版本可能缺少修复。" : "")
                + "\n\n导入后保持未启用，不会执行脚本。";
        new AlertDialog.Builder(this)
                .setTitle(title)
                .setMessage(message)
                .setNegativeButton("取消", null)
                .setPositiveButton(downgrade ? "仍然降级" : "确认保存", (dialog, which) -> {
                    saveImportedAutomation(imported);
                    showToast("脚本清单已保存（未启用）");
                })
                .show();
    }

    private AutomationManifest findImportedAutomation(String id) {
        JSONArray saved = importedAutomationJson();
        for (int i = 0; i < saved.length(); i++) {
            try {
                AutomationManifest manifest = AutomationManifest.parse(saved.getString(i));
                if (manifest.id.equals(id)) return manifest;
            } catch (RuntimeException | JSONException ignored) {
                // Ignore damaged entries.
            }
        }
        return null;
    }

    private void confirmDeleteImportedAutomation(AutomationPackageDescriptor descriptor) {
        new AlertDialog.Builder(this)
                .setTitle("删除脚本清单")
                .setMessage("确定删除 “" + descriptor.name + "” 的本地清单？\n"
                        + "当前清单未启用，删除不会修改网页数据。")
                .setNegativeButton("取消", null)
                .setPositiveButton("删除", (dialog, which) -> {
                    removeImportedAutomation(descriptor.id);
                    showToast("脚本清单已删除");
                })
                .show();
    }

    private void removeImportedAutomation(String id) {
        JSONArray current = importedAutomationJson();
        JSONArray updated = new JSONArray();
        for (int i = 0; i < current.length(); i++) {
            try {
                AutomationManifest existing = AutomationManifest.parse(current.getString(i));
                if (!existing.id.equals(id)) updated.put(existing.canonicalJson);
            } catch (RuntimeException | JSONException ignored) {
                // Drop invalid entries during cleanup.
            }
        }
        preferences.edit().putString(PREF_IMPORTED_AUTOMATION, updated.toString()).apply();
    }

    private void showAutomationImportError(Throwable error) {
        String message = error.getMessage() == null ? "未知导入错误" : error.getMessage();
        new AlertDialog.Builder(this)
                .setTitle("脚本清单导入失败")
                .setMessage(message)
                .setNegativeButton("关闭", null)
                .setPositiveButton("复制诊断", (dialog, which) -> {
                    ClipboardManager clipboard = (ClipboardManager) getSystemService(
                            Context.CLIPBOARD_SERVICE);
                    clipboard.setPrimaryClip(ClipData.newPlainText(
                            "Play Keeper 脚本导入诊断", message));
                    showToast("诊断已复制");
                })
                .show();
    }

    private List<AutomationPackageDescriptor> importedAutomationPackages(int accountIndex) {
        List<AutomationPackageDescriptor> result = new ArrayList<>();
        JSONArray saved = importedAutomationJson();
        for (int i = 0; i < saved.length(); i++) {
            try {
                AutomationManifest manifest = AutomationManifest.parse(saved.getString(i));
                if (manifest.supportsUrl(instanceStartUrl(accountIndex))) {
                    result.add(manifest.toDescriptor());
                }
            } catch (RuntimeException | JSONException ignored) {
                // Ignore obsolete or damaged entries instead of weakening validation.
            }
        }
        return result;
    }

    private void saveImportedAutomation(AutomationManifest imported) {
        JSONArray current = importedAutomationJson();
        JSONArray updated = new JSONArray();
        for (int i = 0; i < current.length(); i++) {
            try {
                AutomationManifest existing = AutomationManifest.parse(current.getString(i));
                if (!existing.id.equals(imported.id)) updated.put(existing.canonicalJson);
            } catch (RuntimeException | JSONException ignored) {
                // Drop entries that no longer pass the current schema.
            }
        }
        updated.put(imported.canonicalJson);
        preferences.edit().putString(PREF_IMPORTED_AUTOMATION, updated.toString()).apply();
    }

    private JSONArray importedAutomationJson() {
        try {
            return new JSONArray(preferences.getString(PREF_IMPORTED_AUTOMATION, "[]"));
        } catch (JSONException ignored) {
            return new JSONArray();
        }
    }

    private byte[] readAutomationBytes(InputStream input) throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[4096];
        int read;
        while ((read = input.read(buffer)) != -1) {
            output.write(buffer, 0, read);
            if (output.size() > AutomationPackageFile.MAX_PACKAGE_BYTES) {
                throw new IllegalArgumentException("自动化文件不能超过 256KB");
            }
        }
        return output.toByteArray();
    }

    private void showAutomationSettings(int accountIndex) {
        ScrollView scroll = new ScrollView(this);
        LinearLayout form = new LinearLayout(this);
        form.setOrientation(LinearLayout.VERTICAL);
        form.setPadding(dp(20), dp(8), dp(20), dp(8));
        scroll.addView(form, new ScrollView.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        String verificationToken = automationCoordinator.equipmentVerificationToken(accountIndex);
        if (!verificationToken.isEmpty()) {
            form.addView(formLabel("等待人工核验：请先查看当前账号主宠的目标套装，未确认前不会继续副本。"));
            Button confirmEquipment = makeButton("核对目标装备并继续", view ->
                    new AlertDialog.Builder(this)
                            .setTitle(accountDisplayName(accountIndex) + " · 人工装备确认")
                            .setMessage(automationCoordinator.equipmentVerificationMessage(accountIndex)
                                    + "\n确认会记录为人工核验，而不是自动检测成功。")
                            .setNegativeButton("保持暂停", null)
                            .setPositiveButton("已逐件核对，继续", (dialog, which) -> {
                                try {
                                    automationCoordinator.confirmEquipmentVerification(
                                            accountIndex, verificationToken);
                                } catch (IllegalArgumentException error) {
                                    showToast(error.getMessage());
                                }
                            }).show());
            form.addView(confirmEquipment, automationActionParams());
        }

        CheckBox auctionEnabled = new CheckBox(this);
        auctionEnabled.setText("每隔固定时间自动拍卖");
        auctionEnabled.setChecked(automationCoordinator.isAuctionEnabled(accountIndex));
        form.addView(auctionEnabled);

        CheckBox auctionKeepOne = new CheckBox(this);
        auctionKeepOne.setText("卖方每种道具保留1个（关闭则保留0个）");
        auctionKeepOne.setChecked(automationCoordinator.auctionReserveCount(accountIndex) == 1);
        form.addView(auctionKeepOne);

        form.addView(formLabel("拍卖道具（逗号分隔，可自行修改）"));
        EditText auctionItems = new EditText(this);
        auctionItems.setText(automationCoordinator.auctionItemsText(accountIndex));
        auctionItems.setHint("曙光印记,进化宝石,强化丹A,强化丹B,天仙玉露");
        auctionItems.setSingleLine(true);
        form.addView(auctionItems, formFieldParams());
        Button auctionPresetOne = makeButton("组合1：曙光/进化/强化丹A/B/天仙玉露",
                view -> auctionItems.setText(AutomationCoordinator.AUCTION_PRESET_ONE));
        form.addView(auctionPresetOne, automationActionParams());
        Button auctionPresetTwo = makeButton("组合2：黑暗系列",
                view -> auctionItems.setText(AutomationCoordinator.AUCTION_PRESET_TWO));
        form.addView(auctionPresetTwo, automationActionParams());

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

        form.addView(formLabel("副本攻击技能（auto 自动选择第二个攻击技能）"));
        EditText dungeonSkill = new EditText(this);
        dungeonSkill.setSingleLine(true);
        dungeonSkill.setText(automationCoordinator.dungeonSkill(accountIndex));
        dungeonSkill.setHint("auto 或技能名称");
        form.addView(dungeonSkill, formFieldParams());

        CheckBox dungeonCompleteTasks = new CheckBox(this);
        dungeonCompleteTasks.setText("副本全部结束后自动完成当前可完成的任务");
        dungeonCompleteTasks.setChecked(
                automationCoordinator.isDungeonTaskCompletionEnabled(accountIndex));
        form.addView(dungeonCompleteTasks);

        form.addView(formLabel("自动捕捉地图（默认圣诞小屋）"));
        EditText captureMap = new EditText(this);
        captureMap.setSingleLine(true);
        captureMap.setText(automationCoordinator.captureMap(accountIndex));
        captureMap.setHint("圣诞小屋");
        form.addView(captureMap, formFieldParams());

        CheckBox prestigeEnabled = new CheckBox(this);
        prestigeEnabled.setText("圣兽云殿挂机时定时使用威望道具（每1小时）");
        prestigeEnabled.setChecked(automationCoordinator.isPrestigeEnabled(accountIndex));
        form.addView(prestigeEnabled);
        form.addView(formLabel("威望道具组合（逗号分隔）"));
        EditText prestigeItems = new EditText(this);
        prestigeItems.setSingleLine(true);
        prestigeItems.setText(automationCoordinator.prestigeItemsText(accountIndex));
        form.addView(prestigeItems, formFieldParams());

        form.addView(formLabel("装备定向转移（最多12件：10装备槽+2卡片槽，每5件自动分批）"));
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
                accountIndex, auctionEnabled, auctionKeepOne, auctionItems, buyer, auctionPrice, hours,
                storeEnabled, templeEnabled, warehouseEnabled, warehouseItem,
                warehouseStoreAll,
                dungeonItems, dungeonSkill, dungeonCompleteTasks, captureMap,
                prestigeEnabled, prestigeItems, equipmentItems,
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

        Button autoCaptureNow = makeButton("保存并启动自动捕捉", view -> {
            if (saveAll.getAsBoolean()) automationCoordinator.runAutoCaptureNow(accountIndex);
        });
        form.addView(autoCaptureNow, automationActionParams());

        Button towerNow = makeButton("保存并启动通天塔自动战斗", view -> {
            if (saveAll.getAsBoolean()) automationCoordinator.runTowerNow(accountIndex);
        });
        form.addView(towerNow, automationActionParams());

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
                                       CheckBox auctionKeepOne,
                                       EditText auctionItems,
                                       EditText buyer, EditText auctionPrice, EditText hours,
                                       CheckBox storeEnabled, CheckBox templeEnabled,
                                       CheckBox warehouseEnabled, EditText warehouseItem,
                                       CheckBox warehouseStoreAll,
                                       EditText dungeonItems, EditText dungeonSkill,
                                       CheckBox dungeonCompleteTasks, EditText captureMap,
                                       CheckBox prestigeEnabled,
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
                    itemAuctionPrice, auctionKeepOne.isChecked() ? 1 : 0);
            automationCoordinator.configureStoreSell(accountIndex, storeEnabled.isChecked(),
                    storeItems, intervalHours);
            automationCoordinator.configureTemple(accountIndex, templeEnabled.isChecked());
            automationCoordinator.configureWarehouse(accountIndex,
                    warehouseEnabled.isChecked(), warehouseItem.getText().toString(),
                    warehouseStoreAll.isChecked());
            automationCoordinator.configureDungeonSequence(accountIndex,
                    dungeonItems.getText().toString(),
                    dungeonSkill.getText().toString(), dungeonCompleteTasks.isChecked());
            automationCoordinator.configureAdventure(accountIndex,
                    captureMap.getText().toString());
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
        LinearLayout fields = new LinearLayout(this);
        fields.setOrientation(LinearLayout.VERTICAL);
        EditText input = new EditText(this);
        input.setSingleLine(true);
        input.setSelectAllOnFocus(true);
        input.setText(accountDisplayName(accountIndex));
        input.setHint("登录用户名或自定义名称");
        int padding = dp(20);
        fields.setPadding(padding, 0, padding, 0);
        fields.addView(input, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        EditText startUrlInput = new EditText(this);
        startUrlInput.setSingleLine(true);
        startUrlInput.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        startUrlInput.setHint("例：sgplay.cc/AFK.html#/hang 或 https://example.com/");
        startUrlInput.setText(preferences.getString(startUrlKey(accountIndex), ""));
        fields.addView(startUrlInput, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        CheckBox allowHttpInput = new CheckBox(this);
        allowHttpInput.setText("允许此实例使用不安全 HTTP（内容可能被窃听或篡改）");
        allowHttpInput.setChecked(preferences.getBoolean(allowHttpKey(accountIndex), false));
        fields.addView(allowHttpInput, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        new AlertDialog.Builder(this)
                .setTitle("实例" + (accountIndex + 1) + "设置")
                .setMessage("名称留空会恢复自动识别。未填协议时，SGPlay 地址自动补 http://，其他网站自动补 https://。"
                        + "\nSGPlay HTTP 示例：sgplay.cc/AFK.html#/hang（需勾选允许 HTTP）。"
                        + "\n导航仍限制在相同协议、主机和端口。")
                .setView(fields)
                .setNegativeButton("取消", null)
                .setPositiveButton("保存", (dialog, which) -> {
                    String previousStart = instanceStartUrl(accountIndex);
                    String customStart;
                    try {
                        customStart = InstanceUrlPolicy.normalizeStartUrl(
                                startUrlInput.getText().toString(), "",
                                allowHttpInput.isChecked());
                    } catch (IllegalArgumentException error) {
                        showToast(error.getMessage());
                        return;
                    }
                    String label = sanitizeAccountLabel(input.getText().toString());
                    SharedPreferences.Editor editor = preferences.edit();
                    if (label.isBlank()) {
                        editor.remove(accountLabelKey(accountIndex));
                        editor.remove(accountLabelManualKey(accountIndex));
                    } else {
                        editor.putString(accountLabelKey(accountIndex), label);
                        editor.putBoolean(accountLabelManualKey(accountIndex), true);
                    }
                    if (customStart.isBlank()) editor.remove(startUrlKey(accountIndex));
                    else editor.putString(startUrlKey(accountIndex), customStart);
                    editor.putBoolean(allowHttpKey(accountIndex), allowHttpInput.isChecked());
                    editor.apply();
                    updateToolbarState();
                    Session session = sessions[accountIndex];
                    if (label.isBlank() && session != null) {
                        detectAccountName(session);
                    }
                    if (session != null && (!previousStart.equals(instanceStartUrl(accountIndex))
                            || !isAllowedUrl(accountIndex, session.webView.getUrl()))) {
                        session.webView.loadUrl(instanceStartUrl(accountIndex));
                    }
                    pushTelemetry();
                })
                .show();
    }

    private void showAccountManagement() {
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(20), dp(8), dp(20), 0);

        TextView summary = new TextView(this);
        summary.setTextColor(Color.LTGRAY);
        summary.setTextSize(14);
        summary.setText("当前配置 " + configuredAccountCount() + " 个实例；"
                + environmentPreset().label + "环境同时驻留 " + residentSessionLimit()
                + " 个网页。切换环境不会重建既有登录资料。");
        content.addView(summary, formFieldParams());

        EditText countInput = new EditText(this);
        countInput.setInputType(InputType.TYPE_CLASS_NUMBER);
        countInput.setText(String.valueOf(configuredAccountCount()));
        countInput.setHint("4–8");
        content.addView(formLabel("已配置实例数量（4–8）"));
        content.addView(countInput, formFieldParams());

        content.addView(formLabel("配置环境"));
        Spinner environmentInput = new Spinner(this);
        ArrayAdapter<String> environmentAdapter = new ArrayAdapter<>(this,
                android.R.layout.simple_spinner_item, EnvironmentPreset.labels());
        environmentAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        environmentInput.setAdapter(environmentAdapter);
        environmentInput.setSelection(environmentPreset().ordinal());
        content.addView(environmentInput, formFieldParams());

        TextView warning = new TextView(this);
        warning.setTextColor(Color.rgb(255, 183, 77));
        warning.setTextSize(13);
        warning.setText("省电/均衡/高性能分别驻留2/4/8个网页；非驻留实例保留独立 Profile，"
                + "再次打开时恢复。高性能环境可能显著增加内存、耗电和温度，连续回收时自动退回均衡。"
                + "这些环境不伪造硬件身份，也不绕过网站同IP或服务端限制。");
        content.addView(warning, formFieldParams());

        new AlertDialog.Builder(this)
                .setTitle("实例与配置环境")
                .setView(content)
                .setNegativeButton("取消", null)
                .setPositiveButton("保存", (dialog, which) -> {
                    int requested;
                    try {
                        requested = Integer.parseInt(countInput.getText().toString().trim());
                    } catch (NumberFormatException error) {
                        showToast("实例数量必须为4–8");
                        return;
                    }
                    if (requested < LEGACY_ACCOUNT_COUNT || requested > MAX_ACCOUNTS) {
                        showToast("实例数量必须为4–8");
                        return;
                    }
                    for (int i = requested; i < configuredAccountCount(); i++) {
                        if (automationCoordinator != null && automationCoordinator.isBusy(i)) {
                            showToast("实例" + (i + 1) + "仍在运行，暂不能减少实例数量");
                            return;
                        }
                    }
                    EnvironmentPreset preset = EnvironmentPreset.values()[
                            environmentInput.getSelectedItemPosition()];
                    for (int i = requested; i < configuredAccountCount(); i++) {
                        Session session = sessions[i];
                        if (session != null) {
                            saveLastUrl(session);
                            removeAndDestroySession(session);
                        }
                    }
                    preferences.edit()
                            .putInt(PREF_CONFIGURED_ACCOUNTS, requested)
                            .putString(PREF_ENVIRONMENT_PRESET, preset.id)
                            .remove(PREF_HIGH_PERFORMANCE)
                            .apply();
                    if (activeAccount >= requested) {
                        selectAccount(requested - 1, false);
                    }
                    trimResidentSessions();
                    rebuildToolbar();
                    updateToolbarState();
                    pushTelemetry();
                    showToast("已使用" + preset.label + "环境，同时驻留"
                            + preset.residentLimit + "个网页");
                })
                .show();
    }

    private int configuredAccountCount() {
        return Math.max(LEGACY_ACCOUNT_COUNT, Math.min(MAX_ACCOUNTS,
                preferences.getInt(PREF_CONFIGURED_ACCOUNTS, LEGACY_ACCOUNT_COUNT)));
    }

    private boolean isHighPerformanceMode() {
        return environmentPreset() == EnvironmentPreset.HIGH_PERFORMANCE;
    }

    private int residentSessionLimit() {
        return environmentPreset().residentLimit;
    }

    private EnvironmentPreset environmentPreset() {
        return EnvironmentPreset.fromId(
                preferences.getString(PREF_ENVIRONMENT_PRESET, null),
                preferences.getBoolean(PREF_HIGH_PERFORMANCE, false));
    }

    private void showRemoteSettings() {
        RemoteConfigStore.Config config = remoteConfigStore.load();
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(20), dp(8), dp(20), 0);

        TextView edition = new TextView(this);
        String editionName = BuildConfig.REMOTE_PRESET_NAME.isBlank()
                ? "正式版" : BuildConfig.REMOTE_PRESET_NAME;
        edition.setText(editionName + " · " + BuildConfig.VERSION_NAME);
        edition.setTextSize(13);
        edition.setTextColor(Color.LTGRAY);
        content.addView(edition, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        TextView connectionStatus = new TextView(this);
        connectionStatus.setText("当前状态：" + remoteStateMessage);
        connectionStatus.setTextSize(15);
        connectionStatus.setTextColor(remoteState == RemoteConnectionManager.State.CONNECTED
                ? Color.rgb(63, 190, 104)
                : remoteState == RemoteConnectionManager.State.ERROR
                        ? Color.rgb(232, 151, 74) : Color.LTGRAY);
        LinearLayout.LayoutParams statusParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        statusParams.topMargin = dp(8);
        statusParams.bottomMargin = dp(8);
        content.addView(connectionStatus, statusParams);

        TextView deviceId = new TextView(this);
        deviceId.setText(getString(R.string.remote_device_id, config.deviceId));
        deviceId.setTextIsSelectable(true);
        deviceId.setTextSize(14);
        content.addView(deviceId, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        TextView endpointLabel = new TextView(this);
        endpointLabel.setText("WSS 远程地址");
        endpointLabel.setTextSize(13);
        content.addView(endpointLabel, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        EditText endpoint = new EditText(this);
        endpoint.setHint("wss://你的域名/device");
        endpoint.setSingleLine(true);
        endpoint.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        endpoint.setText(config.endpoint.isBlank()
                ? BuildConfig.REMOTE_PRESET_ENDPOINT : config.endpoint);
        content.addView(endpoint, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        CheckBox enabled = new CheckBox(this);
        enabled.setText("启用远程连接");
        enabled.setChecked(config.enabled);

        if (!BuildConfig.REMOTE_PRESET_ENDPOINT.isBlank()) {
            Button preset = new Button(this);
            preset.setAllCaps(false);
            preset.setText("使用候选版测试服务器");
            preset.setOnClickListener(view -> {
                endpoint.setText(BuildConfig.REMOTE_PRESET_ENDPOINT);
                enabled.setChecked(true);
                showToast("已填入候选版测试地址，请继续填写 VPS 设备密钥");
            });
            content.addView(preset, new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        }

        TextView tokenLabel = new TextView(this);
        tokenLabel.setText("VPS 设备密钥（不是 APK 签名密钥）");
        tokenLabel.setTextSize(13);
        content.addView(tokenLabel, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        EditText token = new EditText(this);
        token.setHint("填写测试 VPS 的 DEVICE_TOKEN");
        token.setSingleLine(true);
        token.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        token.setText(config.token);
        content.addView(token, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

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
                .setPositiveButton("保存并连接", null)
                .create();
        dialog.setOnShowListener(ignored -> dialog.getButton(AlertDialog.BUTTON_POSITIVE)
                .setOnClickListener(view -> {
                    String endpointValue = endpoint.getText().toString().trim();
                    String tokenValue = token.getText().toString().trim();
                    if (enabled.isChecked()
                            && (!endpointValue.startsWith("wss://") || tokenValue.isBlank())) {
                        showToast("请填写 WSS 地址和测试 VPS 的 DEVICE_TOKEN");
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
                case "keep_player_start": {
                    exitBlackMode();
                    ActivityManager manager = (ActivityManager) getSystemService(
                            Context.ACTIVITY_SERVICE);
                    manager.moveTaskToFront(getTaskId(), 0);
                    success = true;
                    resultMessage = "Play Keeper 已切回前台";
                    break;
                }
                case "keep_player_exit":
                    stopPreview();
                    success = moveTaskToBack(true);
                    resultMessage = success
                            ? "Play Keeper 已退出前台，远程连接保持在线"
                            : "Play Keeper 无法退出前台";
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
                case "capture_diagnostic_snapshot": {
                    int index = requiredAccountIndex(parameters);
                    captureDiagnosticSnapshot(index, parameters.optString("diagnosticId", ""));
                    success = true;
                    resultMessage = "已采集只读诊断截图";
                    break;
                }
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
                case "pointer_swipe": {
                    handlePreviewSwipe(commandId, parameters);
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
                            parameters.optInt("price", 920),
                            parameters.optInt("reserveCount", 1));
                    success = true;
                    resultMessage = "定时拍卖设置已更新";
                    break;
                }
                case "run_auto_auction":
                case "run_auto_sell": {
                    int index = requiredAccountIndex(parameters);
                    requireAutomationIdle(index);
                    automationCoordinator.runAuctionNow(index);
                    success = true;
                    resultMessage = "已启动拍卖检查";
                    break;
                }
                case "run_auction_buy": {
                    int index = requiredAccountIndex(parameters);
                    requireAutomationIdle(index);
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
                    requireAutomationIdle(index);
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
                    requireAutomationIdle(index);
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
                    automationCoordinator.configureDungeonSequence(index, itemText.toString(),
                            parameters.has("skill") ? parameters.optString("skill", "auto")
                                    : automationCoordinator.dungeonSkill(index),
                            parameters.has("completeTasks")
                                    ? parameters.optBoolean("completeTasks", false)
                                    : automationCoordinator.isDungeonTaskCompletionEnabled(index));
                    success = true;
                    resultMessage = "副本组合已更新";
                    break;
                }
                case "run_dungeon_sequence": {
                    int index = requiredAccountIndex(parameters);
                    requireAutomationIdle(index);
                    automationCoordinator.runDungeonNow(index);
                    success = true;
                    resultMessage = "已启动副本组合";
                    break;
                }
                case "run_daily_routine": {
                    int index = requiredAccountIndex(parameters);
                    requireAutomationIdle(index);
                    String runId = parameters.optString("runId", "").trim();
                    if (!runId.matches("[A-Za-z0-9._:-]{1,120}")) {
                        throw new IllegalArgumentException("每日任务批次编号无效");
                    }
                    JSONArray itemArray = parameters.optJSONArray("items");
                    if (itemArray == null || itemArray.length() < 1 || itemArray.length() > 20) {
                        throw new IllegalArgumentException("每日任务副本列表无效");
                    }
                    StringBuilder itemText = new StringBuilder();
                    for (int i = 0; i < itemArray.length(); i++) {
                        String item = itemArray.optString(i, "").trim();
                        if (item.isEmpty() || item.length() > 30) {
                            throw new IllegalArgumentException("每日任务副本名称无效");
                        }
                        if (i > 0) itemText.append(',');
                        itemText.append(item);
                    }
                    String returnMap = parameters.optString("returnMap", "圣诞小屋").trim();
                    if (returnMap.isEmpty() || returnMap.length() > 30) {
                        throw new IllegalArgumentException("完成后挂机副本无效");
                    }
                    automationCoordinator.runDailyRoutineNow(index, runId,
                            itemText.toString(), parameters.optString("skill", "auto"),
                            returnMap);
                    success = true;
                    resultMessage = "已启动账号每日任务，完成后返回" + returnMap + "挂机";
                    break;
                }
                case "configure_adventure": {
                    int index = requiredAccountIndex(parameters);
                    automationCoordinator.configureAdventure(index,
                            parameters.optString("map", "圣诞小屋"));
                    success = true;
                    resultMessage = "自动捕捉地图已更新";
                    break;
                }
                case "run_auto_capture": {
                    int index = requiredAccountIndex(parameters);
                    requireAutomationIdle(index);
                    automationCoordinator.runAutoCaptureNow(index);
                    success = true;
                    resultMessage = "已启动自动捕捉";
                    break;
                }
                case "run_tower_battle": {
                    int index = requiredAccountIndex(parameters);
                    requireAutomationIdle(index);
                    automationCoordinator.runTowerNow(index);
                    success = true;
                    resultMessage = "已启动通天塔自动战斗";
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
                    requireAutomationIdle(index);
                    automationCoordinator.runPrestigeNow(index);
                    success = true;
                    resultMessage = "已启动威望道具检查";
                    break;
                }
                case "configure_inventory_monitor": {
                    int index = requiredAccountIndex(parameters);
                    JSONArray itemArray = parameters.optJSONArray("items");
                    if (itemArray == null) throw new IllegalArgumentException("监控道具列表无效");
                    StringBuilder itemText = new StringBuilder();
                    for (int i = 0; i < itemArray.length(); i++) {
                        if (i > 0) itemText.append(',');
                        itemText.append(itemArray.optString(i));
                    }
                    automationCoordinator.configureInventoryMonitor(index, itemText.toString());
                    success = true;
                    resultMessage = "每日背包监控设置已更新";
                    break;
                }
                case "run_inventory_snapshot": {
                    int index = requiredAccountIndex(parameters);
                    requireAutomationIdle(index);
                    automationCoordinator.runInventorySnapshotNow(index);
                    success = true;
                    resultMessage = "已启动背包物资刷新";
                    break;
                }
                case "set_daily_completion": {
                    int index = requiredAccountIndex(parameters);
                    automationCoordinator.setDailyCompletion(index,
                            parameters.optString("kind"),
                            parameters.optBoolean("completed", false));
                    success = true;
                    resultMessage = "每日完成状态已更新";
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
                    requireAutomationIdle(index);
                    automationCoordinator.runEquipmentSellNow(index);
                    success = true;
                    resultMessage = "已启动装备上架";
                    break;
                }
                case "run_equipment_buy": {
                    int index = requiredAccountIndex(parameters);
                    requireAutomationIdle(index);
                    automationCoordinator.runEquipmentBuyNow(index,
                            parameters.optInt("sellerAccountIndex", -1));
                    success = true;
                    resultMessage = parameters.optInt("sellerAccountIndex", -1) >= 0
                            ? "已启动断线恢复购买并关联卖方"
                            : "已启动装备购买";
                    break;
                }
                case "confirm_equipment_verification": {
                    int index = requiredAccountIndex(parameters);
                    automationCoordinator.confirmEquipmentVerification(
                            index, parameters.optString("verificationToken", ""));
                    success = true;
                    resultMessage = "已记录本次人工装备确认，继续执行；请关注任务进度";
                    break;
                }
                case "run_daily_tasks": {
                    int index = requiredAccountIndex(parameters);
                    requireAutomationIdle(index);
                    automationCoordinator.runDailyTasksNow(index);
                    success = true;
                    resultMessage = "已启动一键接受日常任务";
                    break;
                }
                case "run_completed_tasks": {
                    int index = requiredAccountIndex(parameters);
                    requireAutomationIdle(index);
                    automationCoordinator.runCompletedTasksNow(index);
                    success = true;
                    resultMessage = "已启动完成任务奖励领取";
                    break;
                }
                case "run_seller_cleanup": {
                    int index = requiredAccountIndex(parameters);
                    automationCoordinator.runSellerCleanupNow(index);
                    success = true;
                    resultMessage = "已启动剩余装备穿戴与挂机收尾";
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
                case "configure_return_hang": {
                    int index = requiredAccountIndex(parameters);
                    automationCoordinator.configureReturnHang(index,
                            parameters.optString("map", "圣兽云殿"));
                    success = true;
                    resultMessage = "返回挂机副本已更新";
                    break;
                }
                case "run_temple_guard": {
                    int index = requiredAccountIndex(parameters);
                    requireAutomationIdle(index);
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
        if (index < 0 || index >= configuredAccountCount()) {
            throw new IllegalArgumentException("账号索引无效");
        }
        return index;
    }

    private void requireAutomationIdle(int accountIndex) {
        if (automationCoordinator.isBusy(accountIndex)) {
            throw new IllegalStateException(accountDisplayName(accountIndex)
                    + "仍在执行上一阶段，已拒绝重复启动");
        }
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

    private void captureDiagnosticSnapshot(int accountIndex, String diagnosticId) {
        Session session = getOrCreateSession(accountIndex);
        WebView view = session.webView;
        if (view.getWidth() <= 0 || view.getHeight() <= 0) return;
        int sourceWidth = view.getWidth();
        int sourceHeight = view.getHeight();
        int targetWidth = Math.min(1_280, sourceWidth);
        int targetHeight = Math.max(1, Math.round(sourceHeight * targetWidth / (float) sourceWidth));
        Bitmap bitmap = null;
        try {
            bitmap = Bitmap.createBitmap(targetWidth, targetHeight, Bitmap.Config.RGB_565);
            Canvas canvas = new Canvas(bitmap);
            canvas.drawColor(Color.WHITE);
            canvas.scale(targetWidth / (float) sourceWidth, targetHeight / (float) sourceHeight);
            view.draw(canvas);
            byte[] encoded = compressPreview(bitmap, 64);
            if (encoded.length > PREVIEW_MAX_ENCODED_BYTES) encoded = compressPreview(bitmap, 42);
            if (encoded.length > PREVIEW_MAX_ENCODED_BYTES) return;
            JSONObject frame = new JSONObject();
            frame.put("diagnosticId", diagnosticId);
            frame.put("accountIndex", accountIndex);
            frame.put("accountLabel", accountDisplayName(accountIndex));
            frame.put("sequence", ++previewSequence);
            frame.put("width", targetWidth);
            frame.put("height", targetHeight);
            frame.put("mime", "image/jpeg");
            frame.put("blackOverlay", blackMode);
            frame.put("imageBase64", Base64.encodeToString(encoded, Base64.NO_WRAP));
            remoteConnectionManager.sendDiagnosticSnapshot(frame);
        } catch (RuntimeException | JSONException ignored) {
            // GPT diagnostics are suggestion-only and must not affect the workflow.
        } finally {
            if (bitmap != null) bitmap.recycle();
        }
    }

    private void captureAutomationFailureSnapshot(int accountIndex, String task, String message) {
        long capturedAt = System.currentTimeMillis();
        preferences.edit()
                .putLong(PREF_FAILURE_AT_PREFIX + accountIndex, capturedAt)
                .putString(PREF_FAILURE_TASK_PREFIX + accountIndex, task == null ? "" : task)
                .putString(PREF_FAILURE_MESSAGE_PREFIX + accountIndex,
                        message == null ? "" : message)
                .remove(PREF_FAILURE_SCREENSHOT_PREFIX + accountIndex)
                .apply();
        Session session = sessions[accountIndex];
        if (session == null) return;
        session.webView.post(() -> {
            WebView view = session.webView;
            int sourceWidth = view.getWidth();
            int sourceHeight = view.getHeight();
            if (sourceWidth <= 0 || sourceHeight <= 0) return;
            int targetWidth = Math.min(720, sourceWidth);
            int targetHeight = Math.max(1,
                    Math.round(sourceHeight * targetWidth / (float) sourceWidth));
            Bitmap bitmap = null;
            try {
                bitmap = Bitmap.createBitmap(targetWidth, targetHeight, Bitmap.Config.RGB_565);
                Canvas canvas = new Canvas(bitmap);
                canvas.drawColor(Color.WHITE);
                canvas.scale(targetWidth / (float) sourceWidth,
                        targetHeight / (float) sourceHeight);
                view.draw(canvas);
                File directory = new File(getFilesDir(), "automation_failures");
                if (!directory.exists() && !directory.mkdirs()) return;
                File image = new File(directory,
                        "failure-" + accountIndex + "-" + capturedAt + ".jpg");
                try (FileOutputStream output = new FileOutputStream(image)) {
                    if (!bitmap.compress(Bitmap.CompressFormat.JPEG, 72, output)) return;
                }
                preferences.edit().putString(PREF_FAILURE_SCREENSHOT_PREFIX + accountIndex,
                        image.getName()).apply();
                pruneFailureSnapshots(directory, accountIndex);
                pushTelemetry();
            } catch (RuntimeException | IOException ignored) {
                // Failure capture is diagnostic only and must never replace the original error.
            } finally {
                if (bitmap != null) bitmap.recycle();
            }
        });
    }

    private void clearAutomationFailureSnapshot(int accountIndex, String task) {
        String storedTask = preferences.getString(PREF_FAILURE_TASK_PREFIX + accountIndex, "");
        if (task != null && !task.equals(storedTask)) return;
        String screenshot = preferences.getString(PREF_FAILURE_SCREENSHOT_PREFIX + accountIndex, "");
        preferences.edit()
                .remove(PREF_FAILURE_AT_PREFIX + accountIndex)
                .remove(PREF_FAILURE_TASK_PREFIX + accountIndex)
                .remove(PREF_FAILURE_MESSAGE_PREFIX + accountIndex)
                .remove(PREF_FAILURE_SCREENSHOT_PREFIX + accountIndex)
                .apply();
        if (!screenshot.isBlank()) {
            File image = new File(new File(getFilesDir(), "automation_failures"), screenshot);
            if (image.isFile()) image.delete();
        }
    }

    private void pruneFailureSnapshots(File directory, int accountIndex) {
        File[] files = directory.listFiles((dir, name) ->
                name.startsWith("failure-" + accountIndex + "-") && name.endsWith(".jpg"));
        if (files == null || files.length <= 3) return;
        Arrays.sort(files, Comparator.comparingLong(File::lastModified).reversed());
        for (int index = 3; index < files.length; index++) {
            //noinspection ResultOfMethodCallIgnored
            files[index].delete();
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

    private void handlePreviewSwipe(String commandId, JSONObject parameters) {
        try {
            int accountIndex = requiredAccountIndex(parameters);
            double x1 = parameters.optDouble("x1", -1d);
            double y1 = parameters.optDouble("y1", -1d);
            double x2 = parameters.optDouble("x2", -1d);
            double y2 = parameters.optDouble("y2", -1d);
            int durationMs = parameters.optInt("durationMs", 360);
            long frameSequence = parameters.optLong("frameSequence", -1L);
            validatePreviewTap(accountIndex, x1, y1, frameSequence);
            validatePreviewTap(accountIndex, x2, y2, frameSequence);
            if (durationMs < 120 || durationMs > 1_500) {
                throw new IllegalArgumentException("滑动时间无效");
            }
            Session session = getOrCreateSession(accountIndex);
            String script = "(function(){const x=" + x1 + "*innerWidth,y=" + y1
                    + "*innerHeight,dx=(" + x1 + "-" + x2 + ")*innerWidth*1.15,dy=("
                    + y1 + "-" + y2 + ")*innerHeight*1.15,vertical=Math.abs(dy)>Math.abs(dx);"
                    + "const visible=v=>{if(!v)return false;const s=getComputedStyle(v),r=v.getBoundingClientRect();"
                    + "return s.display!=='none'&&s.visibility!=='hidden'&&r.width>1&&r.height>1;};"
                    + "const scrollable=v=>v&&visible(v)&&(vertical?v.scrollHeight>v.clientHeight+2:"
                    + "v.scrollWidth>v.clientWidth+2);"
                    + "const modalSelectors=['[role=dialog]','.uni-popup__wrapper','.uni-popup','.modal',"
                    + "'.dialog','.pack-modal','.warehouse-modal','.task-modal'];"
                    + "const modals=Array.from(document.querySelectorAll(modalSelectors.join(','))).filter(visible);"
                    + "const modal=modals.length?modals[modals.length-1]:null;"
                    + "let e=document.elementFromPoint(x,y),candidates=[];"
                    + "if(modal){if(!modal.contains(e))e=modal;while(e&&modal.contains(e)){candidates.push(e);"
                    + "if(e===modal)break;e=e.parentElement;}candidates.push(...modal.querySelectorAll('*'));}"
                    + "else{while(e){candidates.push(e);e=e.parentElement;}"
                    + "candidates.push(document.scrollingElement,document.documentElement,document.body);}"
                    + "const target=candidates.find(scrollable);if(!target)return modal?'modal-blocked':'none';"
                    + "const beforeX=target.scrollLeft,beforeY=target.scrollTop;"
                    + "target.scrollBy({left:dx,top:dy,behavior:'auto'});"
                    + "target.dispatchEvent(new Event('scroll',{bubbles:true}));"
                    + "return target.scrollLeft!==beforeX||target.scrollTop!==beforeY?'scrolled':"
                    + "(modal?'modal-blocked':'none');})()";
            session.webView.evaluateJavascript(script, encoded -> {
                boolean domScrolled = "\"scrolled\"".equals(encoded);
                boolean modalBlocked = "\"modal-blocked\"".equals(encoded);
                try {
                    if (!domScrolled && !modalBlocked) {
                        dispatchSwipe(session.webView, x1, y1, x2, y2, durationMs);
                    }
                    remoteConnectionManager.sendCommandResult(commandId, true,
                            domScrolled ? "远程页面已滚动"
                                    : modalBlocked ? "弹窗已到滚动边界" : "远程触摸滑动已执行");
                    mainHandler.postDelayed(this::capturePreviewFrame,
                            domScrolled ? 180L : durationMs + 180L);
                } catch (RuntimeException error) {
                    remoteConnectionManager.sendCommandResult(commandId, false,
                            error.getMessage() == null ? "滑动处理失败" : error.getMessage());
                }
            });
        } catch (RuntimeException error) {
            remoteConnectionManager.sendCommandResult(commandId, false,
                    error.getMessage() == null ? "滑动处理失败" : error.getMessage());
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

    private void dispatchSwipe(WebView view, double x1, double y1,
                               double x2, double y2, int durationMs) {
        if (view.getWidth() <= 0 || view.getHeight() <= 0) {
            throw new IllegalStateException("网页尚未完成布局");
        }
        final float startX = (float) (x1 * view.getWidth());
        final float startY = (float) (y1 * view.getHeight());
        final float endX = (float) (x2 * view.getWidth());
        final float endY = (float) (y2 * view.getHeight());
        final long downTime = SystemClock.uptimeMillis();
        view.requestFocus();
        MotionEvent down = MotionEvent.obtain(downTime, downTime,
                MotionEvent.ACTION_DOWN, startX, startY, 0);
        view.dispatchTouchEvent(down);
        down.recycle();
        int steps = Math.max(4, Math.min(24, durationMs / 25));
        for (int step = 1; step <= steps; step++) {
            final int currentStep = step;
            mainHandler.postDelayed(() -> {
                float fraction = currentStep / (float) steps;
                float x = startX + (endX - startX) * fraction;
                float y = startY + (endY - startY) * fraction;
                int action = currentStep == steps
                        ? MotionEvent.ACTION_UP : MotionEvent.ACTION_MOVE;
                MotionEvent event = MotionEvent.obtain(downTime, SystemClock.uptimeMillis(),
                        action, x, y, 0);
                try {
                    view.dispatchTouchEvent(event);
                } finally {
                    event.recycle();
                }
            }, (long) durationMs * step / steps);
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
        if (index < 0 || index >= configuredAccountCount()) {
            throw new IllegalArgumentException("账号尚未配置");
        }
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
            app.put("versionCode", BuildConfig.VERSION_CODE);
            app.put("versionName", BuildConfig.VERSION_NAME);
            app.put("activeAccount", activeAccount);
            app.put("blackScreen", blackMode);
            app.put("executionMode", blackMode
                    ? "foreground_black_overlay" : "foreground_visible");
            app.put("keepScreenOn", true);
            app.put("previewEnabled", previewEnabled);
            app.put("previewAccount", previewAccount);
            app.put("remoteState", remoteState.name().toLowerCase(Locale.ROOT));
            app.put("configuredAccounts", configuredAccountCount());
            app.put("maxConcurrentAccounts", residentSessionLimit());
            app.put("accountPerformanceMode", environmentPreset().id);
            ActivityManager activityManager = (ActivityManager) getSystemService(
                    Context.ACTIVITY_SERVICE);
            ActivityManager.MemoryInfo memoryInfo = new ActivityManager.MemoryInfo();
            activityManager.getMemoryInfo(memoryInfo);
            app.put("availableMemoryMb", memoryInfo.availMem / (1024L * 1024L));
            app.put("lowMemory", memoryInfo.lowMemory);
            telemetry.put("app", app);

            telemetry.put("battery", latestBatterySnapshot == null
                    ? JSONObject.NULL : latestBatterySnapshot.toJson());

            JSONArray accounts = new JSONArray();
            for (int i = 0; i < configuredAccountCount(); i++) {
                Session session = sessions[i];
                JSONObject account = new JSONObject();
                account.put("index", i);
                account.put("label", accountDisplayName(i));
                account.put("labelManual", preferences.getBoolean(
                        accountLabelManualKey(i), false));
                account.put("opened", preferences.getBoolean(accountOpenedKey(i), i == 0));
                account.put("loaded", session != null);
                account.put("active", i == activeAccount);
                account.put("profileId", profileName(i));
                account.put("renderProcessGoneCount", renderProcessGoneCounts[i]);
                account.put("lastRenderProcessGoneAt", lastRenderProcessGoneAt[i]);
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
                    account.put("url", isAllowedUrl(i, url) ? url : JSONObject.NULL);
                }
                if (automationCoordinator != null) {
                    automationCoordinator.appendAccountTelemetry(account, i);
                }
                long failureAt = preferences.getLong(PREF_FAILURE_AT_PREFIX + i, 0L);
                if (failureAt > 0L) {
                    JSONObject failure = new JSONObject();
                    failure.put("capturedAt", failureAt);
                    failure.put("task", preferences.getString(
                            PREF_FAILURE_TASK_PREFIX + i, ""));
                    failure.put("message", preferences.getString(
                            PREF_FAILURE_MESSAGE_PREFIX + i, ""));
                    String screenshot = preferences.getString(
                            PREF_FAILURE_SCREENSHOT_PREFIX + i, "");
                    failure.put("screenshotAvailable", !screenshot.isBlank());
                    failure.put("screenshotName", screenshot);
                    account.put("lastFailure", failure);
                }
                accounts.put(account);
            }
            telemetry.put("accounts", accounts);
            if (remoteConnectionManager != null) {
                telemetry.put("executionLedger", remoteConnectionManager.executionLedgerTelemetry());
            }
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
        if (accountIndex < 0 || accountIndex >= configuredAccountCount()) {
            showToast("账号尚未配置");
            return;
        }
        if (accountIndex > 0 && !multiProfileSupported) {
            showToast("多账号需要更新 Android System WebView 后使用");
            return;
        }
        if (sessions[accountIndex] == null && !createSession(accountIndex)) {
            return;
        }

        activeAccount = accountIndex;
        sessions[accountIndex].lastAccessAt = SystemClock.elapsedRealtime();
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
            showToast("已切换到实例" + (accountIndex + 1));
        }
        pushTelemetry();
    }

    private void restoreOpenedAccounts() {
        int restored = sessions[activeAccount] == null ? 0 : 1;
        for (int i = 0; i < configuredAccountCount() && restored < residentSessionLimit(); i++) {
            if (i == activeAccount || (i > 0 && !multiProfileSupported)) {
                continue;
            }
            boolean wasOpened = preferences.getBoolean(accountOpenedKey(i), i == 0);
            if (wasOpened) {
                if (createSession(i)) restored++;
            }
        }
    }

    @SuppressLint({"SetJavaScriptEnabled", "RequiresFeature"})
    private boolean createSession(int accountIndex) {
        if (accountIndex < 0 || accountIndex >= configuredAccountCount()) return false;
        if (!ensureResidentCapacity(accountIndex)) {
            showToast(environmentPreset().label + "环境已有" + residentSessionLimit()
                    + "个实例驻留且无法回收；请等待任务结束或调整配置环境");
            return false;
        }
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
        session.lastAccessAt = SystemClock.elapsedRealtime();
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
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setGeolocationEnabled(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        if (Build.VERSION.SDK_INT >= 26) settings.setSafeBrowsingEnabled(true);
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
            session.cookieManager.setAcceptThirdPartyCookies(view, false);
        } catch (RuntimeException error) {
            removeAndDestroySession(session);
            showToast("账号存储初始化失败，请更新系统网页组件");
            return false;
        }

        view.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                request.deny();
            }
            @Override
            public void onProgressChanged(WebView currentView, int newProgress) {
                session.progress = newProgress;
                if (session.index == activeAccount) {
                    updateProgress(newProgress);
                }
            }

            @Override
            public boolean onJsConfirm(WebView currentView, String url,
                                       String message, JsResult result) {
                String host = url == null ? null : Uri.parse(url).getHost();
                boolean expected = System.currentTimeMillis()
                        <= dailyTaskConfirmationUntil[session.index]
                        && "sgplay.cc".equalsIgnoreCase(host)
                        && message != null
                        && message.contains("一键接受")
                        && message.contains("日常任务");
                if (expected) {
                    dailyTaskConfirmationUntil[session.index] = 0L;
                    result.confirm();
                    return true;
                }
                return super.onJsConfirm(currentView, url, message, result);
            }
        });

        view.setWebViewClient(new SessionWebViewClient(session));
        String startUrl = instanceStartUrl(accountIndex);
        String savedUrl = preferences.getString(lastUrlKey(accountIndex), startUrl);
        view.loadUrl(isAllowedUrl(accountIndex, savedUrl) ? savedUrl : startUrl);
        preferences.edit().putBoolean(accountOpenedKey(accountIndex), true).apply();
        return true;
    }

    private boolean ensureResidentCapacity(int requestedAccount) {
        if (sessions[requestedAccount] != null) return true;
        while (residentSessionCount() >= residentSessionLimit()) {
            Session candidate = null;
            for (Session session : sessions) {
                if (session == null || session.index == requestedAccount
                        || (automationCoordinator != null
                        && automationCoordinator.isBusy(session.index))) continue;
                if (candidate == null
                        || (candidate.index == activeAccount && session.index != activeAccount)
                        || ((candidate.index == activeAccount) == (session.index == activeAccount)
                        && session.lastAccessAt < candidate.lastAccessAt)) {
                    candidate = session;
                }
            }
            if (candidate == null) return false;
            if (candidate.index == activeAccount) {
                activeAccount = requestedAccount;
                preferences.edit().putInt(PREF_ACTIVE_ACCOUNT, activeAccount).apply();
            }
            saveLastUrl(candidate);
            removeAndDestroySession(candidate);
        }
        return true;
    }

    private int residentSessionCount() {
        int count = 0;
        for (Session session : sessions) if (session != null) count++;
        return count;
    }

    private void trimResidentSessions() {
        while (residentSessionCount() > residentSessionLimit()) {
            Session candidate = null;
            for (Session session : sessions) {
                if (session == null || session.index == activeAccount
                        || (automationCoordinator != null
                        && automationCoordinator.isBusy(session.index))) continue;
                if (candidate == null || session.lastAccessAt < candidate.lastAccessAt) {
                    candidate = session;
                }
            }
            if (candidate == null) break;
            saveLastUrl(candidate);
            removeAndDestroySession(candidate);
        }
    }

    private final class SessionWebViewClient extends WebViewClient {
        private final Session session;

        SessionWebViewClient(Session session) {
            this.session = session;
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return shouldBlockNavigation(session.index, request.getUrl());
        }

        @Override
        @SuppressWarnings("deprecation")
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            return shouldBlockNavigation(session.index, Uri.parse(url));
        }

        @Override
        public void onPageStarted(WebView view, String url, Bitmap favicon) {
            if (activeReadOnlyWorkflowSession == session) {
                cancelReadOnlyWorkflow("执行期间页面开始跳转，已停止");
            }
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
            long now = System.currentTimeMillis();
            if (now - lastRenderProcessGoneAt[session.index] > 10L * 60L * 1000L) {
                renderProcessGoneCounts[session.index] = 0;
            }
            lastRenderProcessGoneAt[session.index] = now;
            renderProcessGoneCounts[session.index]++;
            if (isHighPerformanceMode() && renderProcessGoneCounts[session.index] >= 2) {
                preferences.edit()
                        .putString(PREF_ENVIRONMENT_PRESET, EnvironmentPreset.BALANCED.id)
                        .remove(PREF_HIGH_PERFORMANCE)
                        .apply();
                showToast("检测到网页进程连续退出，已自动退回均衡环境");
            }
            recoverSession(session, detail.didCrash()
                    ? "网页进程崩溃，正在恢复"
                    : "网页进程已被系统回收，正在恢复");
            trimResidentSessions();
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
        if (isAllowedUrl(session.index, currentUrl)) {
            session.webView.reload();
        } else {
            session.webView.loadUrl(instanceStartUrl(session.index));
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
        if (activeReadOnlyWorkflowSession == session) {
            cancelReadOnlyWorkflow("网页实例已重建，只读流程已停止");
        }
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
            session.webView.loadUrl(instanceStartUrl(session.index));
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
        for (int i = 0; i < configuredAccountCount(); i++) {
            boolean active = i == activeAccount;
            String state = automationCoordinator != null && automationCoordinator.isBusy(i)
                    ? "▶ " : sessions[i] == null ? "○ " : "● ";
            accountButtons[i].setText(state + compactAccountDisplayName(i));
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

    private boolean shouldBlockNavigation(int accountIndex, Uri uri) {
        if (uri == null) {
            return true;
        }
        String scheme = uri.getScheme();
        if ("about".equalsIgnoreCase(scheme)) {
            return false;
        }
        if (isAllowedUrl(accountIndex, uri.toString())) {
            return false;
        }
        showToast("已阻止跳转到外部网站");
        return true;
    }

    private boolean isAllowedUrl(int accountIndex, String url) {
        return InstanceUrlPolicy.isAllowed(url,
                preferences.getString(startUrlKey(accountIndex), ""),
                preferences.getBoolean(allowHttpKey(accountIndex), false));
    }

    private String instanceStartUrl(int accountIndex) {
        String configured = preferences.getString(startUrlKey(accountIndex), "");
        try {
            return InstanceUrlPolicy.normalizeStartUrl(configured, START_URL,
                    preferences.getBoolean(allowHttpKey(accountIndex), false));
        } catch (IllegalArgumentException ignored) {
            return START_URL;
        }
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
        cancelReadOnlyWorkflow("页面已关闭，只读流程已停止");
        if (readOnlyWorkflowDialog != null) {
            readOnlyWorkflowDialog.dismiss();
            readOnlyWorkflowDialog = null;
        }
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
        if (isAllowedUrl(session.index, url)) {
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

    private String startUrlKey(int accountIndex) {
        return PREF_START_URL_PREFIX + accountIndex;
    }

    private String allowHttpKey(int accountIndex) {
        return PREF_ALLOW_HTTP_PREFIX + accountIndex;
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
        String fallback = "实例" + (accountIndex + 1);
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
        long lastAccessAt;
        Runnable retryRunnable;

        Session(int index, WebView webView) {
            this.index = index;
            this.webView = webView;
            this.desktopMode = preferences.getBoolean(desktopModeKey(index), true);
        }
    }
}
