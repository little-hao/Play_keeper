# Debian VPS 升级到 v1.4.0-workflow-test

本版 VPS 需同步更新：远程页面的三组拍卖预设、10件装备校验和新版状态文案都在 `remote-server` 中。Android APP 与 VPS 可以分开升级，但旧 VPS 会拒绝超过5件的装备配置。

```bash
cd /opt/Play_keeper
git fetch --tags origin
git checkout v1.4.0-workflow-test
cd remote-server
npm ci --omit=dev
npm test
sudo systemctl restart play-keeper
sudo systemctl --no-pager --full status play-keeper
curl -fsS https://keeper.19990920.xyz/health
```

健康检查应返回 `1.4.0-workflow-test`。然后在 iPhone/PC 浏览器强制刷新控制台，确认能看到拍卖快捷组合和“最多10件，每5件自动分批”。

若 VPS 上不使用 `/opt/Play_keeper` 或 systemd 服务名不同，只替换上述路径和 `play-keeper` 服务名，不要覆盖现有 `.env`、`ADMIN_TOKEN` 或 `DEVICE_TOKEN`。

回滚 VPS 可切回 `v1.3.0-equipment-test` 后重启服务；Android 端不能用更低 `versionCode` 覆盖安装。
