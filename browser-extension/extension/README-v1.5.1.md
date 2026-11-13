# Play Keeper v1.5.1 许可证激活修复

## 修复内容

v1.5.0 在 HTTP 游戏页中直接使用 Web Crypto，Chrome 会让 `crypto.subtle` 不可用，激活后因此报错：

`Cannot read properties of undefined (reading 'importKey')`

v1.5.1 将授权服务器请求和 P-256 签名验证移到扩展后台安全上下文。生产授权地址、公钥、激活码、设备上限与 72 小时令牌策略均未改变。

## 更新和激活

1. 解压 `PlayKeeper-Windows-v1.5.1.zip` 到固定目录。
2. 打开 `chrome://extensions`，开启开发者模式。
3. 删除旧版后选择“加载已解压的扩展程序”，或将现有扩展目录替换为 v1.5.1 后点击“重新加载”。
4. 刷新 `http://sgplay.cc/home.html#/`。
5. 在神宠规划器的“许可证”栏输入生产激活码，点击“激活/换机授权”。
6. 状态显示“许可证有效”后再运行单次事务或自动循环。

如果仍失败，请保留完整错误文本；不要把生产激活码或 OWNER-ONLY 服务器包发给插件用户。
