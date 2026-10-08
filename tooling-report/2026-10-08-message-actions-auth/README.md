# 消息操作与扩展认证：宿主—SDK 联调结果

日期：2026-10-08；源码预览，未发布 npm 或安装包。

## 已实现

- 消息最多两个 Operation 按钮，宿主读取持久参数并检查消息版本、来源、扩展状态与权限。写操作仍明确确认。
- 执行日志先落盘后派发；accepted/unknown/completed 保留写锁；重启只恢复状态，不重放操作。读取按钮不占用写锁。
- `listActionInvocations`、`reportActionResult` 穿过真实 Node 扩展进程。回报幂等、独立 CAS、结果与消息更新原子提交。
- 企业资源清单及 CLI 结构/语义校验，页面 Operation 请求连接账号，系统浏览器 OIDC Code + PKCE、loopback 回调、宿主加密保存访问令牌。
- 后端静默查询授权、受限 HTTPS 请求、断开连接、会话变化事件；设置 > 账号展示扩展连接。更新或撤销期间校验授权，不把 Token 交给扩展。
- 独立 extension-tooling alpha.6 工作区同步契约、预览消息方法、CLI doctor 能力与基线。没有擅自提升 npm 版本。
- 可安装演示：examples/extensions/notification-auth。

## 验证证据

| 验证 | 结果 |
| --- | --- |
| 消息/认证/操作路由最终定向测试 | 21/21，message-auth-final.log |
| Manifest 与真实扩展进程 | 56/56，extension-chain-tests.log；包含真实进程两条链路 |
| 真实 Electron | 通过，native-message-actions.log；隔离页面发布、两次明确确认、消息完成、禁用重复操作、退出重启记录不变 |
| 浏览器 UI | 5/5，PLAYWRIGHT_CHANNEL=chrome npx playwright test tests/e2e/messages.spec.ts |
| OIDC loopback | 2/2，node --test tests/login-attempt.test.cjs；需允许本地监听 |
| TypeScript / Vite | 通过；Vite 保留已有的大 chunk 提示 |
| 独立 SDK/CLI | 68/68，tooling-final-tests.log |
| 契约对齐 | check:upstream 16 文件通过 |
| 独立 tarball | 通过，tooling-packages.log；离线安装、严格类型、CLI init/build/validate/pack、doctor 新能力 |

浏览器验收使用已安装的 Chrome，默认 Playwright headless 下载未安装。测试全部使用临时用户目录，不操作用户真实账号。原生消息测试脚本为 scripts/test-message-actions.mjs。

## 明确未验收/未实现

- 实际企业身份提供方的应用登记、resource/audience 兼容性和租户策略尚需真实环境验收；自动化使用受控协议/HTTP，以及已有签名、nonce、audience 校验测试。
- 当前每个扩展资源一个选定会话，过期需用户重新连接；暂不保存刷新令牌或提供全局多账号选择器。
- 账号作用域消息、直接导出令牌、WebSocket 凭据，以及更广泛的 Agent hooks 不属于此次已实现能力。
- 未进行 Windows/Linux 原生验收；并非“整个扩展体系全部完成”的声明。

当前接口以 specs/extensions/message-actions-auth-guide.md、contracts/sdk.d.ts、contracts/messages-preview.d.ts、extension.schema.json 为准。
