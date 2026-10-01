package com.local.sgplaykeeper;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.ActivityInfo;
import android.content.res.Configuration;
import android.graphics.Bitmap;
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
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.Toast;

import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import java.util.Locale;

public final class MainActivity extends Activity {
    private static final String START_URL = "http://sgplay.cc/home.html#/";
    private static final String PREFS = "sgplay_keeper";
    private static final String PREF_ACTIVE_ACCOUNT = "active_account";
    private static final String PREF_DESKTOP_PREFIX = "desktop_mode_";
    private static final String PREF_LAST_URL_PREFIX = "last_url_";
    private static final String PREF_ACCOUNT_OPENED_PREFIX = "account_opened_";
    private static final String PREF_LANDSCAPE_PREFIX = "landscape_mode_";
    private static final int MAX_ACCOUNTS = 4;
    private static final long PAGE_LOAD_TIMEOUT_MS = 60_000L;
    private static final long[] RETRY_DELAYS_MS = {3_000L, 10_000L, 30_000L, 60_000L};
    private static final String DESKTOP_USER_AGENT =
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                    + "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 "
                    + "SGPlayKeeper/0.3";

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
    private ConnectivityManager connectivityManager;
    private ConnectivityManager.NetworkCallback networkCallback;
    private SharedPreferences preferences;

    private int activeAccount;
    private boolean blackMode;
    private boolean activityDestroyed;
    private boolean multiProfileSupported;
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
        }

        blackButton = makeButton("黑屏", view -> enterBlackMode());
        homeButton = makeButton("首页", view -> loadHome());
        refreshButton = makeButton("刷新", view -> manualReload());
        desktopButton = makeButton("桌面", view -> toggleDesktopMode());
        orientationButton = makeButton("横屏", view -> toggleOrientation());
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

        if (userInitiated) {
            showToast("已切换到账号" + (accountIndex + 1));
        }
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
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request,
                                    WebResourceError error) {
            if (request.isForMainFrame()) {
                session.loading = false;
                session.failedForCurrentLoad = true;
                scheduleRetry(session, "页面连接失败");
            }
        }

        @Override
        public void onReceivedHttpError(WebView view, WebResourceRequest request,
                                        WebResourceResponse errorResponse) {
            if (request.isForMainFrame() && errorResponse.getStatusCode() >= 500) {
                session.loading = false;
                session.failedForCurrentLoad = true;
                scheduleRetry(session, "服务器异常 " + errorResponse.getStatusCode());
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
        showToast("黑屏保护已开启；连点屏幕5次或按音量键恢复");
        blackMode = true;
        WindowManager.LayoutParams attributes = getWindow().getAttributes();
        brightnessBeforeBlack = attributes.screenBrightness;
        attributes.screenBrightness = 0f;
        getWindow().setAttributes(attributes);
        blackOverlay.setVisibility(View.VISIBLE);
        blackOverlay.bringToFront();
        blackOverlay.requestFocus();
        hideSystemBars();
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
