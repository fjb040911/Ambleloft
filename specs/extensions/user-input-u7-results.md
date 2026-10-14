# U7 请求生命周期、提案确认与恢复

日期：2026-10-14。U7 已实现。开发模式需完整重启 Electron 后台；新执行上下文才会发现新增模型工具。没有重启或中断用户正在运行的任务。

## 已交付

- 内部 MCP 开放 `input_cancel` / `input_replace`，能力位 `cancel:1` / `replace:1`。继续绑定执行上下文与聊天、严格校验输入。模型只收到请求状态、版本和提案/替换 ID，不读取未提交草稿。
- 未编辑请求原子替换：旧请求进入 superseded、新请求获得独立 ID 和 replacesId，共享原来的 pending 配额槽。总历史仍受 100 项限制。
- 已编辑请求只保存一个替换提案，预留 replacementId，不创建第二个 pending。原草稿保留，用户可以继续填写、提交原表单，或预览后接受/拒绝建议。原表单提交会清除提案。
- 提案确认使用预览时的 revision、proposalId 和稳定 clientMutationId；跨窗口更新、预览期间继续编辑均不能静默接受旧版本。草稿冲突仍保留本地缓冲并要求明确选择。
- 文字关联提案展示字段值及原始用户消息，确认后生成一条结构化答案投递，不再次追加原文。暂停时提供“确认并继续”，同一事务恢复策略并仅放行本次答案，其他 queued 项保持 held。
- 用户取消需确认，保留只读原填写，不把默认值或预填当成答案。取消不会停止整个任务，也不会恢复暂停任务。历史可查看已取消/替换请求的原填写。

## 通知与恢复规则

模型取消/替换通过工具回执知晓结果，不额外入队通知。用户取消、接受替换或拒绝建议产生幂等通知，`activeOnly` 限制其只能进入活动轮次；空闲时 held，必须由用户选择继续。运行中入队后若恰好结束，运行时仍会拒绝自动 start 并将其转为 held。显式恢复所选通知才设置 allowIdle。

请求、命令回执、提案和 outbox 使用已有 SQLite 事务。配额失败回滚；同命令重试返回原回执。正常轮次结束不清空动态 pending；重启保留请求与草稿。来源停用对终态通知也永久标记 sourceInvalid，重新启用不恢复旧投递。

原生 `serverRequest/resolved` 按 thread 和原始类型的 RPC requestId 清理问题，不生成回答。回答继续走原 RPC；轮次结束沿用现有清理。应用重启清除所有聊天中的旧原生问题，包括状态已空闲的聊天，绝不向新进程重放旧 RPC。

投递面板增加“核实是否送达”。`reconcile` 先校验聊天归属，再只读查询既有记录和引擎历史；有证据才从 unknown 转 delivered，没有证据仍为 unknown，不重排、不重发。诊断依赖请求/投递 ID、revision、状态和错误 code；新增流程没有将答案或消息正文写入诊断日志。UI 展示“可能已经送达”而不是断言失败。

## 接口增量

- renderer `inputs.action` 新增 `cancel`、`acceptProposal`、`rejectProposal`，沿用请求 ID / revision / clientMutationId；提案操作带 proposalId。
- `acceptProposal` 的文字回答确认支持可选 `resume:{expectedPolicyGeneration}`；与 submit 的原子恢复一致。无恢复参数且已暂停时拒绝提交。
- `reconcile` 参数为 `{action:'reconcile',runId,deliveryId}`，返回只读核实后的投递记录。
- 请求 renderer 类型增加 proposal、replacesId/replacedById 和文字答案证据。模型投影仍不包含提案完整内容或草稿。
- 这仍是内部模型工具和宿主 IPC，没有新建第三方 Node SDK API，也没有提前宣称 ExecutionUnit 调度可用。

## 验证

- 全量 Node 回归：337 项，336 通过、1 跳过、0 失败（新增来源停用回归前的全量结果）。最终针对 InputRequests、模型 MCP、runtime 与 ChatInputs 的专项回归：65 项通过。
- 正式 Conversation 的浏览器测试：10 项，覆盖原有 U6 交互及替换预览/拒绝/接受、取消确认、暂停时文字回答确认并继续、unknown 只读核实。
- TypeScript 检查通过。已检查提案预览截图，复用 shadcn/ui Alert、AlertDialog、Button 和既有表单组件，未引入独立视觉系统。
- 服务测试使用真实 SQLite，MCP 用本机 HTTP；页面测试使用正式组件与模拟 IPC。实际模型、固定引擎双协议与打包客户端的完整验收仍属 U9。

下一阶段 U8：内置补充信息 Skill 的分发、发现、能力探测和使用指导。
