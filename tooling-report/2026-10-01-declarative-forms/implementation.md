# 声明式表单实现记录

## 已实现

- Skill 根级 `amble-form` / `amble-form-ref` 代码块发现；引用限制在 Skill 目录内。
- DSL v1 JSON Schema、严格 YAML 校验、模板摘要固定；拒绝未知属性、锚点、别名、标签、重复键和路径越界。
- text、textarea、number、money、date、select、checkbox；金额以十进制字符串处理。
- 模型使用 `forms_list`、`forms_present`，只选择注册模板与预填数据；列表包含当前任务实例的安全摘要，不返回用户草稿。
- 聊天内 shadcn/ui 表单；上一页、下一页、自动保存、手动保存、字段错误提示。
- SQLite form_instances 持久化，修订号冲突保护，多窗口不静默覆盖；切换聊天时尚未保存的输入保留在渲染器缓存。
- 单一 flowInstanceId、多步骤已校验数据与结果引用；修改前置输入使后续结果失效，保留普通输入并清除后续必选确认。
- chat 提交先由系统确认，再发送到同一聊天；提交标识保存在用户消息中，已提交实例不允许重放。
- 扩展 Operation 通过现有授权路由执行，强制再次确认写入，不使用记住的豁免；仅允许所属扩展的 page 操作。
- `InvocationContext.form` 提供宿主生成的 flowInstanceId、stepId、submissionId、templateDigest、conversationId。
- 持久化提交记录；结果未知时禁用重复提交；声明的同扩展只读 recovery Operation 可核实 succeeded / notExecuted / unknown，成功结果重新校验原输出 Schema。
- 扩展停用、版本变更、模板变更、项目变更与聊天归档阻止后续业务执行。

## 使用

在设置中导入 `examples/skills/travel-expense`，创建聊天，要求“填写差旅报销信息”。Skill 指示 Agent 使用 forms_list / forms_present。

扩展可在已注册的 skills 目录中使用相同 DSL。Operation 写入必须配置 recovery.operation；服务端以 context.form.submissionId 去重并提供查询接口。上一步不会撤销已经提交的业务数据。

## 当前边界

- 个人 Skill 支持 chat 提交；业务 Operation 必须通过安装并信任的扩展注册。
- 选项为静态列表，不支持任意脚本、动态布局、文件字段和密码字段。
- 来源变更的旧实例仍可查看，但不执行；尚未提供“复制为新版本表单”按钮。
- 自动保存有 700ms 防抖；直接终止应用可能丢失尚未完成保存的最后输入。
- 提交记录使用保守标记：Operation 授权/调度前先持久化 dispatched。此时崩溃也会要求核实，不会自动重放。
- 首版聊天提交预览使用系统原生确认窗口；卡片和字段使用 shadcn/ui。
- 现有 DSL 设计文档包含后续完善项，不表示所有计划中的验收项均已交付。

## 验证

- `tests/forms.test.cjs`：严格解析、金额日期选项、SQLite 持久化、冲突、重复提交、多步骤数据失效、未知结果核实。
- `scripts/test-declarative-forms.mjs`：真实 Electron + 模型 MCP 通道、UI 填写、自动保存、重启恢复、原聊天提交一次。
- 既有扩展 Host / Operation / MCP 通道、数据库和 AgentRuntime 回归。
- `npm run build` 通过；完整 `npm test` 201 项通过。

## 表单 MCP 审批修复

内置引擎原先仅为 extension_list_operations / extension_invoke_operation 配置精确的内部工具审批策略，遗漏 forms_list / forms_present。已补齐这两个工具，不放开其他 MCP 工具，也不绕过业务提交的宿主授权确认。

回归测试改为默认权限，真实引擎依次调用 forms_list → forms_present，并检查 forms_list 的实际返回内容包含注册模板，不能只检查最终卡片是否出现。

## 输入时自动保存的交互修复

后台草稿保存与业务提交使用独立状态。自动保存不再禁用输入框或显示“正在处理”；保存期间新增的输入继续保留，并使用返回的新修订号安排后续保存。广播仅在没有本地待保存编辑且修订号更新时应用，避免旧快照回写。

真实 Electron 回归增加字段 disabled 属性观察及焦点断言，验证自动保存不会打断正在填写的字段。
