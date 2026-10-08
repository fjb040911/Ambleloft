# 通知与认证演示

在设置 > 扩展中安装本目录（开发目录）。打开扩展首页，点击“发送演示通知”，经宿主确认后进入消息中心；“完成任务”再次经过宿主确认，回报结果并将消息设为已完成。重复点击、重启不会重放完成操作。

认证测试前，将 extension.json 的 authentication.resources 中 baseUrl、audience、scopes 替换为真实业务服务配置，并重新安装。在设置 > 账号添加企业 OIDC 连接；点击“连接企业账号”，选择连接并在系统浏览器登录，然后点击“查询业务服务”。服务端需要提供对应 baseUrl 下的 tasks API。

默认 example.com 是占位地址，不能直接完成企业登录。纯本地消息演示不要求配置账号。包内 webview.mjs 来自宿主参考 SDK；业务后端 API 由真实扩展进程提供。

完整契约与限制见 [接入规范](../../../specs/extensions/message-actions-auth-guide.md)。自动测试 `tests/extension-hosts.test.cjs` 安装本包，以受控 OIDC/HTTP 验证身份隔离、令牌不出宿主、消息按钮与结果回报链路；它不代表真实企业 IdP 已验收。
