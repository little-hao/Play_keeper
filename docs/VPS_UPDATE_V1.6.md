# Debian VPS 升级到 v1.6.0

v1.6.0 需要同步更新 Android APK 和 VPS 上的 `remote-server`。VPS 仅校验和转发白名单命令；各账号的脚本组合仍保存在 Android 端。

## 使用 GitHub 仓库更新

```bash
cd /opt/Play_keeper
git fetch --tags origin
git checkout v1.6.0
cd remote-server
npm ci --omit=dev
npm test
sudo systemctl restart play-keeper
sudo systemctl status play-keeper --no-pager
curl -fsS http://127.0.0.1:8080/health
```

健康检查应包含：

```json
{"ok":true,"service":"play-keeper-relay","version":"1.6.0"}
```

## 使用 Release 更新包

```bash
mkdir -p /tmp/play-keeper-v1.6.0
tar -xzf PlayKeeper-VPS-v1.6.0.tar.gz -C /tmp/play-keeper-v1.6.0
cd /tmp/play-keeper-v1.6.0/remote-server
npm ci --omit=dev
npm test
sudo rsync -a --delete --exclude='.env' ./ /opt/Play_keeper/remote-server/
sudo systemctl restart play-keeper
curl -fsS http://127.0.0.1:8080/health
```

部署后强制刷新控制台，确认能保存并执行道具拍卖、金币券卖出、装备转移、多道具存仓、副本组合和威望道具检查。

## 回滚

VPS 可切回 `v1.5.0` 后重启。Android 无法用较低 `versionCode` 覆盖 v1.6.0；如需紧急修复，应发布更高的 `versionCode`。
