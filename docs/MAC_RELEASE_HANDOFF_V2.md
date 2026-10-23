# Mac 正式发版交接

## v2.0.3-rc2 候选版接续开发

当前断网续传优化候选版的完整验证记录、Mac 重建步骤、独立 Candidate 包名和未完成真机验收边界，见 `V2.0.3_RC2_MAC_HANDOFF.md`。该记录以功能提交 `f29b369` 为基线；v2.0.0-rc2 以下内容继续作为正式签名历史参考。

## v2.0.0-rc2 基线

- 源码提交：`39ea4a0c81bf63467cf98043350359acfc4ca65d`
- 分支 / 标签：`test/v2.0.0-rc2` / `v2.0.0-rc2`
- APK SHA-256：`a7956eef78a54635dd71dc52a847a284f753dce4ce63b92c7be888277f6375d9`
- 主版包名：`com.local.sgplaykeeper.test.v190`
- 基线版本：versionCode 35 / versionName 2.0.0-rc2
- Java 17，Android SDK / Build Tools 35 / 35.0.0，Gradle 8.9，Android Gradle Plugin 8.7.3

## 签名连续性

- 本地路径：`signing/debug.keystore`
- keystore SHA-256：`bc351381ba0cf1846cad1408373a7b55f6f757f400d941ba3f9edacb14799c9f`
- alias：`androiddebugkey`
- store password / key password：`android` / `android`
- 证书 SHA-256：`11e8c49415512da2ce088b92b1c2161a960744bcb5829507bcd0021fb3cf512f`

`*.keystore` 必须保持 Git 忽略，不得上传 GitHub、VPS 发布包或 Release。正式版使用 `assembleRelease`，后续 versionCode 必须大于 35 且主版包名不变。`assembleMacParallel` 仅生成可并行安装的 `com.local.sgplaykeeper.macparallel`，不能升级主版。

密钥应在两个独立的加密存储中各保留一份。迁移 VPS 时另行加密备份 `.env`、`remote-server/data/users.json`、计划状态文件和邮件配置，这些运行数据不进入 Git。
