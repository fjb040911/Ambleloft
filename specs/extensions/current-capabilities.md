# 当前扩展能力与契约来源

核对日期：2026-10-08。下列“预览”表示当前源码存在公开扩展入口，不表示稳定 API、npm 已发布或任意安装包均支持。历史设计中的目标不能覆盖本表的实现边界。

机器清单：[host-capabilities.json](contracts/host-capabilities.json)。这是源码能力清单，不是运行时协商接口，不授予任何权限。

| 能力 ID | 状态与入口 | 契约及验证入口 |
| --- | --- | --- |
| operations | 预览；manifest.operations → context.operations.register；页面 invoke / Agent 统一路由 | sdk.d.ts；extension-hosts、extension-operations 测试 |
| configuration | 预览；manifest.configuration + configuration/self；context.configuration | sdk.d.ts；extension-configuration、grant-selection 测试 |
| localMessages | 预览；context.messages 七个方法，SDK messages-preview 适配 | messages-preview.d.ts；message-service、message-store、extension-hosts 测试 |
| declarativeForms | 预览；manifest.skills → 根级 YAML；宿主 Agent 工具展示、用户提交 Operation | form.schema.json、sdk.d.ts；forms 测试及 test:forms |
| mcpApps | 有限预览；contributes.mcpApps + Operation UI 元数据，包内任务 UI | extension.schema.json；mcp-apps 测试及 test:extensions:apps |
| extensionAuthentication | 预览；资源声明、交互式 OIDC 连接、静默会话查询、宿主 HTTPS 代理 | sdk.d.ts；extension-auth、oidc、extension-hosts 测试 |
| messageActions | 预览；Operation 按钮、持久执行状态、幂等结果回报与重启恢复 | messages-preview.d.ts；action-journal、message-service、extension-hosts 测试 |
| agentHooks | 未开放公共 Agent hook SDK | 不从设计稿生成运行时代理 |
| formResumeApi | 未开放 forms_resume / SDK 直接展示或迁移 API | 已有实例保存与显示不等于新增公开 API |

本地消息提供 Operation actions，但尚不提供账号作用域投递或系统通知实际送达保证。认证首版不提供 refresh token、全局账号选择器和 WebSocket 凭据，详见 [接入规范](message-actions-auth-guide.md)。表单限静态字段与线性步骤；MCP Apps 不等于任意远程 MCP 或完整 ChatGPT Apps 兼容。宿主内部模块的存在不是能力开放证据。

## 契约和包的关系

- sdk.d.ts：包含宿主公开错误码（含 QUOTA_EXCEEDED）的基础操作、资源、配置、表单上下文与恢复类型的单一来源。
- messages-preview.d.ts：独立消息预览契约；通过 getMessages 检查运行时方法，不把主 ExtensionContext 扩大成所有宿主都支持消息。
- extension.schema.json / form.schema.json：结构契约；CLI 和宿主还须做语义校验。
- 本仓库 packages/extension-sdk 为 alpha.1 参考包；独立 extension-tooling 当前为 alpha.6 工作区。版本、发布状态和验收分别记录，不将二者混称“最新版 SDK”。

## 兼容性检查

独立工具库支持：

```sh
npm run check:upstream
node packages/cli/bin/amble-extension.cjs doctor --host ../agent --require operations,declarativeForms --json
```

doctor 只读源码，不加载扩展代码、不连接业务服务。matched 表示与记录基线匹配，runtimeStatus 始终为 not-tested；它不能诊断某个已安装应用的进程、权限或账号状态。

漂移返回 HOST_SOURCE_DRIFT，文件缺失返回 HOST_SOURCE_UNREADABLE，未开放能力返回 UNSUPPORTED_CAPABILITY，未知 ID 返回 UNKNOWN_CAPABILITY。失败退出 1，参数错误退出 2。差异可能只是注释，也可能是行为变化，因此报告“未验证”，不推断必然不兼容。基线更新须经过差异审查和相应联调，不随普通构建自动接受宿主变化。

check:upstream 对照同步契约和验证器；doctor 对照已记录的宿主实现指纹。两项均不能替代 tarball 干净安装或真实桌面测试。

## 下一轮 SDK/CLI 迭代入口

- [图标规范](icons.md)
- [消息操作与认证接入规范](message-actions-auth-guide.md)
- [v0.5.0 增量交接与验收清单](../../tooling-report/requirement/v0.5.0/README.md)
