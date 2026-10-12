# Codex 异步输入机制探针

验证日期：2026-10-10。当前 Ambleloft 解析出的引擎为 Codex **0.153.4**；实测平台 macOS arm64。

## 结论

当前引擎已具备所需基础能力，**无需更换引擎或依赖特定模型厂商的异步表单 API**。推荐组合现有 MCP `forms_present`（立即返回）与 app-server `turn/steer`（用户完成填写后向活动轮次追加输入）。这不等于 Ambleloft 已完成产品接入。

不能把原生 `request_user_input` 请求里的 `isBlocking:false` 当作模型必然继续执行的证据。本次实际收到该字段为 false，但延迟回答 2 秒期间没有下一次模型请求；回传 RPC 答案后才继续。该字段的完整引擎语义不在本探针中推断。

## 方法

运行：

```sh
node scripts/probes/async-input-engine.cjs
```

- 使用真实 Codex app-server 与项目现有 CodexRPC、Chat Bridge、扩展 MCP 通道。
- 初始化方式与当前 AgentRuntime 一致，**不启用 experimentalApi**。
- 每组使用临时隔离引擎目录和本地确定性模型端点；不读取真实应用配置、不调用付费模型服务。
- 模型端点按既定顺序返回工具调用，检查后续实际请求是否包含答案，而非只检查 RPC 成功。
- 表单渲染回调用模拟 `{id,status:'editing'}` 表示已展示，验证的是引擎/MCP 时序，不是新的 UI 实现。

## 实测结果

| 探针 | 观察与断言 |
| --- | --- |
| 原生 request_user_input | 可用；收到 item/tool/requestUserInput，isBlocking=false；2 秒观察窗内仍只有第一次推理请求；RPC 回答后第二次推理确实包含答案 |
| request_user_input_async 工具发现 | 在当前宿主配置和 fixture 模型的工具目录中未暴露该名称；不能据此断言所有 Codex 产品/模型配置都不存在此能力 |
| 活动轮次 steer | 推理响应保持未完成时提交 turn/steer，返回原 turnId；释放响应后，后续模型请求包含新答案；期间只有一次 turn/started |
| 宿主表单 + Responses | 第一次调用 forms_present 并立即返回；第二次调用独立的 extension_list_operations 完成工作；第三次推理未结束时提交答案；第四次推理收到答案，仍是原轮次 |
| 宿主表单 + Chat Completions | 经过项目现有 Chat Bridge，重复上一组链路成功 |
| 轮次边界（后三组均验证） | 错误 expectedTurnId 被拒绝；轮次结束后 steer 被拒绝；随后 turn/start 成功启动不同的新轮次，新请求同时包含迟到答案和此前历史 |

“独立工作”使用可观测、无副作用的 MCP 回调；它发生在表单展示之后、答案注入之前。该结果证明非阻塞交互不要求一直挂着表单工具调用。

## 建议接入契约

1. 展示工具立即返回 `interactionId` 和 `pending` 状态；该返回值不是用户答案，更不是用户授权。
2. 宿主持久保存表单、所属 conversationId 和提交结果。
3. 用户提交时，活动轮次使用 `turn/steer`，带准确的 `expectedTurnId`。输入为宿主封装的用户提交数据，不伪装成系统或开发者指令。
4. 没有活动轮次时，在重新检查状态后通过 `turn/start` 开启后续轮次。若 steer 与轮次完成竞态发生，先核实是否已接收再决定回退，避免重复提交。
5. 引擎 RPC 成功表示接收，后续 item 事件和持久记录用于核对；不能将 clientUserMessageId 直接当作已经验证的幂等保证。
6. 非阻塞仅允许执行不依赖答案的工作；业务写入授权仍必须等待用户明确批准。

探针阶段（接入前）的宿主缺口是持久交互状态、运行中提交路由、可靠投递/去重、迟到答案、取消/跳过/过期及 UI 生命周期。原生 questions 在 finish/重启时会清除，不能承担持久宿主表单职责。探针本身未修改这些生产行为。后续已完成的生产接入见 [异步宿主表单](./async-host-forms.md)。

## 验证边界

通过确定性模型验证了接口和传输机制，不代表已验证真实模型选择提问时机、理解答案或任务依赖的行为。追加验证确认 userMessage.clientId 在引擎进程重启后仍可通过 thread/read 读取。恰好一次语义、重复 clientUserMessageId 的引擎去重、Windows/Linux 实机或 Codex 桌面产品内部实现未作保证；宿主恢复验证见接入文档。

官方文档也将 turn/steer 定义为向活动轮次追加用户输入，要求 expectedTurnId，且不产生新 turn/started：
[Codex App Server — Steer an active turn](https://learn.chatgpt.com/docs/app-server#steer-an-active-turn)。文档会更新；以上具体行为以固定 0.153.4 的探针结果为准。
