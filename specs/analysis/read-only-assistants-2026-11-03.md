# Codex 原生子代理接入（2026-11-03）

本文件取代本轮早先的宿主只读分析助手方案。用户最新指示：先验证接入 Codex 原生子代理，权限按照官方机制，不另设子代理只读权限层。

## 官方机制与版本证据

官方说明：https://learn.chatgpt.com/docs/agent-configuration/subagents

子代理继承父会话的沙箱、审批、模型服务和 MCP 工具。角色提示词不构成独立的只读沙箱。当前应用内置版本为 0.153.4，通过真实引擎导出的 app-server TypeScript 协议及隔离运行验证，不将最新文档中的配置名直接套用到旧版本。

本版本开启 features.multi_agent 后提供 multi_agent_v1 命名空间的 spawn_agent、wait_agent、send_input、close_agent、resume_agent。原生 app-server 发出 collabAgentToolCall、子线程消息与 turn 生命周期事件。thread/read 提供真实 agentNickname、parentThreadId 与 source。

## 应用接入

- electron/codex-rpc.cjs 开启 features.multi_agent；不覆盖引擎的子线程并发默认值。
- 移除分析助手执行池及其 analysis_start/wait/stop 工具。原先每个任务 2 个助手、池 4 个、每轮 6 个的限制不再应用。原有主任务 maxConcurrent=2 保留，它与原生子线程并发不同。
- electron/native-subagents.cjs 将原生子线程映射为父任务下的持久化活动记录，显示引擎真实名字、固定头像、委派内容、工具记录与结果。
- 子线程的审批与补充问题通过父任务界面显示，并标明子代理身份。未知线程及旧 turn 请求继续拒绝。
- 单独停止调用 thread/archive，真实引擎会卸载子线程并通知父线程等待者。父任务结束关闭其 RPC/模型桥，未完成的子代理标记中断；重启不自动重放。
- 普通聊天与专家任务共享上述运行时和界面。父会话默认权限继续是 read-only + on-request；完全访问继续是 danger-full-access + never（远端沿用原有模式）。没有新增、降低或提升用户选择的父任务权限。
- 引导模型在用户要求委派/并行代理工作时使用原生工具，收集真实结果并关闭不再使用的子代理；多个写任务应明确文件分工。

## 验证

真实二进制 + 隔离临时目录 + 本地确定性模型响应的探针：

    node scripts/probes/native-subagents-engine.cjs

六种模式通过：Responses、Chat 适配、三个原生子线程、继承完全访问并真实写入临时文件、子线程审批归属与拒绝、单独停止。真实引擎返回的名字包括 Kepler、Sagan 等，非前端伪造。模型响应由本地服务控制，验证的是协议和执行机制，不代表真实模型的任务拆解质量。

回归覆盖 native-subagents、runtime、extension-agent-channel、workforce-runtime、chat-bridge 共 41 项。Playwright 两个用例覆盖聊天和专家身份的共享任务视图、继承权限说明、头像名字、停止及完成后的可见摘要。TypeScript 和 Vite 构建检查。未验证真实远端 SSH/Docker、Windows 或打包安装版。

## 试用

重启源码应用的 Electron 主进程。提示示例：请使用 Codex 原生子代理并行检查交互逻辑和数据一致性，等待两个子代理返回结果后汇总。

只有引擎实际启动子线程才显示子代理身份；普通工具调用不会伪装成子代理。若只安装了旧发行版，需要构建并安装新版本，源码变更不会自动更新旧安装包。
