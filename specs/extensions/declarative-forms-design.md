> 实现进度：基础 DSL、任务内表单、多步骤持久化与提交路由已落地。具体支持范围和限制见 [实现记录](../../tooling-report/2026-10-01-declarative-forms/implementation.md)。下文仍保留完整设计目标，不能据此推定所有计划能力已实现。

# 声明式表单与多步骤流程设计

日期：2026-10-01。状态：产品方向与流程边界已确认；本文是具体契约设计提案，尚未实现或冻结为稳定 API。示例不是当前 extension.json、SDK 或 Skill 加载器已经支持的能力。

## 1. 目标、已确认决策与实现边界

开发者在 Skill 中用 YAML 定义字段、选项、校验和提交行为，不编写前端代码，即可在任务内得到确定的表单。模型选择定义并提供预填建议，宿主解析、校验、保存状态并渲染。

已确认：

- 采用结构化 YAML；支持 Skill 专用代码块和包内独立文件引用，两种写法共用一个解析器及内部定义。
- 表单定义由宿主直接加载，不能让模型重新解释、改写字段或临时改变提交目标。
- 宿主协议渲染的组件以 shadcn/ui 为基础，应用 Amblelost 的主题、排版和 Apple 风格规范。iframe 内部组件由扩展自行提供，不限制其框架或组件库；现有网络/权限隔离策略仍然适用。
- 采用同一套 Extension、Operation 和授权机制，不增加独立业务执行通道。
- 同一业务流程包含多个步骤，流程实例身份稳定，数据不依赖模型记忆或聊天历史长度。
- “上一步”修改流程草稿，不自动撤销已执行的业务操作。撤销或修改已提交业务数据必须调用扩展明确提供的操作。

本文建议纳入首版：单步与线性多步骤、固定选项、本地草稿、受限数据映射、用户预览和提交、过期/未知结果处理。复杂分支、循环、动态远程选项、附件、任意计算脚本、自由布局、任意 URL/API 请求暂缓。

普通字段自动保存、未提交数据默认不送模型、个人 Skill 的业务绑定方式是本文推荐的默认规则，尚需产品审阅；不能仅因写入本文就视为用户逐项确认。

## 2. 与 MCP Apps 的关系

| 路径 | 定义与渲染 | 执行边界 |
| --- | --- | --- |
| 声明式表单 | YAML → 宿主标准组件，无 iframe | Host Form Runtime → OperationRouter |
| MCP Apps | 扩展 HTML/JS → 隔离 iframe | MCP Apps tools/call → OperationRouter |

声明式表单是 Amblelost 自有协议，不是 MCP Apps 标准的 YAML 模式，也不要求 MCP Apps 客户端能理解它。现有 MCP Apps 代码不能自动当作 Form Runtime 使用。两个入口共享业务操作及权限，但保留各自的页面生命周期。

相关事实基线：[MCP Apps 设计](mcp-apps-design.md)、[现有 SDK](contracts/sdk.d.ts)、[消息执行设计](message-center-design.md)。新增流程日志可借鉴消息动作的恢复原则，但消息动作日志尚未完整接线，不能宣称直接复用即可完成。

## 3. 核心概念与身份

| 名称 | 定义 |
| --- | --- |
| templateId | 文档中的 id，作者作用域内唯一，例如 travel-expense |
| templateKey | 宿主生成的 authorScope + templateId；不接受模型自报作者身份 |
| templateDigest | 规范化完整定义的摘要，包括绑定、字段、步骤；实例固定此版本 |
| flowInstanceId | 一次办理的随机稳定 ID，单步表单也使用此身份 |
| conversationId | 所属稳定聊天 ID，从草稿到执行不改变 |
| originTurnKey | 首次展示的轮次；后续继续操作引用同一个实例 |
| stepId | 定义内唯一的步骤 ID；用 ID 引用，不以序号作身份 |
| revision | 实例的乐观并发版本；每次成功修改递增 |
| submissionId | 一次明确业务提交的身份，与一次传输请求的 requestId 不同 |

一个聊天允许多个同模板实例。新办理创建新 flowInstanceId；恢复已有实例必须显式引用其 ID。不要通过标题、最后一条消息或当前步骤推断实例。UI 中多处引用同一实例时，显示的是同一份状态，不能复制独立可提交副本。

“复制为新聊天”不复用旧流程实例或 submissionId。首版默认不复制业务流程；用户明确选择复制填写值时创建新实例，只复制允许的普通输入，不复制业务结果和提交记录。

## 4. 定义入口与加载

### 4.1 内联定义

SKILL.md 中的自然语言说明业务使用时机，专用围栏代码块承载正式定义：

````markdown
当用户需要登记差旅费用时展示 travel-expense。
可以预填用户明确提供的信息，不要猜测金额。

```amble-form
version: 1
id: travel-expense
title: 差旅费用登记
fields:
  - name: region
    type: select
    label: 出差地区
    required: true
    options:
      - label: 上海
        value: shanghai
      - label: 北京
        value: beijing
submit:
  kind: chat
  label: 将填写结果发送到聊天
```
````

自然语言不能覆盖结构化规则。只发现“请使用一个下拉框”之类描述时，不自动将其注册为正式表单。

### 4.2 独立文件

Skill 可用专用引用块声明文件：

````markdown
```amble-form-ref
path: forms/travel-expense.yaml
```
````

path 相对该 SKILL.md 所在目录，必须位于作者所属包内；个人 Skill 限于自身目录。拒绝绝对路径、远程 URL、路径穿越、符号链接、递归引用和重复注册。宿主解析 Markdown 语法树，仅识别实际围栏块，不用正则把普通代码示例或引用文字误注册为能力；如何标记文档示例围栏须在解析器实现中固定规则（建议只识别顶层块）。

没有模型参与的加载链：发现声明 → 安全解析 YAML → 严格 Schema 校验 → 语义/绑定校验 → 规范化 → 摘要 → 注册。失败必须指出文件、行列、字段路径及原因；不静默删除未知字段或修复错误。

扩展管理和个人 Skill 管理应显示表单校验状态。无效表单不能执行；是否禁用整个 Skill 建议采用“Skill 仍可阅读，但错误表单不注册，并明确显示错误”，包发布校验则失败。

### 4.3 YAML 安全子集

只接受单文档、可转换为 JSON 的映射/数组/标量；拒绝自定义 tag、anchor/alias、merge key、重复 key、非字符串映射键、危险原型键、NaN/Infinity 和未知字段。采用明确的 YAML 1.2 标量规则，不自动把日期变成 Date；金额与日期示例必须加引号，类型不符合时直接报错。

建议上限：单模板 128 KiB、20 步、总计 100 字段、每个 select 100 选项、结构深度 12。上限须进入正式 Schema 与一致性测试，而非仅文档建议。禁止 eval、JS、HTML、CSS、网络引用及可执行表达式。

## 5. 模板结构

version 表示 DSL 协议版本；作者更新定义产生新的 templateDigest，不要求每次增加协议版本。

| 属性 | 类型 | 约束 |
| --- | --- | --- |
| version | integer | 首版固定 1 |
| id | string | 小写字母起始，允许数字与连字符，1–80 字符 |
| title | string | 必填，1–120 字符 |
| description | string | 可选，最多 2000 字符，纯文本 |
| fields | Field[] | 单步简写；与 steps 二选一，规范化为 main 步骤 |
| steps | Step[] | 多步骤，数组顺序决定流转；1–20 步 |
| submit | Submit | 必填，最终提交定义 |

Step：id、title、可选 description、必填 fields、可选 next。字段 name 使用与 id 相同的词法限制，在步骤内唯一，跨步骤可重名但必须完整引用。Step.id 使用同 id 的词法限制。首版一个步骤一列，可用步骤分隔长表单；不额外引入分组/栅格 DSL。

next 未声明表示本地校验/保存后进入下一步。声明时为一个 NextOperation，见第 8 节。只有非末步骤允许 next。最后一个步骤使用根 submit；最终确认摘要由宿主生成，不需要作者定义 review-form。

title、description、label、placeholder、help、选项 label、提交 label 支持既有 `%key%` 展示文案引用；ID、value、Operation ID、数据引用和校验值不可翻译。扩展所属模板使用 extension.nls 字典。个人 Skill 首版可直接写文案；其多语言文件约定暂不新增，避免误称现有 Skill 已支持字典加载。

## 6. 字段与值类型

公共属性：name、type、label、required（默认 false）、help、placeholder。placeholder 仅用于文本类；其他类型使用时应报错。label 必填。首版不允许作者隐藏字段、禁用最终复核或自定义 HTML 错误提示。

| type | 提交值 | 额外属性与校验 |
| --- | --- | --- |
| text | string | minLength/maxLength；建议默认上限 2000 |
| textarea | string | minLength/maxLength；建议默认上限 20000 |
| number | JSON number | minimum/maximum、integer（默认 false）；仅有限数值，整数不得超安全整数范围 |
| money | 十进制 string | currency、scale（默认 2，0–4）、字符串 minimum/maximum；不用 JS 浮点计算 |
| date | YYYY-MM-DD string | 字符串 minimum/maximum；必须是实际有效日期，无隐式时区转换 |
| select | string | options 必填；label/value；value 不重复、非空，提交值必须匹配 |
| checkbox | boolean | required=true 表示用户必须勾选 true，false 不满足；普通开关 required=false |

可选字段未填写时不出现在提交对象中，不混用 null/空字符串表示缺失；未触碰的可选 checkbox 建议规范化为 false。number 的 0 和 checkbox 的 false 不按普通真假值判空。必填文本全为空白不通过；不得在没有说明的情况下修改用户正文。

money 只接受普通十进制写法，不接受指数、千分位字符或超出 scale 的精度；显示可本地化，保存使用规范十进制字符串。例如 scale=2 时输入 12.3 规范为 "12.30"，输入 12.345 报错，不自动四舍五入。currency 是静态显示/业务属性，不做换汇；操作需要币种时以常量映射显式提交。

所有初始值与用户值使用相同校验。模型预填含未知字段、非法选项或类型不匹配时返回结构化错误，不静默丢字段。初始值可缺少必填项，缺失项由用户填写。首版不增加模板 defaults，减少“模型预填、默认值、旧草稿”三者冲突；恢复实例始终以其草稿为准。

## 7. 单步示例与聊天提交

完整定义见 [single-step.yaml](examples/declarative-forms/single-step.yaml)。它是个人 Skill 也可使用的纯本地表单。

kind=chat 时：点击按钮 → 校验并保存 → 宿主显示将发送的字段及目标聊天 → 用户确认 → 向绑定 conversationId 追加一次用户消息，并按正常聊天发送流程执行。绝不发送到用户后来切换到的其他聊天，也不把表单定义当作系统指令。

建议发送宿主生成的可读字段摘要，并保留结构化关联；不使用模板提供的任意提示词拼接。用户在确认页应能看到将进入模型上下文的实际内容。无模型配置、聊天归档或任务忙碌不能提交时，保存草稿并说明原因，不暗中改用另一个聊天。

消息追加也需要稳定 submissionId 与去重事务。引擎启动失败后，重试恢复同一提交/消息，不再追加第二条同内容消息。该原子性是新增实现要求，当前普通 startRun API 不应被描述为已经满足表单去重。

## 8. 多步骤与显式业务调用

完整定义见 [travel-flow.yaml](examples/declarative-forms/travel-flow.yaml)。示例：填写行程 → 保存服务端草稿 → 填写费用 → 用户确认最终提交。

NextOperation：kind 固定 operation，label、operation、input 必填，recovery 可选。Submit 有两种互斥结构：

- chat：kind、label；不接受 operation/input/recovery。
- operation：kind、label、operation、input；可选 recovery。

next.operation 和 submit.operation 均绑定已注册的 Operation，不能写 HTTP URL、header、token 或任意脚本。operation.input 只允许显式对象键及以下两类叶节点：

```yaml
input:
  region:
    from: steps.itinerary.region
  currency:
    value: CNY
  draftId:
    from: results.itinerary.draftId
  projectId:
    from: context.projectId
```

from/value 互斥。首版 from 只支持：

- steps.<stepId>.<fieldName>：已到达且已校验的字段；字段简写使用 steps.main.<name>。
- results.<stepId>.<outputField>：该步骤 next Operation 成功且未过期的顶层结果。
- context.projectId：实例绑定且当前仍有效的项目 ID；不从 YAML/模型输入获得授权。

首版不支持模板字符串、数组索引、通配符、嵌套输出路径或跨实例引用。不要自动把全部草稿传给 Operation。引用缺失的可选字段时仅允许省略操作的可选属性；必填目标缺失则阻止提交。常量必须与目标属性类型匹配。模板静态校验检查引用存在/无前向依赖与类型兼容，执行时再按 Operation inputSchema 校验实际值。

Operation 若 projectScoped=true，必须映射 context.projectId 到其 projectId。个人 Skill 不能通过填写一个任意 projectId 绕过项目授权。

next Operation 成功前不进入下一步。失败停留本步保留草稿；用户取消确认不是业务失败，也不能计为步骤完成。read 操作仍受权限/Schema 校验，write 操作复用现有风险与确认策略。不得仅因为按钮叫“下一步”就跳过写确认。

## 9. 前进、后退与下游失效

- 无 next 的“下一步”：当前步校验 → CAS 保存 → 标记该步有效 → 前进。没有远程副作用。
- 有 next 的“下一步”：校验 → 固定输入/版本 → 授权确认 → 执行并保存结果 → 前进。
- “上一步”：先保存当前草稿（允许其暂时无效），再返回已到达步骤。不执行 Operation，不自动回滚业务。
- 原值未改：允许复用相同输入和绑定下仍有效的已成功步骤结果，不再次执行业务写入。
- 字段改变：首版保守地将本步 next 结果及所有后续步骤的校验/确认/派生结果标记为 stale；保留普通填写值与历史操作记录，不再把 stale 结果用作新的有效输入。后续 required checkbox 作为必须重新确认的项目重置为未勾选，并向用户说明；历史勾选记录仍保留，不能让过期确认自动通过。
- 本地失效与服务端撤销不同。旧服务端草稿或单据依然存在。再次执行由业务 Operation 负责幂等更新或产生新草稿，不得暗中假设旧结果消失。
- 后续存在结果 unknown 的写入时，可查看其他步骤，但锁定相关编辑和再次提交，先完成核实，避免把旧结果错误归属到新输入。
- 整体最终提交成功后只读。修改已提交业务数据通过明确的后续流程/Operation 完成，不把 succeeded 重置为 editing。

例如，用户从费用步骤返回修改地区：保留金额，提示“行程已修改，请重新检查后续内容”；再次前进必须重新校验/执行受影响步骤。保留服务端 draftId 的历史记录但不把它当作自动撤销凭据。

## 10. 实例存储与并发

建议增加独立的 flow_instances、flow_submissions 持久化存储，聊天记录只保存引用。不要让多个消息副本或 React state 成为流程事实源。具体表名是设计建议，尚未创建数据库表。

实例至少包含：profileId、authorScope、templateKey/digest、完整已校验模板快照、扩展绑定身份与包版本、flowInstanceId、conversationId、originTurnKey、boundProjectId、currentStepId、stepValues、步骤有效性、有效结果引用、revision、状态、时间戳。

每次编辑/前进/后退带 expectedRevision；宿主原子校验并提交。多窗口冲突时保留本地未保存输入，提示刷新/重新应用，不能最后写入者静默覆盖。开始提交后固定输入快照和 payloadHash，确认窗展示的必须是随后执行的同一份内容；确认期间其他窗口修改实例使旧确认失效。

自动保存建议默认开启：输入后短延迟写入，前进/后退/提交前必须 flush 成功。保存失败时显示“尚未保存”，阻止依赖持久状态的前进/提交。输入中的金额字符等暂态可以保留在编辑缓冲区；正式 stepValues 只保存符合类型的值，恢复不得无提示丢弃尚未完成的输入。实例存储需定义 rawDraft 与规范化值的边界。

实例属于 profile 和绑定聊天；企业/业务账号绑定一旦引入，必须记录其不含凭据的稳定身份。账号切换不能把旧实例自动交给新账号执行；需要显式重新连接/绑定并重新校验。认证尚未完整实现，首版不得假装提供跨账号恢复能力。

项目移除/聊天归档时只读，聊天还原后重新检查原项目与授权。聊天改项目不能暗中迁移旧流程；建议保留原绑定且阻止继续，要求新建流程。删除聊天按明确保留/删除策略级联本地草稿；不自动删除服务端业务数据。与审计记录的保留冲突需在数据库设计评审中定稿。

扩展更新或 Skill 修改后，旧实例继续展示固定模板快照，不静默迁移。执行需要原绑定版本仍有效且受信任；首版不承诺保留旧后台并行运行，因此所属包或 Skill 更新使旧实例只读，用户可显式复制普通值到新版本重新校验。业务结果与 submissionId 不复制。停用/撤权立即阻止新执行并中止可取消请求，已派发结果按 unknown 处理。

## 11. 提交状态、幂等与恢复

实例 phase：editing / submitting / succeeded / cancelled。单独维护 availability（available / blocked 及原因），不要把权限失效误当业务失败。中间步骤成功回到 editing 并前进；只有最终提交成功进入 succeeded。cancelled 仅表示用户放弃本地办理，不表示服务端已撤销。

unknown 提交存在时不能通过 abandon、删除卡片或新窗口绕过锁定；允许隐藏/归档展示，但提交日志与核实入口仍须保留。只读 next 的结果也只是某个时刻的快照，最终业务写入必须重新校验服务端规则，不能仅凭本地“有效”状态接受过期价格或额度。

每次实际 Operation 或聊天提交拥有独立日志：

| 状态 | 含义与允许后续 |
| --- | --- |
| prepared | 已保存身份和输入，尚未派发；可确认后派发或取消 |
| dispatched | 已开始派发；崩溃/超时后按 unknown 处理 |
| succeeded | 已确认成功；保存结果，不再执行同一提交 |
| notExecuted | 能证明未产生业务效果，例如确认取消、派发前权限失败 |
| unknown | 无法确认效果；禁止自动重放或创建替代提交 |

业务校验失败只有在契约能证明没有副作用时才算 notExecuted；普通抛错或 isError 不足以证明。日志必须先持久化 dispatched 再派发，日志与宿主局部状态变更使用事务。服务端成功但结果落库前崩溃只能标记 unknown，不能宣称跨远程服务具备 exactly-once 保证。

同一逻辑提交传输重试必须沿用 submissionId。数据改变、旧尝试已确定结束且用户再次明确提交时创建新 submissionId。宿主生成身份，不接受模型/页面自选幂等键；扩展把它用于服务端去重。

建议扩展 InvocationContext 增加只读 form 信息：flowInstanceId、stepId、submissionId、templateDigest、conversationId。由受信宿主注入，不能作为普通 input 任意伪造。**现有 SDK 没有这些字段**；正式实现前需要扩展调用链及 SDK/CLI 对齐。不要拿当前 requestId 冒充稳定业务幂等键。

可选 recovery.operation 绑定一个同扩展只读查询操作，输入由宿主固定为 `{ submissionId }`；若查询 Operation 为 projectScoped，再由宿主加入实例绑定的 projectId，不能让调用方自行提供。需通过 input/outputSchema 静态校验；输出规范拟定为 `{status: succeeded | notExecuted | unknown, result?: 原操作输出对象}`。succeeded 必须携带通过原 outputSchema 校验的 result。notExecuted 只有业务服务能确定未执行、且原请求不再可能成功时才允许返回；“暂时查不到”应返回 unknown。

没有可靠查询能力时，unknown 保持锁定，提示用户到业务系统核实，不提供随意“当作失败重试”的按钮。recovery 只查状态，不是回滚。撤销必须由独立业务 Operation 执行并单独确认。首版中间 write next 若没有可用 recovery，建议不开放；最终 write 允许但必须明确存在无法自动恢复的边界。此策略待产品确认。

## 12. 权限、作者归属与个人 Skill

Extension 所属模板默认只能绑定本扩展的 page 可调用 Operation。Form Runtime 使用受信交互来源适配现有 router，不冒充 Agent，不因使用原生组件免除授权。暂不修改现有 exposeTo 枚举；是否新增专用 form caller 留待后续版本，不隐式兼容。

个人 Skill 没有 Node 后台和 Extension 身份，默认可定义 chat 提交。若允许其调用已安装扩展，建议由宿主创建显式的模板→目标扩展/Operation 绑定授权，界面同时显示 Skill 作者与执行扩展，并限制到当前任务项目。仅 YAML 写出 Operation ID 不足以授权。绑定版本变化后重新确认；Extension 自带模板仍不开放跨扩展调用。

这一绑定机制目前不存在，须作为独立开发项；在其实现前，个人 Skill 的 operation 提交应报 UNSUPPORTED，不静默转成 Agent 调用或任意 HTTP。模板作者选择 Operation 不等于该业务能力已经存在，加载时必须验证目标与可用性。

宿主最终确认摘要由实际映射值生成，金额/日期/选项显示用户能理解的标签。必须区分“将发送给业务服务的数据”和“留在本地的数据”；扩展 label 不得取代宿主实际行为说明。密码、token 等凭据不通过普通表单收集，使用认证/密钥入口。开发者仍须避免用普通字段伪装凭据请求，宿主规范不是内容检测的绝对保证。

## 13. 模型上下文与数据可见性

模型获得的最小流程目录包含 templateKey、标题、用途与可预填字段的类型。创建时模型只能给初始值，不能给字段定义、操作目标、conversationId 或扩展授权。后续模型提议修改产生待用户接受的建议，不能覆盖已编辑值。

建议默认不将未提交编辑发送给模型。模型可读取宿主生成的流程状态摘要：实例 ID、模板、当前步骤、完成/待核实状态；不自动包含字段值、原始服务结果或堆栈。上下文压缩后通过绑定聊天的实例目录恢复，而不是在文本中搜索历史表单。

kind=chat 经用户确认后将选定表单内容作为用户消息发送，意味着这些值会进入模型上下文。kind=operation 只传显式映射字段给扩展；页面调用结果留在流程存储，默认不把完整结果自动加入 Agent 对话。需要模型总结的业务字段，应以后续明确的数据投影契约开放，不简单将敏感字段放进当前 Operation 结果并期待自动隐藏。

现有 Agent Operation 结果对模型可见；不能把它与上述新的 Form Runtime 交互调用混淆。日志默认只记录身份、状态和字段名，不转储正文。自动保存到本地不等于已加密，存储保护能力必须如实说明。

## 14. 拟议宿主接口与 UI

以下是服务职责名，不是已经存在的 SDK 导出：

| 接口职责 | 关键输入/规则 |
| --- | --- |
| listTemplates | 按当前 Skill/扩展、权限及任务过滤 |
| presentForm | templateKey、初始值；宿主绑定 conversationId/turn，返回 flowInstanceId |
| resumeForm | flowInstanceId；验证属于当前聊天及 profile，不重复创建 |
| saveDraft | 实例 ID、expectedRevision、当前步 patch；字段白名单 |
| next / previous | 实例 ID、expectedRevision；宿主计算合法目标步骤 |
| submit | 实例 ID、expectedRevision；宿主映射并冻结输入，不接受自报 operation/input |
| reconcile | 实例与 submission 引用；只调用声明的 recovery，不重放写入 |
| abandon | 放弃本地流程；明确不撤销已执行业务操作 |

同一工具调用的 presentForm 请求重送应根据宿主可信调用身份去重；新的用户办理意图创建新实例。模型不得因为 UI 加载失败自动再次调用业务操作。

渲染层以 shadcn/ui 组件与宿主 tokens 实现：字段标签、帮助、必填标记、就地错误、步骤进度、保存状态、前后按钮、最终摘要、结果与恢复提示。协议描述业务语义，不包含 React 组件名、className 或 Radix/Base UI 实现细节。禁用/加载/错误组件同样受宿主设计规范约束。

支持键盘顺序、标签关联、错误聚焦、屏幕阅读器状态通知、主题与语言切换、窄窗口。报错使用普通语言，例如“金额至少为 0.01 元”“此操作的结果尚未确认，请先核实”，不向普通用户展示原始 YAML、JSON、revision 或协议错误。

## 15. 场景与验收矩阵

| ID | 场景 | 必须满足 |
| --- | --- | --- |
| FORM-01 | 个人 Skill 单步登记 | 解析固定选项，必填与金额校验，生成确定界面 |
| FORM-02 | 内联与文件定义等价 | 规范化结果一致，引用边界清晰，重复 ID 报错 |
| FORM-03 | 非法 YAML | 重复键、alias/tag、未知组件/属性、越界路径均拒绝，无模型纠错执行 |
| FORM-04 | 模型预填 | 非法值报错，缺失必填可展示，不改变模板和业务规则 |
| FORM-05 | 三步本地流程 | 下一步保存，后退保留，未提交值不依赖模型上下文 |
| FORM-06 | 修改前面字段 | 下游输入保留，结果/校验过期；重新核对后才能提交 |
| FORM-07 | 不修改直接往返 | 不重复执行已成功的中间步骤操作 |
| FORM-08 | 中间保存服务端草稿 | next 显式绑定、权限检查、写确认、保存 draftId 并映射至最终提交 |
| FORM-09 | 取消与拒绝授权 | 不前进、不派发；保留草稿 |
| FORM-10 | 超时/崩溃 | dispatched 恢复为 unknown；先查询，不自动重试；复用提交身份 |
| FORM-11 | 服务成功但本地落库失败 | 不能误报未执行；查询恢复同一结果，不生成第二笔业务 |
| FORM-12 | 多窗口编辑 | CAS 冲突，不覆盖未保存输入；旧确认失效 |
| FORM-13 | 同一聊天两次报销 | 不同实例；ID/数据/结果/提交互不串用 |
| FORM-14 | 切换聊天与上下文压缩 | 仍绑定原 conversationId，恢复准确实例，不向当前其他聊天发送 |
| FORM-15 | 更新/停用/撤权/账号切换 | 原定义可审阅，执行重新校验；不得静默迁移或切换身份 |
| FORM-16 | 归档、删除、复制聊天 | 归档只读、删除不撤销远端、复制不沿用实例/提交 ID |
| FORM-17 | 聊天提交重复点击 | 同一用户消息最多追加一次；引擎失败后恢复而非重复追加 |
| FORM-18 | 跨扩展/项目/实例伪造 | 服务端拒绝，UI 不是授权来源 |
| FORM-19 | 金额/日期/checkbox | 精确金额、合法日期、0/false/空值/required 语义一致 |
| FORM-20 | 可访问性和样式 | shadcn/ui 基础、统一 tokens，键盘/读屏/主题/窄屏可用 |
| FORM-21 | 最终提交后后退 | 不重新进入可提交草稿，修改业务用明确新操作 |
| FORM-22 | 个人 Skill 指向业务接口 | 没有显式绑定授权时不能执行，不能变相自动 HTTP 调用 |
| FORM-23 | 数据可见性 | 未提交值不自动送模型，聊天发送须预览，日志不泄露正文 |

这些是未来实现的验收要求，本轮文档检查不等于通过这些功能用例。

## 16. 开发分解与待评审项

建议施工顺序：

1. DSL Schema/解析器、发现规则、命名空间、摘要及无效定义报告。
2. 实例存储、CAS、多窗口与按聊天查询；本地单步表单和 shadcn/ui 渲染。
3. 聊天提交去重；Extension Operation 绑定与最终提交日志/确认。
4. 线性多步骤、本地前后导航、下游失效。
5. 中间 Operation、稳定幂等上下文、recovery 和故障恢复。
6. SDK/CLI 模板、个人 Skill 显式业务绑定、全场景 Demo 与跨平台验收。

进入运行代码开发前需要审阅：

- 本地自动保存与数据可见性默认规则（第 10、13 节）。
- 首版是否开放个人 Skill→扩展显式绑定，还是先仅支持其 chat 提交。
- 中间 write next 是否强制 recovery；建议强制，避免流程卡在未知结果后被误操作。
- 上限、精确 DSL 字段、模板更新与本地草稿/提交日志保留策略。

实现团队还需交付正式 JSON Schema、解析测试、SDK/IPC 类型、数据库迁移/事务设计和接口安全测试。本轮不修改 live extension.schema.json 接受新字段，不虚构已发布 API；正式设计批准后再版本化同步 SDK/CLI 施工需求。
