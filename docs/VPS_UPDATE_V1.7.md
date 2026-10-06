# Debian VPS 升级到 v1.7.0

v1.7.0 需要同步更新 Android APK 和 VPS 上的 `remote-server`。VPS 只校验、转发白名单命令，不保存账号密码或脚本配置。

## Git 部署

```bash
cd /opt/play-keeper
git fetch --tags
git checkout v1.7.0
cd remote-server
npm ci --omit=dev
npm test
sudo systemctl restart play-keeper-relay
curl -fsS https://keeper.example.com/health
```

健康检查应返回：

```json
{"ok":true,"service":"play-keeper-relay","version":"1.7.0"}
```

## 离线更新包

```bash
mkdir -p /tmp/play-keeper-v1.7.0
tar -xzf PlayKeeper-VPS-v1.7.0.tar.gz -C /tmp/play-keeper-v1.7.0
cd /tmp/play-keeper-v1.7.0/remote-server
npm ci --omit=dev
npm test
```

校对现有 `.env`、systemd 服务和 HTTPS/WSS 反向代理后，用新目录替换服务代码并重启。不要将 `.env`、`ADMIN_TOKEN` 或 `DEVICE_TOKEN` 放入更新包。

## 验收

- 远程页面显示“中断脚本”、拍卖单价和“全选背包存仓”。
- 设备在线后，配置命令可成功回执，且旧 v1.6 Android 客户端仍可连接。
- 手机宽度下控制台不出现水平溢出，挂机辅助存仓可全选背包。

## 回滚

VPS 可切回 `v1.6.0` 并重启。Android 不能使用较低 `versionCode` 覆盖 v1.7.0；紧急修复需发布更高的 `versionCode`。
