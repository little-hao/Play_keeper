# Debian VPS 升级到 v1.3.0-equipment-test

本版需同时更新 Android APP 和 VPS Relay，否则新增的装备上架/购买命令会被旧服务器拒绝。

```bash
cd /opt/Play_keeper
git fetch --tags origin
git pull --ff-only origin main
cd remote-server
npm ci --omit=dev
npm test
sudo systemctl restart play-keeper
curl -fsS http://127.0.0.1:8080/health
```

健康检查应返回 `1.3.0-equipment-test`。然后用 iPhone/电脑浏览器强制刷新控制台，确认顺序为：基础按钮、手机画面、一键脚本。

回滚 VPS 时可切回 v1.2.0 标签并重启服务，但 Android `versionCode` 不能降级覆盖；需在新版本号上修复或卸载后重装。
