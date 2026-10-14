# 补充信息：SDK / CLI 增量对接要求

日期：2026-10-14。宿主内部模型工具已实现，本规范不代表独立 SDK/CLI 包已发布。

权威契约见 [User Input v1](contracts/user-input/README.md) 和 [Schema](contracts/user-input/tools.schema.json)；验收见 [U9 结果](user-input-u9-results.md)。

## SDK 增量对接要求

## 必须保持的边界

1. `input_capabilities/list/request/read_answer/resolve_from_message/cancel/replace` 是宿主绑定当前执行上下文的内部模型工具。不是 `context.inputs`、不是第三方 MCP 服务、不是扩展 Node SDK 方法，也不是 renderer IPC 的公开透传。首版本批不新增这些 Node 方法。
2. 现有 `forms_*` 与扩展 operation 保持原协议。补充表单收集答案，不调用业务 API、不授予业务操作权限。SDK 继续使用已有授权和 operation 链路。
3. 若导出动态定义类型/验证辅助，标注为纯数据契约，以宿主 `contracts/user-input/tools.schema.json` 为权威来源，不能借类型暗示可直接调用宿主。严格区分静态多步/operation 表单与动态单页补充表单。
4. `input_capabilities` 是模型侧运行时探测；不要把 dynamicForms 等数值抄进 ExtensionContext.capabilities，宿主并未开放那套协商。缺失工具时提示使用普通文字或原有静态流程；停用内置引导不会撤销第三方已有能力。

## 文档和示例必须覆盖

- 请求标识由宿主分配。模型只提供 requestKey、reason 和 source；不得发送 runId/conversationId/extensionId 或任意业务 URL。
- 创建重试必须相同 requestKey 和内容；不得生成新 key 绕过不确定结果、取消或冲突。
- 独立请求状态、投递状态与暂停策略。pending 无确认答案；answered 不能直接当作已送达。unknown 不能自动重发。
- 文字关联必须引用宿主提供的已送达用户消息 ID；部分或含糊回答不能假装完整。提案确认和原生 RPC 回答属于宿主 UI，扩展不得代用户点击。
- 只在实际能力允许时取消/替换；replacementId 可能仅是预留 ID，确认前不是第二个可填写表单。
- `executionUnitResume:0`，不宣传 A/B/C 独立执行单元恢复。

## 验收

类型或验证器与宿主正反例保持一致；保留旧 SDK 功能回归。SDK 不必为了本批强制发版；若只更新文档，明确报告“无新增运行时 API”。若现有类型误暴露上述不存在的方法，删除误导性声明并给出迁移说明。

## CLI 校验、示例与验收要求

## 校验

增加明确的“补充请求示例”校验入口或项目声明，不把所有 JSON 自动识别成请求。输入为工具调用 envelope 或 CLI 明确指定的 input_request 参数；与宿主 schema 的适配必须写清楚。

校验结构之外必须复用或等价实现宿主语义校验：字段重名、重复选项、非法日期、范围颠倒、类型不匹配、危险字段名、字节限额、预填错误。不要只跑 JSON Schema 就宣称等同宿主。动态定义不允许 operation/URL/script、分步、条件依赖、group-toggle、额外身份字段；最多 12 字段、50 选项，定义 32 KiB、预填/答案 64 KiB。真实配额以 input_capabilities 及宿主校验为准。

模板 key 必须来自宿主 forms_list；CLI 可以检查本地模板文件，但不能保证部署后的命名空间 key，也不能要求开发者写死 skill UUID。

## 脚手架与 Demo

提供可选示例：Skill 按需调用 input_capabilities，发现缺少相关信息后调用 input_request。参考仓库 `resources/skills/supplemental-input/examples/travel.json`；示例不是必装依赖，不复制内置 Skill 当成业务逻辑。

演示两条路径：动态通用收集；已注册单页 chat 模板用 `source.kind:template` 显式进入待补充区。旧 `forms_present` 页面不改变；operation/多步模板仍走原流程，不为了接入而丢掉业务授权。

只问与当前任务有关的字段，显示文案跟随用户语言、业务值稳定。不轮询；模型可继续真实独立工作；若关键资料仍缺失则说明等待，不编造结果。

## 必测

| 情况 | 预期 |
| --- | --- |
| 工具缺失/旧宿主 | 回退普通文字，明确未执行；不伪造交互 UI |
| 动态与静态 chat 示例 | 进入固定待补充区，填写并返回原聊天 |
| 重复 requestKey | 同内容去重、变更内容冲突 |
| 部分/矛盾的文字回答 | 保持等待或再次确认；不强行补齐 |
| 编辑期间替换 | 提案预览、接受/拒绝，旧草稿保留 |
| 稍后填写/用户取消/停止后取消 | 分别验证，不将折叠当取消、不唤醒停止任务 |
| unknown 投递 | 仅核实，不自动重发 |
| 停用内置引导 | 第三方合法工具能力仍可用 |
| 业务 operation | 原权限与确认保持，填表不是执行授权 |
| 重启 | 动态草稿/答案恢复，原生旧 RPC 不恢复，已投递不重发 |

提供实际 CLI 命令、校验正反例和可复现 Demo；真实模型行为测试与确定性 fixture 分开报告。不要把本批接口写入未获得宿主支持的 Node SDK 能力列表。
