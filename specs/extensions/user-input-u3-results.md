# U3 持久补充请求与草稿服务

日期：2026-10-14。本阶段完成宿主服务与内部 IPC；没有新增模型工具或表单界面。U4 负责动态定义适配，U5 绑定模型工具，U6 接入统一待补充区。

## 实现

- 新增 `core/inputs/store.cjs`、`service.cjs`，SQLite 升至版本 10。请求与命令回执独立于轮次存储，正常结束、停止、进程重启不清空。
- 宿主内部 `create` 接收已解析、已绑定来源的单页 chat 模板。requestKey 按聊天及真实来源隔离；相同内容重试返回原回执，同键不同内容拒绝。这个入口不直接接受模型声明的身份，也未暴露给扩展页面或 SDK。
- `beginEdit` 持久标记已编辑；`saveDraft` 使用 revision CAS，允许未完成的金额等输入原样保存，但拒绝未知字段、危险键、非标量和超限内容。即使删空草稿，draftTouched 仍为 true。
- `submit` 复用现有字段验证；答案快照、唯一队列项、answered 状态和幂等回执在同一数据库事务内保存。并发或重复提交只产生一份答案。暂停、配额超限或版本冲突不会留下半份提交。
- 答案冻结 values/displayLabels/locale/来源/revision/时间。来源后续失效不改写答案，仅禁止再次派发。未知投递结果仍由既有 outbox 规则处理，不自动重发。
- 限额：每聊天 5 个 pending、100 个累计请求；12 字段、32 KiB 定义、64 KiB 草稿与答案输入、50 个选项；未完成投递共享 32 条配额。
- 归档保留可读记录，阻止修改；数据库事务也重新核对聊天存在、归档和项目绑定，防止运行时旧快照复活删除的聊天。删除聊天清理请求和 mutation 回执。
- 启动、读取和派发时校验来源；扩展停用/卸载/版本切换、Skill 更新/删除/替换会使原来源请求永久失效。重新启用不复活旧请求。

## 内部接口

沿用窗口/profile 授权和 `input:event {runId}`。正文不进入广播事件。

- `input:list {runId}` 增加 `requests`，保留 U1 的 policy/deliveries。
- `input:action` 增加 beginEdit/saveDraft/submit；均需 runId/requestId/expectedRevision/clientMutationId，后两项还需 values。
- submit 的字段错误通过 preload 保留 code/message/fields，供 U6 定位字段。
- 普通 resume 接口不变。请求暂停时 submit 返回 INTERACTION_REQUIRED；“提交并继续”的统一 UI 和组合操作后续接入，不隐式恢复聊天。

requests 是宿主 renderer 的完整记录，含未提交草稿。U5 的模型读取接口必须使用单独投影，不能直接转发 renderer 列表。取消、替换、文字关联和提案确认仍按后续阶段实施。

## 验证

- 全量 Node 回归：301 项，300 通过、1 跳过、0 失败。
- 随后新增版本 9 升级测试，补充请求专项共 10 项全部通过，实际关闭并重开数据库验证持久性。
- 覆盖幂等创建、多窗口 CAS、未完成草稿恢复、并发提交、暂停拒绝、配额事务回滚、跨聊天拒绝、来源失效、删除清理、总历史限额、旧队列升级兼容。
- TypeScript、主进程及新增模块语法检查通过；本阶段未声明完整模型/表单端到端验收完成。

下一阶段 U4：实现受限动态单页定义的工具输入校验与现有字段渲染适配，再在 U5/U6 接通模型调用和可交互表单。
