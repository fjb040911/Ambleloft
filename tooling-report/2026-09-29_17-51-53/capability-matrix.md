# v0.1.0 开工能力对照

需求版本 v0.1.0；2026-09-29 17:51:53 Asia/Shanghai。先审计后实施，状态由本轮实测补齐。

契约来源：specs/extensions/contracts、developer-guide、message-runtime-handoff、authentication-design。window.desktop 仅允许验收驱动使用，不属于扩展 API。

| ID | 实际入口 / SDK 与 Demo 工作 | 验证状态 |
| --- | --- | --- |
| SDK-01 | 本轮矩阵、指纹和独立包验证 | PASS |
| SDK-02 | 保留 messages-preview；新增辅助入口也为 preview | PASS |
| SDK-03 | manifest.cjs / extension.schema.json / CLI validate | PASS |
| SDK-04 | page-preload.cjs / SDK webview.mjs；无 window.desktop | BLOCKED-HOST |
| SDK-05 | bootstrap.cjs 注册、subscriptions、signal | PASS |
| SDK-06 | operations.cjs resource；补空 ID 本地校验辅助器 | PASS |
| SDK-07 | bootstrap configuration；补应用默认值/订阅示例 | PASS |
| SDK-08 | storage / secrets；补 KV CAS 和安全输入案例 | PASS |
| SDK-09 | message-handlers / messages；现有五方法 | PASS |
| SDK-10 | localization.cjs、页面 context；Node 动态字典缺口 | BLOCKED-HOST |
| SDK-11 | OperationRouter agent；补 Agent 可发现操作 | BLOCKED-HOST |
| SDK-12 | 四分支回执；补用户可读反馈 | PASS |
| SDK-13 | CONFLICT 已由宿主修复；补重复/乱序业务事件 | PASS |
| SDK-14 | ExtensionSettings；补配置表单 schema 及默认值 | PASS |
| SDK-15 | 真实 code 透传；不猜文本 | BLOCKED-HOST |
| SDK-16 | bootstrap 本地 BUSY/TIMEOUT/CANCELLED、initialize 文本错误缺 code：BLOCKED-HOST | BLOCKED-HOST |
| SDK-17 | 写入不重放、未知结果保留待核对 | PASS |
| SDK-18 | 配置/页面订阅清理；后台唯一连接 | PASS |
| SDK-19 | alpha.3 / 独立包安装 / CJS/ESM/严格 TS | PASS |
| SDK-20 | 保留 team-tasks，新增 team-lab 全场景模板 | PASS |

完整逐例验收见 cases.json（含要求原文）；宿主缺口见 blockers.md。

## 完成后对照与证据

上表为最终状态，施工前副本保留在 [开工基线](capability-matrix-initial.md)。实现成果参见 [报告](report.md)，不把待补项描述当作尚未实施。

| API 层 | 真实入口 | 实现与验证 |
| --- | --- | --- |
| Node 后台 | bootstrap context.operations/storage/configuration/secrets/l10n/context | 同步注册、订阅释放、默认值、KV/CAS、安全凭据；DATA/CFG/LIFE 用例 |
| 调用期资源 | operations.cjs resource | getResources 拒绝空 ID，四方法委托；CHAT-01…12；Agent 交互错误码 H-03 |
| 页面 | page-preload/page-host | initialize/invoke/selectProject/requestGrant/requestSecretInput/onHostContextChanged；UI/SUB 用例；initialize 缺码 H-01 |
| 本地消息预览 | message-handlers.extensionMessage / messages | 五方法联合返回及 nullable 投影；MSG 用例；actions 仍不可用 |
| 应用业务连接 | team-lab/src/push.ts + service/server.cjs | 单后台 SSE、稳定 eventId、业务版本门控、退避、端点切换、服务重启；SUB-01…04 |
| 宿主内部 IPC | window.desktop | 仅验收驱动使用，未暴露到 SDK/扩展页面；不是扩展 API |

SDK-04/15/16：结构化错误不完整，见 [H-01、H-03](blockers.md)。SDK 不解析文本猜码；真实消息 CONFLICT 已通过。
SDK-10：页面及贡献字段随 locale 更新已通过，Node 激活字典缺少运行中更新机制（H-02）。
SDK-11：Agent 发现、输入校验、项目范围、读取和确认写入通过；打开聊天仍拒绝但丢 INTERACTION_REQUIRED。
SDK-19/20：alpha.3 CJS/ESM/严格 TS 和三个 CLI 模板在隔离 tarball 安装后构建/校验/打包通过。

认证、非空 actions、通用消息/Agent 回合订阅为 BLOCKED-HOST。当前宿主有系统 Notification 尝试投递，OS 横幅与点击为 NOT-RUN。
[逐例矩阵](acceptance-matrix.md)、[源码与包指纹](evidence/fingerprints.json)、[日志](evidence/packages.log)。
