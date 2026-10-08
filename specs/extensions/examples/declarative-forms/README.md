# 声明式表单设计示例

状态：DSL v1 基础能力已接入宿主和 Skill 加载器，SDK/CLI 以本地开发者预览包对接。使用方式见[表单开发指南](../../declarative-forms-guide.md)。正式说明见 [声明式表单设计](../../declarative-forms-design.md)。这些文件不是可安装扩展包。

| 文件 | 场景 |
| --- | --- |
| [single-step.yaml](single-step.yaml) | 地区、金额、日期和备注；用户确认后发送到绑定聊天 |
| [travel-flow.yaml](travel-flow.yaml) | 三步差旅流程；中间保存服务端草稿、返回修改、最终提交和状态核实 |

简单本地向导：多步骤示例去掉第一步 next，将 submit 改为单步示例的 kind: chat。每个“下一步”仅做本地保存和校验，不调用业务接口。最终宿主生成所有步骤的发送预览。

多步骤示例要求另外实现和声明这些 Operation；仅有 YAML 不会自动生成后台：

| Operation | effect / exposeTo | 输入与输出约束 |
| --- | --- | --- |
| example.expense.saveDraft | write / page | projectScoped；输入 projectId、region、date；输出至少含 string draftId |
| example.expense.submit | write / page | projectScoped；输入 projectId、draftId、string amount、currency、可选 remark、checked；输出业务回执 |
| example.expense.lookupDraftSubmission | read / page | 输入 submissionId 和宿主绑定的 projectId；返回状态及成功时的原 saveDraft 输出 |
| example.expense.lookupFinalSubmission | read / page | 输入 submissionId 和宿主绑定的 projectId；返回状态及成功时的原 submit 输出 |

稳定提交身份来自 InvocationContext.form，由宿主注入，当前 SDK 类型契约已包含此字段。恢复查询通过 input.submissionId 接收提交标识，不依赖 context.form。后台应按 submissionId 去重，按 flowInstanceId 关联业务草稿，不能每次点击下一步就无条件产生新单据。回退修改已保存的行程后，再执行 saveDraft 是否更新已有草稿由业务契约确定；宿主不会自动撤销旧草稿。

chat 提交预览由宿主生成；业务 Operation 使用现有宿主确认流程。confirmation 步骤的 checkbox 只是一个必勾选字段，不替代实际 Operation 写入确认。所有操作仍须通过当前权限、项目、版本和输入输出校验。

结构约束见[表单 Schema](../../contracts/form.schema.json)，语义约束由宿主解析器补充校验。可直接导入的 chat 示例见[差旅 Skill](../../../../examples/skills/travel-expense/SKILL.md)；本目录多步骤 YAML 仍需配套业务后端，不能直接作为完整扩展安装。
