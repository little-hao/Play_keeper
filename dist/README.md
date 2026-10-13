# 本地安装包目录

APK 属于构建产物，不提交到 Git。当前 Android 10+ 可安装包为：

`PlayKeeper-Android10Plus-v1.10.7.apk`

Mac 当前可安装的平行版为：

`PlayKeeper-MacParallel-Android10Plus-v1.10.4.apk`

包名固定为 `com.local.sgplaykeeper.macparallel`，可与 Windows 签名的 v1.10.7 正式线路同时安装。Windows 后续从同一源码运行 `assembleRelease` 时仍生成原 `com.local.sgplaykeeper.test.v190` 升级线路。

其 SHA-256 校验值保存在同名 `.sha256` 文件中。原始构建产物位于：

`app/build/outputs/apk/macParallel/app-macParallel.apk`

APK 通过 GitHub Release 分发；`dist/*.apk` 已由 `.gitignore` 排除，不提交到源码仓库。
