# SDK/CLI 增量需求 v0.2.0：MCP Apps

2026-10-01。继承 v0.1.0 的全部基线；本版本号是交流需求版本，不是 npm 版本。

宿主已增加 Extension Operation → MCP Apps → 任务内卡片通路。正式声明和支持边界：[MCP Apps 设计](../../../../specs/extensions/mcp-apps-design.md)。源码以该文件、contracts/extension.schema.json 和 core/extensions/mcp-apps.cjs 为准。

1. SDK/CLI manifest 校验与类型增加 contributes.mcpApps、Operation._meta.ui.resourceUri。资源 URI 强制 `ui://<extensionId>/…`，引用必须在同包声明；保持本地路径、多语言和 schema 严格校验。
2. CLI 增加可选的 task UI 模板，输出独立 HTML（JS/CSS 内联）。不得默认引入外部 CDN、网络白名单、window.openai 或原生 Node API。打包要包含 HTML，并检查 1 MiB 限制。
3. 页面优先复用标准 MCP Apps 客户端 SDK，或直接使用规范 JSON-RPC。初始化要支持宿主能力检测；未支持的 ui/message、模型上下文、display mode 等不得模拟成功。
4. 不新增第二个业务注册系统：页面 tools/call 的 name 是原 operationId；Agent/page 暴露、项目参数、schema、权限和写确认都沿用现有 Operation。后台 SDK 无需为显示 UI 新增特权 API。
5. 原 Extension 首页桥继续可用；MCP Apps iframe 不提供 ambleExtension/desktop。文档必须区分两种页面环境。
6. Demo 加入本轮卡片、表单编辑、只读查询、确认/取消、page-only 工具、跨项目拒绝、跨扩展拒绝、撤权关闭、切换任务、重启不重放、未知写入不重试等用例。
7. 外部 @modelcontextprotocol/ext-apps 客户端实际集成必须独立测试。宿主协议 fixture 成功不等于第三方 SDK 已通过。
8. 保持版本化报告流程。远程 MCP 导入、完整 ChatGPT Apps 兼容、外部 CSP 域和全屏模式标为未实现，不虚构对应 SDK 能力。

示例参考 `examples/extensions/task-form`；原生验证 `npm run test:extensions:apps`。
