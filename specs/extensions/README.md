# Extension 平台公开规范

本目录存放可公开、纳入 Git 版本管理的设计与开发交付材料。范围已确认，A1–A7 已逐阶段实现，SDK 以本地开发者预览包交付；公开 API 尚未冻结为稳定 1.0，完整发行验收仍待 A8。

Windows、macOS、Linux 均为正式发行目标；通用核心与平台适配边界、当前缺口和验收矩阵见 [跨平台架构与发行要求](./platform-support.md)。

优先阅读[当前可用能力与契约来源](current-capabilities.md)，再查设计目标；未开放能力不能仅凭设计稿生成 SDK。

## 阅读顺序

1. [首版范围与已确认决策](./scope.md)：M1/M2 的产品边界。
2. [代码审查与迁移映射](./code-audit.md)：当前实现事实、可复用部分与缺口。
3. [M1 实现设计](./m1-design.md)：模块、运行时、页面、授权、安装及 Agent 接入。
4. [契约说明](./contracts/README.md)、[清单 Schema](./contracts/extension.schema.json)、[SDK 类型](./contracts/sdk.d.ts)：接口评审材料。
5. [开发入门](./developer-guide.md) 与 [示例](./examples/README.md)：SDK、本地安装包和页面/Agent 操作闭环。
6. [消息中心设计](./message-center-design.md)：M2 已确认的数据与交互规则、动作状态机、31 项验收标准，以及尚待评审的 SDK 草案。
7. [声明式表单与多步骤流程](./declarative-forms-design.md)：YAML 定义、shadcn/ui 渲染、实例、提交与恢复；基础能力已实现，完整目标和当前边界分别标注；使用方式见[表单开发指南](./declarative-forms-guide.md)。
8. [开发任务与验收](./implementation-plan.md)：依赖、探针、验收及进入开发条件。

消息宿主实现进展见 [开发记录](./message-center-progress.md)；企业身份接入方向与待评审协议见 [认证设计草案](./authentication-design.md)。

扩展作者、业务服务开发者和企业管理员可阅读 [认证接入指南（预备稿）](./authentication-integration-guide.md)，了解职责边界与未来接入所需材料；认证 SDK 尚未发布。

## 状态与优先级

消息模块的后续施工见 [开发推进计划](./message-center-implementation-plan.md)；[声明式表单与多步骤流程](./declarative-forms-design.md) 已实现严格 YAML 加载、任务内渲染、多步骤草稿、Operation 提交和结果核实；2026-10-01 已增加 [MCP Apps 任务内 UI](./mcp-apps-design.md) 的有限首版实现。

scope 的已确认产品边界优先。设计与契约相互约束，冲突必须修订，不允许实现者自行择一。任务清单不扩大产品范围。操作确认策略已确定为风险分层与宿主提交组件；稳定 conversationId 方案也已确认；A0–A6 的实现与证据见下方记录，下一步为 A8 集成与发行验收；M2 的接口和存储细节尚未冻结。

## 维护规则

- 文档自包含，不以内部讨论稿作为开发前提，不包含本机路径、账号、凭据或未整理内部记录。
- 分开标注已确认范围、接口提案、未决事项、已执行验证和实际实现状态。
- 契约冻结后才能按相应任务进入功能实现；技术验证失败先更新设计。
- 范围变更同步本目录，内部讨论资料不作为第二份公开规范。

## A0 / A1 开发记录

见 [技术探针、契约校验及剩余门槛](./a0-a1-results.md)。旧线程 dynamicTools 注入不可用，后续 A6 已验证统一内部 MCP 路线；独立 A1 校验器已实现，公开契约仍为草案。

## A2 开发记录

见 [资源写入、稳定聊天引用与验证边界](./a2-results.md)。资源级 mutation 和草稿到执行的稳定身份已接入桌面；A3 包管理与授权进展见下文。A0 未关闭项、A5 多窗口及跨平台验收仍保留。

## A3 开发记录

见 [扩展包、信任、授权与私有存储](./a3-results.md)。已接入安装/更新/回退及管理界面；Node 运行、页面和 Agent 调用分别由 A4–A6 继续实现。

## A4 开发记录

见 [独立 Node 宿主、生命周期与验证](./a4-results.md)。已接入 startup/按需后台及停用更新；页面和窗口体系见下文；Agent 路由仍受 A0/A6 门槛约束。

## A5 开发记录

见 [多窗口、隔离页面与交互授权](./a5-results.md)。已接入扩展首页、专用桥、宿主授权选择器与本地开发 origin；macOS 三窗口和实际屏幕合成层验证通过。A6 后续进展见下文。

## A6 开发记录

见 [统一操作、审批与 Agent 接入](./a6-results.md)。页面和模型已共用 OperationRouter；固定引擎双协议的新建、恢复及无工具旧聊天通过内部 MCP 验证。A7 SDK 与 Demo 进展见下文，A8 跨平台与发行验收仍保留。

## A7 开发记录

见 [SDK、可安装 Demo 与打包工具](./a7-results.md)。已交付开发者预览 SDK tarball、项目卡片 Demo、确定性打包工具及公开开发文档，离线安装与目录/安装包桌面闭环通过。

- [MCP Apps 适配与任务内 UI](mcp-apps-design.md)：现有 Operation 的标准协议适配、隔离任务卡片与首版能力边界。

## 下一轮 SDK/CLI 迭代入口

- [图标规范](icons.md)
- [消息操作与认证接入规范](message-actions-auth-guide.md)
- [v0.5.0 增量交接与验收清单](../../tooling-report/requirement/v0.5.0/README.md)
