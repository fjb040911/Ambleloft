# User Input v1：U0 冻结施工契约

日期：2026-10-14。状态：**施工契约已冻结，U1–U8 已实现，正式任务界面已启用模型工具**。独立目录防止与已开放 SDK 混淆；不向 host-capabilities.json 写入支持声明。实现符合本文及 [工具输入 Schema](tools.schema.json) 后才开放能力。U0 探针结果见 [记录](../../user-input-u0-results.md)。

## 1. 工具与能力

通过现有、按执行上下文绑定的内部 MCP 接入，工具名见 Schema。工具只能操作其所属聊天；禁止输入 runId、conversationId、extensionId、nodeId 或外部 endpoint。模型动态来源记为 model，不能因提示词声称自己是某 Skill 就授予扩展身份。

| 工具 | 成功返回 |
| --- | --- |
| input_capabilities | `{version:1,dynamicForms:1,persistentRequests:1,messageResolution:1,cancel:1,replace:1,executionUnitResume:0,limits:{...}}`；各能力仅实现并验收后置 1 |
| input_list | `{requests:[RequestSummary],sourceMessages:[{id,sequence,text,truncated}],sourcesTruncated:boolean}`，列出本聊天 pending 与仍需处理投递的请求，以及最近可引用用户消息 |
| input_request | `{requestId,revision,state,created:boolean}`（首次为 pending，重试返回当前状态），持久化后立即返回 |
| input_read_answer | `{requestId,revision,state,answer:AnswerSnapshot|null,delivery:DeliveryReceipt|null}`，终态可读；不支持跨聊天查询 |
| input_cancel | `{requestId,revision,state:'cancelled'}`；模型调用 reason 为请求已不需要的原因，不记录成“用户取消” |
| input_replace | `{requestId,revision,outcome:'replaced'|'confirmationRequired',replacementId,proposalId?:string}`；待确认 replacementId 仅预留，不产生第二个可操作 pending |
| input_resolve_from_message | `{requestId,revision,outcome:'resolved'|'confirmationRequired',proposalId?:string}`；已解决答案可通过 read 查询 |

错误沿用统一 envelope：`{ok:false,error:{code,message,details?}}`，成功服务层返回 `{ok:true,value:...}`；MCP 对错误设置 isError，details 只带安全字段路径/当前版本，不返回其他聊天数据。INVALID_ARGUMENT、NOT_FOUND、CONFLICT、FORBIDDEN、QUOTA_EXCEEDED、STORAGE_UNAVAILABLE、UNSUPPORTED 必须可区分。MCP/JSON-RPC 请求 id 仅用于传输，不可当持久创建幂等键。

request summary 包含 id/revision/title/reason/origin/state、draftTouched、createdAt、待确认 proposal 概要和 delivery；默认不向模型暴露尚未提交的用户草稿。所有时间 UTC ISO 字符串，revision 为非负安全整数，宿主生成 UUID 为请求/提案/提交/投递标识。

## 2. 定义、语义与限制

动态 source 为 `{kind:'dynamic',definition:{title,description?,fields}}`；模板 source 为 `{kind:'template',key}`。prefill 是平面 fieldName→scalar；模板首版仅允许单页、submit.kind=chat、无业务 operation 的信息补充模板，宿主据目录绑定真实来源。多步骤或超出子集的模板返回 UNSUPPORTED，旧 forms_present 完全不变。

宿主将动态定义转换成现有表单结构（version 1，宿主生成模板 id，一个 details step，固定 chat 提交）；工具不接受提交按钮、prompt、operation 或任意校验脚本。复用现有 normalize/validateValues 的日期、金额、数字和 required 语义。动态字符串按字面呈现，`%key%` 不从任何 Skill 词典查找；模板使用自身词典快照。

冻结限制：12 字段；定义 JSON UTF-8 32 KiB；每聊天 pending 请求 5 个；每请求至多 1 个未处理提案；每聊天持久请求总计 100 个；options 每字段至多 50 项；答案/prefill 编码 64 KiB，单字符串至多 20000 字符；每聊天未完成投递最多 32 条（含 queued/dispatching/unknown）。超过上限拒绝，不丢弃旧数据。

普通补充文字最多 20000 字符且编码不超过 64 KiB。理由 500 字符、标题 120、说明 2000。动态 schema 不允许 group-toggle、联动、隐藏字段、脚本、附件或密码输入。重复字段/选项 value、危险键、NaN/Infinity、属性类型不匹配、min>max、不存在的预填字段都必须在语义层拒绝。Schema 只验证结构；字节限制和语义检查不可省略。

input_list 最多返回 20 条最近“用户主动输入、已送达”的消息证据，正文每条最多 2000 字符、总计 32 KiB；截断明确标记。模型无法从可见片段确认的答案应询问用户，不能猜测被截断内容。resolve 至多引用 8 条，宿主读取完整不可变消息快照；可引用创建请求前的真实消息。助手输出、工具结果、扩展生成的提示词、未发送草稿、自动表单投递文本不算用户主动文字。模型未出示来源或来源不在当前聊天均拒绝。

## 3. 状态与数据事务

请求状态：pending → answered / cancelled / superseded / expired，终态不能回到 pending。replacement 必须新 id，replacesId 记录旧请求。原生问题只做展示适配，不强行套用可恢复的持久 RPC 状态。

AnswerSnapshot：`{id,requestId,requestRevision,source:'form'|'userMessage',values,displayLabels,locale,createdAt,sourceMessages?:[{id,sequence,text}],interpretation?:{values}}`。引用文字与模型解释分开，存储真实来源快照；诊断日志禁止正文。部分回答不调用 resolve，保持 pending，由模型提议补充或请求修改；首版不另加自动部分填表工具。

表单提交：检查所有权/状态/来源/配额/revision → 校验答案 → 冻结快照 → 创建唯一 outbox → 请求 answered；同一数据库事务完成。CAS 与幂等键判断必须先于终态拒绝，以便安全返回重复成功回执。

文字关联：同一事务保存答案与证据并置 answered；模型已收到原文，返回工具结果，不新增 steer/outbox。存在用户已编辑且冲突字段时保存提案并返回 confirmationRequired，不覆盖草稿；用户确认提案后才冻结答案，确认是明确用户操作，可按当前执行状态投递一次关联结果。关联不开放给业务 operation、原生授权或原生 RPC 问题。

投递状态沿用 queued → dispatching → delivered/failed/unknown；引擎明确拒绝轮次边界才允许 dispatching→queued；unknown 仅通过只读核实到 delivered，禁止自动重放。暂停为独立聊天 policy，不伪装 failed。无 outbox 的文字关联 delivery 为 null，记录工具调用来源即完成当前消费者接收。

所有 mutating renderer 命令带 clientMutationId 和 expectedRevision。幂等键作用域为聊天+方法+clientMutationId；同键不同规范化输入返回 CONFLICT。MCP 当前不传原始引擎 toolCallId，因此 request/replace 的定义内必填 requestKey，由调用方生成并在重试时复用。宿主以“绑定聊天+真实来源+requestKey”作幂等键，保存定义摘要；同键不同内容 CONFLICT，同键相同内容返回既有结果（包括已终态），新的业务询问使用新键。requestKey 仅是去重标识，不是授权凭据或来源身份，模型不能用它越过绑定聊天。保留 MCP transport id 供诊断，不用它做持久去重。

## 4. 停止、恢复与生命周期

聊天持久 policy：`{paused:boolean,generation:number}`。停止先事务设置 paused=true 并递增 generation，再通知引擎 interrupt。派发持有原 generation，发送前再次检查；数据库更新、RPC 发送和 stop 在同聊天串行派发锁内有明确先后。已经发出的只能按回执判断，不能许诺停止会回滚业务。

暂停后允许保存草稿，submit 默认返回 INTERACTION_REQUIRED，UI 显示“提交并继续”。恢复命令携带显式 deliveryIds（需展示待送内容及数量）和 expectedPolicyGeneration；仅选中的旧 queued 与当前提交进入放行集，未选项继续暂停。禁止一次继续静默放行所有历史积压；U1 实现采用聊天级 generation CAS 加逐项 held 标志，避免仅解除聊天暂停就误发未选项。

用户普通继续聊天也走显式恢复策略。正常轮次结束未暂停的 queued 可在同聊天新轮次投递；取消/替换生成的通知只在活动轮次或用户明确继续时投递，不为了告知取消单独唤起空闲模型。模型自己执行 cancel/replace 通过工具回执知晓，不额外给自己发送通知。

动态 pending 跨正常完成/重启保留；停止保留草稿并暂停 outbox；归档阻止新提交，既存 queued 保持暂停，恢复聊天不会自动发出旧内容。来源停用或版本失配置 expired 并拒绝新投递；重新启用不复活旧请求。删除聊天级联清理。无自动过期或自动提交倒计时。

原生问题在 RPC 回答/服务端 resolved/结束/中断时按 requestId 清理；清理不能被记录成用户已回答。恢复应用时旧原生 RPC 失效，不发送到新进程。不能因 isBlocking=false 就断言引擎主循环不等待。

## 5. 编辑与替换并发

第一次编辑前请求 beginEdit，宿主设置持久 userTouched 标记并返回 revision；输入可先在前端缓冲，未取得回执不得认为已保存。自动替换与 beginEdit 在数据库 CAS 下竞争；若替换先完成，前端保留本地缓冲并提示用户迁移，不能将新定义静默盖到输入上。userTouched 保持为真，即使用户删空或重启也不判定为未编辑。

没有用户编辑时 replace 原子创建新请求并将旧请求 superseded；替换与原请求共享 pending 配额槽。有编辑时保存 proposal，旧请求仍可填写/提交；提交原请求则取消提案。接受提案带原 revision 与 proposalId，草稿发生变化后返回 CONFLICT 保留两份信息；拒绝提案不改变旧请求。明确映射后的迁移预览由用户接受，不根据同名字段自动覆盖。

## 6. Renderer 内部 API（不属于 Node SDK）

所有命令通过已有 authorize(event) 绑定窗口/profile，聊天权限和归档由宿主再校验。冻结通道为 `input:list`、`input:action`、`input:append`、`input:event`。

- list `{runId}` 返回 dock 列表、policy、投递回执及本窗口需要展示的草稿，原生请求保持其专用 answer API。
- append `{runId,clientMutationId,text}` 只用于运行中补充；已暂停返回 INTERACTION_REQUIRED，不能暗中恢复。
- action 判别字段 action：beginEdit/saveDraft/submit/cancel/acceptProposal/rejectProposal/reconcile/resume。请求操作带 runId/requestId/expectedRevision/clientMutationId；saveDraft/submit 带 values，提案操作带 proposalId，reconcile 带 deliveryId，resume 带 expectedPolicyGeneration/deliveryIds，可带本次待提交请求的完整 CAS 参数。
- “稍后填写”、展开状态为界面状态，不改变请求状态；用户草稿保存走 saveDraft。
- event 仅携带 runId/变更 revision 提示，不广播答案正文，收到后按权限重取。

内置 Skill 采用随应用版本分发的只读资源，通过引擎上下文中的简短能力说明按需引导读取；不得要求用户手动安装。用户禁用只停止自动引导，不使已存在请求失效、不撤销第三方合法工具访问。没有该 Skill 也可使用普通补充输入。


## U1 当前已实现的宿主内部接口

这些是 renderer → preload → 主进程接口，不是扩展 SDK API，不代表动态模型工具已开放。

- `input:append`：`{runId, clientMutationId, text}`。限制 20,000 字符且最多 64 KiB，拒绝空白及额外字段。返回持久队列记录；接受不等于已进入模型。
- `input:list`：`{runId}`。返回 `{policy:{paused,generation},deliveries}`，最多最近 100 条投递记录。
- `input:action`：当前仅支持 `{action:"resume",runId,clientMutationId,expectedPolicyGeneration,deliveryIds}`。最多 32 个去重 ID，全部必须属于本聊天且仍为 queued；空列表表示继续接受新补充，但不释放旧积压。相同恢复请求可重试；不同参数复用最后一次 mutation ID 或过期 generation 返回 CONFLICT。
- `input:event`：`{runId}`，仅提示重新读取，不广播答案全文。

记录包含 id/runId/text/state，普通文字另有 `source:"user"`，旧表单保留 flowId。可选 held/error/target；state 为 queued/dispatching/delivered/failed/unknown。paused 或 held 项不得自动派发。普通 append 在停止后返回 INTERACTION_REQUIRED；U2 需要先展示明确继续操作。当前表单提交仍沿用旧接口，停止时保存进队列但不自动运行；后续统一 dock 的“提交并继续”由 U3/U6 接入。

beginEdit/saveDraft/submit/cancel/acceptProposal/rejectProposal 等动态请求 action 仍是目标契约，U1 未开放。恢复仅放行 queued，不重发 unknown；后者继续使用既有宿主只读核实能力，普通输入核实的页面入口后续接入。

## U3 增量（覆盖上节对应的 U1 状态）

`input:list` 已增加 renderer 专用 requests，包含草稿、版本、状态和冻结答案；归档历史可读。`input:action` 已支持 beginEdit/saveDraft/submit，均带 runId/requestId/expectedRevision/clientMutationId，saveDraft/submit 带 values。字段错误通过 preload 保留 code/message/fields。

暂停时 submit 拒绝并保留 pending/草稿；不自动恢复。提交事务包含状态、答案、唯一 outbox 和命令回执，配额失败整笔回滚。U2 界面仍只展示投递状态；请求字段的可交互展示由 U4/U6 完成。create 当前仅为宿主内部已解析模板入口，不能将模型提供的来源直接传入。模型工具、取消/替换/文字关联尚未开放，完整状态见 [U3 结果](../../user-input-u3-results.md)。

## U4 增量

内部 createDynamic 使用冻结 Schema 校验动态来源，只允许单页 chat 定义并绑定 model 身份。复用静态字段控件的受控适配已完成，未开放模型工具和正式 dock。动态文本中的词典标记按字面量处理，选项业务值不翻译。校验与发布资源验证见 [U4 结果](../../user-input-u4-results.md)。

## U5 增量

模型工具适配器与执行上下文绑定已实现，默认不在普通任务启用；U6 接入固定待补充区后开启运行时内部就绪开关。已实现 capabilities/list/request/read_answer/resolve_from_message，cancel/replace 仍不公布。静态模板通过 template source 显式 opt-in，不改变 forms_present。

列表与答案采用独立模型投影，不包含未提交草稿；文字关联仅引用持久化、可信 user 来源且 delivered 的消息。草稿首次发送来源暂不可证明，保守排除，历史消息不补写来源。凡 beginEdit 后都需确认提案，保护未保存的前端输入；提案操作由 U6/U7 完成。创建重试返回当前状态，语言变化不改变模型请求的幂等身份。详见 [U5 结果](../../user-input-u5-results.md)。

## U6 增量（当前启用状态）

正式 Conversation 已接入固定待补充区，主进程启用 inputToolsEnabled；完整重启后台后的新执行上下文可发现 U5 工具。pending 历史只提供定位，不创建另一份编辑表单。原生问题保留专用 answerRun 通道。

内部 input:action 的 submit 可带 `resume:{expectedPolicyGeneration}`。这是明确的“提交并继续”：在同一数据库事务内恢复策略、将旧 queued 保持 held，并只将本次答案入队。无效答案、过期 generation 或队列满均回滚，重复 clientMutationId 返回原回执。saveDraft 和 beginEdit 不接受 resume。错误通过 preload 保留 code/message/fields。

取消、替换及提案确认仍由 U7 交付，当前不显示伪操作。详见 [U6 结果](../../user-input-u6-results.md)。


## U7 实际开放状态

`input_cancel`、`input_replace` 已开放，分别返回终态回执及替换/待确认回执；pending 配额共享、预留 replacementId、提案 CAS 与幂等回执已实现。renderer cancel/acceptProposal/rejectProposal/reconcile 已接入正式任务界面。文字回答提案的 acceptProposal 与 submit 均支持 `resume:{expectedPolicyGeneration}`，事务内只恢复本次答案；取消、替换通知需要活动轮次或用户显式放行，不能自行启动空闲任务。

提案内容仅 renderer 可见，模型列表只提供 id/kind。原生 resolved 按原 RPC 身份清理，重启不恢复原生问题；动态 pending 保留。unknown 只能只读核实，不自动重发。详见 [U7 结果](../../user-input-u7-results.md)。前面的阶段记录保留其交付时点状态，以本节为当前实现状态。


## U8 引导可用性

内置 supplemental-input Skill 已分发并加入按需发现；启停仅影响引导，不是 input_* 能力开关。无 Node SDK 新增方法，第三方仍直接探测宿主工具。详见 [U8 结果](../../user-input-u8-results.md)。


## U9 验收状态

正式 Electron 与 macOS arm64 打包应用已通过 Responses/Chat 本地确定性服务验收。真实模型质量抽样按用户决定暂缓，其他平台实机及正式签名公证仍待验证。冻结输入 Schema、已开放工具列表和内置示例保持一致；结果与 SDK/CLI 交接见 [U9 结果](../../user-input-u9-results.md)。
