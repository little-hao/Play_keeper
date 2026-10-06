# 本地安装包目录

APK 属于构建产物，不提交到 Git。当前 Android 10+ 通用正式包为：

`PlayKeeper-Android10Plus-v1.7.1.apk`

其 SHA-256 校验值保存在同名 `.sha256` 文件中。原始构建产物位于：

`app/build/outputs/apk/release/app-release.apk`

APK 通过 GitHub Release 分发；`dist/*.apk` 已由 `.gitignore` 排除，不提交到源码仓库。
