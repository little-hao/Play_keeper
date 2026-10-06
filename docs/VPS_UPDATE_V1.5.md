# Debian VPS 升级到 v1.5.0

v1.5.0 需要同步更新 Android APK 和 VPS 上的 `remote-server`。VPS 只转发通过白名单校验的状态和命令，脚本设置仍按账号保存在 Android 端。

## 使用 GitHub 仓库更新

```bash
cd /opt/Play_keeper
git fetch --tags origin
git checkout v1.5.0
cd remote-server
npm ci --omit=dev
npm test
sudo systemctl restart play-keeper
sudo systemctl status play-keeper --no-pager
curl -fsS http://127.0.0.1:8080/health
```

请将 `/opt/Play_keeper` 和 `play-keeper` 替换为 VPS 实际目录与 systemd 服务名。健康检查应包含：

```json
{"ok":true,"service":"play-keeper-relay","version":"1.5.0"}
```

## 使用 Release 更新包

Release 中的 `PlayKeeper-VPS-v1.5.0.tar.gz` 只包含 `remote-server` 所需文件，不包含 `.env`、密钥和 `node_modules`。备份现有目录后解压覆盖：

```bash
mkdir -p /tmp/play-keeper-v1.5.0
tar -xzf PlayKeeper-VPS-v1.5.0.tar.gz -C /tmp/play-keeper-v1.5.0
cd /tmp/play-keeper-v1.5.0/remote-server
npm ci --omit=dev
npm test
sudo rsync -a --delete --exclude='.env' ./ /opt/Play_keeper/remote-server/
sudo systemctl restart play-keeper
curl -fsS http://127.0.0.1:8080/health
```

部署后在 iPhone/Android 浏览器强制刷新控制台，确认能看到“上架装备”“购买装备”“立即拍卖”“购买拍卖道具”“立即卖金币券”和“立即检查仓库”。

## 回滚

VPS 可切回 `v1.4.0-workflow-test` 后重启服务。Android 无法用较低 `versionCode` 覆盖 v1.5.0；若需紧急修复，应在新的更高 `versionCode` 上发布。
