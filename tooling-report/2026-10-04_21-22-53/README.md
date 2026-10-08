# 综合 Demo：扩展能力体验馆

Demo 0.3.0；SDK/core/CLI 0.1.0-alpha.5，未发布、未提交、未推送。

## 直接体验

- [可安装扩展](../../../extension-tooling/dist/npm/extension-lab-clean-install.amble-extension)
- [完整体验包：源码、两个本机服务、SDK tarball 和安装包](../../../extension-tooling/dist/extension-lab-demo.zip)
- [插件介绍](../../../extension-tooling/examples/extension-lab/README.md)

在宿主设置中安装并信任扩展后，进入 **扩展 → 扩展能力体验馆 → 详情**，即显示包根 README.md；不需要启动服务或执行扩展操作才能阅读介绍。新建模板命令：`amble-extension init my-lab --template extension-lab`。

实际桌面安装的身份是 acme.extension-lab，归档由 alpha.5 SDK/core/CLI 真实 tarball 在仓库外干净离线安装构建，完整体验包中的源码身份与之相同。仓库 examples/extension-lab 的默认身份为 example.extension-lab，可自行修改 publisher。不要把两个身份作为同一安装项。

## 改动

综合模板复用并整合现有项目/聊天、消息、配置、KV、安全输入、SSE、声明式表单与 MCP Apps。新增首页体验指南和完整插件 README。添加无需业务服务的 team-intake 七字段表单，保留三步报销 travel 及持久化模拟服务。SSE serviceUrl 和 expenseServiceUrl 分离。MCP Apps 首次写入使用 null revision 创建记录，并经过宿主写确认。

移除综合模板对崩溃、RPC 洪泛和故障探针 Operation 的公开注册；专项验收夹具仍保留在原 Demo 中。SDK 不新增表单私有入口、认证流程或自动写重试。

所有六种模板构建现在都将 README.md 复制到安装归档根目录。此前文件只在开发源码目录，构建时遗漏，导致宿主详情没有可显示的介绍。无需修改宿主 README 渲染器。

## 本轮验证

- 工具库 npm test：65/65 PASS。
- 六模板真实 npm tarball：独立空缓存、离线安装、构建、validate、pack 通过。
- 综合 Demo 真实 Electron：8 组全部 PASS（下表）。
- 修复后的宿主完整报销桌面脚本重跑通过；T19 实际 FORBIDDEN，T21 实际 UNSUPPORTED，服务写计数不变。
- 宿主 npm run build 与 14 文件上游对照通过。宿主全量单测未在本轮重跑，不借用历史 202 项作为本轮结果。

|用例|实际验证|状态|
|---|---|---|
|README|真实详情 Markdown 展示；安装包根文件；2149 字符|PASS|
|项目聊天|真实项目选择授权、关联、创建并打开草稿、保存同一聊天 ID|PASS|
|通知|发布、查询、重复事件去重、更新、撤回|PASS|
|KV|实际存储空值、版本、冲突检查|PASS|
|声明式信息收集|默认权限真实 Agent 发现，七字段填写，宿主确认后同聊天提交|PASS|
|三步报销|真实 Node 后端、本机 SQLite 服务，草稿与正式报销各写一次|PASS|
|MCP Apps|默认权限真实 Agent 生成卡片，iframe 编辑，取消与确认保存|PASS|
|重启|README、聊天身份、表单结果保留，模型/业务无自动重放|PASS|

[能力对照](capability-matrix.md)、[综合桌面原始结果](evidence/showcase/report.json)、[宿主修复复验](evidence/expense/report.json)、[源码/包/运行环境指纹](evidence/fingerprints.json)。所有测试使用隔离临时配置，结束清理；未写入用户日常宿主配置。

模型侧使用本机 Responses fixture 驱动真正 Agent/MCP 流程，不代表远程模型自然语言质量测试。业务侧为本机模拟服务，无企业账号。本轮没有重新逐项验收 SSE、密钥安全输入、全部多语言切换和系统通知；相关入口保留并在 README 中提供步骤，不能把继承代码等同于本轮全量验收。

认证登录、非空通知 actions、系统级提醒实际投递继续不宣称可用；动态表单选项、附件、迁移和第三方 MCP Apps 客户端 SDK 不在已验收范围。

## 桌面截图

- [安装后的插件介绍](evidence/showcase/01-installed-readme.png)
- [体验馆首页](evidence/showcase/02-home.png)
- [七字段表单](evidence/showcase/03-intake.png)
- [报销完成](evidence/showcase/04-business.png)
- [任务卡片](evidence/showcase/05-mcp-card.png)

## 复现命令

在 extension-tooling 执行 npm test、npm run check:upstream、npm run test:packages、npm run showcase:build、npm run test:showcase:desktop、npm run test:expense:desktop。在 agent 执行 npm run build。Electron/回环网络需允许本机进程和端口。日志和执行脚本保存在 evidence。
