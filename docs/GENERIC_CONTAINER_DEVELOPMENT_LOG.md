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

## 2026-11-23 · 步骤 5 · 只读 workflow 格式与离线校验

实现提交：`87fa689f3502bca39d74816f3383b511736bce0d`（`feat: validate read-only automation workflows`）

实现：

- manifest 可选携带 `workflow.steps`；未携带 workflow 的旧清单保持兼容。
- 定义 `readTitle`、`waitFor`、`readText`、`assertText`、`writeSanitizedLog` 五个只读动作。
- 最多 50 步，步骤 ID 必须唯一；拒绝未知动作和未知字段。
- 每个动作必须由 manifest 显式声明对应能力。
- selector 最长 300 字符，等待超时限制为 100–30000ms；静态文本最长 500 字符。
- 日志动作暂不接受变量模板或控制字符，避免在执行器完成脱敏设计前形成敏感数据插值通道。
- 导入确认页展示 workflow 步骤数，并明确“仅校验，不执行”。
- 示例清单补充完整五动作 workflow。

安全边界：

- 本步骤仅解析、规范化并保存 JSON，不访问 WebView DOM，也不执行 workflow。
- 未增加点击、输入、任意 JavaScript、Cookie、网络或 Android 文件访问能力。
- `assertText` 仅定义格式；失败处理、结果保存和可重放日志尚未实现。

动作与验证：

- 新增正常解析、默认超时、未知动作、权限缺失、重复 ID、超限步骤、非法超时、缺失字段和不安全日志模板测试。
- 首次编译发现 Android 内置 `JSONObject` 不支持 `keySet()`；改用兼容的 `keys()` 迭代后重跑。
- Android Candidate、Debug、MacParallel、Release 全 build type 单元测试通过。
- 本步骤按小步节奏不生成 APK。

## 2026-11-23 · 步骤 6 · 用户授权的 WebView 只读执行层

实现提交：`fc84121eb9738924c8350ddb726bad5f8be6126a`（`feat: run authorized read-only workflows in WebView`）

版本提交：`ffce33666545738d27b55b5e9609fa7369ac9856`（`chore: version read-only WebView candidate`）

实现：

- 导入且带有 workflow 的清单，在详情页提供“运行只读流程”。
- 每次运行前展示脚本、当前完整 URL、步骤数和只读边界，由用户点击“运行一次”授权。
- 执行器按顺序支持读取标题、轮询等待元素、读取文本、精确文本断言和静态脱敏日志。
- WebView 只执行应用生成的固定代码片段；selector 和期望文本通过 JSON 字符串编码，不执行清单提供的 JavaScript。
- 任一步失败即停止并展示结构化结果；运行期间完整 URL 变化也立即停止。
- 同一时间只允许一个通用只读 workflow 运行。

安全边界：

- 不点击、不输入、不访问 Cookie/localStorage/IndexedDB、密码值、Android 文件或原生接口。
- 清单不能提供 JavaScript；执行器仅使用 `document.title`、`querySelector` 和 `textContent`。
- 读取结果只显示在本次结果对话框，当前不持久化、不上传。
- 本步骤没有开放后台自动运行、定时运行或跨来源执行。

动作与验证：

- 新增离线桥接重放测试，覆盖五动作顺序、脚本边界、失败中止、未授权来源拒绝和导航中止。
- Android Candidate、Debug、MacParallel、Release 全 build type 单元测试通过。
- Candidate lintVital 和 APK 组装通过。
- 生成本地 `2.0.8-rc4-candidate`：包名 `com.local.sgplaykeeper.candidate`，versionCode `2000804`。
- APK 大小 `2649738` 字节，SHA-256：`d55650efc854a10ae089d7b24e8663246f44faaf7641c03de0f39fb8ca5eaf78`。
- 当前环境缺少历史 Candidate keystore；本地 APK 使用证书 SHA-256 `0cd3ad11938904decf64b396d4b89d88a347e931bfa24ddff0b4e93c0f434c86`，不能覆盖历史签名版本，因此不作为共享升级包发布。

## 下一步候选

- 增加显式取消、Activity/WebView 销毁清理和执行总超时。
- 使用本地 DOM 夹具完成 Android WebView 设备级重放测试。
- 取得历史 Candidate keystore 后重建可覆盖升级的共享测试包。
- 继续禁止点击、输入、任意 JavaScript 和后台自动执行。

## 2026-11-23 · 步骤 7 · 使用历史证书重签 rc4

来源与核验：

- 根据旧开发聊天 `Playkeep开发-old` 的 v2.0.8-rc2 发布记录，在旧项目本地目录找到未纳入 Git 的 `signing/debug.keystore`。
- keystore SHA-256：`bc351381ba0cf1846cad1408373a7b55f6f757f400d941ba3f9edacb14799c9f`。
- 证书 SHA-256：`11e8c49415512da2ce088b92b1c2161a960744bcb5829507bcd0021fb3cf512f`，与历史覆盖安装链及交接记录一致。

构建与验证：

- 使用临时本地签名目录执行 clean、全 build type 单元测试、Candidate lintVital 和 assemble；全部通过。
- 重建包名：`com.local.sgplaykeeper.candidate`。
- versionName：`2.0.8-rc4-candidate`；versionCode：`2000804`。

## 2026-11-24 · 步骤 8 · rc5 运行可控与紧凑界面

- 只读 workflow 新增显式取消和 2 分钟整轮超时；取消或超时后忽略迟到的 WebView 回调，保证只产生一次终态。
- Activity 销毁、页面开始跳转、WebView 实例重建时会先停止当前只读 workflow。
- 工具栏新增“网址”入口，可直接为当前实例设置 HTTP/HTTPS 自定义首页；HTTP 仍需用户明确允许。
- 账号行与操作行可整体收起，折叠状态持久化；收起后仅保留右上角小型“展开工具”按钮。
- 新增取消、迟到回调、整轮超时单元测试；`testCandidateUnitTest`/`lintCandidate`/`assembleCandidate` 通过。
- 版本升为 `2.0.8-rc5-candidate`，versionCode `2000805`。仍保持只读能力边界，未开放点击、输入、任意 JavaScript 或后台无人值守。
- APK Signature Scheme v2 验证通过，签名者数量为 1。
- APK 大小：`2651322` 字节。
- APK SHA-256：`82e539e999c704562c5cbc40f456f27cb434ea333d8f4408eb7ff51afd29c81a`。
- 共享测试包：`dist/PlayKeeper-Android10Plus-v2.0.8-rc5-generic-candidate.apk`。
- 临时 keystore 副本在构建后删除，私钥未提交到 Git。

安装边界：

- 可覆盖同为 `com.local.sgplaykeeper.candidate`、证书指纹相同且 versionCode 更低的候选版。
- 不能覆盖包名为 `com.local.sgplaykeeper.test.v190` 的正式/覆盖安装线；不同包名应并行安装。

## 2026-11-24 · 步骤 9 · rc6 展开按钮安全区热修复

- 根据真机截图确认，收起工具栏后的“展开工具”按钮未使用系统顶部 inset，会与电量、网络等状态图标重叠。
- 按钮现在动态应用顶部与右侧系统安全边距，横竖屏或状态栏尺寸变化时会跟随重新定位。
- 版本升为 `2.0.8-rc6-candidate`，versionCode `2000806`。
- APK 大小：`2651550` 字节；SHA-256：`a81c61479c64f1dc81c55b1fdac9e5a33dc14223c6a51ab93bf691bf311731b9`。
- 共享测试包：`dist/PlayKeeper-Android10Plus-v2.0.8-rc6-generic-candidate.apk`。

## 2026-11-26 · 步骤 10 · rc7 自动化包 v1

- 自定义首页支持缺省协议补全：`sgplay.cc/...` 补为 HTTP，其他域名补为 HTTPS；HTTP 仍需用户逐实例明确允许。
- 新增 `.pkauto` v1 导入与导出，同时保留旧 JSON 清单导入。
- 自动化包使用固定 ZIP 文件结构，校验 schemaVersion、脚本 ID/版本、manifest SHA-256、路径、条目数、压缩包大小及解压大小。
- 新增开发者打包工具 `tools/pack_automation.py`、v1 格式文档和 SGPlay 只读示例清单。
- v1 仍仅允许受控只读动作，不允许点击、输入、Cookie、任意 JavaScript 或后台无人值守。
- 版本升为 `2.0.8-rc7-candidate`，versionCode `2000807`。
- Android Candidate 单元测试、lint 和 assemble 通过；VPS 72 项测试通过，npm audit 无漏洞。
- APK 大小：`2652290` 字节；SHA-256：`de428d8194192d9713cac4a9916957eef55d394ebe4284496a88ddc39b95cf84`。
- 共享测试包：`dist/PlayKeeper-Android10Plus-v2.0.8-rc7-generic-candidate.apk`。

## 2026-11-26 · 步骤 11 · rc8 发布者签名基础

- `.pkauto` schemaVersion 2 新增 EC P-256 / SHA-256 发布者签名，导入时验证公钥指纹、清单哈希和签名。
- 导入确认页显示发布者、签名状态和指纹摘要；未签名包仍只能使用只读能力。
- APP 保存导入的原始 `.pkauto`，跨设备导出时保留发布者签名；JSON 清单导出为未签名 v2 包。
- 开发者打包工具新增 `--sign` 和 `--publisher`，私钥不进入包或 Git。
- Java 单元测试覆盖 P-256 生成、签名和导入验证。开发机未安装 OpenSSL，因此本机命令行签名未伪报成功。
- 版本升为 `2.0.8-rc8-candidate`，versionCode `2000808`。
- Android Candidate 单元测试、lint 和 assemble 通过；VPS 72 项测试通过，npm audit 无漏洞。
- APK 大小：`2653670` 字节；SHA-256：`0a025d38ecb0e39e3d30654c03a58ca303984c742cba5700afe7f0db1e94d1bc`。
- 共享测试包：`dist/PlayKeeper-Android10Plus-v2.0.8-rc8-generic-candidate.apk`。

## 2026-11-26 · 步骤 12 · rc9 受控交互引擎

- 新增 `dom.click` / `click`：固定 CSS selector、可见性与 disabled 检查、有限等待和单次点击，不接受 manifest 提供的 JavaScript。
- 新增 `same_origin.navigate` / `navigate`：目标必须位于 manifest `allowedOrigins`，页面就绪后才继续，跨来源立即失败。
- 交互能力只允许已验证发布者签名的 `.pkauto`；未签名包和旧 JSON 保持只读。
- APP 导入和每次运行都复核签名原包，并对点击/导航显示明确权限警告。
- 运行器允许授权 origin 内的同源页面变化，但一旦离开授权来源就停止。
- 新增受控点击、同源导航、后置文本证据、跨源拒绝和未签名权限拒绝测试。
- 版本升为 `2.0.8-rc9-candidate`，versionCode `2000809`。
- Android Candidate 单元测试、lint 和 assemble 通过；VPS 72 项测试通过，npm audit 无漏洞。
- APK 大小：`2655266` 字节；SHA-256：`b160d310b808b59b3a0e4951e90b529e4efa6761fcc7e2fe0c8f9e9969caf26f`。
- 共享测试包：`dist/PlayKeeper-Android10Plus-v2.0.8-rc9-generic-candidate.apk`。
