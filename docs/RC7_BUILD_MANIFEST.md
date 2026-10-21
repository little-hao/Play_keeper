# rc7 本地候选制品

构建日期：2026-10-21。基线提交 187b66a 加本轮工作区修改；尚未提交、推送或部署。

| 制品 | SHA-256 |
| --- | --- |
| PlayKeeper-Android10Plus-v2.0.2-rc7.apk | 72903b231e565a4d484d912ddbff7931fc4494b49b4eea2f29abe4a8791506c5 |
| PlayKeeper-VPS-v2.0.2-rc7.tar.gz | 994f16d48d721d7941453d68c08eca282131b6b58d6a9a143c674d0d220b22de |

均位于 dist；APK 版本 2.0.2-rc7 / 44，包名 com.local.sgplaykeeper.test.v190。
签名检查通过，使用原保留密钥，不包含密钥于 VPS 包。
VPS 包使用显式白名单，包含服务源码、网页、测试、样本适配器源文件与验收文档；不包含 .env、data、node_modules 或任何用户凭据。

已验证：Android 22 个单元测试、lint（0 错误/6 警告）、release 构建；Node 47 个测试；390px/1440px 本地浏览器交互与布局检查。
验收细节与未测场景见 RC7_ACCEPTANCE.md。候选包不代表生产修复已验收，不自动部署。

后续开发使用完整 Git 工作区，不应仅保存 APK 哈希。恢复开发需源码及锁文件、JDK 17、Android SDK 35/Build Tools 35.0.0、Node >=20，以及安全独立保存的原签名材料。VPS 用户与计划状态另行备份，不提交到源码仓库。
