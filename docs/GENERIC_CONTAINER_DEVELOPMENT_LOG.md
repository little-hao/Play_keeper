# Play Keeper 通用化开发日志

本文件记录每一步实现内容、执行动作、验证结果和仍未实现的边界。后续跨 Mac、Windows 或其他 Codex 环境开发时，应在同一分支继续追加，不覆盖历史记录。

## 2026-11-22 · 步骤 1 · 多实例通用化 MVP

提交：`05a8effc8d3284e3674d0335be3c685a86823fbe`

实现：

- 每实例 HTTPS 首页和精确 origin 导航限制。
- WebView 最小权限默认值。
- 省电/均衡/高性能 2/4/8 驻留环境及旧配置迁移。
- “账号/脚本”调整为“实例/自动化”。
- 自动化中心展示 SGPlay 内置适配器和禁用的通用只读示例。
- URL、环境迁移、清单和性能守卫测试。
- 更新 `nodemailer` 至无已知审计漏洞版本。

动作与验证：

- Android 全 build type 单元测试通过。
- Candidate lintVital/assemble 通过。
- VPS 72/72 测试通过，npm audit 为 0。
- 使用历史证书生成 `2.0.8-rc3-candidate` 测试 APK；临时 keystore 副本随后删除。

## 2026-11-22 · 步骤 2 · 用户授权的 HTTP 实例

提交：`0c59380b7e42c58bc07c317b60c01196ab865f86`

实现：

- 自定义实例默认仍只接受 HTTPS。
- 增加逐实例“不安全 HTTP”显式授权和风险提示。
- HTTP/HTTPS 均限制精确 scheme、host、port，拒绝协议、端口和子域切换。
- 修改首页后立即加载；无效持久化配置回退至 SGPlay 首页。

动作与验证：

- 新增 HTTP 授权、拒绝和 exact-origin 测试。
- Android 全 build type 单元测试通过。
- 本步骤未打包 APK。

## 2026-11-23 · 步骤 3 · 受限脚本清单导入

实现提交：`5961b34`（`feat: import validated read-only automation manifests`）

实现：

- Android 文件选择器导入本地 JSON manifest，文件上限 64KB。
- 校验脚本 ID、语义化版本、允许来源和能力列表。
- 自定义脚本不得占用 `com.playkeeper.*` 内置 ID 空间。
- 当前只接受 `page.title.read`、`dom.wait`、`dom.text.read`、`log.sanitized` 四项只读能力。
- manifest 必须匹配当前实例首页的精确 origin。
- 导入后保存为“未启用”，同 ID 再导入时替换旧清单。
- 自动化中心只显示适用于当前实例的已导入清单。
- 提供 `docs/examples/readonly-script-manifest.json` 示例。

安全边界：

- 本步骤不执行脚本、不注入 JavaScript、不点击或填写页面。
- 不读取 Cookie、密码框、Authorization 或 Android 文件系统。
- 损坏或旧 schema 条目不会降低校验规则，而是从展示/后续保存中忽略。

动作与验证：

- 新增 manifest 正常解析、exact-origin、写能力拒绝和内置 ID 冲突测试。
- 首次编译检查发现 `MainActivity` 缺少 `java.util.List` 导入；补齐后重新执行完整测试并通过。该问题未进入提交或制品。
- 完成后运行 Android 全 build type 单元测试和差异检查。
- 本步骤按小步节奏不生成 APK。

## 2026-11-23 · 步骤 4 · 清单生命周期与诊断

实现提交：`f95027f`（`feat: manage imported automation manifest lifecycle`）

实现：

- 已导入清单详情增加删除操作和二次确认。
- 同 ID 导入前展示旧版本到新版本的变化、允许来源、原始权限 ID 和中文权限说明。
- 使用语义化核心版本比较判断升级/降级；预发布版本低于相同核心正式版。
- 降级必须点击单独的“仍然降级”确认，不再静默覆盖。
- 导入失败改为对话框诊断，并支持复制错误信息。
- 自定义清单描述符明确标记为可移除；内置适配器不可删除。

安全边界：

- 清单仍保持未启用，不执行脚本。
- 删除清单不删除实例网页 Profile、Cookie、存储或缓存。
- 本步骤未增加任何点击、输入、网络或任意 JavaScript 权限。

动作与验证：

- 新增升级、降级和预发布版本比较测试。
- Android 全 build type 单元测试通过。
- 本步骤按小步节奏不生成 APK。

## 下一步候选

- 定义只读 workflow JSON schema。
- 实现 `page.title.read`、`dom.wait`、`dom.text.read` 和脱敏日志的受控执行器。
- 在 DOM 夹具重放测试通过前，不开放点击、输入或任意 JavaScript。
