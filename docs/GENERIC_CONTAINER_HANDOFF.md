# Play Keeper 通用化开发交接

## 开发分支

- 分支：`codex/generic-container-mvp-v1`
- 基线：`codex/v2.0.8-rc2`，提交 `4e4e16e592e4db5e854c844c189d1d92026da39c`
- Android 测试版本：`2.0.8-rc4-candidate`
- applicationId：`com.local.sgplaykeeper.candidate`
- versionCode：`2000804`
- 逐步实现记录：`docs/GENERIC_CONTAINER_DEVELOPMENT_LOG.md`

Windows 或其他 Codex 环境继续开发时：

```bash
git fetch origin
git switch codex/generic-container-mvp-v1
```

## 当前已实现

- 每实例 AndroidX WebKit Profile；Cookie、DOM Storage、IndexedDB、Service Worker 数据与缓存按 Profile 分区。
- 实例级 HTTP/HTTPS 首页与精确 origin 导航限制；HTTP 默认关闭，需逐实例明确允许。
- 最小权限 WebView 默认值：拒绝相机、麦克风、MIDI、受保护媒体和地理位置，关闭第三方 Cookie、混合内容与文件访问。
- 省电、均衡、高性能环境分别驻留 2、4、8 个 WebView，兼容旧高性能设置并支持 renderer 异常自动降级。
- 顶部“账号/脚本”入口改为“实例/自动化”。
- 自动化中心展示 SGPlay 内置适配器与通用只读示例的来源和能力；原 SGPlay 配置与执行流程保持可用。
- URL 策略、环境迁移、自动化清单和热路径性能测试。
- `nodemailer` 安全更新。
- 导入的 workflow 可由用户逐次授权，在当前 WebView 页面运行固定只读动作并显示结构化结果。

## 当前边界

- 自定义清单没有持久化自动启用状态；每次只读运行都需要用户确认。
- 只读执行器只生成内置固定代码，不接受 manifest 提供的任意 JavaScript；尚无暂停/取消和持久化运行历史。
- SGPlay 自动化仍由原 `AutomationCoordinator` 执行。
- 没有伪造 Android ID、GPU、Canvas、传感器、TLS 或网络出口，也不绕过网站限制。

## 下一步

1. 增加显式取消、页面销毁清理和单步总超时。
2. 增加本地 DOM 夹具页面的设备/真机重放测试。
3. 评审是否需要实例级启用状态；继续保留逐次运行确认。
4. 在独立权限和审计设计完成前，不加入点击和输入动作。

## 构建与测试

环境基线为 Java 17、Android SDK 35、Build Tools 35.0.0、Node.js 20+。

```bash
./gradlew --no-daemon test
./gradlew --no-daemon assembleCandidate
npm test --prefix remote-server
npm audit --prefix remote-server --audit-level=moderate
```

Candidate 必须使用历史保留 keystore 才能覆盖已安装版本：

- keystore SHA-256：`bc351381ba0cf1846cad1408373a7b55f6f757f400d941ba3f9edacb14799c9f`
- APK 证书 SHA-256：`11e8c49415512da2ce088b92b1c2161a960744bcb5829507bcd0021fb3cf512f`

私钥不在 Git 中。通过加密渠道获取后放到 `signing/debug.keystore`，构建前核对哈希，构建完成后按本地密钥管理要求处理。不要生成同名新密钥代替。

本轮验证结果：Android 全 build type 单元测试通过，Candidate lintVital/assemble 通过。

本地 rc4 制品因历史 keystore 未在当前环境中，使用了本机 Android Debug 证书（证书 SHA-256：`0cd3ad11938904decf64b396d4b89d88a347e931bfa24ddff0b4e93c0f434c86`）。它不能覆盖由上述历史证书签名的 Candidate；正式共享制品必须取得历史 keystore 后重建，不得通过卸载应用规避签名问题，以免清除候选版本地数据。
