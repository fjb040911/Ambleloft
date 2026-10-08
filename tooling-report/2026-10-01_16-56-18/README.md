# MCP Apps 宿主首版验收

对应需求：v0.2.0。日期：2026-10-01，macOS 本地开发环境。

实现了包内 UI 声明、Operation/MCP 适配、任务内 iframe 卡片、稳定会话/轮次绑定、原有权限与写确认复用，以及按轮保存和恢复。协议范围与未实现项见 [正式设计](../../specs/extensions/mcp-apps-design.md)。

## 结果

- 全量单元测试 **197/197** 通过，含 8 个 MCP Apps 专项用例及 Agent MCP 发现/资源/结构化结果验证。
- TypeScript 检查和生产构建通过；构建仍有现有大 chunk 提示。
- 真实 Electron 验收通过。仅模型回答由本地 fixture 提供；扩展安装、Node 后台、IPC、OperationRouter、确认窗、HTML 沙箱和 SQLite 都走实际宿主。
- Demo 打包并回读校验通过，包内容摘要 `669de0b4a667a35c057370b46ce4e4a1ad65edbd9901417956eaa691e4405dce`。
- 已检查 [表单界面截图](task-form.png)，文字、输入框、按钮与任务容器正常。

原生验收覆盖生成卡片、预填、编辑、保存取消/确认、网络与导航拦截、跨窗口拒绝、撤权关闭、重启恢复不重放。日志中的 CSP 拒绝是隔离用例的预期结果，不是未处理故障。

原生测试发现并修复：外部导航被 CSP 拦截后需关闭错误 iframe 并提供重新打开；表单需保留 submit 事件（allow-forms），同时使用 form-action none 阻止原生外发。

## 边界

此版是包内 HTML 与标准 MCP Apps 协议子集。未验证外部 MCP Apps SDK、任意远程 MCP 服务、打包应用或 Windows/Linux；没有宣称这些通过。ui/message、模型上下文更新、fullscreen/pip、外部网络与 ChatGPT 专有接口未实现。

最终补充的省略 arguments 兼容性通过专项和全量单元测试；原生表单始终传递显式 arguments。SDK/CLI 独立项目未在本轮修改，已新增 [增量交付要求](../requirement/v0.2.0/README.md)。

## 证据

- [机器结果](results.json)
- [单元测试](unit-tests.log)
- [原生测试](native-test.log)
- [构建日志](build.log)
- [源码 SHA-256](source-sha256.json)

工作区包含此前尚未提交的改动，本轮没有创建提交、推送或发布。全工作区 diff-check 仍发现 tests/e2e/chat.spec.ts 中已有尾随空格；本轮涉及文件的 diff-check 通过。
