# 现有代码审查与迁移映射

日期：2026-09-28。审查基线：提交 `ab4072f` 与当时工作区。本文记录代码事实，不把目标设计当作实现状态。审查未读取用户数据；公开引用均为仓库相对路径。

## 1. 结论

当前是“声明式文本扩展＋单窗口工作台”，不能直接接入可执行插件。保留核心服务组装、数据库 worker、凭据加密和 Agent 执行循环；新增扩展运行时、窄资源 API、页面隔离和操作分发。优先修复资源写入与窗口路由边界，再实现业务 Demo。

| 位置 | 已有事实 | M1 处理 |
| --- | --- | --- |
| [registry.cjs](../../core/extensions/registry.cjs) | `apiVersion:1`、id/name、文本 views 和导航 commands；拒绝代码入口和未知字段 | 保留旧格式校验作导入适配，新格式独立 schema，统一内部记录，不发展两套生态 |
| [service.cjs](../../core/extensions/service.cjs) | `platform.extensions.v1` 保存全量清单与 enabled；变更串行，落盘后发布；安装立即 enabled | 迁移至安装记录与包版本；保留提交后可见原则，增加信任、授权和运行状态 |
| [services.cjs](../../core/services.cjs) | 主进程创建一套 workspace/provider/tasks/skills/files/extensions，依赖注入数据库与加密 | 作为应用级协调器组装点，扩展不得收到原服务或 DB 句柄 |
| [main.cjs](../../electron/main.cjs) | 单个 `window` 变量；IPC 只信任该窗口主 frame；已有单实例锁；运行事件只送该窗口 | WindowRegistry 保存宿主窗口身份与 profile；按来源窗口路由 UI 请求，按 profile 广播状态 |
| [preload.cjs](../../electron/preload.cjs) | 主 UI 拥有 workspace/save、provider、Agent 等宽接口 | 仅宿主 UI 使用；另建扩展页面 preload，绝不转发完整 desktop 对象 |
| [store.cjs](../../electron/store.cjs)、[database-worker.cjs](../../electron/database-worker.cjs) | workspace 全量保存；syncTable 删除不在传入列表中的记录；SQLite user_version=2，事务化 worker | 改为资源级事务命令＋revision 检查；只加调用锁不能修复旧快照覆盖问题 |
| [storage.ts](../../src/storage.ts)、[App.tsx](../../src/App.tsx) | Renderer 持有快照并传整份 workspace；草稿发送时创建新的 run | 宿主 UI 也迁移到增量命令，扩展草稿使用稳定 conversationId |
| [agent-runtime.cjs](../../electron/agent-runtime.cjs) | 应用级任务队列；run 内存状态、250ms 延迟保存；finish 最终 persist；不支持独立创建未执行聊天 | 增加稳定聊天入口及 Operation 适配；M2 需持久终态/outbox，不能直接订阅当前 UI publish |
| [codex-rpc.cjs](../../electron/codex-rpc.cjs) | 每次执行启动 app-server；配置固定内部 progress MCP；无扩展工具注册 | 新增运行上下文绑定的工具适配，不改写模型 HTTP 请求来注入工具 |
| [chat-bridge.cjs](../../electron/chat-bridge.cjs) | Responses/Chat Completions 协议转换，工具实际执行由 Codex 负责 | 保持职责，增加工具适配后的回归测试，不把它改成扩展执行器 |
| [skills.cjs](../../electron/skills.cjs) | 已有独立 Skill 导入、不可变版本、元数据目录与按需读取指导 | 扩展 Skills 增加 owner 和包 revision，禁用时退出目录；不复制另一套技能检索 |
| [secure-storage.cjs](../../electron/secure-storage.cjs) | safeStorage 封装，拒绝 mock 和 Linux 明文后端 | 复用加密能力，另建扩展命名空间，失败时禁止降级明文 |
| [ExtensionsPage.tsx](../../src/ExtensionsPage.tsx)、[extensions.ts](../../src/extensions.ts) | 操作与管理混合；刷新依赖同窗口 DOM 事件 | 分离操作列表与设置管理；改用有 revision 的宿主事件同步 |
| [build config](../../build/electron-builder.cjs) | 打包 core/electron；大部分 node_modules 被排除，额外资源包含内部 MCP | SDK/校验器必须显式 bundle；不能假定开发依赖存在于发布包 |

## 2. 身份与存储差异

现有 Project 已有稳定 id、name、description、path，可投影为最小 DTO，不能把 path 顺带泄露。没有可直接复用的多 profile 用户切换系统：M1 建议以现有 userData 根作为一个配置隔离域，持久化 default profile ID；不改现有 Atelier 路径，不额外实现账号系统。

现有草稿和 run 是两个集合。草稿状态没有 conversationId；用户复制草稿并发送将生成新 run ID。开发中必须维护新的稳定引用，而非宣称现有草稿 ID 已经是运行中的聊天 ID。具体迁移见 M1 设计。

现有 `saveRuns` 与 workspace 的全量写入是内部单所有者模型。新 API 不能绕过该所有者直接写入 runs，再被旧内存快照删除。聊天创建先作为 draft，由 AgentRuntime 在首次发送时原子转为 run。

## 3. 引擎协议证据与限制

本地 `engine.cjs` 固定 Codex 0.153.4，实际二进制报告同一版本。使用隔离临时引擎目录导出了本地 `app-server generate-json-schema --experimental`，发现：

- ThreadStartParams 有 `dynamicTools`，ThreadResumeParams 无对应字段。
- DynamicToolSpec 支持 function，必填 type/name/description/inputSchema。
- 服务端请求 `item/tool/call` 携带 threadId、turnId、callId、tool、arguments，namespace 可选。
- DynamicToolCallResponse 使用 contentItems 和 success。

这证明协议具有入口，不证明实验能力已经通过实际调用、恢复和提供方兼容测试。尤其不能给 thread/resume 填一个不存在的字段。设计推荐每个新引擎线程固定两个内部分发工具，业务目录在宿主查询；旧线程兼容需先验证。不能因工具恢复不兼容而静默丢弃历史或新建替代线程。

当前源码只显式接入内部进度 MCP，未发现通用外部 MCP 管理页面或 Extension→MCP 映射。范围中的“保留已有 MCP”在当前仓库至少指此内部机制，不应宣称已有完整第三方 MCP 平台。

## 4. 已执行验证

只运行相关基线测试：extensions、store、database、execution-policy、secure-storage，11 项全部通过。这些覆盖旧声明式扩展校验、保存失败、现有状态存储及执行权限传递，不证明新设计已实现。

未运行带真实模型调用的验证，未启动新扩展宿主，未验证新页面容器或跨平台发布包。工作区原有 ComposerControls 和 composer E2E 修改未改动。
