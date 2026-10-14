# U0：补充信息契约冻结与协议探针

日期：2026-10-14。代码审计基线：`d54463f`。状态：**U0 完成，U1–U9 尚未实现**。产品决策 D1–D5 保持不变。

## 交付

- [施工契约](contracts/user-input/README.md)：工具输入/输出、持久请求、文字来源、状态、停止/恢复、替换竞态和内部 IPC。
- [工具 Schema](contracts/user-input/tools.schema.json)：七个工具的严格输入结构；动态字段与现有表单字段子集对齐。
- `tests/user-input-contract.test.cjs`：结构、上限、来源引用、未知字段与业务执行绑定拒绝。
- `scripts/probes/async-input-engine.cjs`：增强原生问题回答及中断后的 resolved 断言，保留既有双协议异步表单与 steer 探针。

以上为施工约束，未修改运行时工具列表或 host-capabilities.json；不能据此宣称新工具已经可调用。

## 冻结决策

1. 七个模型工具：input_capabilities/list/request/read_answer/resolve_from_message/cancel/replace，详细参数以 Schema 为准。上下文由宿主绑定，输入中不接受任意聊天或扩展身份。
2. 动态单页表单最多 12 字段、定义 32 KiB、每聊天 5 个 pending/100 个总请求；选项每字段 50 项、答案 64 KiB；新输入通道每聊天最多 32 条未完成投递。定义与答案另做语义验证。
3. 请求状态、投递状态、暂停策略分开；停止不变相取消草稿，恢复只放行用户明确选中的积压项，不自动重发 unknown。
4. 文字关联必须保留真实用户消息引用及模型解释，已在上下文的原文不再次投递；草稿冲突转人工确认，不代替业务授权。
5. 当前 MCP 无原始引擎 toolCallId，冻结 requestKey 幂等输入。宿主按绑定聊天/真实来源隔离，同键不同定义冲突；键不能提供权限。替代早期“直接使用原始工具 ID”的设想。
6. beginEdit 与替换通过 CAS 竞争；已输入但未收到编辑回执的内容留在前端缓冲，不允许替换静默丢失。历史旧请求只读。
7. 首版不提供 executionUnitResume；内置 Skill 只读、随应用版本分发，禁用不撤销底层能力。已有业务模板和授权路由保持兼容。

## 本机协议实测

环境：macOS darwin arm64；项目内固定 Codex **0.153.4**；临时隔离 home、本地确定性模型服务，无付费模型请求。

| 项目 | 结果 |
| --- | --- |
| 原生 request_user_input | 工具可见，发出 item/tool/requestUserInput；回答按原 JSON-RPC id 返回，后续模型输入包含答案 |
| 原生问题 resolved | 回答后恰好一个 serverRequest/resolved，threadId/requestId 与原请求一致 |
| 原生问题中断 | turn/interrupt 后状态 interrupted；恰好一个 resolved，未启动后续推理请求 |
| isBlocking | 实测请求携带 false；探针回答前的观察窗口内未出现下一次推理请求。因此不能用该字段承诺主循环继续工作；不推导其他引擎/执行场景行为 |
| request_user_input_async | 当前工具列表不存在；这是兼容性发现，不是新宿主异步功能失败 |
| 活动 turn/steer | expectedTurnId 正确时接受，同一轮次追加；错误或已结束的 turn 被拒绝 |
| 迟到答案 | 已结束后以同 thread 的新 turn 继续；既有上下文仍可见 |
| 持久核实 | clientUserMessageId 可由 thread/read 读回，重启引擎后仍在；不据此承诺引擎自动幂等重放 |
| 异步宿主表单 | forms_present 立即返回后，独立工具继续；Responses 与 Chat Bridge 均验证运行中追加仍属于同一轮次 |

原生问题与中断探针本轮只验证 Responses 路径；双协议验证指宿主表单/steer，不将结果扩大到全部原生工具模式。

## 验证命令与结果

```sh
node --test tests/user-input-contract.test.cjs tests/chat-inputs.test.cjs tests/runtime.test.cjs
node scripts/probes/async-input-engine.cjs
```

28 项测试通过；真实固定引擎探针完成，原生回答/中断、steer、两种表单协议全部断言通过，异步原生工具缺失明确记录。Schema 编译通过，文档链接和 git diff --check 通过。

本轮不运行全量 UI/发行测试：未改正式运行时或页面。尚需 U1–U9 覆盖新请求服务的真实落地、停止队列竞态、多窗口、表单交互与发行验收；Windows/Linux 原生实测不在本轮结果内。
