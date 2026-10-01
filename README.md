# Play Keeper / SG多账号挂机 Android 测试版

这是针对小米 Civi 4 Pro / HyperOS 优化的多账号网页挂机 APP，固定打开：

`http://sgplay.cc/home.html#/`

## v0.3.0 更新

- 每个账号单独保存横屏/竖屏偏好，切换账号时自动恢复
- 横屏采用单行紧凑工具栏，竖屏自动调整为双行工具栏
- 工具栏自动避开状态栏、刘海和底部手势区
- 4 个独立账号槽位，Cookie、缓存和站点存储互相隔离
- 已开启过的账号会在下次启动时自动恢复
- 每个账号分别保存最后页面和桌面/手机显示模式
- 页面加载超过 60 秒会自动重载
- 连接异常按 3、10、30、60 秒递增重试
- 网络恢复后自动重载失败页面
- WebView 渲染进程崩溃或被系统回收后自动重建对应账号
- 重写黑屏保护：纯黑全屏、最低亮度、隐藏系统栏
- 黑屏时连续点击屏幕 5 次或按任意音量键恢复

## 多账号使用方法

1. 打开“账号1”，登录第一个账号并进入挂机页面。
2. 点击“账号2”，登录第二个账号；账号之间不会共用登录 Cookie。
3. 按相同方法使用账号3、账号4。
4. 已打开的账号网页实例会保留在 APP 内，点击账号按钮可以随时切换。
5. 点击“横屏/竖屏”为当前账号设置显示方向；设置会自动保存。
6. 全部设置完成后点击“黑屏”开始低亮度挂机。

账号隔离依赖较新的 Android System WebView。如果 APP 提示“不支持账号隔离”，请先在系统应用商店或 Google Play 更新 Android System WebView/Chrome，再重新打开 APP。

## 当前安装包

`dist/PlayKeeper-Civi4Pro-v0.3.0-test.apk`

测试版包名仍为 `com.local.sgplaykeeper.test`，版本号为 `3`，可覆盖安装 v0.1/v0.2 测试版，并保留原有 WebView 登录数据。

## 小米建议设置

1. 设置 → 应用设置 → 应用管理 → SG多账号挂机。
2. 省电策略设为“无限制”。
3. 允许后台活动并开启自启动。
4. 在最近任务界面锁定 APP。
5. 建议长期挂机时接入低功率充电，并留意机身温度。

## 重要限制

- 黑色遮罩不等于真正熄屏；APP 会保持屏幕和前台 WebView 工作。
- 按电源键熄屏、切到其他 APP 或被 HyperOS 强制结束后，网页持续运行无法保证。
- 同时打开 4 个账号会明显增加内存占用，建议先测试 2 个账号，再逐步增加。
- `sgplay.cc` 使用明文 HTTP，账号通信存在被监听或篡改的风险，请勿复用重要密码。
- APP 不保存明文账号密码；登录状态由各账号 WebView Profile 的 Cookie 和站点存储保存。

详细步骤见 `docs/CIVI4_PRO_TEST_PLAN.md`。

## 开发文档

- `docs/DEVELOPMENT.md`：架构、核心实现、状态模型、异常恢复与安全约束
- `docs/RELEASE_GUIDE.md`：版本升级、构建、签名、验证和发布流程
- `docs/CIVI4_PRO_TEST_PLAN.md`：小米 Civi 4 Pro 回归测试方案
- `CHANGELOG.md`：版本变更记录

## 源码构建

项目使用 Android Gradle Plugin 8.7.3、Gradle 8.9、JDK 17、Android SDK 35 和 AndroidX WebKit 1.12.0：

`./gradlew assembleDebug`
