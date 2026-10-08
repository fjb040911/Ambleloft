# 规范—宿主—SDK/CLI—Demo 能力对照

需求 v0.3.0；[实施前快照](capability-matrix-initial.md)。下列“支持”不代表稳定发布。

|需求|宿主真实入口|SDK/CLI 增量|Demo / 验证|状态|
|---|---|---|---|---|
|F01|skills + FormService → OperationRouter|无第二套注册体系、无 forms RPC|根级 Skill 引用 YAML；page-only 业务|PASS|
|F02|sdk.d.ts / bootstrap / hosts|可选 form，正常入口导出 FormInvocationContext|后端收到 flow/step/submission/digest/conversation/request/caller|部分 BLOCKED-HOST：异常码丢失|
|F03|service.action reconcile|FormRecoveryInput、FormRecoveryResult<T>|lookup 不依赖 form；坏结果拒绝|PASS|
|F04|宿主只转交业务提交|不重试写、不声称恰好一次|SQLite 事务、持久幂等和取消屏障|PASS|
|F05|form.schema.json|原样 Schema 子路径与 tarball|干净离线消费、CJS/ESM/TS|PASS|
|F06|template.discover/safeRead|原样 Markdown AST、严格 YAML、跨 Skill 唯一|inline/ref/嵌套/越界/符号链接测试|PASS|
|F07|template.normalize/validateValues|同源差异测试；限制不放宽|金额、日期、选项、确认等正反例|PASS|
|F08|service.catalog + OperationRouter|增强项目/映射/结果/恢复检查；范围等警告|项目绑定、无项目、资源拒绝、跨扩展|部分 BLOCKED-HOST：错误码为 INTERNAL|
|F09|安装包 Skill 发现|init --template expense / task-form；validate/pack|五模板从真实 tarball 干净构建|PASS|
|F10|现有契约|不编造 supportsForms/最低版本|边界文档与源码指纹|PASS|
|D01–03|真实 Electron + Node 扩展后端|alpha.4；财务报销助手 0.1.0|三步流程 + 独立 mock-service 0.1.0|PASS|
|D04–06|T01–22|机器与桌面结果分别记录|20 PASS / 2 BLOCKED-HOST|见逐项报告|

CLI 增强诊断不等于宿主执行同样的静态检查。Schema 原样出包，生成的 TS 只抽取宿主内联类型并添加恢复类型。MCP Apps 原生 JSON-RPC 模板可构建，不宣称第三方 ext-apps SDK 已验收。
