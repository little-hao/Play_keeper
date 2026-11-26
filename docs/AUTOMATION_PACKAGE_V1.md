# Play Keeper 自动化包 v1/v2

`.pkauto` 是可跨设备复制的数据包，不是 APK，也不允许携带 JavaScript、DEX、原生库或账号凭据。schemaVersion 1 保持可导入；schemaVersion 2 新增可选发布者签名。

## 文件结构

```text
example.pkauto
├─ package.json
└─ manifest.json
```

`package.json` 固定使用 `playkeeper.automation` 格式，记录清单路径、脚本 ID、版本及清单 SHA-256。APP 导入时限制文件数量、路径、压缩包大小和解压后大小，并复核哈希、ID 与版本。schemaVersion 2 可用 EC P-256 / SHA-256 签名发布者身份。

`manifest.json` 沿用现有只读清单格式。v1 支持：

- `page.title.read`
- `dom.wait`
- `dom.text.read`
- `log.sanitized`
- `readTitle`、`waitFor`、`readText`、`assertText`、`writeSanitizedLog`

不支持点击、输入、Cookie、localStorage、任意 JavaScript、后台无人值守或跨来源导航。旧版单文件 JSON 清单仍可导入。

## 开发者打包

```bash
python tools/pack_automation.py examples/readonly-example.json dist/readonly-example.pkauto
```

生成并使用 EC P-256 私钥签名（私钥不得放入自动化包或 Git）：

```bash
openssl ecparam -name prime256v1 -genkey -noout -out publisher-private.pem
python tools/pack_automation.py examples/readonly-example.json dist/readonly-example.pkauto \
  --sign publisher-private.pem --publisher "Example Publisher"
```

APP 会再次执行完整 schema 和能力校验，因此打包成功不代表脚本自动获得权限。用户导入时仍会看到来源、能力和版本，运行前仍需逐次授权。

## APP 导入与导出

- 自动化中心选择“导入自动化包 / JSON 清单”。
- 已导入脚本的详情页可选择“导出 .pkauto”。
- 导出只包含清单，不包含实例名称、网页数据、Cookie、密码、Device Token 或 API Key。
- schemaVersion 2 可验证开发者签名和公钥指纹；导出时保留原始签名包。签名能证明两个包来自同一密钥，但不等于 APP 已将该发布者列为官方可信。

## 后续兼容方向

SG 内置自动化应按流程逐步迁移到受控动作 DSL。VPS 只下发稳定的脚本 ID、入口和参数，不下发或执行代码。涉及点击、输入、拍卖和交易的能力必须单独设计权限、幂等检查、证据和人工确认，不能通过 v1 只读包绕过。
