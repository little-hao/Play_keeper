# 通用网页容器 MVP（v2.0.8-rc2 基线）

## 已落地

- 每个实例使用 AndroidX WebKit `MULTI_PROFILE`；Cookie、DOM Storage、IndexedDB、Service Worker 与 HTTP 缓存由 WebView Profile 分区。
- 长按实例标签可设置独立 HTTPS 首页；导航只允许该首页的精确 origin（协议、主机、端口）及原有 `sgplay.cc` 兼容域。
- 默认拒绝网页摄像头、麦克风、MIDI、受保护媒体等权限；关闭地理位置、第三方 Cookie、混合内容、文件与 Content URI 访问。
- 标准模式最多驻留 4 个 WebView，高性能模式最多 8 个；按 LRU 回收非活跃且无任务的实例，连续渲染进程退出时自动降级。
- URL 策略具有功能测试与 10 万次热路径性能守卫。
- 顶部入口使用“实例”和“自动化”；自动化中心列出内置 SGPlay 适配器与禁用状态的通用只读示例，并明确来源、版本和能力。原 SGPlay 配置与执行逻辑保持可用。
- 实例环境提供省电/均衡/高性能预设，分别驻留 2/4/8 个 WebView；旧高性能布尔设置自动迁移，高性能 renderer 连续退出时自动降级为均衡。

## 隔离边界

WebView Profile 提供浏览器存储与缓存分区，但所有实例仍运行在同一个 Android 应用 UID、同一设备和同一网络出口。Android WebView API 不提供按 Profile 隔离或伪造 GPU、字体、屏幕、传感器、Android ID、TLS/网络指纹的能力。本项目不尝试绕过网站的同 IP、风控或服务端限制。若站点要求更强边界，应使用 Android Work Profile、独立系统用户或独立设备，并遵守站点规则。

实例的显示 UA 只有既有的移动/桌面模式，不构成硬件隔离。网页权限当前采用最小权限的“全部拒绝”基线；后续如增加授权，应按 origin、权限类型和实例逐项提示并可撤销。

## 插件兼容性结论

同仓库扩展分支中的 Manifest V3 插件申请 `debugger`，host 权限限于 `sgplay.cc` 与许可证站点。`god-planner-core.js` 的经验曲线、解析、筛选和规划函数是可复用纯逻辑；应以 Java/Kotlin 端口或受控脚本模块集成并保留向量测试。

`background.js` 的 `chrome.debugger`、`Input.dispatchMouseEvent`、扩展消息与 service worker API 无法直接在 Android WebView 使用。DOM 事务脚本依赖游戏当前选择器和页面文本，必须作为站点适配器、仅在用户明确启用后运行；每个有副作用步骤都要保留前置观察、幂等检查、超时、可取消和结果复核。许可证客户端依赖 WebCrypto/P-256 与服务器接口，不应把私钥或绕过逻辑移入 APP。

## 性能验证

主机侧：`./gradlew --no-daemon test` 会运行 URL 策略功能测试和 10 万次性能守卫。

真机侧建议分别测试 1、4、8 实例，各运行 30 分钟：

1. 记录 `dumpsys meminfo` 的 PSS、WebView renderer 数量和峰值；
2. 用 Perfetto 记录 CPU 时间、主线程长任务、网络与唤醒；
3. 用 Battery Historian/`batterystats` 比较前台可见、黑屏覆盖、后台三种场景；
4. 记录热状态、渲染进程退出数、页面恢复耗时和脚本成功率；
5. 验收门槛应按目标机型建立基线，8 实例若出现连续 renderer 回收必须保持自动降级。

当前没有在本开发机连接 Android 真机，因此没有捏造内存、耗电或续航数字。

## iOS 可行性

iOS 的 `WKWebsiteDataStore` 可为非持久会话建立隔离存储，但持久多实例并没有与 Android WebView Profile 完全等价、可任意命名的公开容器接口。可行实现是每个实例独立 `WKWebViewConfiguration`/data store，受限脚本通过 `WKUserScript` 与 message handler 执行；后台长期运行、定时唤醒和多实例挂机会受 iOS 生命周期与 App Store 审核约束，不能承诺 Android 同等能力。摄像头、麦克风等仍需系统与站点双重授权。

## 下一迭代

1. 把扩展纯逻辑抽成带固定输入/输出 JSON schema 的模块，并移植现有测试向量。
2. 增加脚本清单：站点 origin、所需能力、版本、哈希、用户授权与撤销；禁止任意远程代码静默执行。
3. 建立录制/重放测试夹具，脱敏保存 DOM 快照、动作、预期观察和时序，不保存 Cookie/令牌/输入框秘密。
4. 控制台改成模块化面板，区分实例状态、权限、脚本、日志、性能与人工确认。
5. 加入 Android Macrobenchmark/真机 Perfetto CI，再依据数据调整驻留上限、预览帧率与后台策略。
