# Play Keeper 签名文件（不提交私钥）

v1.9 正式 APK 为兼容两台设备已安装的并行测试版，继续使用 Windows 测试阶段固定下来的 Android Debug 证书签名。该证书与 v1.9.0–v1.9.2 并行测试包一致；v1.8.x 旧应用使用另一证书，因此 v1.9 保持独立包名，不尝试覆盖它。

- 仓库本地路径：`signing/debug.keystore`
- Windows 原始备份：`%USERPROFILE%\.android\debug.keystore`
- keystore 文件 SHA-256：`BC351381BA0CF1846CAD1408373A7B55F6F757F400D941BA3F9EDACB14799C9F`
- APK 签名证书 SHA-256：`11E8C49415512DA2CE088B92B1C2161A960744BCB5829507BCD0021FB3CF512F`

`*.keystore` 已被 `.gitignore` 排除，私钥不得上传到公开 GitHub。切换到 Mac 时，通过加密 U 盘或加密文件传输把同一个文件放到 `signing/debug.keystore`，再核对文件 SHA-256 后构建。Gradle 会优先使用仓库本地副本，找不到时才回退到用户目录的 `.android/debug.keystore`。

Windows 校验：

```powershell
Get-FileHash -Algorithm SHA256 signing/debug.keystore
```

macOS 校验：

```bash
shasum -a 256 signing/debug.keystore
```

绝不能在 Mac 上重新生成同名 keystore；同名文件不代表同一私钥。
