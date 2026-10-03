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
- 前台采集设备电池与热状态，并可通过加密出站连接上报。
- 允许 iPhone Safari/桌面浏览器执行严格白名单内的 APP 操作。

非目标：

- 不保存或自动填写账号密码。
- 不绕过网站登录、安全验证或挂机规则。
- 不承诺按电源键熄屏、退到后台或被 HyperOS 杀进程后网页仍持续运行。
- 不提供整机画面、任意坐标注入、键盘注入、ADB、shell 或系统级远控；只允许用户在最新 WebView 预览上执行受控单击。

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
│   ├── MainActivity.java         UI、WebView 会话与命令执行
│   ├── BatteryMonitor.java       15 秒实时电池/热状态采样
│   ├── RemoteConfigStore.java    WSS 配置与 Keystore 密钥存储
│   └── RemoteConnectionManager.java  WSS 鉴权、遥测、命令与重连
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

仓库根目录的 `remote-server/` 是独立 Node.js 20+ 服务：

```text
remote-server/
├── server.js                     HTTP 静态站点、设备/控制端 WSS 中继
├── public/                       iPhone/桌面响应式控制台
├── test/protocol.test.js         鉴权、遥测、命令回执协议测试
├── Caddyfile.example             HTTPS/WSS 反向代理示例
└── play-keeper-relay.service.example  systemd 示例
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
│   ├── 横屏或竖屏
│   ├── 实时电量与温度
│   └── 远程连接状态/设置
├── WebView 容器
│   ├── Session 0 → Default Profile
│   ├── Session 1 → sgplay_account_2
│   ├── Session 2 → sgplay_account_3
│   └── Session 3 → sgplay_account_4
└── 全屏黑色遮罩
```

远程链路与本地挂机解耦：`MainActivity` 继续直接管理 WebView；`RemoteConnectionManager` 只把状态序列化为 JSON，并将通过白名单验证后的命令回调到主线程。服务器故障、密钥错误或网络断开都不能停止 WebView 或触发 Activity 退出。

```text
Play Keeper ── WSS /device ── Relay ── WSS /control ── Safari
     │                            │
     └─ 设备密钥                  └─ 管理密钥
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
- 远程端点只接受 `wss://`；设备密钥用 Android Keystore 中的 AES-GCM 密钥加密后存入偏好。
- Relay 使用不同的 `DEVICE_TOKEN` 和 `ADMIN_TOKEN` 对设备与控制台分别鉴权。
- 远程命令只允许固定名称与严格参数；服务端生成 UUID，并设置 30 秒过期时间。
- 管理端限速为每连接每分钟 30 条命令，消息体上限 256 KiB。
- 控制台管理密钥只存入浏览器 `sessionStorage`；关闭标签页后清除。
- 遥测只包含设备、APP、账号槽位和电池状态，不包含密码、Cookie 或网页存储。

## 11. 耗电与远程状态

`BatteryMonitor` 每 15 秒读取一次 Android 提供的整机电池数据。当前电流、电量计数等字段在 ROM 不支持时必须保持 `null`/“不可用”，不能用 0 代替。功率按电池电压与瞬时电流估算，代表电池净流入/流出，不是 Play Keeper 单个进程的精确功耗。

`RemoteConnectionManager` 使用 OkHttp WebSocket：

- 连接建立后发送 `device.hello`，鉴权成功才允许上报或执行命令。
- OkHttp 每 30 秒发送协议级 Ping。
- 断线按 2、5、15、30、60 秒重连；成功后归零。
- 服务器拒绝密钥后停止自动重试，避免错误凭据持续请求。
- 状态变化和每次电池采样都会发送最新完整快照。
- 所有命令在 Android 主线程执行，并返回明确成功/失败结果。

允许的命令固定为：`switch_account`、`reload_account`、`open_home`、`set_browser_mode`、`set_orientation`、`enter_black_screen`、`exit_black_screen`、`request_status`、`preview_start`、`preview_stop`、`pointer_tap`、`select_option`。不要新增任意 URL、JavaScript 或系统命令入口。

## 12. 页面预览、账号名称与远程单击

- 浏览器发送 `preview_start` 后，Android 在主线程把目标 WebView 绘制到 RGB_565 Bitmap。
- 支持 720/1280/2560 三档最大宽度，对应 1/0.33/0.1 FPS；目标是按需查看细节而不是高分辨率实时串流。
- 图片使用 JPEG 压缩，按分辨率选择 55～72 初始质量；超过 2.5 MiB 时降到 42，仍超限则丢弃该帧。
- 截图通过 WSS Base64 JSON 传输；Relay 只校验并转发，不保存。
- 浏览器隐藏、主动停止或最后一个预览控制连接断开时，Relay 向 Android 下发 `preview_stop`。
- `pointer_tap` 只接受 0～1 的归一化坐标、目标账号和截图序号；超过最近 5 帧的点击拒绝执行。
- Android 将坐标映射到自己的 WebView 并直接分发一次 DOWN/UP，不需要无障碍或 MediaProjection 权限。
- HTML `select` 在 WebView 中通常显示为 Android 原生弹窗，该弹窗不属于 WebView Bitmap。点击前先用 `elementFromPoint()` 检测；若命中 `select`，Android 返回经过截断的选项列表，而不触发原生弹窗。
- 网页选择后发送元素短时 token 和 option 索引；Android 重新定位同一个 `select`、设置 `selectedIndex`，并触发冒泡的 `input/change` 事件。
- 账号登录名称通过限定 DOM 选择器读取；自动识别失败时，用户可长按 Android 账号按钮手动设置。
- 黑屏仍是 Activity 前台常亮状态。遮罩只覆盖显示，预览直接绘制底层 WebView；该能力必须在 Civi 4 Pro 真机验证。

## 13. 已知限制

- WebView 是否真正持续执行定时器最终取决于网站实现、系统 WebView 和 HyperOS 资源策略。
- 同时打开 4 个账号会显著增加内存和耗电，应按 1、2、4 个账号逐步压力测试。
- 页面异常检测目前基于主框架错误和超时，不会分析游戏业务状态。
- APP 被系统结束后不能继续挂机；下次启动只能恢复登录状态和最后页面。
- Debug APK 使用 Android Debug 证书，不适合正式分发。正式发布必须使用稳定私有签名。
- WebView 硬件渲染在部分 ROM 上可能导致 `draw(Canvas)` 截图空白，需以 Civi 4 Pro 实测为准。
- v0.5 远程只支持单击，不支持拖动、多点触控、键盘、文件上传或声音。
- Activity 不在运行时，当前版本不会额外启动前台服务维持远程在线。
- 实时监控尚未保存 7 天历史；历史图表和告警阈值属于后续版本。

## 14. 修改原则

1. 不改变现有 Profile 名称和测试包名，除非提供迁移方案。
2. 不把账号密码写入源码、配置、日志或仓库。
3. 新增外部域名前，先确认用途，再最小化修改导航和明文网络白名单。
4. WebView API 必须做系统功能检测，不能假设所有 ROM 支持。
5. 每次修改都运行 `assembleDebug`、`lintDebug`、签名验证和 Civi 4 Pro 回归测试。
6. 版本升级同步更新 `versionCode`、`versionName`、README 和 CHANGELOG。
7. 修改远程协议后必须同时更新 Android、Relay、网页控制台并运行 `npm test`。
