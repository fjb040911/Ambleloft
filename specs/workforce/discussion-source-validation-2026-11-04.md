# 讨论方案来源校验修复

## 事故定位

只读检查本机记录 `248b49c3-b4da-4446-be66-27612b466df2`：用户在重新引导后说明多项目开发目标，主持人于 2026-11-04 08:38:40 UTC 开始响应，08:42:18 UTC 结束，报 `方案来源无效 / Invalid brief source`。主持人未保存新步骤，当前 brief 仍为空。新草稿的来源边界正确指向上一轮 restart-guide，不存在此次检查发现的边界丢失。

这不是 JSON 语法错误：该错误只能发生在 JSON 解析、基础 Schema 校验之后的 `checked`。旧校验将空白条目、空来源数组、来源 ID 不在当前 sources 中合并报同一错误。失败输出没有持久化，无法断言此次具体是哪一种。

根本缺口是引用约束只在推理结束后检查，而通用推理层的单次自动修复仅覆盖内容与 Schema 错误。因此合法 JSON 中的无效来源不会触发修复。

## 修复

- 每次推理生成当前来源约束：sourceIds 只能精确引用本次 sources 的 ID，数组至少一项；条目文字必须包含非空白字符。无来源时只允许空条目集合。
- 使用同一个通用推理层完成校验与单次修复；Chat、Responses、Schema、JSON 与纯提示模式都执行完整本地校验。协议/格式协商和修复仍共用最多四次请求预算。
- 不丢弃无效来源、不补造引用、不把专家建议改成用户决定。保留原有决策来源、专家授权、委派预算、执行前校验。
- 重新引导之后的旧来源不进入可用 ID 集合。空 brief 合法，不强制模型为早期澄清编造条目。
- 主持人规则 v7 明确项目 ID、草稿 ID、条目 ID、轮次和旧引导引用均不能当作来源 ID。
- 区分 JSON 解析失败、结构校验失败、来源校验失败的用户提示。失败诊断只保留 Schema 位置和关键字，不保存原始输出或生成的敏感内容。

修复只重做推理；校验通过前不应用方案，不派发任务。失败保留已提交回答和原有计划；取消时拒绝迟到输出。Schema 能验证引用是否存在，不能证明模型对来源含义的理解完全正确。

## 验证

- `node --test tests/workforce-discussion-host.test.cjs tests/structured-output-capabilities.test.cjs tests/provider-stream.test.cjs tests/workforce-task-guide.test.cjs`：124 项通过。
- 新覆盖：空/虚构来源、空白条目、Chat/Responses 修复、格式降级后的修复及四次共享预算、重新引导隔离、修复失败保存回答、取消后的迟到输出不能派发任务。原有专家授权和用户决策来源保护继续通过。
- `npx tsc --noEmit`、`git diff --check` 通过。
- `electron scripts/probes/discussion-source-validation-live.cjs`：用户配置的 DeepSeek / deepseek-flash，隔离数据库、虚构项目。模拟已重新引导状态后调用真实主持人，8.8 秒返回 ask、4 条有效来源条目和 1 个问题，执行次数为 0。此验证覆盖修复后的正常生成；故障注入与修复分支由自动化测试覆盖，并非恢复旧事故的原始输出。
- 实测摘要：`evidence/discussion-source-validation-2026-11-04.json`。

本次修改包含 Electron 主进程代码；运行中的旧进程需重新启动应用后生效。没有修改真实讨论记录，也没有替用户重发失败消息。
