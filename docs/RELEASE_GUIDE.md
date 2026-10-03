# 构建、升级与发布指南

## 1. 环境要求

- JDK 17
- Android SDK Platform 35
- Android SDK Build-Tools 35.0.0
- Gradle 8.9（仓库已包含 Wrapper）
- 可访问 Google Maven 或项目中配置的镜像

设置 Android SDK 后执行：

```bash
./gradlew clean assembleDebug lintDebug
```

Debug APK 输出：

```text
app/build/outputs/apk/debug/app-debug.apk
```

## 2. 版本升级规则

每次可安装更新至少修改：

```groovy
defaultConfig {
    versionCode 6
    versionName '0.5.1-select-test'
}
```

- `versionCode` 必须递增，否则 Android 不允许覆盖安装。
- `versionName` 采用语义化版本，测试包可追加 `-test`。
- 不要修改 `applicationId`，否则会安装成另一个 APP，无法继承 Profile 数据。
- Debug 版由 `applicationIdSuffix '.test'` 生成测试包名。

## 3. Debug 构建验证

```bash
./gradlew clean assembleDebug lintDebug
```

必须满足：

- Gradle 输出 `BUILD SUCCESSFUL`。
- Lint 为 0 errors。
- 仅接受已确认不会影响运行的图标兼容提示。

使用 Android Build-Tools 验证：

```bash
apksigner verify --verbose --print-certs app-debug.apk
zipalign -c 4 app-debug.apk
aapt dump badging app-debug.apk
sha256sum app-debug.apk
```

macOS 可使用：

```bash
shasum -a 256 app-debug.apk
```

重点检查：

- 包名为 `com.local.sgplaykeeper.test`。
- `versionCode` 高于上一版。
- 最低 SDK 为 26，目标 SDK 为 35。
- 权限只有网络与网络状态。
- APK 使用 v2 或更高签名方案并通过 zipalign。

## 4. 真机覆盖安装

连接已开启 USB 调试的小米手机：

```bash
adb devices -l
adb install -r app-debug.apk
```

`-r` 表示覆盖安装并保留数据。若签名不同，Android 会拒绝覆盖安装；不要为了解决此问题卸载旧版，除非用户接受所有登录状态被清除。

## 5. 正式签名

正式版不要复用 Debug 签名。创建并离线保管 release keystore，通过本机 `keystore.properties` 或 CI Secret 注入：

```properties
storeFile=/absolute/private/path/play-keeper-release.jks
storePassword=***
keyAlias=play_keeper
keyPassword=***
```

安全要求：

- `keystore.properties`、`.jks` 和密码绝不提交 Git。
- keystore 至少保留两份加密备份。
- 正式版发布后必须永久使用同一签名，才能覆盖升级并保留账号 Profile。
- Release 构建启用前，应在 `app/build.gradle` 中通过环境变量或本地属性配置 signingConfig。

## 6. Civi 4 Pro 发布前矩阵

每个版本至少完成：

1. v0.2 或上一版本覆盖安装，新版能继承账号1登录状态。
2. 账号1横屏、账号2竖屏，来回切换 20 次不串号、不重载。
3. 横屏单行工具栏和竖屏双行工具栏均不与系统栏重合。
4. 黑屏进入/退出各测试 10 次。
5. Wi-Fi 断开 30 秒再恢复，页面自动恢复。
6. 2 个账号连续挂机 8 小时。
7. 4 个账号连续挂机 8 小时并记录内存、温度和掉线情况。
8. 通过后再进行 24 小时测试。
9. 远程页面预览、单击、Safari 后台自动停止和黑屏期间预览通过测试。

测试记录至少包含：

- HyperOS 完整版本
- Android System WebView 和 Chrome 版本
- APP 版本号和 APK SHA-256
- 使用账号数及各账号方向
- 掉线、白屏、重载、串号和发热情况

## 7. Git 工作流

建议每次升级：

```bash
git switch -c feature/short-description
./gradlew clean assembleDebug lintDebug
git add app docs README.md CHANGELOG.md
git commit -m "feat: describe the change"
git push -u origin feature/short-description
```

合并前检查：

- 没有账号、密码、Cookie、keystore 或本地路径。
- 构建产物没有误提交。
- README、CHANGELOG 与版本号一致。
- APK 已通过签名、对齐和包信息检查。
- `remote-server` 变更已执行 `npm test`，且未提交 `.env`、token 或 `node_modules`。

## 8. 回滚原则

- Git 可以回滚源码，但 Android 不能安装更低 `versionCode` 覆盖高版本。
- 紧急回滚时，从稳定提交创建新版本，并继续递增 `versionCode`。
- 不删除或更改 Profile 名称；恢复旧逻辑时也要保留数据兼容。
