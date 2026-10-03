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
                    + "SGPlayKeeper/0.5";
    private static final int PREVIEW_DEFAULT_WIDTH = 720;
    private static final int PREVIEW_MAX_WIDTH = 2_560;
    private static final int PREVIEW_MAX_ENCODED_BYTES = 2_500 * 1024;
    private static final long PREVIEW_MIN_INTERVAL_MS = 1_000L;
    private static final String USERNAME_DETECTION_SCRIPT =
            "(function(){"
                    + "const s=['[data-username]','[data-user-name]','#username','#userName',"
                    + "'.username','.user-name','.user_name','.nickname','.nick-name',"
                    + "'#nickname','#nickName'];"
                    + "for(const q of s){const e=document.querySelector(q);if(!e)continue;"
                    + "let v=e.getAttribute('data-username')||e.getAttribute('data-user-name')"
                    + "||e.value||e.textContent||'';v=v.replace(/\\s+/g,' ').trim();"
                    + "if(v&&v.length<=32&&!/^(用户名|账号|昵称|登录|未登录|user|username)$/i.test(v))return v;}"
                    + "return null;})()";

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
    private ConnectivityManager connectivityManager;
    private ConnectivityManager.NetworkCallback networkCallback;
    private SharedPreferences preferences;
    private BatteryMonitor batteryMonitor;
    private BatteryMonitor.Snapshot latestBatterySnapshot;
    private RemoteConfigStore remoteConfigStore;
    private RemoteConnectionManager remoteConnectionManager;
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
            row.addView(desktopButton, weightedButtonParams(0.82f));
            row.addView(orientationButton, weightedButtonParams(0.82f));
            row.addView(batteryButton, weightedButtonParams(1.05f));
            row.addView(remoteButton, weightedButtonParams(0.82f));
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
            actionRow.addView(desktopButton, weightedButtonParams(1f));
            actionRow.addView(orientationButton, weightedButtonParams(1f));
            actionRow.addView(batteryButton, weightedButtonParams(1.15f));
            actionRow.addView(remoteButton, weightedButtonParams(1f));
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
            app.put("versionCode", 6);
            app.put("versionName", "0.5.1-select-test");
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
