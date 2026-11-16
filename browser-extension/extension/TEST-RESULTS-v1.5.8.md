# Play Keeper v1.5.8 基础测试

- `background.js`、自动捕捉、规划器和事务脚本均通过 `node --check`。
- 原规划核心测试通过。
- 牧场恢复测试通过。
- v1.5.8 静态发布检查通过：版本一致、后台选项默认关闭、批次核验默认 5、CC 核验默认开启、合成冷却为 5 秒、完整导航恢复存在。
- 发布 ZIP 根目录已确认直接包含 `manifest.json`。

浏览器实机测试仍需用户加载 v1.5.8 后执行，重点观察诊断事件：

- `browser/background-attempt`
- `browser/background-verification-failed`
- `browser/foreground-recovery`
- `automation/evolution-batch-verified`
- `synthesis/full-navigation-recovery`
