# SDK/CLI 与当前宿主匹配审查

结论：SDK/CLI 0.1.0-alpha.5 与当前宿主公开扩展能力基本匹配，但不是所有宿主内部功能均已成为 SDK 能力，也不是无差异。审查针对当前工作区源码，不代表已发布安装版或用户正在运行的二进制。

| 能力 | 对齐情况 |
| --- | --- |
| 清单、权限、国际化、条件显示、入口页面 | 契约与校验器一致 |
| 项目读取/路径、创建与打开聊天 | 已覆盖；授权不会自动创建 Demo 任务；没有已授权项目枚举接口 |
| KV、配置订阅、secrets | 已覆盖；最新配置授权修复属于宿主 UI，无需新增 SDK 方法 |
| 本地消息五个方法 | messages-preview 已覆盖；非空 actions 仍被宿主拒绝 |
| MCP Apps | 清单、校验、task-form/extension-lab 示例覆盖；第三方 ext-apps SDK 全面兼容未验收 |
| 声明式表单 | Schema、调用身份、恢复类型、CLI 绑定校验及 expense/extension-lab 示例覆盖；不提供 sdk.forms 私有 IPC 包装 |
| 系统提醒 | 宿主已接入 Electron Notification，复用现有 publish；无需新增 SDK API，但真实 OS 横幅/点击仍未验收 |
| 认证 | 宿主有内部 OIDC/登录协调模块，主进程公开设置桥仍只有连接管理；扩展 bootstrap/page-host 无 auth 桥，SDK 保持提案是正确边界 |

## 具体差异

1. **P2：错误码类型漏项。** `agent/core/extensions/errors.cjs` 的公开白名单包含 QUOTA_EXCEEDED；`core/extensions/messages.cjs` 的消息数量上限会抛出此码；宿主 `specs/extensions/contracts/sdk.d.ts` 与 tooling 同步类型的 ErrorCode 均未包含它。运行时包装会保留错误，但 TypeScript 无法正确穷举该错误。应先补宿主契约，再同步 SDK，并增加运行时白名单与类型集合一致性检查。现有 check:upstream 只能发现两仓库文件不同，不能发现双方共同遗漏。
2. **P2：文档陈旧。** tooling `docs/declarative-forms.md` 仍声称 handler 错误被折叠为 INTERNAL/BLOCKED-HOST，但宿主现有 bootstrap 使用 publicCode，历史复验已通过。宿主 `conversation-interactions-direction.md`、`mcp-apps-design.md` 仍有声明式表单“尚未实现”描述，与当前 forms 实现和 guide 冲突。
3. **验收缺口：系统提醒。** 宿主已接入真实 Notification，服务层测试通过；应把状态表述为“已接入、OS 实际投递待验收”，不能继续统称未实现，也不能因 remind:true 声称送达。Demo README 将其列为未验收是准确的。
4. **体验缺口：项目授权与业务关联。** 见上一轮项目诊断。没有 SDK 丢授权；如果需要自动列出授权项目，须新增宿主公开契约。当前 Demo 空状态未解释两个步骤。
5. **兼容范围：源码一致不等于发行版兼容。** engines.api/protocolVersion 仍为 1，Node preview 缺少完整版本能力协商。消息包装拒绝旧/部分宿主；最低宿主兼容范围应结合构建指纹与桌面验收，不能只看包版本。

## 本轮验证

- npm run check:upstream：14 个文件一致，涵盖主 SDK、两个 Schema、清单/条件/包校验器和表单解析器。
- npm test：65/65。
- npm run test:packages：实际 tarball、空缓存离线安装、CJS/ESM/webview、严格 TypeScript、六套模板 init/build/validate/pack、归档验证与确定性打包通过。
- 宿主定向测试：extension-sdk、forms、grant-selection、message-service，共 14/14。
- 阅读 bootstrap/hosts/page-host、消息实现与认证内部模块，补充自动文件一致性检查覆盖不到的运行时核对。

本轮未重新进行完整真实桌面验收，未验证操作系统通知横幅、企业真实 IdP 或不同平台安装版。未修改公开接口、模板或宿主行为，未发布包。安装包测试重建了本地 dist 产物。

## 宿主协作 Prompt

请核对本报告的 QUOTA_EXCEEDED 类型缺项，在宿主公开 ErrorCode 契约补齐实际可返回的错误码，并添加防止运行时白名单与类型漂移的验证。更新声明式表单、系统通知及认证内部实现的状态说明，明确内部模块与扩展公开 API 的边界。不要在本次修正文档/类型时擅自冻结 authentication 接口或新增 SDK 登录流程。宿主契约更新后由 tooling 同步并执行包级回归。
