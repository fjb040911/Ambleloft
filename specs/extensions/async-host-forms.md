# 异步宿主表单

状态：宿主源码已实现，macOS arm64 + 固定 Codex 0.153.4 验证。Windows/Linux 的实现适配与实机验证由后续任务推进。

## 使用方式

沿用声明式表单，不新增另一套 UI 协议。Skill 的 `amble-form` 声明使用 `submit.kind: chat`；模型通过 `forms_list` 获取模板，通过 `forms_present` 展示宿主表单。

1. `forms_present` 持久保存表单并立即返回 `{id, status: 'editing'}`，不会挂起等待答案。
2. 模型可以继续执行不依赖答案的工作。表单保持可填、自动保存草稿，聊天结束或应用重启不会丢失。
3. 用户提交并确认后，宿主持久保存答案及 submission ID。表单显示正在送达并锁定，避免多窗口或重复点击重新提交。
4. 有活动轮次时调用 `turn/steer`，携带 `expectedTurnId` 与 `clientUserMessageId`。准备中、排队中和结束清理期间等待合适时机；空闲时调用 `turn/start`。
5. 答案以普通用户输入发送，包含表单 ID、标题和字段标签/值。模型在后续推理中接收。运行中输入仍属于原轮次，UI、历史分页和摘要快照不会把它拆成新轮次。

业务操作表单仍走原有 operation 授权与核实流程。表单答复不代表业务写入授权。本次没有新增任意动态 JSON UI、原生 `request_user_input_async` 工具或外部 SDK 方法；现有声明式扩展表单直接复用这一能力。

## 持久投递

数据库迁移至 user_version 8，增加宿主私有 `chat_inputs` 表；该表不向扩展暴露。不同聊天独立投递，同一聊天串行。

| 投递状态 | 表单显示/行为 |
| --- | --- |
| queued / dispatching | pending；答案已保存，等待送达；禁止再次提交 |
| delivered | completed；引擎已接收，不表示业务任务已经成功 |
| failed | editing；确认未投递，可修改后重新提交 |
| unknown | unknown；不重试，可点击“核实提交结果”只读检查 |

- 每个 submission ID 在宿主队列中唯一；重复入队不会重复执行，内容冲突拒绝。
- 每次实际发送前重新检查表单来源、模板摘要/版本、所属聊天及项目，停用或更新来源后不投递。
- 引擎明确拒绝过期轮次时，重新排队判断当前轮次；传输超时或断线不直接回退为新轮次。
- 应用重启保留 queued；dispatching 转为 unknown。已确认提交但尚未发送的 queued 会恢复投递。
- 核实使用 `thread/read(includeTurns: true)` 查找 userMessage.clientId；已收到的本地接受回执也可作为证据。未查到不代表未执行，因此仍保持 unknown，不自动重发。
- 真实引擎探针验证了 client ID 在引擎重启后仍可读取，但没有假设引擎会对重复 clientUserMessageId 去重，也不承诺分布式恰好一次投递。
- 归档阻止新投递，永久删除聊天同时删除交互记录和投递记录。完成轮次的摘要快照保持不可变，之后的只读核实不会重新触发完成 Hook。

## 验证

```sh
node --test tests/chat-inputs.test.cjs tests/forms.test.cjs tests/automation.test.cjs tests/skills.test.cjs
node scripts/test-form-async-input.mjs
node scripts/test-declarative-forms.mjs
node scripts/probes/async-input-engine.cjs
npm test
npm run build
```

- 单元/数据库测试：持久去重、冲突、来源失效、准备/结束竞态、回执丢失、只读核实、跨聊天独立投递、历史分组及摘要包含追加答案。
- Electron 集成：隔离用户目录、真实固定 Codex、本地确定性模型。表单展示后独立工具继续执行；运行中提交保持单轮次，下一次模型请求包含答案；重启不重放。另验证草稿恢复与空闲提交。
- 原始引擎探针：Responses 与 Chat Bridge、错误/结束轮次拒绝、迟到新轮次、进程重启后读取 client ID。

测试不调用付费模型服务，不替代真实模型对任务依赖、等待时机和答案理解的产品评估。通用交互的跳过、取消、过期策略仍需单独设计；当前表单未提交时可留作草稿，不阻塞聊天。
