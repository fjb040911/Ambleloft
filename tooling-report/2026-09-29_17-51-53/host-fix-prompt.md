请在 agent 宿主项目阅读 tooling-report/2026-09-29_17-51-53/README.md、capability-matrix.md、blockers.md 与 evidence/desktop/agent-output.json，依据 requirement/v0.1.0 和 specs/extensions 修复本轮宿主错误契约缺口。忽略 ai-rules。

优先修复：
1. Agent 调用已有 conversationId 的 openConversation 时，operations.cjs 抛 INTERACTION_REQUIRED，但 hosts.cjs 经 errors.cjs 白名单变成 INTERNAL。补齐规范公开错误码的安全透传，仍禁止 Agent 打开页面；未知错误不得泄露内部信息。
2. bootstrap 本地未初始化、队列满、超时和 shutdown 错误，以及 page-preload initialize 失败，仅保留文本。请统一结构化 code，明确调用是否已派发以及 effectStatus，不让 SDK 猜测字符串。用真实子进程和页面桥验证；rpcProbe 已能实际触发队列满。
3. Node l10n 动态 locale 目前没有公开更新契约：先确认是否本轮实现，若变更协议需提供兼容提案；不能通过偷偷重启应用宣称实时更新。

不得把非空 actions、认证、通用消息订阅提前声明可用。系统横幅需实际观察，不用 remind 代替。

补针对性测试、构建宿主，再复用 ../extension-tooling/scripts/test-team-lab-desktop.mjs 验证。其 rpcProbe 当前记录旧宿主无 code 缺口，修复后应将此断言更新为有结构化 BUSY 等错误并保留原始证据，不能删掉用例。Agent INTERACTION_REQUIRED 期望仍保持原契约。

将修复报告、日志、截图及源码指纹放到新的 tooling-report/YYYY-MM-DD_HH-mm-ss/（Asia/Shanghai），引用本轮基线并更新总索引，不覆盖历史，不自动发布、提交、推送或合并。
