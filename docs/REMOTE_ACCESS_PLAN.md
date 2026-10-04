# 远程连接方案

状态：v1.2.0 已实现状态、白名单命令、三档 WebView 预览、横竖屏等比适配、受控单击、HTML 选择项桥接，以及拍卖/商店卖出/圣殿守护和30分钟战斗统计监控；等待 Civi 4 Pro 真机全流程验证。

目标是通过 iPhone Safari 或桌面网页远程查看并控制 Play Keeper，而不是接管整台 Android 手机。

## 1. 结论

推荐采用“云端轻量中继 + Web 控制台 + Android 主动出站连接”：

```text
小米 Civi 4 Pro / Play Keeper
        │
        │  WSS / TLS 443，主动连接
        ▼
  Play Keeper Relay API
        ▲
        │  HTTPS + WSS
        │
iPhone Safari PWA / 电脑浏览器
```

第一版只传输状态和明确的控制命令，不传输完整系统画面。此方案具有以下优势：

- Android 位于家庭 Wi-Fi、移动网络或运营商 NAT 后都能连接。
- 手机不需要公网 IP、端口映射或常驻本地 HTTP 端口。
- iPhone 不需要安装原生客户端，Safari 打开网页即可使用。
- 不使用 Android MediaProjection，因此启动连接时不需要现场点击录屏确认。
- 仅控制 Play Keeper 自身功能，不需要无障碍或设备管理员权限。
- VPS 只负责转发小体积状态和命令，资源占用远低于服务器运行 Chromium。

## 2. 方案比较

| 方案 | iOS/网页 | 无人值守 | 画面 | 功耗 | 结论 |
|---|---|---:|---:|---:|---|
| WSS 状态与命令 | Safari、任意浏览器 | 是，APP运行时 | 无 | 低 | 第一阶段推荐 |
| WSS 低帧率网页预览 | Safari、任意浏览器 | 可行 | 本 APP 页面 | 中 | 第二阶段原型 |
| WebRTC + MediaProjection | Safari、网页 | 否，每次需系统确认 | 整个屏幕 | 高 | 不作为主方案 |
| Tailscale + 本地网页 | iOS需安装Tailscale | 可行 | 取决于实现 | 中 | 私有网络备选 |
| TeamViewer/AirDroid | 依赖第三方客户端 | Civi 4 Pro 已验证受限 | 整机 | 中高 | 不继续投入 |

Android 官方要求 Android 14+ 每次 MediaProjection 捕获会话重新获得用户同意，且 Android 15+ 不允许从 `BOOT_COMPLETED` 启动媒体投影前台服务。因此整机录屏无法作为可靠的无人值守入口：

- https://developer.android.com/media/grow/media-projection
- https://developer.android.com/develop/background-work/services/fgs/service-types

## 3. 第一阶段：远程状态与控制

### 3.1 网页显示内容

- 设备在线/离线及最后心跳时间
- APP 版本、HyperOS/Android 版本、System WebView 版本
- 当前活动账号
- 4 个账号的已打开、加载中、正常、异常、等待重试状态
- 各账号最后成功 URL、桌面/手机模式和横竖屏设置
- 是否处于黑屏保护
- 电池电量、充电状态、温度、电压、电流、估算功率
- Android 热状态和网络类型
- 最近异常和自动恢复记录

### 3.2 允许的远程命令

第一版只实现白名单命令：

```text
switch_account(accountIndex)
reload_account(accountIndex)
open_home(accountIndex)
set_browser_mode(accountIndex, desktop|mobile)
set_orientation(accountIndex, landscape|portrait)
enter_black_screen()
exit_black_screen()
request_status()
preview_start(accountIndex, maxWidth, fps)
preview_stop()
pointer_tap(accountIndex, x, y, frameSequence)
select_option(accountIndex, elementToken, optionIndex)
configure_auto_auction(accountIndex, enabled, items, buyer, intervalHours)
run_auto_auction(accountIndex)
configure_store_sell(accountIndex, enabled, items, intervalHours)
run_store_sell(accountIndex)
configure_temple_guard(accountIndex, enabled)
run_temple_guard(accountIndex)
configure_equipment_transfer(accountIndex, items, price, buyer)
run_equipment_sell(accountIndex)
run_equipment_buy(accountIndex)
```

每条命令包含：

- 唯一 commandId
- 目标 deviceId
- 创建时间和过期时间
- 命令名称和严格校验后的参数
- 操作者身份
- 服务端签名或会话鉴权信息

Android 执行后返回 `accepted / completed / failed / expired`，网页不能只根据“发送成功”判断执行结果。

### 3.3 明确禁止

- 不允许网页发送任意 JavaScript 给 WebView 执行。
- 不允许网页下发任意 URL。
- 不开放 shell、ADB、文件系统或系统设置权限。
- 不传输账号密码、Cookie、LocalStorage 或登录令牌。
- 不提供没有超时限制的远程输入通道。

## 4. 第二阶段：网页画面预览（v0.5 已实现原型）

第一阶段稳定后，原型验证本 APP 自有 WebView 捕获：

1. 在 Android 内将目标 WebView 绘制到 RGB_565 Bitmap。
2. 最大宽度可选 720、1280 或 2560px，保持原始宽高比。控制台根据帧宽高动态切换 portrait/landscape 容器，并用 `object-fit: contain` 展示完整画面。
3. 编码为 JPEG，对应最高 1、0.33 或 0.1 帧/秒，单帧最大 2.5 MiB。
4. 仅在远程页面打开预览时传输。
5. 浏览器隐藏、断开、用户停止或最后一个预览控制者离线时自动停止。

此方式只捕获 APP 自己拥有的 WebView，不使用系统 MediaProjection。必须在 Civi 4 Pro 验证以下问题：

- 硬件加速 WebView 是否能稳定绘制，是否出现白屏。
- 黑屏遮罩期间能否直接绘制底层 WebView。
- 非当前账号 WebView 是否能正确生成快照。
- 编码耗时、CPU、温度和每小时流量。

如果 `WebView.draw(Canvas)` 不可靠，可尝试 PixelCopy 捕获当前窗口；但窗口处于黑屏时 PixelCopy 只会得到黑色画面，因此它不能单独满足需求。

## 5. 第三阶段：远程点击（v0.5 已实现单击原型）

当前单击原型遵循：

- 网页发送归一化坐标 `x: 0..1, y: 0..1`。
- Android 根据目标 WebView 实际尺寸映射坐标。
- APP 内部向自己的 WebView 分发受控触摸事件。
- 点击必须携带最新截图序号；落后超过 5 帧或账号变化后拒绝。
- 远程控制必须在 Android 端设置中显式启用。
- 每次点击写入本地审计记录，但不记录网页输入内容。

键盘输入、拖动、多点触控和文件上传后置处理。第一版远程点击不得包含通用文字注入，避免密码和聊天内容泄漏。

HTML `<select>` 是特殊情况：WebView 会把它渲染为 Android 原生弹窗，无法出现在 WebView 截图中。v0.5.1 在点击命中 `select` 时读取其选项，在控制台显示远程选择面板，并用短时 DOM token 把选定索引回写到同一元素。选项最多 200 个、单项文字最多 120 字符。

## 5.1 远程脚本配置（v1.3）

- 控制台从当前活动账号的 telemetry 读取脚本状态，不在 VPS 持久化脚本配置。
- `configure_auto_auction` 接受1–10种、单项不超过30字的拍卖名称、1–168小时和安全字符组成的买家名；默认名称为进化宝石/曙光印记。
- `configure_store_sell` 当前只接受单项金币券及1–168小时定时间隔；VPS 无法借此请求卖出任意道具。
- `run_auto_auction`、`run_store_sell` 和 `run_temple_guard` 只是要求 Android 开始一次检查；最终结果以 Android 脚本状态和操作日志为准。
- Relay 不会生成或转发任意 JavaScript；自动化脚本固定编译在 APK 中。
- `configure_equipment_transfer` 仅接受1–10个装备名、1–9999999单价和安全字符组成的玩家ID；卖方执行时玩家ID不得为空。
- `run_equipment_sell` 与 `run_equipment_buy` 只启动 Android 内置受限流程，VPS 不接收密码、任意选择器或脚本。

## 6. 服务器建议

### 6.1 当前实现与推荐部署

- 一个低配 VPS
- Caddy 或 Nginx 提供 HTTPS/WSS
- 仓库 `remote-server` 中的 Node.js 20+ 服务负责设备连接、鉴权、命令路由和静态网页
- 当前状态仅保存在内存，不使用数据库；服务重启后设备自动重连并重新上报
- 第二阶段如采用 WebRTC，再增加 coturn；第一阶段不需要

### 6.2 Android 连接策略

- 使用 OkHttp WebSocket 主动连接 `wss://domain/device`。
- 仅在 Play Keeper Activity 前台和黑屏保护状态保持连接。
- 心跳建议 30 秒一次。
- 断线按 2、5、15、30、60 秒递增重连。
- 网络变化时立即重新建立连接。
- 状态变化即时上报；稳定状态每 60 秒汇总上报一次。
- 第一阶段不创建额外前台服务，避免新增常驻通知和后台限制。

如果未来要求 APP 退到后台后仍远程在线，需要单独评估 Android 14+ 前台服务类型、权限、耗电和应用商店合规，不应直接复用当前前台 Activity 方案。

## 7. 鉴权、配对与安全

### 7.1 v0.5 当前鉴权

- Relay 启动时从环境变量读取不同的 `DEVICE_TOKEN` 与 `ADMIN_TOKEN`，两者均至少 16 位。
- Android 使用 `DEVICE_TOKEN` 连接 `/device`，网页使用 `ADMIN_TOKEN` 连接 `/control`。
- Android 的 token 使用 Keystore AES-GCM 加密落盘；网页 token 只保存在标签页会话存储。
- Relay 不把 token、遥测或操作记录写入磁盘。
- 该方式适合单用户测试。多个不互信用户共用服务前必须升级为逐设备凭据和用户账号体系。

### 7.2 后续二维码配对方案

1. Android APP 生成设备密钥并保存到 Android Keystore。
2. APP 显示一次性二维码和 8 位配对码，5 分钟过期。
3. 用户在 iPhone Safari 登录控制台并扫描二维码或输入配对码。
4. 服务端绑定用户与 deviceId，并签发可撤销设备凭据。
5. 后续不再传输配对码。

### 7.3 安全要求

- 全部流量使用 TLS 1.2+，禁止明文 WebSocket。
- 控制台账号启用 Passkey 或 TOTP 二次验证。
- 设备凭据使用 Android Keystore 保存，不写入 SharedPreferences 明文。
- 远程命令必须短时有效并防重放。
- 设备端提供“立即断开远程连接”和“撤销所有配对”。
- 服务端不持久化网页截图；截图只做内存转发。
- 所有控制命令保留时间、操作者、结果和设备记录。
- 远程控制开启时，Android 工具栏显示明确的在线状态。

## 8. 协议草案

Android 首次连接：

```json
{
  "type": "device.hello",
  "deviceId": "PK-ABCDEF123456",
  "token": "DEVICE_TOKEN",
  "appVersion": "1.2.0"
}
```

Android 上报：

```json
{
  "type": "telemetry.update",
  "deviceId": "device-public-id",
  "timestamp": 0,
  "payload": {
    "app": {
      "versionCode": 8,
      "activeAccount": 0,
      "blackScreen": true
    },
    "battery": {
      "levelPercent": 99,
      "temperatureC": 34.2,
      "currentNowMa": 620,
      "estimatedPowerW": 2.6
    },
    "accounts": []
  }
}
```

网页向 Relay 请求：

```json
{
  "type": "command.send",
  "deviceId": "PK-ABCDEF123456",
  "command": "reload_account",
  "parameters": { "accountIndex": 1 }
}
```

Relay 校验后向 Android 下发：

```json
{
  "type": "command.request",
  "commandId": "uuid",
  "deviceId": "device-public-id",
  "expiresAt": 0,
  "command": "reload_account",
  "parameters": {
    "accountIndex": 1
  }
}
```

当前实现使用固定命令表和逐命令参数校验，未知命令或非法账号索引直接拒绝。未来协议增加可选字段时应引入版本号和 JSON Schema，同时保持旧客户端兼容。

## 9. 实施顺序

### v0.4：耗电监控与远程命令 MVP（已完成）

- 电池与热状态采集
- APP 内状态条和详情面板
- Android WSS 客户端
- VPS Relay API
- iPhone Safari PWA
- 双密钥鉴权、设备状态、白名单命令和当前会话操作日志

尚未完成：1 分钟聚合、7 天本地历史、二维码配对、长期审计和主动推送提醒。

### v0.5.1：按需页面快照、单击与选择项（已完成原型）

- 单张截图请求
- 低帧率预览
- 带宽、CPU和温度保护
- 归一化坐标点击
- 截图序号校验
- 断线自动停止预览
- HTML select 远程选项桥接
- 720/1280/2560 三档画质

### v0.6：交互与真机稳定性

- Civi 4 Pro 黑屏期间截图可靠性验证
- 滑动与长按控制锁设计
- 温度过高时自动降帧或停止预览

## 10. 第一阶段验收标准

- 手机仅主动访问服务器 443 端口，无需端口映射。
- iPhone Safari 和桌面浏览器均可登录。
- 黑屏保护期间仍能收到状态并执行刷新、切号等命令。
- 命令端到端响应时间在正常网络下小于 2 秒。
- 断网恢复后 60 秒内自动重连。
- 未配对账号无法枚举或控制设备。
- 服务端下线不影响本地挂机功能。
- 开启远程状态连接后的额外平均耗电有明确实测记录。
