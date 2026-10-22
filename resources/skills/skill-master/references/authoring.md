# 按交付路径读取

这是技能大师的创作规则，依据 Ambleloft 当前本地实现整理。实际生成时以目标宿主的文档、Schema 和工具能力为准；不要依赖本机绝对路径或尚未公开的教程地址。

## 普通 Skill

交付目录至少包含 SKILL.md，frontmatter 包含 name 和 description。description 写清何时触发；正文给出专有流程和必要约束。仅在被需要时加载 references。不要默认加入 OpenAI 专有 agents/openai.yaml：本技能的目标是 Ambleloft，应核对其支持的元数据。

## 声明式业务表单

在 SKILL.md 正文根级使用 amble-form-ref 代码块，内容为 `path: forms/request.yaml`，路径相对 skill 根目录；或使用 amble-form 根级代码块内联 YAML。普通 Markdown 链接不是模板登记。

YAML v1 使用 id、title、fields 或 steps、submit。根 fields 是隐含 main 步骤；多步用 steps，不能同时写根 fields。字段以 name/type/label 定义，required 与类型限制来自 Schema。金额是十进制字符串，日期为 YYYY-MM-DD，选择项提交稳定的 value。单步和多步 chat 表单都可由独立 Skill 提供。

Skill 引导模型 forms_list 获取实际 key，再 forms_present({key,prefill})。prefill 按 step ID 分组，不能用扁平字段替代；不得编造 key。forms_present 立即返回实例 id/status，展示不是完成。

中间无业务动作时省略 next。最终 submit.kind=chat 把确认数据送回当前聊天；只有最终提交投递消息，前后导航不投递。confirmation:onSubmit 需要 forms_capabilities 的 singleClickChat 支持；未声明时保留额外确认。最终事件中的 submissionId 用于 forms_read_submission，读取冻结 values、initialValues、touched 等记录。这不同于 input_read_answer 和 ui_read_submission。

依赖字段、条件显示、开关等可选能力须先核对 forms_capabilities 和 Schema，不生成任意 JavaScript 条件。上游变更可要求重新确认下游输入；返回上一步不撤销已发生的业务操作。

当前 amble-form 字段是固定声明，不提供可动态增删的重复行/费用明细数组、公式计算或自动合计，也不自动把前面字段渲染成确认页摘要。不要把这些能力作为已有控件推荐。最小费用登记可用总金额与说明；多项明细确属必需时，核对其他 UI 契约或自定义页面方案后说明实现成本。普通三步确认页可以写核对说明、提供返回导航和确认勾选，最终 chat 的额外确认由宿主提供；不可将模型生成草稿后的汇总与提交前表单预览混为一谈。

## 扩展与 Node Operation

检查当前 CLI --help，再选择支持的 template，不能假定可用 init 参数或 npm 已发布版本。若使用本地工具链，按已有工程方式安装对应 tarball；版本号相同仍要核对包内容。打包时确保 manifest.skills 指向目录，且 SKILL.md 和相对引用文件都进入产物。

业务操作在插件 manifest.operations 中定义并在 Node 入口实现。表单 Operation 必须属于当前扩展，exposeTo 包含 page。普通独立 Skill 不承担 Node Operation 注册。

中间业务动作使用 next.kind=operation，最终使用 submit.kind=operation。input 可绑定 steps.<step>.<field>、前置 results.<step>.<顶层字段>、context.projectId 或契约允许的固定值。YAML 不直接执行 HTTP 或存放认证密钥。

写操作提供同扩展、只读且 page 可调用的 recovery Operation。后端使用宿主注入的 invocation.form 身份，其中 submissionId 配合真实用户、租户、操作范围实现业务幂等；requestId 不是替代品。身份标识也不是业务凭据。

未知结果先查询，不自动重发写入。恢复结果为 succeeded + result、notExecuted 或 unknown；仅在业务系统能证明没有执行且旧请求不会继续执行时返回 notExecuted。信息确认、操作授权与业务审批是不同事件，不将其中一个写成另两个已经完成。

## 其他 UI

业务表单：amble-form / forms_*；编辑器与集合：其注册模板 / ui_*；通用补充问题：input_*。MCP Apps 和扩展首页也各有自己的运行契约。先读所选路径的真实文档，不将某一类可用字段或桥接方法复制到另一类。
