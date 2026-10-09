# Play Keeper v1.9.3

本版以 Windows 开发环境与签名为后续发布基准。

## 更新内容

- 修复装备交易所重入后上架计数丢失，重新统计当前在售目标装备，避免超过五件上限。
- 增加双设备八账号每日装备接力与副本计划。
- 监控页面显示每个账号今日装备转移、副本完成状态，以及 `进化宝石、曙光印记、强化丹A、强化丹B、天仙玉露` 数量。
- 背包监控项目可自定义，可手动刷新，APP 前台运行时每天自动刷新一次。
- 增加 KeepPlayer 一键启动/退出前台按钮。退出前台会保留远程连接，以便再次远程启动。
- 修复并保留买方“一键脱装备 → 一键穿装备 → 十件情改套装复核 → 副本”的正式流程。

## 安装与签名

- 包名：`com.local.sgplaykeeper.test.v190`
- versionCode：`24`
- versionName：`1.9.3`
- APK 签名证书 SHA-256：`11E8C49415512DA2CE088B92B1C2161A960744BCB5829507BCD0021FB3CF512F`
- APK SHA-256：`ED371C6E07F2989C685DCBEA49880BF57ABAB96E46D7560CE86816F012057393`

该包可覆盖两台设备已安装的 v1.9.0–v1.9.2 并行测试版，不覆盖签名不同的 v1.8.x 旧应用。

后续切换到 Mac 开发时，必须从 Windows 通过加密介质复制同一个 `signing/debug.keystore`，并核对 keystore 文件 SHA-256：

`BC351381BA0CF1846CAD1408373A7B55F6F757F400D941BA3F9EDACB14799C9F`

私钥未上传 GitHub；仓库中的 `signing/README.md` 记录了 Windows/macOS 校验方法。
