# A6 统一操作、宿主审批与 Agent 接入

状态：已实现并在 macOS arm64、固定引擎 0.153.4 上验证。A7 SDK/Demo 与 A8 集成、发行验收未完成。本记录取代 A5 中 invoke 尚未开放的阶段性说明。

## 路由与资源

页面 invoke 与 Agent 的两项内部工具统一进入 `core/extensions/operations.cjs`。身份由页面宿主或执行上下文绑定，不采用模型输入中的 profile/window/run 身份。目录查询过滤 agent exposure、项目、声明权限和 enablement；invoke 再检查一次。page-only 操作不能被模型猜测调用。

输入先经包校验 worker 检查，再复制为本次调用的不可变快照。路由绑定安装 revision/generation、项目、来源、参数和取消信号；确认后、实际出队派发前、结果交付前重复检查。HostManager 继续承担并发、有限队列、超时与输出 Schema 检查。取消确认返回 notStarted；派发后取消、撤权、失联或输出无效返回 unknown，不自动重放。

InvocationContext.resources 已连接真实宿主资源：

- getProject 返回授权项目 DTO，不含目录；getProjectPath 另查路径权限。
- createConversation 需要 write 操作及声明、授予的 conversations.create 权限。资源级事务创建草稿，返回稳定 conversationId，不启动 Agent。写入与扩展更新/撤权串行。
- openConversation 按稳定 ID 定位并校验同项目，路由到发起页面所属窗口。Agent 调用返回 INTERACTION_REQUIRED，避免后台抢焦点。
- 后台资源请求必须绑定仍在执行的 invocationId；无调用、已取消、已返回结果或跨项目请求拒绝。未在该操作 requiredPermissions 中声明的资源 API 不可调用。

页面项目必须真实存在，且来自该页面的宿主选择或已有项目授权。Agent 项目由实际运行记录绑定。

## 确认策略

资源授权与操作确认分别执行。已授权 read 不再弹确认；write 默认显示宿主 Modal。扩展只能提交参数，不能颁发 approved 标记或可复用审批票据。弹层出现时隐藏扩展原生 view，确认控件属于宿主；来源窗口和随机交互 ID 均校验，重复回复不再派发。

确认页展示扩展、操作、项目名称、调用来源、风险影响和可展开的脱敏参数。敏感键按 token/password/secret/credential/authorization/api key 等规则隐藏；自由文本不能保证自动识别全部秘密。普通、可撤销、无重要影响的项目写操作可由用户选择记住确认；存在脱敏字段时不提供此选项。external/destructive/bulk/permissions 以及风险未声明的写操作逐次确认。

免确认绑定当前 profile 的数据库、扩展、operation 合同、代码 revision、generation、项目和调用来源。更新、撤权、停用重新启用后不沿用。设置中的“恢复操作确认”提升 generation 并停止旧后台、取消旧请求，保留已有资源授权；下次执行重新确认。它不会撤销已经产生的业务副作用。

页面 AbortSignal 留在主世界，通过随机取消键通知隔离 preload；不尝试把 EventTarget 原型跨 contextBridge 序列化。关闭页面同样取消在途调用。

## 引擎路线与凭证

A0 已证明旧线程无法追加 dynamicTools。A6 采用统一内部 MCP：每个实际执行单独创建 loopback HTTP endpoint 和随机短期凭证，固定暴露 extension_list_operations / extension_invoke_operation；新建、恢复和旧聊天走相同路由。没有开放扩展清单 MCP binding，也没有在模型 bridge 中添加私有工具执行循环。

仅对这两项宿主工具设置当前引擎进程的 `approval_mode=approve`，含义是将请求交给 OperationRouter；并非批准具体扩展操作。其他引擎工具策略不变，Agent full 模式仍受宿主写操作确认。实现参考官方 [MCP 配置类型](https://github.com/openai/codex/blob/main/codex-rs/config/src/types.rs)，实际行为以固定版本探针为准。

凭证通过临时进程环境变量及 env_http_headers 传入，不放在命令行或模型参数；shell 工具环境排除此变量。实测发现固定引擎的 shell 环境快照仍会保存该变量，所以在此执行路径关闭 shell_snapshot。六条引擎用例随后扫描临时目录，未发现凭证落盘。运行停止/结束/失败关闭 endpoint，取消在途请求并使旧凭证失效；不复用到下一执行。

HTTP 通道拒绝错误凭证、浏览器 Origin、错误路径/方法及超额并发，限制请求体。Node 扩展仍是用户信任后运行的本机代码，以上不构成恶意 Node 代码的系统级沙箱。

## 已执行验证

| 验证 | 命令 | 结果 |
| --- | --- | --- |
| 全量单元/数据库/契约回归 | `npm test` | 150 项通过 |
| 类型与生产前端构建 | `npm run build` | 通过，保留既有大 chunk 提示 |
| 固定引擎双协议 | `npm run test:extensions:mcp` | Responses / Chat Completions 各验证新建、恢复、无工具旧聊天，共 6 条路径；每条真实调用 2 个工具 |
| 真实 Electron 操作闭环 | `npm run test:extensions:operations` | 页面资源授权、Node 读取 DTO、写确认、取消无写入、AbortSignal、稳定草稿 ID 通过；真实 Agent full 模式仍需确认且成功调用 Node 写操作 |
| A5 回归 | `npm run test:extensions:pages` | 三窗口共享后台、隔离来源、设置遮挡及关闭清理通过 |

路由测试覆盖 exposure 绕过、跨项目/跨扩展、输入拒绝、确认取消、审批期间 generation 变化、免确认范围、重要风险逐次确认、结果交付时撤权。MCP 测试覆盖双项目凭证隔离、经真实路由取消写操作、执行关闭中断请求、不重放和命令行无凭证。

所有模型请求使用隔离临时目录和本地 fixture，不连接真实账号端点。桌面测试的安装原生对话框回答为模拟，操作确认使用实际宿主 React Modal。

## 剩余范围

- A7 发布 SDK、安装包示例和开发者材料；无自定义首页扩展当前只有操作元数据，未增加通用参数表单。
- A8 补齐正式发行产物、Windows/Linux、多屏 DPI、屏幕阅读器与长期运行验收；不能以 macOS 开发环境通过宣称三平台发行完成。
- 可靠 hook、摘要流水线、通知与后台连接仍属于 M2。
- 普通免确认设置按扩展整体恢复；细粒度逐操作管理 UI 可后续补齐。多个操作同时请求同一窗口交互时返回 BUSY，不覆盖已展示的确认。
