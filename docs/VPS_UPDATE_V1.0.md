# Debian VPS 升级到 Play Keeper v1.0.0

本次 Android 与 VPS 都必须升级。新增的脚本配置/执行命令需要 v1.0.0 Relay 参数校验，旧 VPS 会返回“命令或参数无效”。

## 方式 A：让 VPS 上的 Codex 执行

把下面整段提示交给 VPS Codex：

```text
请在 Debian VPS 上升级 Play Keeper Relay 到 GitHub 仓库 little-hao/Play_keeper 的 v1.0.0。先查找当前部署目录和 systemd 服务名，备份现有 .env 或 EnvironmentFile，不得输出 ADMIN_TOKEN/DEVICE_TOKEN。然后 git fetch --tags，切换到 v1.0.0，在 remote-server 执行 npm ci 和 npm test。测试通过后重启现有 Play Keeper systemd 服务，检查服务状态、本地 /health 必须返回 version 1.0.0，再通过公网 HTTPS 域名检查控制台。保留现有 Caddy/Nginx 和密钥，不要重新生成密钥。失败时停止并说明具体步骤，不要删除旧版。
```

## 方式 B：手动命令

以 `/opt/Play_keeper` 和 `play-keeper-relay` 为例；如实际名称不同，只替换这两处。

```bash
cd /opt/Play_keeper
git status --short
git fetch --tags origin
git checkout v1.0.0
cd remote-server
npm ci
npm test
sudo systemctl restart play-keeper-relay
sudo systemctl --no-pager --full status play-keeper-relay
curl --fail --silent http://127.0.0.1:8080/health
```

预期健康检查：

```json
{"ok":true,"service":"play-keeper-relay","version":"1.0.0"}
```

再从外网检查：

```bash
curl --fail --silent https://你的域名/health
```

## 回滚

如 v1.0.0 Relay 无法启动，在保留原密钥的前提下切回上一个稳定 tag：

```bash
cd /opt/Play_keeper
git checkout v0.5.1
cd remote-server
npm ci
sudo systemctl restart play-keeper-relay
```

回滚 VPS 后，v1.0.0 Android 的基础状态、预览和单击仍可能工作，但新的脚本远程命令不可用。
