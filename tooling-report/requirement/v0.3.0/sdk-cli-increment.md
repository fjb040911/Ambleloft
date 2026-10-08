# SDK/CLI 增量契约与施工要求

## A. 职责边界（F-01）

- Skill 负责业务使用指引；YAML 负责确定性表单；扩展 Node 后端负责业务 API、认证和错误处理。
- YAML 的 submit.operation / next.operation 引用现有 manifest operations。不新增第二套 handler、表单服务端口或贡献点注册体系。
- 继续用 extension.json.skills 声明 Skill 目录；本版不增加 contributes.forms 或 extension.json 顶层 forms。
- SDK 不依赖 React、shadcn/ui 或宿主渲染器。宿主绘制 YAML 表单；MCP Apps 的 iframe 内容仍由开发者自己提供。
- 不在 Skill、YAML 或模型上下文中写 API token、密码。服务地址放扩展配置；Node 后端根据已实现的配置、secrets/认证契约获取所需信息。
- 不新增 sdk.forms.present/save/submit/resume 等尚无宿主公开入口的方法。forms_list、forms_present 是宿主提供给 Agent 的工具，不是扩展可直接调用的 SDK 方法；window.desktop.forms 是宿主私有 IPC。

## B. SDK 契约（F-02～F-05）

### F-02：提交上下文

当前宿主已实现以下可选字段；独立 SDK 必须同步并从正常入口导出可用类型：

```ts
interface FormInvocationContext {
  flowInstanceId: string;
  stepId: string;
  submissionId: string;
  templateDigest: string;
  conversationId: string;
}
// 在现有 InvocationContext 中保留：
// form?: FormInvocationContext;
```

上述独立类型名为本轮 SDK 整理要求，宿主当前使用内联类型；字段和可选性不变。不得要求所有 Operation 都具备 form。

- 由宿主产生并通过 OperationRouter → HostManager → bootstrap 传递，不能从 input.form 构造或相信同名输入。
- 表单业务提交的 caller 是 page，即使由 Agent 展示表单。提交操作必须 exposeTo 包含 page；不能要求 agent 暴露才能使用表单。
- requestId 是本次调用标识；submissionId 是本次业务提交标识。不要互相替代。
- flowInstanceId 跨步骤稳定；conversationId 指向同一聊天；每次新提交可能生成新的 submissionId。用户返回上一步再提交不是旧提交的自动重放。
- `form` 存在不代表额外授权，不替代项目约束、资源授权和写入确认。不要把这些本机标识当作业务服务的身份凭据。
- 老宿主没有此字段时，专用于业务表单的 handler 在写入前明确报告不支持，不能伪造 ID 或降级为无幂等写入。

### F-03：恢复查询

新增可导出的类型；这是对现有行为的类型表达，不是新 RPC：

```ts
type FormRecoveryInput = {
  submissionId: string;
  projectId?: string;
};
type FormRecoveryResult<T extends JsonObject = JsonObject> =
  | { status: 'succeeded'; result: T }
  | { status: 'notExecuted' }
  | { status: 'unknown' };
```

重要细节：

1. recovery.operation 必须来自同一扩展、effect=read、exposeTo 包含 page。
2. 宿主查询时传 input.submissionId；查询操作 projectScoped=true 才附带 input.projectId。查询 handler **不能依赖 context.form**，当前这条调用不会携带它。
3. succeeded.result 是原写 Operation 的输出值，不是 SDK Result 包装；宿主按原 Operation.outputSchema 再次校验。
4. notExecuted 只用于服务端能确定没有执行、也不会被仍在运行的旧请求执行的情况。“暂时查不到”、超时、网络中断或服务重启不能直接解释为 notExecuted。
5. unknown 保持待核实，不自动再次调用写接口。取消 AbortSignal 或客户端超时不代表服务端回滚。
6. 只读恢复必须可重复调用且无新增业务副作用；普通业务 Operation 继续使用原错误与返回契约，不混用消息按钮的恢复协议。

### F-04：服务幂等说明与可选 helper

SDK 可以提供纯类型/纯函数辅助，但不能宣称“SDK 保证恰好执行一次”，不得默认重试有副作用的网络请求。

扩展把 context.form.submissionId 传给服务；服务需原子记录提交和业务结果，限定在真实认证主体/租户及业务操作范围内。同一键和相同输入返回同一结果；同一键但不同输入必须拒绝。不能只在扩展进程内 Map 去重。

服务端还要校验业务状态。例如已提交的报销单不能因另一 submissionId 被再次正式提交。业务幂等与同一次网络请求去重是两件事。

### F-05：Schema 与构建产物

- 发布 `@ambleloft/extension-sdk/form.schema.json` 子路径，更新 exports 和 files，并在实际 npm tarball 中验证可解析。沿用现有包名；如独立项目已变更包名，报告映射。
- 同步宿主 Schema，不手写一个宽松副本。当前宿主本地 build-extension-sdk.cjs 仅复制 sdk.d.ts 和 extension.schema.json，尚未包含此 Schema，不能据此假定已经出包。
- 声明式表单 TypeScript 类型可由 Schema 生成或维护，但必须做一致性测试。不能把 Schema 接受的组合都视作可运行；还需要语义校验。
- 提供编辑器 YAML Schema 关联说明；不擅自添加宿主严格 Schema 不接受的 `$schema` 或本地化属性。
- 保持已有 CJS/ESM、Operation、消息、认证、设置、首页桥和 MCP Apps 能力；不因表单支持破坏旧包入口。

## C. CLI 校验和打包（F-06～F-09）

### F-06：发现与解析

从 manifest.skills 中各 SKILL.md 的 Markdown AST 根级代码块发现表单：

- amble-form：代码块内容为 YAML。
- amble-form-ref：仅 `{path: 相对路径}`，相对所在 Skill 目录，而非包根目录。
- 引用、列表嵌套里的示例代码块不注册表单；不能用正则扫描取代 AST。
- 拒绝绝对路径、越界路径、符号链接；打包后仍能按原结构读取引用文件。
- 严格 YAML：重复键、锚点、别名、标签、merge key、原型危险键、非有限数值均拒绝；边界以宿主解析器为准。
- 同扩展跨 Skill 表单 id 不得重复；不同扩展的同名表单允许存在。

### F-07：结构与数据语义

与宿主 normalize/validateValues 保持一致，并提供共享 golden fixtures 或等价差异测试：

- version=1；根 fields 与 steps 二选一；fields 简写标准化到步骤 main。
- 最多 20 步、累计 100 字段、模板 YAML 128 KiB；引用文件还受宿主 safeRead 的文件大小约束。不要自行放宽限制。
- 支持 text/textarea/number/money/date/select/checkbox，拒绝未知属性及字段类型不适用的属性。
- money 是十进制字符串，currency 必填，scale 默认 2，范围同样是字符串；不以 JS 浮点数构造业务金额。
- number 为有限数；integer 要求安全整数；date 为有效 YYYY-MM-DD；select 选项值唯一且输入必须命中选项；必填 checkbox 必须为 true。
- 字段/步骤唯一、最小值不超过最大值、当前步骤之前的数据依赖合法。
- input 的每个参数仅允许 `{from: ...}` 或 `{value: ...}`；静态值支持范围以 Schema 为准，不支持表达式、任意 JS 或 API URL action。
- from 仅引用 steps.<stepId>.<field>、results.<stepId>.<顶层结果字段>、context.projectId。不能把它实现为通用 JSONPath。

### F-08：业务绑定校验

校验 Operation 存在、属于本扩展、page 暴露、写操作声明 recovery，恢复为同扩展只读操作。

还需做以下开发期检查，并区分“CLI 增强诊断”与“宿主已执行的检查”：

- projectScoped 操作应映射 projectId: {from: context.projectId}；项目不存在时不能由 SDK 自动选择别的项目。
- 对可静态判定的映射，检查必填输入、字段类型、results 字段与 outputSchema；复杂 JSON Schema 无法静态证明时明确警告，保留运行时验证，不能假装完全类型安全。
- 结果引用只面向已执行的前置 Operation，不能引用未来步骤或没有业务结果的步骤。
- 恢复接口 inputSchema 必须接受 submissionId 和所需 projectId；outputSchema 与三种状态及原操作结果契约一致。
- 中间步骤需要业务保存时使用 next.kind=operation；纯导航省略 next；chat 只作为最终 submit 使用。当前宿主 Schema 允许 next 指向通用 action，不能据此宣传“中途 chat 后继续向导”已受支持；CLI 应给出明确的兼容性错误。

错误应包含文件、可用时的行号、表单/步骤/字段标识、错误码和修复建议。诊断不输出认证信息或用户真实报销内容。

### F-09：脚手架与发布前校验

在现有 CLI 的 create/validate/build/pack 工作流增加可选“声明式业务表单”模板，不强制修改现有命令名称；报告准确命令。

模板必须是完整扩展，默认不只是个人 Skill，也不把 YAML 转成 MCP Apps HTML。普通扩展/个人 Skill/MCP Apps 原模板仍可用。

validate 不执行扩展 Node 代码、不启动业务服务。pack 要验证归档内容可被宿主发现，并包含 Skill、YAML、后端构建产物与 manifest。模拟服务单独运行，不因安装扩展自动启动或向公网发送数据。

## D. 当前能力与限制（F-10）

- 宿主无公开的 form-specific supportedMethods/能力协商接口；不要编造 supportsForms 方法或未经验证的最低宿主版本。记录实际测试的宿主源码指纹/构建版本。
- 模板文本按 YAML 原文显示；没有已交付的 YAML `%key%` 多语言替换、动态选项、任意条件表达式或远程模板加载。扩展 manifest 的本地化能力不等于表单 DSL 同样支持。
- 同一轮、同一 templateKey 的 forms_present 复用实例；本版不得宣传同一轮可无限创建同模板实例或已提供 forms_resume。
- 来源版本/模板摘要变化后，旧实例禁止继续执行；尚无复制/迁移旧表单的公开 API。
- 修改前置输入会清理下游结果与必要确认，但不会撤销业务服务上的历史写入。
- 存储、渲染、审批策略和自动保存焦点修复属于宿主，不应在 SDK 内复制实现。
