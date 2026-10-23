# 本地安装包目录

APK 属于构建产物，不提交到 Git。当前 Android 10+ 可安装包为：

`PlayKeeper-Android10Plus-v2.0.3-rc2.2-candidate.apk`（独立安装候选版，尚未部署）

配套 VPS 服务包为：

`PlayKeeper-VPS-v2.0.3-rc2.tar.gz`（配套候选版，尚未部署生产）

候选 APK 的包名为 `com.local.sgplaykeeper.candidate`，桌面名称为“Play Keeper 候选版”，可与包名 `com.local.sgplaykeeper.test.v190` 的正式版同时安装。两个 APP 的设置和 WebView 会话相互独立，候选版首次安装需单独填写远程连接。

Mac 当前可安装的平行版为：

`PlayKeeper-MacParallel-Android10Plus-v1.10.4.apk`

包名固定为 `com.local.sgplaykeeper.macparallel`，可与 Windows 签名的 v2.0 候选线路同时安装。Windows 后续从同一源码运行 `assembleRelease` 时仍生成原 `com.local.sgplaykeeper.test.v190` 升级线路。

其 SHA-256 校验值保存在同名 `.sha256` 文件中。原始构建产物位于：

`app/build/outputs/apk/candidate/app-candidate.apk`

APK 通过 GitHub Release 分发；`dist/*.apk` 已由 `.gitignore` 排除，不提交到源码仓库。
