# Play Keeper v1.9.3 Windows 开发记录

本版于 Windows 环境构建，使用 JDK 17、Android SDK 35、Build Tools 35.0.0 和 Gradle Wrapper 8.9。

## 本次正式版功能

- 装备交易所页面重入时，按十件白名单和当前价格重新扫描在售列表，恢复本批已上架数量，达到五件上限后直接等待买家，不再误上架第六件。
- 每个账号持久化“装备转移完成时间”“副本队列完成时间”和每日背包物资快照。
- 默认监控 `进化宝石、曙光印记、强化丹A、强化丹B、天仙玉露`，远程页面可自定义、手动刷新；APP 前台运行时每24小时自动刷新一次。
- 远程页面增加 KeepPlayer 启动与退出按钮。退出仅把界面退到后台并保留远程连接，否则 APP 完全终止后无法接收“启动”命令。

## Windows 与 Mac 共用签名

正式 APK 延续用户确认的 v1.9 并行安装包名 `com.local.sgplaykeeper.test.v190`，versionCode 为 24，可覆盖已在两台设备安装并完成测试的 v1.9.0–v1.9.2 并行测试版；它不会覆盖签名不同的 v1.8.x 旧应用。构建使用本机保留的 v1.9 `debug.keystore`，不是新生成的证书。

私钥只保留在本地 `signing/debug.keystore` 和用户目录备份，GitHub 只保存校验指纹和迁移说明。切换到 Mac 前，使用加密介质复制同一个 keystore，并按 `signing/README.md` 校验 SHA-256。这样 Mac 生成的 APK 才能覆盖 Windows 生成的 APK，并保留两台设备上的账号登录数据。
