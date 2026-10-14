# 宿主到 SDK 的功能与接口同步基线（2026-10-14）

本文供 extension-tooling SDK 工程师执行后续同步。以本次 agent 快照中的实际源码为准。“已实现”表示存在实现和接线证据，不表示已发布、稳定 API 或运行验收通过。文档已通过独立静态复核；SDK 代码同步、示例执行及运行测试仍待后续完成。

## 1. 范围、代码基准与证据等级

| 项目 | 本次基准 |
|---|---|
| 基准采集时间 | 2026-10-14 18:28（Asia/Shanghai），宿主仓库的固定源码副本 |
| 原项目 | agent 宿主仓库；核验期间只读固定副本 |
| HEAD | 直接读取当前目录 `.git/HEAD`，值为 `d54463fd764f79e0d56f21f928dde8ce26bdd486` |
| 内容指纹 | 协调器计算并在角色执行前后校验的 SHA-256 工作区指纹：`5dfddfd503ec2475e32b934a146ec71ce41e0c325da7a3b75a081e8a7e3170bf` |
| 工作区状态 | 基准包含未提交修改和新文件；复制前后及原项目与副本内容一致性检查通过。仅凭 HEAD 不能复现该工作区基准 |
| 审查范围 | 宿主实现、源契约、仓库内 `packages/extension-sdk`、构建脚本及部分测试源码 |
| 未审查 | 外部 extension-tooling、npm 发布物、线上宿主和跨平台运行结果 |
| 验证范围 | 只读源码与契约核对；未运行宿主或 SDK 测试、构建与示例。文档静态验收不等于运行验证通过 |

下文路径均相对于实际读取目录；路径和符号组合是定位证据。测试文件只作为静态证据，不代表测试通过。设计稿、历史报告和注释不能覆盖当前实现。

本版针对 QA 做了三项实质修订：

1. jobs 去重限定为当前持久层序列化内容的哈希一致，明确没有 JSON 对象键排序；不承诺语义等价 JSON 一定复用或一定被 unknown 拦截。
2. 删除“input schema 仍标注尚未接线”的失效问题。当前标题已是 `User input v1 internal model tool contract`；保留独立存在的 inventory 缺项和 model 注释问题。
3. 将 256 KiB 明确为 getTurn 读取时的快照 JSON 门禁，不描述为 capture 存储阶段限制。

## 2. 入口与能力矩阵

| 接口表面 | 使用方 | 返回/失败 | 探测方式 |
|---|---|---|---|
| Node `activate(context)` | 扩展后台进程 | 普通值、Promise 或 Promise rejection | 检查对象及所需方法；权限另行检查 |
| 页面 `window.ambleExtension`；本仓库 SDK `createClient()` | 扩展页面 | initialize 返回 HostContext，业务方法返回 Result | 协议、supportedMethods、桥接方法存在性 |
| Agent MCP tools | 宿主绑定的有效执行上下文 | MCP text 中的 JSON；失败可带 isError | 先 tools/list，再对应 capabilities |

| 能力 | 当前实现 | 关键边界 | 源码证据 |
|---|---|---|---|
| 扩展 operations | Node 注册、页面调用、Agent 列出和调用 | manifest、exposeTo、项目、grant、确认、schema | `core/extensions/bootstrap.cjs`：initialize；`operations.cjs`：OperationRouter；`hosts.cjs`：HostManager |
| 页面宿主交互 | initialize/selectProject/requestGrant/requestSecretInput/invoke | 选项目和授权不等于业务写入批准 | `electron/extensions/page-host.cjs`：rpc/interact；`page-preload.cjs` |
| 持久事件 | hooks.register；两类公开事件 | ACK、重复投递、有界重试和保留 | `core/automation/service.cjs`：deliver；`persistence.cjs`：automationAck |
| 普通通知 | 配置、认证、语言、HostContext | 无持久 ACK、重放保证 | `bootstrap.cjs` 变更消息分支；`page-preload.cjs` |
| 持久补充输入 | 七个 input_* Agent 工具，当前 main 已启用 | 草稿隔离、提案确认、无执行单元恢复 | `core/inputs/model.cjs`：bindModelInputs；`electron/main.cjs:125` |
| 声明式表单 | 四个 forms_* 工具 | 步骤预填、聊天提交、业务 operation 分开 | `core/forms/service.cjs`：present/read/action |
| 声明式 UI | 五个 ui_* 工具 | editor/collection 快照，用户点击后聊天投递 | `core/ui/service.cjs`：UiService |
| 本地消息与动作 | context.messages 七方法 | 本地作用域、CAS、显式报告业务结果 | `core/extensions/message-handlers.cjs`：extensionMessage；`action-journal.cjs` |
| 后台自动化 | conversations.getTurn、jobs.submit/get | 项目权限、用户启用、预算、无工具模型请求 | `core/automation/service.cjs`：forExtension/runJob |
| 基础服务与认证 | storage/configuration/secrets/context/l10n/authentication | 安装代际、授权、宿主持有 token | `bootstrap.cjs`；`core/auth/extension-auth.cjs` |
| 统一宿主功能版本协商 | 当前未实现 | 静态 inventory 不是运行时响应 | `specs/extensions/contracts/host-capabilities.json`：runtimeNegotiation=false |

不将 renderer IPC、数据库 worker handler、自动化管理入口包装为公开 SDK API。MCP Apps、技能安装和打包 CLI 的完整协议不在本次重点范围内。

## 3. 生命周期、operations 与资源

### 3.1 注册与生命周期

扩展入口导出 `activate(context)`，可选导出 `deactivate()`。operations 和 hooks 必须在 activate 的同步阶段注册，首次 await 后注册不被接受。

```ts
type Disposable = { dispose(): void };
context.operations.register(handler, callback): Disposable;
context.hooks.register(handler, callback): Disposable;
```

handler 必须匹配 manifest；重复、缺失、非法注册导致激活失败。active 后不能通过 dispose 解绑 handler。context.subscriptions 用于关闭清理。

默认激活期限 10 秒、关闭等待 5 秒；关闭中止调用 signal、拒绝待完成 RPC、执行 deactivate 并清理订阅，无响应进程可被终止。崩溃恢复有次数和时间边界，不承诺无限重启。

证据：`core/extensions/bootstrap.cjs`：registering、initialize、shutdown；`core/extensions/hosts.cjs`：DEFAULTS、activate。

### 3.2 调用契约

```ts
type Json = null | boolean | number | string | Json[] | {[key:string]:Json};
type JsonObject = {[key:string]:Json};
type Result<T> =
  | {ok:true; value:T}
  | {ok:false; error:{
      code:string; message:string; requestId:string;
      effectStatus:'notStarted'|'unknown'|'completed';
      details?:JsonObject;
    }};
```

源类型允许 completed；当前 OperationRouter 的失败分支只产生 notStarted 或 unknown。

| 入口 | 参数与返回 |
|---|---|
| 页面 invoke | `(operationId, input:JsonObject, {signal?:AbortSignal}?) → Promise<Result<JsonObject>>` |
| extension_list_operations | `{}` → 操作描述数组，包含 id/title/description/inputSchema/exposeTo/effect/risk，可含 _meta |
| extension_invoke_operation | `{operationId:string,input:JsonObject}` → MCP 包装的 Result<JsonObject> |
| Node handler | `(input, invocation) → JsonObject 或 Promise<JsonObject>`；结果必须满足 outputSchema |

InvocationContext 的主要公开字段：

```ts
{
  requestId:string;
  locale:string;
  caller:'page'|'agent';
  projectId?:string;
  signal:AbortSignal;
  resources:ProjectResources;
  authentication:{requestSession(resourceId:string):Promise<AuthenticationSession>};
  form?:{flowInstanceId:string;stepId:string;submissionId:string;
    templateDigest:string;conversationId:string};
  message?:{invocationId:string;messageId:string;actionId:string};
}
```

form/message 由宿主注入，不能从业务 input 推导为可信身份。router 错误 requestId 与 handler requestId 分别生成，不保证一致。locale 在 HostManager 创建调用、入队时捕获。

项目级 Agent 调用使用宿主任务项目，页面使用 input.projectId。宿主重查扩展归属、exposeTo、项目、enablement、generation 和 requiredPermissions；列出操作不是授权凭证。

write operation 由宿主确认。普通调用只有满足项目级、可逆、无风险 impacts、输入未命中敏感键脱敏规则等条件时，才可记忆确认；记忆绑定 revision/generation、operation、caller 和项目。form/message 调用不享有该豁免。

默认 operation 期限 30 秒，最大 120 秒；每扩展并发 4、等待队列 32。计时在激活后入队时开始，包含排队，不包含此前确认 UI 和整个激活过程。输出 JSON 上限 256 KiB。运行中取消后，handler 真正返回前仍占容量；迟到结果不能再次结算。

证据：`core/extensions/operations.cjs`：check/list/invoke；`hosts.cjs`：invoke/dispatch/finish；`bootstrap.cjs`：invoke 分支。

### 3.3 Invocation resources

| 方法 | 返回 | 必需权限与限制 |
|---|---|---|
| getProject(projectId) | `{id,name,description}` | projects.read；绑定项目 |
| getProjectPath(projectId) | 路径字符串 | projects.path.read；绑定项目 |
| createConversation({projectId,title,initialPrompt?}) | `{id,projectId,state:'draft'}` | conversations.create；operation.effect=write |
| openConversation(conversationId) | 类型 void，当前 RPC 返回 null | conversations.open；会话属于绑定项目；Agent 返回 INTERACTION_REQUIRED |

权限必须同时出现在 operation.requiredPermissions 和实际授权中。title 非空且不超过 120 字符，initialPrompt 不超过 20,000 字符。创建仅产生草稿，不自动打开或运行。调用结束、撤权或代际变化后不能继续使用资源。

证据：`core/extensions/operations.cjs`：resource。

## 4. 页面、基础服务与普通通知

### 4.1 页面契约

```ts
initialize(): Promise<{
  protocolVersion:'1';extensionId:string;pageInstanceId:string;
  locale:string;theme:'light'|'dark';supportedMethods:string[];
}>;
```

当前 supportedMethods 包括 initialize、selectProject、requestGrant、requestSecretInput、invoke。

| 方法 | 当前客户端返回 | 约束 |
|---|---|---|
| selectProject({capabilities}) | Result<Project|null> | capability 须已声明；SDK 将 CANCELLED 转为成功 null |
| requestGrant({projectId,capabilities}) | Result<boolean> | 项目须由该页面选择且仍存在；SDK 将 CANCELLED 转为成功 false |
| requestSecretInput({key,title}) | Result<{saved:boolean}> | 不向页面返回秘密值；取消仍为失败 |
| invoke(id,input,{signal?}) | Result<JsonObject> | 保留宿主 effectStatus |
| onHostContextChanged(listener) | Disposable | 不在 supportedMethods 列表，单独检查桥接方法 |

原始桥接的 selectProject/requestGrant 取消返回 CANCELLED；null/false 是 `packages/extension-sdk/webview.mjs` 的转换。SDK createClient 要求先 initialize；不要描述为原始 page-host 已记录并强制验证每个页面的初始化状态。

capabilities 必须非空、无重复、最多 10 项。安全输入 key 长度 1–200、title 1–120，秘密值长度 1–16,000；只在宿主内保存。页面请求绑定 WebContents、main frame 和 origin，不公开内部 IPC 作为业务 API。

证据：`electron/extensions/page-host.cjs`：authorize/rpc/interact；`page-preload.cjs`；`packages/extension-sdk/webview.mjs`：createClient/call。

### 4.2 Node 基础服务

| 完整路径 | 契约 |
|---|---|
| context.storage.get(key) | Promise<{value:Json,revision:number}|null>；JSON null 可以是合法已存值 |
| context.storage.set(key,value,expectedRevision) | Promise<number>；CAS；null revision 表示仅不存在时创建 |
| context.storage.delete(key,expectedRevision) | Promise<void>；删除后版本不重置 |
| context.configuration.get() | Promise<JsonObject>；无公开 Node 写配置方法 |
| context.configuration.onDidChange(listener) | Disposable；listener 接收配置对象 |
| context.secrets.get/set/delete | get 返回 string|null；写删返回 void；内部先读版本再写，可能 CONFLICT |
| context.context.set(key,value) | Promise<void>；注意两层 context；只接受 manifest contextKeys 声明的键和类型，进程重建清空 |
| context.l10n.t(key,args?) | string；参数值为 string/number/boolean；缺 key 返回 key |
| context.l10n.locale/onDidChangeLocale | 当前语言和监听 Disposable |
| context.authentication.onDidChangeSessions(listener) | listener 无参数，返回 Disposable |

配置、语言、认证以及页面 HostContext 都是普通通知，不承诺持久化、ACK、重放或自动重试。上述 RPC 没有单独公开 signal 参数。

证据：`core/extensions/bootstrap.cjs`：initialize、变更消息分支；`hosts.cjs`：context RPC；`persistence.cjs`：extensionData。

### 4.3 认证

```ts
type AuthenticationSession = {
  id:string;resourceId:string;connectionId:string;
  account:{id:string;name:string};scopes:string[];expiresAt:number;
};
context.authentication.getSession(resourceId):Promise<AuthenticationSession|null>;
context.authentication.disconnect(resourceId):Promise<void>;
context.authentication.request({sessionId,path,method?,body?})
  :Promise<{status:number;body:string;contentType:string}>;
invocation.authentication.requestSession(resourceId):Promise<AuthenticationSession>;
```

requestSession 要求 page caller 和有效 owner；Agent 返回 INTERACTION_REQUIRED。资源须在 manifest.authentication.resources 声明，并绑定安装代际、资源配置和 connection；不返回原始 token。

request 默认 GET，允许 GET/POST/PUT/PATCH/DELETE/HEAD；GET/HEAD 禁止 body。body 为字符串且不超过 256 KiB；响应不超过 1 MiB；内部期限 30 秒。path 受声明 baseUrl 约束，拒绝跨域、路径逃逸、重定向等。过期或 401 需要重新交互认证；撤权可压制响应，但不能撤回远端副作用。

证据：`core/auth/extension-auth.cjs`：binding/public/getSession/requestSession/request。

## 5. 持久事件与后台任务

### 5.1 Hook envelope、ACK 与重试

```ts
type TurnReference = {conversationId:string;turnId:string;version:number};
type JobStatus = 'queued'|'running'|'succeeded'|'failed'|'unknown'|'cancelled';
type HookEnvelope = {eventId:string;projectId:string;occurredAt:string} & (
  | ({type:'conversation.turn.completed'} & TurnReference)
  | {type:'background.job.completed';jobId:string;status:JobStatus}
);
context.hooks.register(handler,
  (event:HookEnvelope,invocation:{signal:AbortSignal;projectId:string;
    requestId:string;locale:string}) => void|Promise<void>);
```

需要 manifest hook 声明和项目 agent.hooks 授权。callback 正常完成表示 ACK，默认执行期限 30 秒。eventId 在恢复后保持，可能重复投递，扩展必须对副作用去重。

最多 6 次尝试，指数退避并带 jitter；7 天保留、容量 1000 和授权有效性共同限制投递。达到尝试次数或保留期限进入 dead；溢出产生内部 overflow 死信，queue.overflow 不是公开 HookEvent。失去权限可清除待处理事件，重新启用不回填历史。应描述为有界的至少一次尝试，不能承诺必达、恰好一次或无限重放。

证据：`core/automation/service.cjs`：deliver；`persistence.cjs`：RETENTION、putEvent、automationRecover、automationNextEvent、automationAck。

### 5.2 getTurn 与 job

```ts
type TurnSnapshot = TurnReference & {
  projectId:string;status:string;
  messages:{id:string;role:string;text:string}[];
};
type BackgroundJob = {
  id:string;eventKey:string;projectId:string;status:JobStatus;
  providerId:string;model:string;createdAt:number;result?:Json;error?:string;
};
context.conversations.getTurn(ref:TurnReference):Promise<TurnSnapshot>;
context.jobs.submit({projectId,eventKey,prompt,turns,outputSchema}):Promise<BackgroundJob>;
context.jobs.get(jobId:string):Promise<BackgroundJob>;
```

getTurn 要求 conversations.read，version 为至少 1 的安全整数；不存在、版本不符、项目来源变化或已清理的快照不能读取。**读取时，存储快照 JSON 超过 256 KiB 返回 QUOTA_EXCEEDED。capture 保存快照没有这项大小门禁，不能宣称存储阶段拒绝超大快照。**

submit/get 检查 background.jobs、conversations.read 和扩展归属。新任务还需要用户启用自动化、配置 provider/model；默认策略暂停。预算按最近 24 小时已发送次数统计，额度不足的排队任务等待。

| submit 约束 | 限制 |
|---|---|
| eventKey | 1–200 字符 |
| prompt | 非空，最多 8000 字符 |
| turns | 1–10 个 TurnReference |
| 原始 submit JSON | 最多 24,000 字节 |
| 解析后的快照数组 | 合计最多 48,000 字节；在 service 层检查 |
| 安装范围 job 数量 | 最多 1000 |

模型执行只有一次无 tools 请求，期限 120 秒，输出按 outputSchema 校验。已发送请求的非确定性失败、运行中崩溃可能进入 unknown，不自动重发。公开 jobs 只有 submit/get，没有 cancel/retry/manage。

BackgroundJob 是核心投影类型。publicJob 通过排除 prompt/outputSchema/input/hash 返回其余字段，可能附带 extensionId、时间和管理元数据；SDK 应容忍额外字段，不能把核心类型当作严格 wire 白名单。

证据：`core/automation/service.cjs`：forExtension/runJob；`persistence.cjs`：capture、automationRead、automationSubmit、automationGetJob、publicJob。

### 5.3 jobs 的精确幂等边界（QA 重点修订）

service 先读取 turns，将持久层输入构造为 `{projectId,eventKey,prompt,outputSchema,input:turns}`。持久层移除 eventKey，执行：

```js
const {eventKey, ...content} = input;
const hash = SHA256(JSON.stringify(content));
```

这里**没有递归排序对象键，也没有 JSON 语义规范化**。具体行为为：

- 同一扩展、同 eventKey：hash 一致复用原 job；不一致返回 CONFLICT。
- 换 eventKey：仅当该扩展已有 unknown job 的 hash 与当前 hash 一致时，返回 OUTCOME_UNKNOWN。
- 因而，“同内容”只能指当前持久层序列化内容哈希一致。仅改变 outputSchema 对象键的插入顺序，也可能改变 hash；同键可能冲突，换键时也不能依赖 unknown 检查识别同一业务请求。

最后一项是本轮从源码静态推导的边界，未运行复现测试。现有 `tests/automation.test.cjs` 的换键拒绝用例使用相同请求表示，不能证明语义等价但键顺序不同的情况也被拦截。

SDK 必须保留原请求表示、稳定 eventKey 和返回 job.id。unknown 后优先 get 原 job 并进行业务核实，不得通过换键、重新组织 schema 或改写请求自动重提。若 SDK 实施自己的规范化，应在首次提交前固定规则；不能声称当前宿主已经规范化，也不能在重试时改写既有请求。

证据：`core/automation/service.cjs`：forExtension；`core/automation/persistence.cjs:74`–`:76` 的 hash、old、unknown 检查。

## 6. 持久补充用户输入

### 6.1 接线、工具参数与能力

当前 `electron/main.cjs:125` 设置 inputToolsEnabled=true；`electron/agent-runtime.cjs` 的 supplementalTools/createAgentChannel 绑定有效执行上下文。没有已核实的 Node context.inputs 或页面 inputs API。

参数契约为 `specs/extensions/contracts/user-input/tools.schema.json`，额外字段不允许；`core/inputs/definition.cjs` 还执行 JSON 数据、深度、大小和字段语义校验。当前 schema 标题已更新为 `User input v1 internal model tool contract`，不存在历史报告中的未接线标签。

```ts
type InputValues = Record<string,string|number|boolean>;
type InputResult<T> =
  | {ok:true;value:T}
  | {ok:false;error:{code:string;message:string;details?:unknown}};
type InputRequestArgs = {
  requestKey:string;reason:string;
  source:
    | {kind:'dynamic';definition:{title:string;description?:string;fields:InputField[]}}
    | {kind:'template';key:string};
  prefill?:InputValues;
};
type RequestState = 'pending'|'answered'|'cancelled'|'superseded'|'expired';
```

InputField 的完整约束直接同步 schema 和 definition.cjs，不以简化 TypeScript 类型取代验证。支持 text、textarea、number、money、date、select、checkbox、switch；字段名匹配 `^[a-z][a-z0-9-]{0,79}$`。模板来源仅支持单页 chat 表单，不支持业务 operation、group-toggle、dependsOn、visibleWhen。

| 工具 | 参数 | InputResult.value |
|---|---|---|
| input_capabilities | `{}` | 能力及 limits |
| input_list | `{}` | `{requests,sourceMessages,sourcesTruncated}` |
| input_request | InputRequestArgs | `{requestId,revision,state,created}` |
| input_read_answer | `{requestId}` | `{requestId,revision,state,answer,delivery}` |
| input_cancel | `{requestId,expectedRevision,reason}` | `{requestId,revision,state}` |
| input_replace | `{requestId,expectedRevision,replacement:InputRequestArgs}` | `{requestId,revision,outcome:'replaced'|'confirmationRequired',replacementId,proposalId?}` |
| input_resolve_from_message | `{requestId,expectedRevision,sourceMessageIds,values}` | `{requestId,revision,outcome:'resolved'|'confirmationRequired',proposalId?}` |

confirmationRequired 分支含 proposalId。requestKey 最多 128 字符，reason 最多 500 字符；expectedRevision 为非负整数；sourceMessageIds 为 1–8 个不同 ID。prefill/values 都是平铺字段对象，不按步骤分组。runId/projectId 由宿主绑定，不能通过工具参数替换身份。

当前能力：version=1；dynamicForms/persistentRequests/messageResolution/cancel/replace=1；executionUnitResume=0。

limits 为 fields=12、definitionBytes=32768、prefillBytes=65536、answerBytes=65536、options=50、pendingRequests=5、totalRequests=100、pendingDeliveries=32、sourceMessages=20。

证据：`core/inputs/model.cjs`：supported/capabilities/bindModelInputs；`definition.cjs`：validateTool/normalizeDynamic；上述 schema。

### 6.2 列表、答案和投递结构

```ts
type InputDelivery = {
  id:string;
  state:'queued'|'dispatching'|'delivered'|'failed'|'unknown';
  held?:true;
};
type InputRequestSummary = {
  id:string;revision:number;title:string;reason:string;origin:string;
  state:RequestState;draftTouched:boolean;createdAt:string;
  delivery:InputDelivery|null;
  proposal?:{id:string;kind:'replacement'|'messageResolution'};
};
type InputList = {
  requests:InputRequestSummary[];
  sourceMessages:{id:string;sequence:number;text:string;truncated:boolean}[];
  sourcesTruncated:boolean;
};
type InputAnswerBase = {
  id:string;requestId:string;requestRevision:number;createdAt:string;
  values:InputValues;displayLabels:Record<string,string>;locale:string;
};
type InputAnswer =
  | (InputAnswerBase & {source:'form'})
  | (InputAnswerBase & {source:'userMessage';
      sourceMessages:{id:string;sequence:number;text:string}[];
      interpretation:{values:InputValues}});
```

列表用 id；其他参数和 receipt 用 requestId。createdAt 是 ISO 时间字符串。input_list 只列 pending 或仍有非 delivered 投递的请求，不是完整历史；只暴露 draftTouched/proposal 摘要，不返回未提交草稿。

来源消息最多 20 条，单条展示最多 2000 字符，并受整体约 32 KiB 上限约束。单条 truncated 与整体 sourcesTruncated 都要保留。答案中的 sourceMessages 是冻结原文证据，没有列表摘要的 truncated 字段。

pending 时 answer=null；requestRevision 是形成答案时引用的版本，不保证等于读取时请求 revision。answered 与 delivered 不等价，delivery 可为 null 或 held。

证据：`core/inputs/model.cjs`：delivery/input_list/input_read_answer；`core/inputs/store.cjs`：submit/resolve。

### 6.3 幂等、用户确认与取消

input_request 持久化后立即返回，不阻塞等待用户。相同 requestKey 和身份内容复用请求，内容不同冲突；重试会读取当前记录，因此可返回当前 revision/state、created=false。

cancel/replace/resolve 使用参数摘要作为 mutationId，store 在 input_mutations 保存不可变命令结果；相同命令重试命中旧 receipt，而不是重读当前状态。该重试仍受当前调用身份、来源等外围检查。改变 expectedRevision 是新命令，不是原 receipt 重试。

resolve 仅接受本聊天已送达的用户原文和完整有效答案。未触碰草稿时可直接冻结答案、delivery=null，不重复投递原消息；草稿已触碰时生成用户确认提案。replace 同样保护已触碰草稿，即使保存值相同也不能推定未保存编辑可覆盖。模型没有接受提案工具。

input_cancel 只取消 pending 请求，不取消宿主任务；模型取消不创建通知 outbox。来源更新或停用可使 pending 请求 expired；已有答案可能保留，但后续投递受来源有效性约束。unknown 投递需核实已有证据，不盲目重发。

预填不是答案，补充信息不是业务执行授权，宿主聊天继续控制不是 executionUnitResume。

证据：`core/inputs/store.cjs`：stable/digest、prior、input_mutations、cancel/replace/resolve；`model.cjs`：prepare/call。model 中“original revision”注释仍与实际创建重试行为不一致；`tests/input-model.test.cjs:30` 明确断言编辑后重试 revision=1，本轮仅静态阅读。

## 7. Forms 与声明式 UI

### 7.1 Forms

| 工具 | 参数与返回 |
|---|---|
| forms_capabilities | `{}` → declarativeForms/singleClickChat/fieldDependencies/conditionalFields/groupToggle/switch/readSubmission=1，另含三项本地化标志 |
| forms_list | `{}` → `{templates:[{key,template}],instances:[{id,key,step,status}],errors}` |
| forms_present | `{key,prefill?}` → `{id,status}`，立即返回 |
| forms_read_submission | `{submissionId}` → `{submissionId,deliveryStatus,...snapshot}` |

prefill 按 stepId 分组，例如 `{details:{name:'张三'}}`。同 turnKey/key 可复用实例。大小判断实际是 `JSON.stringify(prefill).length > 128*1024`，不是精确 UTF-8 字节上限。

冻结 snapshot 包括 locale、displayTemplate、template、templateDigest、sourceRevision、source、projectId、conversationId、runId、instanceId、values、initialValues、touched。values/initialValues 按步骤和字段嵌套，touched 键为 stepId.fieldName。

read_submission 只接受当前聊天中有 snapshot 且 asyncInput=true 的提交，并检查归档、项目和来源 revision/digest；不是全部业务 operation 提交的通用查询。

业务表单 operation 必须属于同扩展且 exposeTo 含 page；write 必须配置同扩展 read recovery。宿主核实输入为 `{submissionId,projectId?}`。恢复约定为：

```ts
type FormRecoveryResult =
  | {status:'succeeded';result:JsonObject}
  | {status:'notExecuted'}
  | {status:'unknown'};
```

succeeded.result 仍须通过原 operation.outputSchema；无法确认时保留 unknown，不自动重放写入。当前服务显式处理 succeeded/notExecuted，其余未确认结果保持原状态；不得据此扩展为通用 resume API。

证据：`core/forms/service.cjs`：catalog/present/read/action、snapshot/reconcile 分支；`core/extensions/agent-channel.cjs`。

### 7.2 UI

| 工具 | 参数与返回 |
|---|---|
| ui_capabilities | `{}` → declarativeUi=1、types=[editor,collection]、chatActions/collectionValueLabels/collectionLayouts=1、businessStatus=false、limits 和本地化标志 |
| ui_list | `{}` → `{templates,errors,instances:[{id,key,revision,readOnly,replacedBy?}]}` |
| ui_present | `{key,data}` → 当前 flow 对象 |
| ui_update | `{id,expectedRevision,data}` → 新 flow、新 ID |
| ui_read_submission | `{submissionId}` → `{instanceId,submissionId,input,data,rowKeys}` |

```ts
type UiData = {
  values?:Record<string,unknown>;
  rows:Record<string,unknown>[];
  state?:'ready'|'empty'|'incomplete'|'failed'|'uninitialized';
  summary?:string;coverage?:string;
};
```

flow 当前包含 id/kind/runId/conversationId/projectId/turnKey/key/digest/sourceRevision/template/localizationId/data/status/submissions/revision 等。完整稳定 DTO 范围待确认；SDK 不应按自行缩减的字段集剥除返回数据。

update 使用 expectedRevision，旧实例设为 superseded 并记录 replacedBy，保留只读历史；旧实例不能继续作为有效 flow 读取提交。用户点击 chat action 才投递，模型无自动点击接口。data.state 是展示状态，businessStatus=false，不是业务执行状态。

限制：模板 128 KiB、实例 192 KiB、500 行、8 actions；服务另限制每聊天 100 个 UI 实例。读取限当前聊天和有效来源。

证据：`core/ui/service.cjs`：present/valid/update/action/read；`agent-channel.cjs`：ui_capabilities。

## 8. 本地消息与业务动作

### 8.1 数据类型与七方法

```ts
type LocalizedText = string | {key:string;args?:Record<string,string|number|boolean>};
type MessageActionInput = {
  id:string;label:LocalizedText;commandId:string;arguments?:JsonObject;
};
type LocalMessageInput = {
  eventKey:string;title:LocalizedText;body:LocalizedText;
  category:'notice'|'actionRequired';severity?:'info'|'warning'|'error';
  businessType?:string|null;expiresAt?:number|null;actions?:MessageActionInput[];
};
type PublishResult =
  | {status:'published';id:string;revision:number;remind:boolean}
  | {status:'duplicate'|'dismissed';id:string}
  | {status:'rejected'};
type LocalMessagePatch = {
  title?:LocalizedText;body?:LocalizedText;severity?:'info'|'warning'|'error';
  actions?:MessageActionInput[];expiresAt?:number|null;
  businessState?:'pending'|'resolved'|null;
  validity?:'active'|'expired'|'withdrawn';
};
type MessageActionInvocation = {
  id:string;messageId:string;actionId:string;operationId:string;
  effect:'read'|'write';revision:number;
  state:'prepared'|'dispatching'|'accepted'|'completed'|'failed'|'unknown'|'notExecuted';
  remoteTaskId?:string;createdAt:number;updatedAt:number;
};
type ActionResultReport = {
  invocationId:string;reportId:string;expectedRevision:number;
  outcome:'accepted'|'completed'|'failed'|'unknown';remoteTaskId?:string;
  messageUpdate?:{patch:LocalMessagePatch;expectedRevision:number};
};
```

LocalMessage 包含 id/eventKey/title/body/category/severity/businessType/actions/expiresAt/validity/businessState/revision/receivedAt/updatedAt。读取时 title/body/action.label 为解析后的字符串；businessType/expiresAt 可为 null，businessState 为 pending/resolved/null。时间戳为数字毫秒。投影不暴露 readAt、dismissedAt、宿主来源身份、账户作用域或 token。

| context.messages 方法 | 返回与语义 |
|---|---|
| publish(input) | Promise<PublishResult>；必须按 status 分支 |
| getByEventKey(eventKey) | Promise<LocalMessage|null>；缺失、suppressed、dismissed 为 null |
| update(id,patch,expectedRevision) | Promise<LocalMessage|null>；CAS；缺失/suppressed 可 NOT_FOUND，dismissed 投影 null |
| withdraw(id,expectedRevision) | 同 update，设 validity=withdrawn |
| getPreferences() | Promise<{receive:boolean,muted:boolean}>；只读 |
| listActionInvocations() | Promise<MessageActionInvocation[]>；只含 dispatching/accepted/unknown，不是完整历史 |
| reportActionResult(input) | Promise<{invocation:MessageActionInvocation,message:LocalMessage|null}> |

记录字段为 id，报告参数为 invocationId。effect 已在 runtime publicInvocation 返回，现有预览声明遗漏。

publish 同键返回旧记录状态，不覆盖旧内容；rejected 不是发布成功。默认 severity=info、actions=[]、expiresAt/businessType=null；notice 的 businessState=null，actionRequired 初始 pending。终态不能任意复活。

action.commandId 必须对应本扩展 exposeTo 含 page 的 operation。消息没有独立 messages permission 枚举；宿主校验可信启用安装、generation、本地 profile/source，并应用 receive/muted 偏好。调用方不能提供 profileId/source/accountScope。无公开消息变更订阅或独立 signal 参数。

### 8.2 字段限制

| 字段 | 当前校验 |
|---|---|
| eventKey | 非空，最多 512 UTF-8 字节 |
| title/body/businessType | title 非空白、最多 1024 字节；body 最多 64 KiB；businessType 为 null 或最多 256 字节字符串 |
| actions | 最多 2 个，id 不重复 |
| action.id/label/commandId | 非空，分别最多 128/160/256 字节 |
| action.arguments | JSON 对象，序列化最多 64 KiB |
| expiresAt | null 或非负安全整数，Unix 毫秒 |
| update/withdraw expectedRevision | 至少 1 的安全整数 |
| reportId | 非空，最多 256 字符 |
| report expectedRevision | 安全整数且匹配记录；该分支未单独规定正数下界 |
| remoteTaskId | 可选，最多 1024 字符 |
| scope 消息记录数 | 最多 10,000 |

LocalizedText 先经宿主解析；不要把翻译引用对象的 JSON 大小与最终字符串大小混为一谈。

### 8.3 显式报告、幂等与重启

report 只允许从 dispatching/accepted/unknown 报告，revision 必须匹配，outcome 不能等于当前状态。相同 invocationId/reportId、相同完整输入重试返回保存结果；不同内容 CONFLICT。这里会递归排序对象键，与 jobs 的未规范化哈希规则不同。报告与可选 messageUpdate 在同一事务提交。

handler 普通成功不能证明业务完成。handler 返回后仍处于 dispatching，宿主将其标为 unknown；SDK 不得把 operation `{ok:true}` 自动变成 completed。

dispatch 前取消为 notExecuted；重启 prepared→notExecuted，dispatching→unknown。写动作防重锁覆盖 prepared/dispatching/accepted/unknown/completed。unknown 后只读核实业务幂等键，不自动重放。

证据：`core/extensions/messages.cjs`：validate/publish/update；`message-handlers.cjs`：publicInvocation/extensionMessage；`action-journal.cjs`：report/recover/message_submission_lock；`message-service.cjs`：execute；`specs/extensions/contracts/messages-preview.d.ts`。

## 9. 权限、错误、取消与兼容探测

### 9.1 权限与生命周期失效

权限枚举包括 projects.read、projects.path.read、conversations.create、conversations.open、agent.hooks、conversations.read、background.jobs、storage、configuration、secrets。

manifest 声明及 self/project scope、实际 grant、信任/启用状态、generation 和项目存在性共同约束访问。安装更新提交清除 grants；授权变化推进 generation。旧调用可能在确认后、dispatch 前或返回前失效；宿主可压制已经完成操作的成功返回。

认证使用独立 manifest 资源和 session 绑定，不虚构 authentication permission。Node 独立进程也不等于任意文件/网络访问都受完整操作系统沙箱约束。

证据：`core/extensions/persistence.cjs`：extensionMutation/extensionCheck/extensionData；`operations.cjs`：check。

### 9.2 四种错误表面

| 表面 | SDK 要求 |
|---|---|
| operation Result | 保留 code/message/requestId/effectStatus；不要按 code 重新推断副作用状态 |
| Node rejection | rpcResult 附加 error.code；bootstrap 本地 HOST_UNAVAILABLE/BUSY/TIMEOUT/关闭 CANCELLED 仅普通 Error，不保证 code |
| input Result | 无必需 requestId/effectStatus，保留其 details |
| MCP | 正常值序列化到 text；value.ok=false 设置 isError；抛异常编码 `{code,message,fields?}`，缺 code 用 TOOL_ERROR |

宿主公开错误白名单：INVALID_ARGUMENT、INVALID_OUTPUT、NOT_FOUND、UNSUPPORTED、UNTRUSTED、DISABLED、FORBIDDEN、GRANT_REQUIRED、INTERACTION_REQUIRED、CANCELLED、TIMEOUT、OUTCOME_UNKNOWN、BUSY、CONFLICT、ACTIVATION_FAILED、HOST_UNAVAILABLE、STORAGE_UNAVAILABLE、QUOTA_EXCEEDED、INTERNAL。未知 error.code 归 INTERNAL。

input 只保留 INVALID_ARGUMENT/NOT_FOUND/CONFLICT/FORBIDDEN/QUOTA_EXCEEDED/UNSUPPORTED/CANCELLED，其余异常归 STORAGE_UNAVAILABLE。不能把全局白名单理解为各入口都保留全部错误。forms/UI 不能强制套用 operation Result。

取消不等于回滚。router 根据 binding.started 给出 notStarted/unknown；SDK 必须保留结果，不因“超时”“取消”自行判定未执行。storage/messages/jobs 等无公开 signal；RPC 超时不证明底层停止，远端写入依靠业务幂等与核实恢复。

证据：`core/extensions/errors.cjs`；`bootstrap.cjs`：rpc/rpcResult/shutdown；`operations.cjs`：invoke catch；`core/inputs/model.cjs`：catch；`agent-channel.cjs`：tools/call/catch。

### 9.3 探测顺序

1. 页面先 initialize，检查 protocolVersion='1'、supportedMethods 和所需桥接方法；HostContext 监听单独检查存在性。
2. Agent 先 tools/list，再 input/forms/ui capabilities。缺工具时明确不可用，不模拟内部 IPC 或代替用户提交。
3. Node 检查所需完整方法集合；messages 的本版完整契约需七方法。
4. context.capabilities 只有 skillLocalization/templateLocalization/notificationLocalization/liveLocalization，不能据此推断 messages、inputs 或全部 UI 能力。
5. engines.api、页面 protocolVersion、MCP serverInfo.version、input version 是不同维度，不是统一功能版本。
6. 静态 host-capabilities.json 的 runtimeNegotiation=false；它既不是运行时探测响应，也不是授权证明。该文件当前仍未收录 input_* 持久输入能力。

## 10. 五类最小调用示例

以下都是静态核对示例，未编译或运行。operation、handler 和模板必须由实际扩展声明；示例名称不是宿主内置能力。

### 10.1 页面 operation

前提：声明 example.demo.projectInfo、handler=projectInfo、effect=read、projectScoped=true、exposeTo 包含 page，声明并授予 projects.read，输入输出 schema 对应项目 ID 和 Project。

```js
// Node：同步注册。
export function activate(context) {
  context.operations.register('projectInfo', (input, invocation) =>
    invocation.resources.getProject(input.projectId));
}
```

```js
import {createClient} from '@ambleloft/extension-sdk/webview';
const client = createClient();
const host = await client.initialize();
if (!['selectProject','invoke'].every(m => host.supportedMethods.includes(m))) {
  throw new Error('UNSUPPORTED');
}
const selected = await client.selectProject({capabilities:['projects.read']});
if (selected.ok && selected.value) {
  const controller = new AbortController();
  const result = await client.invoke('example.demo.projectInfo',
    {projectId:selected.value.id}, {signal:controller.signal});
  if (!result.ok) console.error(result.error.code, result.error.effectStatus);
}
```

页面错误边界还需处理 initialize 异常和 selected 失败；取消按钮可调用 controller.abort。选项目不豁免调用鉴权，unknown 不自动重试写入。

### 10.2 hook → getTurn → job

前提：声明 conversation.turn.completed 对应 handler=summarize；具有 agent.hooks/conversations.read/background.jobs 项目授权，用户已启用自动化。

```js
export function activate(context) {
  context.hooks.register('summarize', async (event, invocation) => {
    if (event.type !== 'conversation.turn.completed') return;
    if (invocation.signal.aborted) throw new Error('CANCELLED');
    const ref = {conversationId:event.conversationId,
      turnId:event.turnId, version:event.version};
    await context.conversations.getTurn(ref);
    const request = {
      projectId:event.projectId, eventKey:event.eventId,
      prompt:'总结本回合，返回 summary 字符串。', turns:[ref],
      outputSchema:{type:'object',properties:{summary:{type:'string'}},
        required:['summary'],additionalProperties:false}
    };
    const job = await context.jobs.submit(request);
    if (job.status === 'unknown') console.error('需要核实', job.id);
  });
}
```

正常返回 ACK 只表示本次 hook 处理完成，不表示 job 成功。重复投递须保持 eventKey 和请求表示稳定；升级代码时也不能用改变 schema 键顺序或换键处理 unknown。signal 检查不能取消已经发出的 jobs RPC。完成结果通过另行声明 background.job.completed hook 后 jobs.get 读取，不在 hook 中轮询等待。

### 10.3 消息 action → 显式 report

在 manifest 声明的 write/page handler 中，使用 invocation.message.invocationId 取得动作身份。前提是完整七方法探测成功，业务自身具备幂等和核实能力。

```js
const names = ['publish','getByEventKey','update','withdraw',
  'getPreferences','listActionInvocations','reportActionResult'];
if (!names.every(name => typeof context.messages?.[name] === 'function')) {
  throw Object.assign(new Error('UNSUPPORTED'), {code:'UNSUPPORTED'});
}
const result = await context.messages.publish({
  eventKey:'review-v1',title:'请确认',body:'查看并确认业务动作。',
  category:'actionRequired',
  actions:[{id:'confirm',label:'确认',commandId:'example.demo.confirm',arguments:{}}]
});
// 按 result.status 区分 published/duplicate/dismissed/rejected。
```

业务已由真实响应或只读查询证实完成后，执行报告片段；这不是业务执行本身：

```js
const invocationId = invocation.message.invocationId;
const row = (await context.messages.listActionInvocations())
  .find(item => item.id === invocationId);
if (!row) throw new Error('动作不可报告');
const report = {invocationId:row.id,reportId:'confirmed-completed',
  expectedRevision:row.revision,outcome:'completed'};
await context.messages.reportActionResult(report);
```

报告响应丢失时保留整个 report 原样重试，不能复用 reportId 却更换 expectedRevision。若业务结果未知，不报告 completed、不重做业务；先核实。需要同时把消息设 resolved 时，增加带消息当前 revision 的 messageUpdate，不能混用动作 revision。

### 10.4 动态 input

先 tools/list 和 input_capabilities。以下为 MCP tools/call 的 params：

```json
{"name":"input_request","arguments":{
  "requestKey":"destination-v1","reason":"需要目的地才能继续制定行程",
  "source":{"kind":"dynamic","definition":{"title":"补充目的地",
    "fields":[{"name":"destination","type":"text","label":"目的地","required":true}]}},
  "prefill":{"destination":"上海"}
}}
```

保存返回 requestId；立即继续独立工作，不轮询、不把预填当答案。创建响应不确定时使用完全相同 requestKey 和参数重试。用户确认后按需调用 `input_read_answer({requestId})`，分别处理 answer 和 delivery。confirmationRequired 等待用户，模型不能接受提案；取消使用当前 revision，且只取消请求。

### 10.5 传统 forms

先 forms_capabilities/forms_list，使用真实 key。假定模板有 details 步骤、name 字段且 submit.kind=chat：

```json
{"name":"forms_present","arguments":{
  "key":"替换为真实模板 key","prefill":{"details":{"name":"张三"}}
}}
```

展示立即返回；用户提交后的消息提供 submissionId，再调用 forms_read_submission，读取 values.details.name、initialValues.details.name 和 touched['details.name']，独立检查 deliveryStatus。非 asyncInput 业务提交不能使用该读取接口。

若模板执行 write operation，unknown 时使用声明的 read recovery 核实 submissionId；无法确认就保留 unknown，不自动重放原写入。

## 11. SDK 待同步清单

下表差异只指 agent 仓库内 SDK，不能外推外部 extension-tooling 或 npm 包。

| 优先级 | 任务 | 可验证交付 |
|---|---|---|
| P0 | 固定外部 SDK 基线 | 下一阶段记录 extension-tooling commit、入口、最低宿主并实际 diff；此前不得标记已同步 |
| P0 | 同步源与生成类型 | packages/extension-sdk/contracts.d.ts 补 LocalizedText、locale、四项 capabilities、语言监听、布尔本地化参数和 forms/UI 类型；验证 source/generated/exports |
| P0 | 同步 form schema | 当前本地副本缺 confirmation、switch、group-toggle、dependsOn、visibleWhen；同步并验证合法模板 |
| P0 | 发布 messages 七方法契约 | 主 sdk.d.ts 未声明 messages，包未导出 messages-preview/getMessages；明确可选/实验入口，补 effect、status、限制、CAS、报告幂等 |
| P0 | 发布 input Agent 契约 | 七工具参数和返回联合类型、列表/答案、两种 receipt；不创造 context.inputs |
| P0 | 分离四类错误适配 | Node/operation/input/MCP 各自解析，不补造 error.code，不自动重试 unknown 写入 |
| P0 | 固定 jobs 重试表示 | 保留原请求和稳定 eventKey；文档说明未排序 JSON 哈希；unknown 不换键或重组请求重提 |
| P0 | 分离 forms/input/UI | 步骤预填、平铺预填、UI data 分开；保留 asyncInput 限制和 update 新 ID |
| P1 | 补齐 hooks/jobs | ACK、重复投递、六次尝试、保留/容量、预算、读取 256 KiB 与聚合 48,000 字节限制 |
| P1 | 完善资源/认证/普通事件 | 声明与 grant、代际失效、交互限制、token 隔离；不承诺通知重放或远端回滚 |
| P1 | 修正仍存在的文档漂移 | messages-preview 的 five→seven、动作 effect；model 创建 receipt 注释；inventory 补 input 能力并保留非运行时协商说明 |
| P1 | 明确构建与导出链 | scripts/build-extension-sdk.cjs 当前只复制 sdk.d.ts、extension.schema.json、form.schema.json；消息/input/UI 契约需要明确分发路径 |
| P1 | 扩展契约一致性检查 | 覆盖生成物、schema、exports、方法集合和返回联合类型；当前仅 ErrorCode 检查不足 |

本地 package 版本为 0.1.0-alpha.1。预览文件的 getMessages 只是声明，不能直接当作已实现包导入。两份 extension.schema.json 本次文本 diff 无差异，未运行 validator。

**已关闭的历史差异：**input schema 标题已更新，本次不再列“删除 not yet a runtime capability”待办；这不影响独立工具契约发布和 inventory 补项任务。

## 12. 验收建议与测试证据

本轮没有运行任何测试、构建或示例。以下区分已读取断言与后续要求，不提供通过数量。

| 领域 | 本轮静态证据 | 后续执行验收 |
|---|---|---|
| 生命周期/operation | tests/extension-hosts.test.cjs 中取消容量、late registration、schema 和代际相关检索结果 | 预取消、排队超时、运行取消仍占容量、迟到结果、跨项目、撤权、输入输出非法 |
| 输入 | 定向读取 tests/input-model.test.cjs:22–42 的草稿隔离、当前 revision 和 resolve 幂等断言；其他用例部分检索 | 创建返回当前状态；mutation 原 receipt；真实消息证据；提案确认；取消不停止任务；来源失效 |
| 自动化 | tests/automation.test.cjs 中重试/恢复/预算等用例检索；定向读取 :74 起换键 unknown 用例 | 同键同表示复用、不同 hash 冲突；unknown 同 hash 换键拒绝；六次死信、保留、预算、读取/聚合大小 |
| jobs 哈希边界 | persistence.cjs 的 JSON.stringify 哈希实现；未运行复现 | 新增语义等价但 outputSchema 键顺序不同的同键/换键用例；记录实际行为，验证 SDK 不自动重提，不把语义防重写成当前宿主保证 |
| 消息 | 读取 message-service/action-journal/message-handlers 实现；测试批量检索有截断，不声称完整审阅 | status 分支、null/NOT_FOUND、七方法、id/invocationId、reportId 原样重试、原子 messageUpdate、重启防重 |
| Forms | tests/forms.test.cjs 中单次提交、unknown recovery 断言的检索输出 | 步骤预填、冻结 snapshot、asyncInput 和来源归属、unknown 不重放写入 |
| 一致性 | 完整读取 tests/extension-contract-consistency.test.cjs | 当前仅验证 ErrorCode 白名单；新增生成类型、schema、exports、方法和返回结构检查 |

页面 SDK、UI 和认证还需执行真实交互、取消转换、订阅 dispose、UI 新 ID/历史只读、来源失效、登录取消及撤权测试。`tests/extension-sdk.test.cjs`、extension-operations、input-requests、user-input-contract、action-journal、message-store 和 e2e 是后续入口，本轮不声称完整阅读或运行。

验收记录应列环境、源码和 SDK commit、实际命令、结果及未覆盖项。不能用静态阅读或历史报告替代运行结果。

## 13. 未知项与当前不可宣称能力

待确认：外部 extension-tooling 的真实差异和目标版本；正式/实验导出策略；最低兼容宿主；input schema 与返回类型的分发位置；UI flow、job 额外字段的稳定范围；当前未提交实现是否进入发布物。

当前不能宣称存在通用执行单元恢复、账户级消息投递、UI 每行业务执行状态、Node/页面 inputs API、公开 jobs.manage/cancel/retry。executionUnitResume=0、businessStatus=false 和当前公开方法集合是直接依据。内部实现或设计稿不构成 SDK 已实现证明。
