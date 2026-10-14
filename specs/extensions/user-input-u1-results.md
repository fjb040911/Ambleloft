# U1 持久输入通道实现结果

日期：2026-10-14。U1 已完成宿主通道与内部 IPC；U2 界面及 U3–U8 请求服务/工具/Skill 尚未交付。本阶段没有新增动态模型工具或扩展 SDK 权限。

## 已实现

- 普通文字以 source=user 进入既有 ChatInputs outbox，复用运行中 guarded turn/steer、空闲同一聊天 turn/start，表单继续执行原来源验证。
- clientMutationId 在聊天内生成稳定投递 ID。同一 ID 重试返回已有记录，内容变化拒绝；模型接受后以 userInputId 记录用户来源，不伪造 formSubmissionId。
- Stop 即使遇到空闲任务，也持久写入 paused/generation；归档同样暂停，正常退出应用不冒充用户停止。数据库升级至版本 9，删除聊天同时清理投递策略。
- 停止与真正发送的临界区按聊天串行；锁不等待远端响应，避免停止被网络卡住。恢复使用 generation CAS 和明确 deliveryIds，仅选中 queued 放行，未选中项 held；unknown 不自动重发。
- 重启把 dispatching 隔离成 unknown，保留暂停；投递前再次验证聊天、来源和策略。准备阶段停止的用户消息占位在同一输入重试时去重。
- 普通文字 IPC 校验窗口/profile、聊天存在与归档、输入字段、20,000 字符/64 KiB 限制；每个聊天最多 32 条 queued/dispatching/unknown，旧 UI 表单同样受限，失败整笔回滚。
- preload 与 TypeScript 类型同步；input:event 只携带 runId。

接口细节见 [当前契约](contracts/user-input/README.md)。重复恢复的幂等回执保留最后一次成功恢复；更早请求被新策略版本替代后返回 CONFLICT，客户端须刷新策略。

## 验证

- 全量 `node --test tests/*.test.cjs`：290 项，289 通过、1 跳过、0 失败（允许本机临时端口的环境）。
- 全量之后补充空闲 Stop、表单配额原子回滚两项测试；`node --test tests/chat-inputs.test.cjs tests/declarative-ui.test.cjs`：26 项全部通过。
- `npx tsc --noEmit` 通过。
- 覆盖重复与跨聊天输入身份、停止与派发竞态、停止不等待远端、重建队列保留暂停、选择性恢复、陈旧 CAS、配额、归档、普通输入来源和旧表单兼容。
- 本阶段是数据库/运行时/IPC 实现验证，未新增正式页面端到端验收；固定引擎协议探针证据沿用 [U0](user-input-u0-results.md)，不将模拟运行时测试描述为真实引擎测试。

## 下一阶段 U2

Conversation/ChatComposer 接入运行中补充、独立停止按钮及明确继续选择；只在持久接受后清理本次文本快照，保留失败输入与发送期间新输入。展示排队、已送达、暂停及待核实状态。继续操作必须明确选择旧积压，不能因用户启动新轮次而自动放行全部输入。

当前普通补充仅提供内部 API，正式聊天框尚未接入。旧表单在停止后可以保存到队列，但恢复选择入口依赖 U2；这不是完整补充表单功能的发行验收。
