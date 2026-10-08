# M1 契约（A7 开发者预览）

本目录是 SDK 的类型与 Schema 来源。A7 已交付可本地安装的 `@ambleloft/extension-sdk@0.1.0-alpha.1`，构建流程见 [开发入门](../developer-guide.md)。manifest 仍为 `1.0-draft`，不宣称稳定 1.0；范围以 [scope](../scope.md) 为准。

## 1. 文件与校验层

- [extension.schema.json](./extension.schema.json)：manifest 结构与局部字段校验。
- [sdk.d.ts](./sdk.d.ts)：Node 上下文、页面客户端与错误。底层 IPC 信封不属于公开 SDK。
- [示例清单](../examples/extension.json)：保留最小清单片段；可安装版本见 [完整 Demo](../../../examples/extensions/project-card/README.md)。

Schema 使用 draft 2020-12。Operation 的输入输出采用限制子集：object/array/string/number/integer/boolean/null、properties、required、additionalProperties:false、items、标量 enum、长度/数值/数组上限。禁止 $ref、远程 schema、正则和隐式类型转换。递归结构深度建议最多 8；JSON Schema 文件本身的递归 $defs 是校验器结构，不是允许插件引入引用。

宿主还必须执行语义校验，不能以 schema 通过代替：

1. operation/command ID 以 publisher.name 为前缀，跨贡献不可重复；handler 不重复，绑定名称与清单精确一致。
2. projectScoped 操作的输入必须声明 required string projectId。项目权限只能用于该作用域；permissions 中项目能力 scope=project，storage/configuration/secrets scope=self。
3. requiredPermissions 为已声明权限子集；配置 schema 不允许凭据字段，凭据走宿主输入和 secrets API。输入对象 required 必须是 properties 子集，类型专属关键词须匹配类型，min 不大于 max，enum 项须匹配类型。
4. main/skills/webRoot 是包根相对路径，entry 相对于 webRoot。拒绝 ..、绝对路径、symlink 和越界 realpath；仅正则无法完成文件安全校验。home 是一个首页，M1 commands 只允许 openHome 且必须存在 home；操作按钮直接 invoke Operation。
5. localization 采用约定 extension.nls.json / extension.nls.<locale>.json。显示字段可 %key%；ID、handler、路径、权限和条件不翻译；操作 description 可翻译但不改变业务约束。默认文案必须覆盖引用。
6. condition 解析器校验键/类型/作用域，contextKeys 仅 ext.<extensionId>.* 且默认值类型匹配；无 eval。M1 启动事件只显式声明 onStartupFinished；operation/page/command/skill 的激活或加载按声明推导，不能用未运行 handler 的动态注册发现自身。
7. Skill 路径指向包内含 SKILL.md 的目录；清单标识 skills owner，启停时与原技能目录统一过滤。仅 Skills 不启动 Node。
8. 每个 Operation 的 exposeTo 为空表示不开放给页面和 Agent。未知根字段报错；M2 hooks/prompts 不提前接受并静默忽略。Node/ABI 兼容范围待发布包探针产出后扩展 engines，M1 不虚构准确 Node 版本。

## 2. 页面桥与进程 RPC

传输仅使用有大小限制的 JSON 值，不接受函数、原型对象或任意 IPC channel。建议单消息最大 1 MiB；Operation 输入和输出分别最大 256 KiB，日志与错误不得转储完整内容。

| 方法 | 方向 | 参数/结果 |
| --- | --- | --- |
| initialize | 页面→宿主 | 空参数→HostContext；必须先握手 |
| invoke | 页面→宿主 | operationId,input→Result<JsonObject> |
| selectProject | 页面→宿主 | capabilities→Result<Project或null> |
| requestGrant | 页面→宿主 | projectId,capabilities→Result<boolean> |
| requestSecretInput | 页面→宿主 | key,title→Result<{saved}>；值不返回页面 |
| invoke 的 AbortSignal | 调用方→宿主 | 页面本地 signal 映射为隔离桥取消键；只取消自己的请求 |
| onHostContextChanged | 宿主→页面 | locale/theme/supportedMethods 更新 |

SDK 的 invoke Promise 在桥可用时返回 Result；通道销毁时以统一本地 HOST_UNAVAILABLE Failure 收敛，不产生未处理的悬挂 Promise。initialize 失败拒绝 Promise，调用方显示宿主级初始化错误。signal 是本地 AbortSignal，不在 JSON 中序列化；SDK 将本地 signal 交给宿主页面桥，桥将其映射为取消请求。requestId 在当前通道唯一，宿主生成内部 invocationId；payload 里的 extensionId/profileId/caller 不作为身份证明。超时、取消和成功只有一个终态。

Node 使用宿主传入的绑定通道，握手携带协议版本、generation，由父进程核实；handler 调用与资源回调分别带 invocationId。后台 self storage/configuration/secrets 使用自己的扩展会话；项目 API 必须有有效 invocation 上下文。后台 Hook 的项目上下文留待 M2 增加，不暴露可自行构造的授权对象。

## 3. 权限与存储方法

- ProjectResources 的每个方法须校验项目授权：getProject→projects.read，getProjectPath→projects.path.read，createConversation→conversations.create，openConversation→conversations.open；open 还检查身份映射的项目等于当前调用项目。
- selectProject 只能申请本扩展已声明的项目权限；用户取消返回 null，拒绝单独授权返回 false；不暴露所有未选项目。Agent 无权调用页面桥；当前需先通过设置或扩展页面授权，再在目录中发现并调用。
- storage/configuration/secrets 需要声明对应 self 权限；storage/配置属于扩展自有资源，信任安装不自动授予权限，需在宿主设置或页面交互中明确授权；secrets 读不到其他扩展或模型凭据。配置修改来自宿主设置 UI，Node 读取与订阅变化。
- storage revision 按 key 单调增加，delete 后保留内部 tombstone revision，重新 create 不重置计数；expectedRevision=null 仅当前无值时成功，旧 revision 写入返回 CONFLICT，避免 ABA。
- key 限制 1–200 字符、禁止路径解释，值必须 JSON；get 返回 null 代表不存在。接口不提供任意 filesystem 路径。
- activate 的 subscriptions 用于合作式清理；deactivate async 有限等待。Node 资源回调拒绝带 error.code；页面 unwrap 抛出带 Failure 的 ExtensionError。不得把 RPC 远端 stack 暴露页面或模型。

## 4. 错误及副作用

INVALID_ARGUMENT/GRANT_REQUIRED/FORBIDDEN 等派发前错误 effectStatus=notStarted。已进入 handler 后的超时、崩溃或输出 schema 错误，若有副作用则 effectStatus=unknown，不能因输出无效宣称业务未执行。正常完成 effectStatus=completed 可用于诊断；成功值不需要额外包裹。

CANCELLED 表示不再等待，TIMEOUT 表示超过 deadline，OUTCOME_UNKNOWN 用于明确的中断后不确定结果；均不指示自动重试。Agent 错误回复为 success:false 和脱敏文本，详情不暴露未授权资源是否存在。未授权 ID 查询先检查范围再返回 NOT_FOUND，避免资源枚举。

## 5. 清单尚不包含的扩展点

MCP binding、运行时新增 Operation、工作区级后台、远程页面、树 provider、任意命令 handler 均不在本 draft 的 schema 中；任务内 UI 现有 MCP Apps 声明，YAML 表单则在 Skill 中定义。原有声明式文本 views 通过宿主内部 legacy 适配保留，不强行映射为可执行网页。不同清单版本有显式解析入口，禁止把旧 apiVersion=1 误判为本 specVersion。

## 6. 本轮验证记录

2026-09-28：使用仓库现有 Ajv 8.20.0 的 draft-2020-12 实现编译 schema，示例通过；删除 main、未知根字段、非法 exposure、路径越界、缺失 inputSchema、外部 $ref 共 6 个反例被拒绝。使用 strict:false 是因为插件业务 schema 是被校验数据；语义校验清单仍须实现，不能据此认定完整安装校验已完成。

SDK .d.ts 使用 TypeScript strict、ES2022＋DOM 类型检查通过。公开 Markdown 链接与代码围栏检查通过，不引用内部文档。未来将校验器作为明确构建依赖并 bundle，不能依赖当前恰好存在的间接依赖。以上为设计工件验证，不是页面、进程、授权或 Agent 端到端验证。

## 7. 按风险确认与宿主提交组件

已确认策略见 scope 第 4.1 节。Operation 可选 risk={reversible, impacts}；impacts 为 external（对外发送或发布）、destructive、bulk、permissions。多个影响可以同时存在。缺失声明按未知处理，不能自动获得普通免确认资格。普通可撤销操作要求 effect=write、reversible=true、impacts=[]，且通过宿主规则；开发者声明只是输入，不是资格保证。read 操作若声明写影响则语义校验拒绝，不能一面标记只读一面跳过确认。

页面 operations.invoke 不接受 approved、skipConfirmation 或 riskOverride 参数。SDK 调用宿主确认与派发流程，用户通过宿主控制的组件确认后直接执行。已具有匹配免确认策略的普通操作可以直接派发，仍逐次检查资源授权。对外发送、破坏性操作、批量修改和权限变更永远不能使用普通免确认记录。

宿主维护短期 pending confirmation，建议 5 分钟过期；绑定实际参数摘要、调用来源、revision/generation、项目及权限版本，不把可复用 token 返回页面。重试或改参产生新请求；消费确认与在途请求登记须原子完成，重复事件不能重复派发。用户拒绝/超时不会进入 handler。

普通操作确认与记住选择已接入 OperationRouter；管理入口可恢复操作确认，扩展没有写入该记录的 API。表单写入不使用记住的豁免。上述短期确认等设计细节不能一概认定已实现，实际范围见[当前能力表](../current-capabilities.md)。

## 8. A1 实现 revision

独立校验器内部 revision 为 `m1-a1-r1`，公开 specVersion 仍为 `1.0-draft`，SDK 类型没有扩展。具体实现、条件语法、构建依赖及 A0 未关闭门槛见 [A0/A1 记录](../a0-a1-results.md)。该 revision 是可复现实现标识，不等同公开 API 已冻结。

## A7 后续交付

SDK 与安装包不再只是示意工件：见 [A7 交付与验证记录](../a7-results.md)。上面的早期校验记录保留为历史证据；现行预览 API 以 sdk.d.ts 及开发入门为准。

## MCP Apps 增量（2026-10-01）

Schema 新增 `contributes.mcpApps`（uri/title/entry/mimeType）及 `operations[]._meta.ui.resourceUri`。此处 entry 相对包根，不是 home.webRoot。资源必须属于本扩展 URI 命名空间并在本包声明，HTML 上限 1 MiB。详情和支持的方法见 [MCP Apps 设计](../mcp-apps-design.md)。MCP Apps iframe 使用标准 JSON-RPC 桥，不提供本页原有首页 WebviewClient。Node Operation 注册与授权接口不变。SDK/CLI 需按交流需求 v0.2.0 对齐新增清单字段，发布状态独立验收。

## 声明式表单与后端错误码（当前源码）

[form.schema.json](form.schema.json) 定义 DSL v1 的结构；严格 YAML、引用和业务绑定另由宿主做语义校验。使用方法见[表单指南](../declarative-forms-guide.md)。InvocationContext.form 已加入 sdk.d.ts，属于可选的宿主提交上下文；恢复查询使用 input.submissionId，不依赖该字段。

后端异常的公开 code 经 bootstrap、HostManager、OperationRouter 白名单保留，包含 OUTCOME_UNKNOWN、UNSUPPORTED、FORBIDDEN；未知异常返回 INTERNAL。原始 message、stack、details 和扩展声称的 effectStatus 不向客户端透传。已派发调用的异常仍为 unknown，不能因为错误码是 CANCELLED 或 FORBIDDEN 就认定业务未执行。派发前失败为 notStarted。

## 统一能力清单

[当前能力表](../current-capabilities.md)及 [host-capabilities.json](host-capabilities.json)区分公开预览和未开放能力。[messages-preview.d.ts](messages-preview.d.ts)集中声明本地消息预览接口；sdk.d.ts 集中声明 FormInvocationContext、FormRecoveryInput、FormRecoveryResult，独立 SDK 构建不再自行追加同名类型。


## 当前增量契约（2026-10-08）

- `icon`：包内静态 PNG 或 light/dark 对象；结构与文件校验必须同时通过，见 [图标规范](../icons.md)。无需新 SDK 方法，不允许动态 setIcon。
- `authentication.resources`：业务资源、HTTPS baseUrl、audience、scopes；类型和行为见 [认证与动作规范](../message-actions-auth-guide.md)。
- `messages-preview.d.ts`：七个方法，包含 listActionInvocations/reportActionResult；包装器保留基础五方法探测和新增方法逐调用拒绝。
- `host-capabilities.json`：源码清单，不能代替运行时版本协商、授权或桌面联调。
- 历史 A0–A7 结果和旧需求保留，不作为现行能力否定依据。后续独立 SDK/CLI 工作见 [v0.5.0 交接](../../../tooling-report/requirement/v0.5.0/README.md)。
