# v0.1.0 开工能力对照

需求版本 v0.1.0；2026-09-29 17:51:53 Asia/Shanghai。先审计后实施，状态由本轮实测补齐。

契约来源：specs/extensions/contracts、developer-guide、message-runtime-handoff、authentication-design。window.desktop 仅允许验收驱动使用，不属于扩展 API。

| ID | 实际入口 / SDK 与 Demo 工作 | 验证状态 |
| --- | --- | --- |
| SDK-01 | 本轮矩阵、指纹和独立包验证 | NOT-RUN |
| SDK-02 | 保留 messages-preview；新增辅助入口也为 preview | NOT-RUN |
| SDK-03 | manifest.cjs / extension.schema.json / CLI validate | NOT-RUN |
| SDK-04 | page-preload.cjs / SDK webview.mjs；无 window.desktop | NOT-RUN |
| SDK-05 | bootstrap.cjs 注册、subscriptions、signal | NOT-RUN |
| SDK-06 | operations.cjs resource；补空 ID 本地校验辅助器 | NOT-RUN |
| SDK-07 | bootstrap configuration；补应用默认值/订阅示例 | NOT-RUN |
| SDK-08 | storage / secrets；补 KV CAS 和安全输入案例 | NOT-RUN |
| SDK-09 | message-handlers / messages；现有五方法 | NOT-RUN |
| SDK-10 | localization.cjs、页面 context；Node 动态字典缺口 | NOT-RUN |
| SDK-11 | OperationRouter agent；补 Agent 可发现操作 | NOT-RUN |
| SDK-12 | 四分支回执；补用户可读反馈 | NOT-RUN |
| SDK-13 | CONFLICT 已由宿主修复；补重复/乱序业务事件 | NOT-RUN |
| SDK-14 | ExtensionSettings；补配置表单 schema 及默认值 | NOT-RUN |
| SDK-15 | 真实 code 透传；不猜文本 | NOT-RUN |
| SDK-16 | bootstrap 本地 BUSY/TIMEOUT/CANCELLED、initialize 文本错误缺 code：BLOCKED-HOST | NOT-RUN |
| SDK-17 | 写入不重放、未知结果保留待核对 | NOT-RUN |
| SDK-18 | 配置/页面订阅清理；后台唯一连接 | NOT-RUN |
| SDK-19 | alpha.3 / 独立包安装 / CJS/ESM/严格 TS | NOT-RUN |
| SDK-20 | 保留 team-tasks，新增 team-lab 全场景模板 | NOT-RUN |

完整逐例验收见 cases.json（含要求原文）；宿主缺口见 blockers.md。
