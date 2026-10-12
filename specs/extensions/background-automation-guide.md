# Hooks、轮次读取与后台摘要作业（M2 预览）

实现基线：2026-10-10，本仓库源码。需要使用同步后的 manifest schema 和 SDK 类型；**不表示已发布的 npm SDK/CLI 或旧安装包已经支持**。外部 extension-tooling 需要单独同步与验收。

## 一条完整链路

1. 宿主结束完整工具循环与最终回复后，使用一个 SQLite 事务保存聊天终态、不可变轮次快照与 Hook outbox。流式保存、工具结束和消息片段均不产生完成事件。
2. 宿主激活订阅的扩展后台，将事件交给声明的 handler。事件只有资源引用，不携带聊天正文或模型密钥。
3. 扩展调用 `context.conversations.getTurn({conversationId,turnId,version})`，按项目授权读取明确版本。
4. 扩展提交 `context.jobs.submit`。宿主解析授权引用、冻结文本输入并持久化，立即返回作业，不等待模型输出。
5. 宿主在用户开启自动化且额度允许时调用模型，验证 JSON 输出并保存结果；随后发送 `background.job.completed`。扩展用 `context.jobs.get(jobId)` 读取结果，再自行保存、发布消息或同步业务服务。

## 清单与权限

```json
{
  "specVersion": "1.0-draft",
  "publisher": "example",
  "name": "summary",
  "version": "1.0.0",
  "displayName": "Turn summaries",
  "engines": {"api": "1"},
  "main": "main.cjs",
  "permissions": [
    {"capability": "agent.hooks", "scope": "project"},
    {"capability": "conversations.read", "scope": "project"},
    {"capability": "background.jobs", "scope": "project"}
  ],
  "hooks": [
    {"event": "conversation.turn.completed", "handler": "summarize"},
    {"event": "background.job.completed", "handler": "completed"}
  ]
}
```

安装、信任扩展后，在“权限”中授权项目；再到扩展详情的“后台自动化”选择模型服务、模型、每 24 小时调用额度，开启并保存。授予读取权限本身不会开启模型调用。扩展不能设置自动化策略或读取模型凭据。

```js
exports.activate = context => {
  // activate 同步注册；异步工作放在回调内。
  context.hooks.register('summarize', async event => {
    await context.jobs.submit({
      projectId: event.projectId,
      eventKey: event.eventId,
      prompt: 'Summarize the completed turn in the language of the conversation.',
      turns: [{ conversationId: event.conversationId, turnId: event.turnId, version: event.version }],
      outputSchema: {
        type: 'object',
        properties: { summary: { type: 'string', maxLength: 4000 } },
        required: ['summary'],
        additionalProperties: false
      }
    });
  });
  context.hooks.register('completed', async event => {
    const job = await context.jobs.get(event.jobId);
    // 所有终态都可能到达，包括 failed / unknown。业务副作用必须按 job.id 幂等。
    if (job.status === 'succeeded') console.log(job.id, job.result.summary);
    else console.log(job.id, job.status, job.error);
  });
};
```

`getTurn` 返回 `{conversationId,turnId,version,projectId,status,messages:[{id,role,text}]}`。首版只提供轮次文本，不返回独立的项目路径字段、附件二进制、工具执行参数或完整运行对象；正文中原本出现的路径仍属于文本。version 1 为冻结终态，不覆盖；没有开放历史轮次列表或任意版本编辑。找不到指定版本、会话已删除、项目迁移与快照所属项目不一致时返回明确错误，绝不回退到最新内容。

## 投递、恢复和额度

- ACK 是 handler 成功返回。相同 eventId 可多次到达，业务写入必须幂等。首次失败后最多 5 次重试，指数退避加抖动；handler 30 秒超时。聊天不会等待 handler 或模型。
- 每扩展最多 1000 条未清理事件，容量不足时以可见的 `queue.overflow` 失败记录累计缺口；不会静默丢失，也不会阻塞聊天。该记录不能作为业务事件重放。
- 同一聊天的后续事件等待前一个 pending/delivering 的尝试完成；死信不阻塞后续事件。跨聊天不承诺全局顺序。当前一个全局投递槽、一个模型作业槽。
- 未确认事件和轮次快照保留 7 天。超期事件转为失败记录；失败记录允许丢弃，未过期事件允许手动重投。重投不保证正文仍存在。
- 禁用、卸载、撤权清除对应事件并取消排队作业；运行中无法确认的请求标为 unknown。重新授权不补历史。项目删除或源会话迁移/删除会阻止排队输入继续使用。
- 作业默认关闭；每扩展滚动 24 小时默认 20 次，可设 1–100。请求发出前消耗一次额度，失败/未知也计入。此为调用数预算，**不是金额预算或精确 token 计费**。
- 每次提交 1–10 个轮次；冻结正文总计最多 48 KB，提示词最多 8000 字符；输出至多 2048 tokens，HTTP 响应最多 256 KB，模型请求最长 120 秒。超限返回 QUOTA_EXCEEDED 或失败，不自动压缩、不截断成另一版本。
- 每扩展最多保留 1000 个作业；已完成记录不会自动删除以免破坏 eventKey 幂等。可通过宿主管理端清理 7 天前的成功、失败或取消记录；unknown 保留供核对。卸载并删除数据会清除全部作业和策略。
- eventKey 在扩展范围内去重；相同 key 相同输入返回原作业，改输入返回 CONFLICT。同输入的 unknown 不能通过换 key 自动重发；用户确认“重新生成”可创建新的关联作业，可能重复计费。
- 重启后：queued 重新检查授权/策略/额度；已有结果直接投递；running 恢复为 unknown 并通知扩展。不承诺提供方恰好执行一次。首版不查询提供方远端结果。
- 改换模型后，已有 queued 作业仍绑定原模型，恢复原选择后才继续。暂停或退出时取消等待中的 HTTP 请求，已发出的请求可能计费。
- 只接受直接的 Chat Completions / Responses 非流式 JSON 输出；不提供工具、不运行 Agent、不执行模型建议的业务操作。输出不符合 schema 时失败，不追加“修复格式”请求。

状态机：`queued → running → succeeded | failed | unknown`；撤权可 `queued → cancelled`。作业管理不修改源聊天。结果业务同步和摘要质量由扩展负责。

## 平台与验证

持久化、调度、授权和 HTTP 作业使用 Node/SQLite，无平台专属 shell、守护进程或路径拼接。扩展继续运行于宿主现有隔离进程，凭据沿用平台系统加密存储。完整 Node 扩展不是 OS 沙箱。

`node --test tests/automation.test.cjs` 覆盖事务、版本读取、重试、撤权、预算、重启与真实子进程 SDK 链路。`node scripts/test-extension-automation.mjs` 使用隔离用户目录与本地模拟模型服务，验证真实 Electron/utilityProcess、HTTP 请求与应用重启。Windows/Linux 安装包和平台实测仍属于 A8，不能由本机测试代替。
