# Play Keeper 远程中继服务

该目录提供 v0.5 的远程连接服务和适配 iPhone Safari 的网页控制台。安卓 APP 主动建立加密 WebSocket 连接，因此不需要手机公网 IP，也不需要在 HyperOS 上开放入站端口。

## 本地启动

要求 Node.js 20 或更高版本：

```bash
npm install
ADMIN_TOKEN='生成一个至少16位的管理密钥' \
DEVICE_TOKEN='生成另一个至少16位的设备密钥' \
node server.js
```

浏览器打开 `http://127.0.0.1:8080`。生产环境必须通过 HTTPS/WSS 使用，示例 `Caddyfile.example` 会自动申请证书并反向代理到本服务。

## 手机上填写

- WSS 地址：`wss://keeper.example.com/device`
- 设备密钥：服务器环境变量 `DEVICE_TOKEN`
- 网页管理密钥：服务器环境变量 `ADMIN_TOKEN`

管理密钥和设备密钥必须不同。网页管理密钥仅保存在 Safari 的 `sessionStorage`，关闭标签页即清除；安卓设备密钥使用 Android Keystore 加密保存。

## 安全边界

- 只允许固定的 APP 内命令，不支持任意网址、脚本、系统命令或整机远控。
- 设备与控制台分别鉴权；管理端每分钟最多发送 180 条命令，以支持受控单击。
- 状态只保存在内存，不写数据库；服务重启后由设备重新上报。
- v0.5 只传输 Play Keeper 自有 WebView 的按需压缩截图，不使用整机录屏。
- 截图只在内存中转发，不写入磁盘；单帧解码大小最多 700 KiB。
- 远程只支持单击，不支持滑动、键盘输入或其他 APP。
- Android 14 的整机屏幕捕获每个会话仍需用户授权，不适合无人值守挂机。

运行协议测试：

```bash
npm test
```
