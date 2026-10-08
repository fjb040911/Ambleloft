# SDK/CLI 增量对接需求 v0.3.0：声明式业务表单

日期：2026-10-04（Asia/Shanghai）。状态：供 SDK/CLI Agent 实施和宿主联调。

继承 [v0.1.0](../v0.1.0/README.md) 与 [v0.2.0](../v0.2.0/README.md)，本版新增声明式表单对接，不替代 MCP Apps。v0.3.0 是交流需求版本，不是 npm 包版本、宿主最低版本或新的协议版本。

## 交付物

1. [SDK/CLI 增量契约与施工要求](sdk-cli-increment.md)：类型、Schema、校验、打包、兼容性与职责边界。
2. [完整业务扩展 Demo 与验收](demo-acceptance.md)：可安装扩展、独立模拟服务、多步骤和故障恢复验证。
3. 实施方产出能力对照表、可本地安装的 npm tarball、扩展包、机器测试结果和真实桌面证据。

正式场景是“扩展自带 Skill 和 YAML → Agent 选择模板 → 宿主渲染 → 用户提交 → 扩展 Operation → 业务服务”。个人 Skill 的 chat 示例只验证信息收集，不能替代业务扩展验收。

## 实施顺序

1. 核对当前宿主源码和契约指纹，输出需求 ID、宿主入口、SDK/CLI 状态、测试和缺口的对照表。
2. 完成 SDK 类型、Schema 出包与兼容说明；补齐 CLI 语法、语义和包内容校验。
3. 生成完整业务扩展及持久化模拟服务，先完成离线校验和服务幂等测试。
4. 用实际打出的 SDK tarball 构建 Demo，安装到隔离的桌面配置，完成默认权限下的端到端验收。
5. 写入新一轮 `tooling-report/YYYY-MM-DD_HH-mm-ss/`，更新总索引；保留旧证据。

报告状态：PASS / FAIL / BLOCKED-HOST / NOT-RUN。发现宿主问题时保留最小复现和原始结果，不在 SDK 内模拟成功、绕过宿主或删除测试。宿主修复后重新验证。

本轮不自动发布 npm，不要求修改相邻项目之外的宿主代码，也不自动提交、推送或合并。

## 事实来源及基线

以下路径以 agent 仓库为根，实施前重新读取；工作区包含未提交实现，不能只依赖 HEAD。

| 来源 | 用途 |
| --- | --- |
| [sdk.d.ts](../../../specs/extensions/contracts/sdk.d.ts) | 当前公开 InvocationContext 等契约 |
| [form.schema.json](../../../specs/extensions/contracts/form.schema.json) | 当前 DSL 结构 |
| [template.cjs](../../../core/forms/template.cjs) | YAML、Markdown AST、语义与字段校验 |
| [service.cjs](../../../core/forms/service.cjs) | 模板发现、实例、映射、提交和恢复的真实行为 |
| [operations.cjs](../../../core/extensions/operations.cjs) | 授权、确认、Schema 校验和操作路由 |
| [bootstrap.cjs](../../../core/extensions/bootstrap.cjs) | Node 后端接收 InvocationContext.form |
| [设计目标](../../../specs/extensions/declarative-forms-design.md) | 完整设计意图，不等于当前全部已实现 |
| [实现记录](../../2026-10-01-declarative-forms/implementation.md) | 当前实现范围、限制及已有验证 |

采集时 HEAD：`ab4072f3c4e3f5a0f533fac55e81bf2209a09958`。

| 文件 | SHA-256 |
| --- | --- |
| specs/extensions/contracts/sdk.d.ts | `a6e81544e2235594265e776b5f47cbf90cbdd584a772ba6e869b5f55c28ac44e` |
| specs/extensions/contracts/form.schema.json | `b42ba8bcc4ab1ee1a793114cb78c076f2835bfd0c37d28616d2398c11515099c` |
| core/forms/template.cjs | `84b96119434248fe07ad47561a51e4f920793dd79da25b43b522161edf89a001` |
| core/forms/service.cjs | `a2cd7bb491c7e6819e62973d98722e172a2e96e5af6a7176f35f1b1e961a445a` |

文档核对不等于本轮重新执行测试；已有宿主测试仅作为基线，SDK/CLI 新版必须重新验收。
