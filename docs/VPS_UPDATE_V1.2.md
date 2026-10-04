# Debian VPS 升级到 Play Keeper v1.2.0

Android 与 VPS Relay 必须一起升级。v1.2.0 的 `configure_store_sell` 新增定时开关和执行间隔；旧 Relay 会拒绝新版参数。

## 交给 VPS Codex 的提示

```text
请在 Debian VPS 上把 Play Keeper Relay 升级到 GitHub 仓库 little-hao/Play_keeper 的 v1.2.0。先确认当前部署目录和 systemd 服务名，备份现有 .env 或 EnvironmentFile，不得显示、提交或更换 ADMIN_TOKEN/DEVICE_TOKEN。然后 git fetch --tags，切换到 v1.2.0，在 remote-server 执行 npm ci 和 npm test。测试通过后重启现有服务，检查 systemd 状态，并确认本机和公网 HTTPS 的 /health 都返回 version 1.2.0。保留现有 Caddy/Nginx、域名、证书和密钥。失败时停止并报告，不要删除旧版。
```

## 手动更新

```bash
cd /opt/Play_keeper
git status --short
git fetch --tags origin
git checkout v1.2.0
cd remote-server
npm ci
npm test
sudo systemctl restart play-keeper-relay
sudo systemctl --no-pager --full status play-keeper-relay
curl --fail --silent http://127.0.0.1:8080/health
```

预期：

```json
{"ok":true,"service":"play-keeper-relay","version":"1.2.0"}
```

公网检查：

```bash
curl --fail --silent https://你的域名/health
```

## 回滚

```bash
cd /opt/Play_keeper
git checkout v1.1.0
cd remote-server
npm ci
sudo systemctl restart play-keeper-relay
```

回滚后基础预览和单击仍可使用，但 v1.2.0 的定时金币券卖出参数与掉线标记界面不可用。
