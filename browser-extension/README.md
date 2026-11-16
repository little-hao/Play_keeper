# Play Keeper 浏览器插件

这是 Play Keeper Android App 的附属浏览器功能模块，当前源码版本为 **v1.6.0**。它通过 Chrome 扩展在 `sgplay.cc` 游戏页提供神宠规划、单次进化/合成、牧场补级、自动循环、诊断日志和许可证校验。

## 目录

- `extension/`：可直接由 Chrome“加载已解压的扩展程序”的源码根目录，`manifest.json` 位于该目录顶层。
- `docs/DEVELOPMENT_HISTORY.md`：从累计经验修复到许可证生产化的开发过程与关键设计决定。
- `scripts/package-macos.sh`：在 Mac 上生成根目录直接包含 `manifest.json` 的 ZIP。

## Mac 接续开发

```bash
git clone https://github.com/little-hao/Play_keeper.git
cd Play_keeper
git switch fix/browser-extension-v1.6.0-background-watchdog
node --check browser-extension/extension/background.js
node browser-extension/extension/tests-god-planner.js
```

在 Chrome 打开 `chrome://extensions`，启用开发者模式，选择“加载已解压的扩展程序”，指向 `browser-extension/extension`。

打包：

```bash
chmod +x browser-extension/scripts/package-macos.sh
browser-extension/scripts/package-macos.sh
```

输出位于 `browser-extension/dist/`，该目录不提交 Git。

## 授权与敏感信息

仓库仅保存插件需要的生产 HTTPS 地址和验证公钥。服务器私钥、激活码清单、设备状态、OWNER-ONLY 服务器包及用户诊断数据不得提交。

生产激活码应通过私密渠道交付。插件源码可被阅读和修改，因此许可证用于控制正常发行版本的使用资格，不应被视为不可逆的代码加密。

## 发布检查

1. 更新 `manifest.json`、`license-config.js` 和三个运行脚本中的版本号。
2. 对 JavaScript 文件运行 `node --check`。
3. 运行 `tests-god-planner.js`。
4. 检查 ZIP 根目录直接包含 `manifest.json`。
5. 搜索并确认没有激活码、私钥、账号 Cookie、设备令牌或未脱敏诊断日志。
