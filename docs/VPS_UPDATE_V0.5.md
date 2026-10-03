# VPS 更新到 v0.5.1

本次更新不增加端口，不修改 `ADMIN_TOKEN`、`DEVICE_TOKEN` 或 Caddy 域名。公网继续只使用 443，Node.js 继续监听 `127.0.0.1:8080`。

建议让 VPS 上的 Codex 执行以下流程，并根据实际安装目录或服务名调整：

```bash
sudo systemctl stop play-keeper-relay
sudo git -C /opt/play-keeper fetch origin
sudo git -C /opt/play-keeper pull --ff-only origin main
sudo npm --prefix /opt/play-keeper/remote-server ci --omit=dev
sudo npm --prefix /opt/play-keeper/remote-server test
sudo systemctl start play-keeper-relay
sudo systemctl is-active play-keeper-relay
curl -fsS http://127.0.0.1:8080/health
curl -fsS https://你的域名/health
sudo journalctl -u play-keeper-relay -n 80 --no-pager
```

健康接口必须返回版本 `0.5.1`。如果服务器目录由 `playkeeper` 用户拥有，应由 Codex 改用该用户执行 Git 和 npm 操作，避免改变文件所有权。

更新后用浏览器强制刷新一次。如果仍看到旧控制台，清除该站点缓存，确认 HTML 引用的是 `app.js?v=0.5.1`。

回滚时不要降低 Android 的 `versionCode`。VPS 可以切回旧提交，但 v0.5 APK 发出的预览命令需要 v0.5 Relay 才能转发。
