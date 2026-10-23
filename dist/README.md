# 本地安装包目录

APK 属于构建产物，不提交到 Git。当前 Android 10+ 可安装包为：

`PlayKeeper-Android10Plus-v2.0.3.apk`（正式版，可覆盖现有正式安装）

配套 VPS 服务包为：

`PlayKeeper-VPS-v2.0.3.tar.gz`（正式版配套服务，尚未部署生产）

正式 APK 包名为 `com.local.sgplaykeeper.test.v190`，沿用原签名，可覆盖安装 v2.0.2 正式版。已安装的 `com.local.sgplaykeeper.candidate` 候选版仍可并存，二者设置和 WebView 会话相互独立。

Mac 当前可安装的平行版为：

`PlayKeeper-MacParallel-Android10Plus-v1.10.4.apk`

包名固定为 `com.local.sgplaykeeper.macparallel`，可与 Windows 签名的 v2.0 候选线路同时安装。Windows 后续从同一源码运行 `assembleRelease` 时仍生成原 `com.local.sgplaykeeper.test.v190` 升级线路。

其 SHA-256 校验值保存在同名 `.sha256` 文件中。原始构建产物位于：

`app/build/outputs/apk/release/app-release.apk`

APK 通过 GitHub Release 分发；`dist/*.apk` 已由 `.gitignore` 排除，不提交到源码仓库。
