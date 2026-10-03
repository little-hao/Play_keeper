# 本地安装包目录

APK 属于构建产物，不提交到 Git。运行 `./gradlew assembleDebug` 后，原始测试包位于：

`app/build/outputs/apk/debug/app-debug.apk`

本项目交付时使用的本地文件名：

`PlayKeeper-Civi4Pro-v0.5.1-select-test.apk`

APK 通过 GitHub Release 分发；`dist/*.apk` 已由 `.gitignore` 排除，不提交到源码仓库。
