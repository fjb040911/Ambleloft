# 当前扩展能力与契约来源

核对日期：2026-10-10。下列“预览”表示当前源码存在公开扩展入口，不表示稳定 API、npm 已发布或任意安装包均支持。历史设计中的目标不能覆盖本表的实现边界。

机器清单：[host-capabilities.json](contracts/host-capabilities.json)。这是源码能力清单，不是运行时协商接口，不授予任何权限。

| 能力 ID | 状态与入口 | 契约及验证入口 |
| --- | --- | --- |
| operations | 预览；manifest.operations → context.operations.register；页面 invoke / Agent 统一路由 | sdk.d.ts；extension-hosts、extension-operations 测试 |
| configuration | 预览；manifest.configuration + configuration/self；context.configuration | sdk.d.ts；extension-configuration、grant-selection 测试 |
| localMessages | 预览；context.messages 七个方法，SDK messages-preview 适配 | messages-preview.d.ts；message-service、message-store、extension-hosts 测试 |
| declarativeForms | 预览；manifest.skills → 根级 YAML；宿主 Agent 工具展示、用户提交 Operation | form.schema.json、sdk.d.ts；forms 测试及 test:forms |
| mcpApps | 有限预览；contributes.mcpApps + Operation UI 元数据，包内任务 UI | extension.schema.json；mcp-apps 测试及 test:extensions:apps |
| extensionAuthentication | 预览；资源声明、交互式 OIDC 连接、静默会话查询、宿主 HTTPS 代理 | sdk.d.ts；extension-auth、oidc、extension-hosts 测试 |
| messageActions | 预览；Operation 按钮、持久执行状态、幂等结果回报与重启恢复 | messages-preview.d.ts；action-journal、message-service、extension-hosts 测试 |
| agentHooks | 预览；manifest.hooks → context.hooks.register，项目授权、持久投递与死信 | [M2 接入指南](background-automation-guide.md)；automation 测试 |
| conversationTurns | 预览；context.conversations.getTurn，冻结版本文本 | sdk.d.ts；automation 测试 |
| backgroundJobs | 预览；context.jobs.submit/get，无工具摘要、模型与额度授权、未知结果不自动重试 | [M2 接入指南](background-automation-guide.md)；automation 测试 |
| formResumeApi | 未开放 forms_resume / SDK 直接展示或迁移 API | 已有实例保存与显示不等于新增公开 API |

本地消息提供 Operation actions，但尚不提供账号作用域投递或系统通知实际送达保证。认证首版不提供 refresh token、全局账号选择器和 WebSocket 凭据，详见 [接入规范](message-actions-auth-guide.md)。表单限静态字段与线性步骤；MCP Apps 不等于任意远程 MCP 或完整 ChatGPT Apps 兼容。宿主内部模块的存在不是能力开放证据。

## 契约和包的关系

- sdk.d.ts：包含宿主公开错误码（含 QUOTA_EXCEEDED）的基础操作、资源、配置、表单上下文与恢复类型的单一来源。
- messages-preview.d.ts：独立消息预览契约；通过 getMessages 检查运行时方法，不把主 ExtensionContext 扩大成所有宿主都支持消息。
- extension.schema.json / form.schema.json：结构契约；CLI 和宿主还须做语义校验。
- 本仓库 packages/extension-sdk 为 alpha.1 参考包；独立 extension-tooling 当前为 alpha.6 工作区。版本、发布状态和验收分别记录，不将二者混称“最新版 SDK”。

## 兼容性检查

独立工具库支持：

```sh
npm run check:upstream
node packages/cli/bin/amble-extension.cjs doctor --host ../agent --require operations,declarativeForms --json
```

doctor 只读源码，不加载扩展代码、不连接业务服务。matched 表示与记录基线匹配，runtimeStatus 始终为 not-tested；它不能诊断某个已安装应用的进程、权限或账号状态。

漂移返回 HOST_SOURCE_DRIFT，文件缺失返回 HOST_SOURCE_UNREADABLE，未开放能力返回 UNSUPPORTED_CAPABILITY，未知 ID 返回 UNKNOWN_CAPABILITY。失败退出 1，参数错误退出 2。差异可能只是注释，也可能是行为变化，因此报告“未验证”，不推断必然不兼容。基线更新须经过差异审查和相应联调，不随普通构建自动接受宿主变化。

check:upstream 对照同步契约和验证器；doctor 对照已记录的宿主实现指纹。两项均不能替代 tarball 干净安装或真实桌面测试。

## 下一轮 SDK/CLI 迭代入口

- [图标规范](icons.md)
- [消息操作与认证接入规范](message-actions-auth-guide.md)
- [v0.5.0 增量交接与验收清单](../../tooling-report/requirement/v0.5.0/README.md)

## 异步宿主表单（源码预览）

声明式 `submit.kind: chat` 已接入持久投递：展示立即返回，运行中 steer、空闲 start，结果未知仅核实不重发；运行中答案归入原轮次。macOS 原生集成已验证，Windows/Linux 后续验证。详见 [异步宿主表单](./async-host-forms.md)。

## 声明式任务 UI 源码预览（2026-10-10）

新增独立 `amble-ui` / `amble-ui-ref` v1，支持规则编辑器、结果集合、用户单击 chat 动作、SQLite 提交与队列原子持久化。普通 skill 与扩展内 skill 共用；旧表单 v1 保持兼容。运行时以 `ui_capabilities` 为准。`skills_install` 支持 GitHub 子目录完整技能安装及不可变 commit 来源记录。详见 [契约与边界](declarative-ui-guide.md)。逐行业务回写、项目修复互斥队列与跨平台发行验收未交付；SDK/CLI 由独立项目按 tooling-report/requirement/v0.6.0 对接。

2026-10-10 UI 展示增量：集合列/详情/筛选支持 `rows.valueLabels`，select 字段复用 options 标签；运行时需 `collectionValueLabels=1`。已优化长路径、固定操作列、自适应筛选与空状态。原始数据和投递状态语义保持不变；详见 tooling-report/requirement/v0.6.1。

文件引用展示后续方案见 [长路径设计](file-reference-design.md)：沿用 `rows.location.pathField`，由宿主内部组件统一渲染，skill 无需导入组件。H09a 的缩略、完整路径浮层、复制和绑定定位已接入正式 TaskUi 路径列及路径详情字段，同名消歧按全实例计算；当前 capability 清单不因此增加新能力。

2026-10-10 三步表单增量：`forms_capabilities`、最终 chat 单击提交 opt-in、之前字段依赖/条件展示、混合组开关、紧凑 Switch 和 `forms_read_submission` 已接入源码预览。依赖变化保留旧值并要求确认，不自动重算推荐。详见 [表单指南](declarative-forms-guide.md) 与 tooling-report/requirement/v0.6.3；独立 SDK/CLI 尚需同步实现。

- 集合双布局：运行时 `ui_capabilities.collectionLayouts: 1`，collection 可用 `rows.layout` 与 `rows.card` 显式映射，在正式任务中切换 table/cards，共享筛选、分页、选择和操作权限。详见 [声明式 UI 指南](declarative-ui-guide.md#集合双布局2026-10-12)。

- 自动交付文件卡片仅根据当前轮次 added/modified 文件快照或已完成文件写入工具收集；最终答复中的普通路径/链接不再作为产物证据。shell 输出通过轮次快照识别，基准不足时不猜测。历史卡片不自动迁移，显式交付已有文件协议仍待定义。

## 多语言目标与当前边界

宿主已实现 [统一多语言设计](localization-design.md)：Skill 根目录词典、显示元信息、表单/集合显示白名单投影、通知 LocalizedText、后台 locale 热切换及持久翻译快照。运行时探测 skillLocalization/templateLocalization/liveLocalization/notificationLocalization，具体入口与限制见设计文档和机器能力清单。独立 SDK/CLI 按 v0.6.7 要求对接，不代表其 npm 包已经发布。
