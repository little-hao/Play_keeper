# Play Keeper 开发说明

本文面向后续维护者，记录项目目标、架构决策、状态模型、兼容策略、故障恢复机制和已知限制。修改核心逻辑前请先阅读本文和 `RELEASE_GUIDE.md`。

## 1. 项目目标

Play Keeper 是一个面向小米 Civi 4 Pro / HyperOS 的轻量 Android WebView 容器，用于长期保持 `sgplay.cc` 网页运行。

当前目标：

- 最多 4 个账号同时保留网页实例。
- 各账号 Cookie、缓存、LocalStorage、IndexedDB 等站点数据相互隔离。
- 前台运行时持续亮屏，并提供 OLED 纯黑遮罩。
- 网络异常、加载卡死及 WebView 渲染进程异常后自动恢复。
- 每个账号保存最后页面、浏览器模式和横竖屏偏好。
- 兼容 Android 15 强制 edge-to-edge，以及 Civi 4 Pro 的刘海和手势区域。

非目标：

- 不保存或自动填写账号密码。
- 不绕过网站登录、安全验证或挂机规则。
- 不承诺按电源键熄屏、退到后台或被 HyperOS 杀进程后网页仍持续运行。
- 不提供远程控制能力；远控属于独立系统。

## 2. 技术栈与兼容范围

| 项目 | 当前值 |
|---|---|
| 语言 | Java 17 |
| Android Gradle Plugin | 8.7.3 |
| Gradle | 8.9 |
| compileSdk / targetSdk | 35 |
| minSdk | 26 |
| AndroidX WebKit | 1.12.0 |
| 测试包名 | `com.local.sgplaykeeper.test` |
| 正式包名 | `com.local.sgplaykeeper` |

AndroidX WebKit 选择 1.12.0 是为了在当前 compileSdk 35 构建环境中稳定使用 Multi-Profile API。升级 WebKit 前需要重新检查其 `minCompileSdk`、传递依赖和 Civi 4 Pro 的实际 WebView 功能支持。

## 3. 代码结构

```text
app/src/main/
├── AndroidManifest.xml
├── java/com/local/sgplaykeeper/
│   └── MainActivity.java
└── res/
    ├── drawable/                 启动图标矢量
    ├── mipmap-anydpi-v26/        Android 8+ 自适应图标
    ├── mipmap-anydpi-v33/        Android 13+ 单色主题图标
    ├── values/                   名称、颜色、主题
    ├── values-night/             深色主题
    └── xml/
        ├── data_extraction_rules.xml
        └── network_security_config.xml
```

当前功能集中在 `MainActivity.java`，便于原型阶段快速验证。功能继续增长时，建议按以下方向拆分：

- `SessionController`：账号会话创建、恢复、销毁。
- `RecoveryController`：超时、网络恢复和递增重试。
- `ScreenGuardController`：黑屏遮罩、亮度和系统栏。
- `PreferenceStore`：状态键名和持久化。
- `MainToolbarView`：横竖屏自适应工具栏。

## 4. 总体架构

```text
MainActivity
├── 自适应工具栏
│   ├── 账号1～账号4
│   ├── 黑屏 / 首页 / 刷新
│   ├── 桌面或手机模式
│   └── 横屏或竖屏
├── WebView 容器
│   ├── Session 0 → Default Profile
│   ├── Session 1 → sgplay_account_2
│   ├── Session 2 → sgplay_account_3
│   └── Session 3 → sgplay_account_4
└── 全屏黑色遮罩
```

所有已打开的 WebView 都保持 `VISIBLE` 并附着在同一个 `FrameLayout` 中，当前账号通过 `bringToFront()` 显示。这样可以减少非当前账号因 `GONE/INVISIBLE` 引起的网页计时器暂停风险。此方式会增加内存消耗，因此账号数量暂时限制为 4。

## 5. 多账号隔离

Android 原生 `CookieManager.getInstance()` 在同一应用内默认共享 Cookie，仅创建多个普通 WebView 会发生串号。

本项目使用 AndroidX WebKit Multi-Profile：

- 账号1继续使用 Default Profile，以兼容 v0.1 单账号版已有登录状态。
- 账号2～账号4分别绑定固定命名 Profile。
- Profile 在调用任何 WebView 设置之前通过 `WebViewCompat.setProfile()` 绑定。
- Cookie 操作使用对应 Profile 的 `CookieManager`。
- Profile 名称不可随意修改，否则用户会丢失原有登录状态。

运行时必须先检查 `WebViewFeature.MULTI_PROFILE`。若系统 WebView 不支持，APP 只允许账号1运行，并提示用户更新 Android System WebView 或 Chrome。禁止回退为多个账号共用 Default Profile，因为这会产生静默串号。

## 6. 横竖屏与自适应界面

屏幕方向按账号保存：

- 默认值为横屏。
- 点击“横屏/竖屏”只修改当前账号。
- 切换账号时调用 `setRequestedOrientation()` 恢复该账号方向。
- Manifest 声明了 `orientation|screenSize|smallestScreenSize` 配置变更，因此旋转不会销毁 Activity 或 WebView。

工具栏布局：

- 横屏：账号与操作按钮共用一行，高度 44dp。
- 竖屏：账号按钮一行、操作按钮一行，总高度 76dp。
- Android 15 edge-to-edge 下，由根视图监听 `WindowInsets`，对页面列添加状态栏、刘海、导航栏和手势区安全边距。
- 黑屏状态下隐藏系统栏；退出黑屏后重新申请 Insets。

不要重新使用 Manifest 固定横屏，否则账号级方向设置会失效。

## 7. 状态持久化

状态保存在 `SharedPreferences`：

| 键 | 含义 |
|---|---|
| `active_account` | 最后选择的账号索引 |
| `account_opened_N` | 账号槽位是否曾经打开 |
| `last_url_N` | 账号最后成功页面 |
| `desktop_mode_N` | 账号桌面/手机 User-Agent 模式 |
| `landscape_mode_N` | 账号横屏/竖屏偏好 |

登录状态不保存在 SharedPreferences，而由 WebView Profile 自己持久化 Cookie 和站点存储。APP 不读取、不记录账号密码。

启动恢复流程：

1. 读取最后活动账号及其方向。
2. 检查 Multi-Profile 能力。
3. 恢复所有曾经打开的账号 WebView。
4. 为每个账号加载最后允许的 `sgplay.cc` 地址。
5. 将最后活动账号置于容器最上层。

仅允许保存和恢复 `sgplay.cc` 及其子域地址，其他 URL 会回退到首页。

## 8. 异常恢复设计

### 8.1 加载超时

每次主页面开始加载时生成新的 `loadToken`，并启动 60 秒看门狗。60 秒后如果同一个 token 仍处于加载状态：

1. 停止当前加载。
2. 标记该账号失败。
3. 进入递增重试。

### 8.2 连接或服务器异常

主框架网络错误，或 HTTP 5xx，会触发以下延迟：

```text
3 秒 → 10 秒 → 30 秒 → 60 秒 → 后续保持 60 秒
```

页面成功完成后重试次数归零。手动点击“刷新”或“首页”也会清除旧重试任务。

### 8.3 网络重新可用

`ConnectivityManager.registerDefaultNetworkCallback()` 监听网络恢复。网络可用 1.5 秒后，立即重新加载所有处于失败状态的账号，并取消其旧延迟任务。

### 8.4 渲染进程异常

`onRenderProcessGone()` 返回 `true`，表示 APP 自己处理异常：

1. 移除并销毁异常 WebView。
2. 保留最后成功 URL 和 Profile 数据。
3. 700ms 后用原账号 Profile 创建新 WebView。
4. 自动加载最后页面。

不要在渲染进程消失后继续读取旧 WebView 状态；恢复只能使用此前持久化的数据。

## 9. 黑屏保护

黑屏不是系统熄屏，而是覆盖在所有内容之上的全屏纯黑 View：

- `FLAG_KEEP_SCREEN_ON` 保持设备唤醒。
- 窗口亮度设为 `0f`。
- 隐藏状态栏与导航栏。
- 底层 WebView 不调用 `onPause()`、`pauseTimers()`，也不销毁。
- 连续 3 秒内点击 5 次，或按任意音量键退出。
- Activity 重新获得焦点时，如果仍在黑屏状态，会再次隐藏系统栏。

退出时恢复进入黑屏前的窗口亮度，并重新应用安全区 Insets。

## 10. 网络与安全边界

- APP 只申请 `INTERNET` 和 `ACCESS_NETWORK_STATE`。
- 顶层导航只允许 `sgplay.cc` 及子域；外部跳转会被阻止。
- 文件访问、Content URI、跨文件 URL 访问均关闭。
- 备份和设备迁移排除应用私有数据，避免登录 Cookie 被云端备份。
- 由于目标网站使用 HTTP，`network_security_config.xml` 只对 `sgplay.cc` 及子域开放明文流量，其他域默认禁止。
- HTTP 登录信息存在被同网络攻击者监听或篡改的风险，不应复用重要密码。

## 11. 已知限制

- WebView 是否真正持续执行定时器最终取决于网站实现、系统 WebView 和 HyperOS 资源策略。
- 同时打开 4 个账号会显著增加内存和耗电，应按 1、2、4 个账号逐步压力测试。
- 页面异常检测目前基于主框架错误和超时，不会分析游戏业务状态。
- APP 被系统结束后不能继续挂机；下次启动只能恢复登录状态和最后页面。
- Debug APK 使用 Android Debug 证书，不适合正式分发。正式发布必须使用稳定私有签名。

## 12. 修改原则

1. 不改变现有 Profile 名称和测试包名，除非提供迁移方案。
2. 不把账号密码写入源码、配置、日志或仓库。
3. 新增外部域名前，先确认用途，再最小化修改导航和明文网络白名单。
4. WebView API 必须做系统功能检测，不能假设所有 ROM 支持。
5. 每次修改都运行 `assembleDebug`、`lintDebug`、签名验证和 Civi 4 Pro 回归测试。
6. 版本升级同步更新 `versionCode`、`versionName`、README 和 CHANGELOG。
