# MCP Apps 适配与任务内 UI

实现基线：2026-10-01；MCP Apps 协议版本 `2026-01-26`。这是现有 Extension 的附加展示能力，不是第二套插件或权限体系。

参考：[OpenAI — Add UI to your MCP server](https://developers.openai.com/plugins/build/chatgpt-ui)、[MCP Apps 规范](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx)。采用标准 `_meta.ui.resourceUri` 和 JSON-RPC/postMessage；不把 ChatGPT 专有 `window.openai` 视为标准能力。

## 与声明式表单的边界

宿主解析 YAML 并使用 shadcn/ui 渲染的标准表单，是另一种展示适配，见 [声明式表单与多步骤设计](./declarative-forms-design.md)。它不属于 MCP Apps 标准，也尚未实现。iframe 内部组件库仍由扩展选择；宿主渲染的外壳、状态、确认及未来表单统一遵循宿主设计规范。两种路径共享 Operation 与授权，不共享任意脚本执行权限。

## 接入模型

1. `extension.json` 的 `contributes.mcpApps` 声明随包发布的 HTML 资源。
2. Operation 使用 `_meta.ui.resourceUri` 关联一个资源。URI 必须属于 `ui://<publisher>.<name>/…` 命名空间。
3. Agent 可以通过既有 `extension_invoke_operation` 调用，或调用 MCP tools/list 中直接暴露的 UI Operation。
4. OperationRouter 完成原有输入验证、资源授权、项目限制、条件表达式、写确认、执行及输出验证。
5. 成功结果由宿主追加到本轮任务记录。UI 只保存引用和输入/输出快照，不保存 HTML、不重新执行生成操作。
6. 用户打开任务内卡片，宿主重新检查扩展、包摘要、任务身份、项目和权限，然后创建隔离 iframe。
7. iframe 的 `tools/call` 映射到相同 Extension 的 OperationRouter，caller 固定为 page。UI 不能自报 Agent 身份、更换项目或调用其他扩展。

UI 并非业务数据源。业务工具应当在无 UI 时仍能返回有用结果。需要实时业务状态的页面应通过操作重新读取，历史快照不代表服务端最新状态。

## 声明示例

```json
{
  "contributes": {
    "mcpApps": [{
      "uri": "ui://example.task-form/travel",
      "title": "差旅记录",
      "entry": "form.html",
      "mimeType": "text/html;profile=mcp-app"
    }]
  }
}
```

在对应 Operation 中添加：

```json
{"_meta":{"ui":{"resourceUri":"ui://example.task-form/travel"}}}
```

这是片段，仍须提供完整 Extension 和 Operation 必填字段。title 支持既有 `%key%` 多语言机制。调用条件继续使用 Operation 的 enablement；不新增另一套条件表达式。`exposeTo: ["agent"]` 对应 model 可见，`["page"]` 对应 app 可调用。MCP descriptor 的 visibility 由宿主生成，扩展不能用它扩大 exposeTo。

HTML 必须为不超过 1 MiB 的独立文件，JS/CSS 内联，图片/字体可使用 data URI。相对脚本、外部资源、连接域、iframe、设备权限尚未开放；构建工具应输出单文件。包路径校验与包摘要校验复用现有实现。一个扩展最多 20 个 UI 资源。

## 首版协议范围

| 方法 | 行为 |
| --- | --- |
| ui/initialize | 协议版本、应用信息与能力协商；返回 inline、语言、主题和高度上限 |
| ui/notifications/initialized | 握手完成后发送本次操作输入及结果 |
| ui/notifications/tool-input | `{arguments}`，宿主到页面 |
| ui/notifications/tool-result | MCP CallToolResult：content、structuredContent；宿主到页面 |
| tools/call | 同扩展、page 可见的 Operation；名称为完整 operationId |
| notifications/cancelled | 取消本页面仍在等待的指定请求 |
| ping | 活跃会话检查 |
| ui/notifications/host-context-changed | 主题或语言变更通知 |
| ui/notifications/size-changed | 调整任务卡片高度，限制 160–640 px |
| ui/resource-teardown | 关闭时尽力通知页面，宿主不等待其响应 |

仅声明已经实现的 serverTools 与 sandbox 能力。不支持的方法返回 -32601；初始化未完成的操作被拒绝。首版不支持 ui/message、ui/update-model-context、fullscreen/pip、页面 resources/read、OpenAI 专有接口、文件上传和持久 widgetState。

Agent MCP 端点支持 UI Operation 的 tools/list、tools/call、已授权资源的 resources/read。适配器将普通 Operation 对象结果变为 structuredContent，并保留文本降级结果。Agent 调用的整个 Operation 结果对模型可见，尚无 UI 专用私密结果通道，不得把普通对象中的 `_meta` 字段误认为会对模型隐藏。**这不是任意远程 MCP Server 的导入器**；远程服务仍由 Extension 后台连接并经 Operation 暴露。未来远程 MCP 接入必须明确连接归属、工具映射、认证、风险和资源授权，不能把任意 tools/call 直接转发绕过路由。

## 权限、隔离与生命周期

- iframe 使用 `sandbox="allow-scripts allow-forms"`（保留表单的 submit 事件），CSP `form-action none` 禁止表单直提交；不允许 same-origin、弹窗、下载、摄像头或麦克风。
- HTML 从宿主 `amble-app` 协议提供；响应头强制 CSP，无外部网络、嵌套 frame 或 base URL 权限。页面没有 desktop/preload API。
- renderer 只接收对应 iframe WindowProxy、opaque origin 的协议消息。IPC 再校验宿主窗口，sessionId 绑定 owner，不信任页面提供的任务、扩展或项目标识。
- 会话绑定 conversationId、runId、cardId、源 operationId、项目、包摘要和授权 generation。每次调用重新验证。任务删除/归档/移项、扩展更新/停用/撤权使旧会话无法执行。
- 停用、更新、撤权主动关闭已打开的卡片。切换任务、收起卡片、窗口关闭/重载会释放会话并中止等待中的调用。
- 确认窗仍由既有 Interactions 控制，普通 DOM iframe 会被宿主模态遮罩覆盖。授权给项目不等于免除写操作确认；已有用户显式记忆规则仍适用。
- sessionId 不代表业务权限。每窗口最多 12 个会话，每会话最多 8 个等待请求、2048 个请求 ID，消息大小上限 256 KiB。重复 ID 不执行第二次。
- 页面初始化 15 秒超时会关闭，可重新打开；外部导航被拦截，错误文档会销毁会话。重新打开创建新会话，不重试上次写操作。
- 未知写入结果不自动重试，页面需提示用户核实；业务服务仍应实现自己的幂等键和结果查询。

## 持久化与展示

run_items 新增 taskApps collection（现有通用表，无独立迁移）。记录本轮 turnKey、稳定 conversationId、来源包版本、输入/输出快照。按轮分页；侧栏任务摘要不携带 UI 载荷。重启后重新打开同一版本的资源，校验当前授权，不重放生成操作。

卡片显示扩展名称和标题，默认收起；用户点开后加载。归档任务只有说明，不开放交互。错误用普通语言解释，技术字段不暴露给最终用户。该实现与扩展首页的 WebContentsView 独立，因此不会互相抢占单一首页槽位。

## 示例与验证

完整示例：[examples/extensions/task-form](../../examples/extensions/task-form/README.md)。SDK/CLI 对齐要求见 tooling-report/requirement/v0.2.0。

- `node --test tests/mcp-apps.test.cjs`：声明、快照、重复请求、权限、项目/窗口隔离、撤权、归档和历史分页。
- `npm run test:extensions:apps`：真实 Electron、隔离 HTML、标准握手、真实 Extension 后台、Agent 工具路由、写确认与取消、重启和撤权。仅模型响应使用回环服务 fixture。
- `npm test` 与 `npm run build`：宿主回归与构建。

外部 @modelcontextprotocol/ext-apps SDK 集成、任意远程 MCP 服务、打包安装版和其他操作系统应分别验证，不从本机协议 fixture 推断全面兼容。
