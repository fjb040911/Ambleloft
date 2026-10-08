# 完整业务扩展 Demo 与验收

## 1. Demo 目标（D-01）

交付名为“财务报销助手”的可安装扩展，而非只有 SKILL.md 的个人 Skill。用户在普通任务中输入“我要报销差旅费”，Agent 展示表单，用户逐步填写并确认，由扩展后端提交到模拟报销服务。

建议结构（具体构建目录可沿用现有 CLI）：

```text
expense-extension/
  extension.json
  src/main.ts
  skills/expense/SKILL.md
  skills/expense/forms/travel.yaml
  dist/main.cjs
mock-expense-service/
  src/
  tests/
  README.md
```

- manifest.skills 包含 skills/expense，main 指向实际后端产物，operations 注册提交和核实接口。
- 配置提供 serviceUrl，连接地址不写进 Skill/YAML。默认服务只监听本机；不要硬编码真实企业服务或真实 token。
- 若模拟认证，仅使用专用测试凭据并明确为模拟；通过已实现的 secrets/认证能力获取。不得把模拟登录标为企业 OIDC 验收通过。
- 必须使用本轮生成的 SDK tarball 进行干净安装构建，不能借助 monorepo 隐式依赖或开发目录软链接掩盖缺包。

## 2. 用户流程和模板（D-02）

至少三步：

1. 行程：地区（上海/北京）、日期；下一步调用 saveDraft，结果返回 draftId。
2. 费用：金额（money CNY）、说明；下一步只本地校验和保存。
3. 确认：必选“我已核对报销信息”；最终调用 submitExpense，映射前置 draftId、金额、说明和确认值。

saveDraft 与 submitExpense 分别声明自己的恢复 Operation；最终返回 expenseId 和业务状态。业务操作默认 page-only，避免 Agent 绕过填写过程直接提交。

Skill 使用根级代码块引用模板：

````markdown
需要登记差旅费用时，先调用 forms_list 找到本扩展表单，再调用 forms_present。等待用户填写和确认；不要自行构造提交结果。

```amble-form-ref
path: forms/travel.yaml
```
````

以下为最终动作片段示意；步骤名、字段名、Operation 名必须与生成的完整模板及 manifest 一致：

```yaml
submit:
  kind: operation
  label: 提交报销
  operation: example.expense.submitExpense
  input:
    draftId:
      from: results.itinerary.draftId
    amount:
      from: steps.expenses.amount
    remark:
      from: steps.expenses.remark
    confirmed:
      from: steps.confirmation.confirmed
  recovery:
    operation: example.expense.lookupExpense
```

示例默认可使用 projectScoped=false，保证普通未关联项目的任务也能体验。另提供 projectScoped=true 的测试 fixture，验证宿主项目绑定；不能为默认 Demo 暗中创建本地项目或授予资源权限。

返回上一步不是服务端回滚。若修改行程后再次保存，服务可生成新业务草稿或按明确规则更新原草稿；说明旧草稿的处置。最终业务提交必须防止同一草稿重复变为多个报销单。

## 3. 模拟服务与故障注入（D-03）

模拟服务独立启动，有持久化数据库或等价的原子存储；扩展和服务重启不丢失提交账本。提供清晰的启动、关闭、清理隔离测试数据命令。

- 以认证主体/租户、操作和 submissionId 为去重键，记录输入摘要和原结果。
- 同键相同请求重放返回相同结果；不同输入返回冲突，不能新增业务记录。
- 成功创建业务数据和成功提交账本须原子提交，或以可证明正确的恢复协议实现；不能先写成功账本再尝试业务写入。
- 若明确返回 notExecuted，必须阻止旧的延迟请求之后继续产生业务副作用。没有记录但旧请求仍可能到达时返回 unknown。
- 注入模式至少有：写前明确拒绝、写后丢失响应、处理中暂不可判定、明确取消且不会继续执行、只读查询失败、服务重启。
- 为延迟成功模式提供测试控制入口/屏障，不只靠固定 sleep 猜测时间。
- 保留可核对的写入计数和 submissionId 账本；对外报告脱敏，不能记录真实凭据。

扩展 handler 必须检查 context.form；提交标识取自该字段。恢复 handler 从 input.submissionId 读取，返回 F-03 中的结果对象，不依赖新的 context.form。

## 4. 验收矩阵（D-04）

每行单独记录状态和证据；用例可以细分，不能用“Demo 整体正常”替代。

| ID | 用例 | 通过标准 |
| --- | --- | --- |
| T01 | SDK 出包 | 干净项目可解析 form.schema.json、导入 form 上下文/恢复类型；CJS/ESM 原入口无回归 |
| T02 | 脚手架与归档 | 一次生成可构建业务扩展；归档包含全部模板、Skill、后端；安装后可发现 |
| T03 | AST/路径规则 | inline/ref 均可用；嵌套示例不注册；越界、符号链接被拒绝 |
| T04 | 严格校验 | 未知属性、重复键/ID、非法 YAML、超限、错误映射有准确诊断 |
| T05 | 默认权限发现 | 真实引擎先 forms_list 再 forms_present；检查 list 实际返回模板，不能只有卡片截图 |
| T06 | 字段确定性 | 地区显示中文、提交稳定 value；非法日期、金额精度、范围和必选确认被阻止 |
| T07 | 自动保存 | 自动保存不禁用输入、不丢焦点；模拟保存延迟期间继续输入，最后内容持久化且无旧快照覆盖 |
| T08 | 切换与重启 | 保存后的草稿在切换任务、重启后恢复；无业务写入或模型调用自动重放 |
| T09 | 多步骤身份 | flowInstanceId/conversationId 稳定；不同业务提交使用各自 submissionId；前置结果正确映射 |
| T10 | 回退修改 | 保留普通输入；修改前置字段使下游结果/必选确认失效；不会把已成功业务写入伪装为撤销 |
| T11 | 写确认取消 | 宿主确认不是扩展按钮文本；取消后服务写入计数为零；再次操作仍需确认 |
| T12 | 写入成功 | 扩展 Node 调用配置的服务，服务收到正确金额字符串和 submissionId，界面仅在成功后完成 |
| T13 | 响应丢失 | 服务实际成功但响应丢失，宿主显示待核实，不再次写入；查询 succeeded 后恢复结果并推进 |
| T14 | 明确未执行 | 服务能证明旧请求不可能再执行，查询返回 notExecuted 后允许用户重新提交；不自动重试 |
| T15 | 结果仍未知 | unknown、查询失败、服务断线时保持待核实；无法通过连点绕过状态 |
| T16 | 恢复契约 | lookup 接收 input.submissionId 而不是 context.form；错误 succeeded.result 无法通过原 outputSchema |
| T17 | 服务幂等 | 同键相同输入不新增记录；同键不同输入拒绝；新键也不能重复正式提交同一业务草稿 |
| T18 | 多窗口冲突 | 陈旧 revision 被拒绝；用户未保存输入保留，不能静默覆盖另一窗口的新内容 |
| T19 | 权限与归属 | 跨扩展引用、非 page 操作不可用；projectScoped fixture 正确绑定项目，未授权资源仍拒绝 |
| T20 | 来源/生命周期 | 停用、更新、移除、模板变更、聊天归档阻止旧实例继续执行业务；不自动迁移重放 |
| T21 | 常规 Operation 兼容 | 非表单调用 form 为 undefined，不影响旧 handler；专用表单 handler 缺少 form 时写前失败 |
| T22 | 已有功能回归 | 旧消息、设置、认证、首页桥、MCP Apps 测试不因本次 SDK/CLI 变更失败 |

T07 的慢保存、T13/T14 的服务执行时序、T18 的窗口冲突必须使用可重复的控制条件，报告实际观察值。只通过静态类型检查不算通过运行时用例。

## 5. 宿主缺口与阻塞处理（D-05）

本次不要求 SDK 补做宿主私有协议。以下情况若无法按期望通过，记录 BLOCKED-HOST：

- 宿主自动保存响应顺序、旧版本恢复、未知结果等行为不符合验证预期；提交最小 fixture、准确步骤和时间线。
- 宿主没有 capability 探测、直接展示表单 SDK API或旧模板复制接口；不要以伪造返回值满足用例。
- 动态选项、复杂分支、附件、密码字段、模板自动本地化不在本次实现范围；不将其包装为已实现能力。

这份需求不宣称当前宿主的所有上述故障用例已通过，完整扩展和真实业务服务联调是本轮交付的一部分。

## 6. 交付报告（D-06）

报告必须注明：需求 v0.3.0、宿主源码/构建指纹、SDK/CLI 版本及 tarball SHA-256、扩展归档 SHA-256、模拟服务版本、Node/Electron/操作系统、逐项状态、执行命令和已知缺口。

证据包括：干净安装构建日志、CLI 正反例机器结果、默认权限工具实际返回、表单各步骤截图、恢复前后状态与脱敏账本计数。历史宿主测试可引用但不能冒充本轮结果。

推荐先参考宿主 `tests/forms.test.cjs` 和 `scripts/test-declarative-forms.mjs`，再覆盖本矩阵的扩展业务服务路径。现有个人 Skill 测试与 MCP Apps task-form Demo 均不能替代本轮验收。
