# 综合 Demo 能力对照

|宿主能力|实现来源|Demo 入口|
|---|---|---|
|安装后 README|extensions/details.cjs、ExtensionDetail|详情页，包根 README.md|
|项目/聊天/权限|OperationRouter.resources|首页团队任务|
|通知 CRUD/去重|context.messages|首页本地通知|
|配置/安全存储/KV|configuration/secrets/storage|详情设置、首页开发者区|
|条件显示/多语言/主题|manifest contextKeys/when/l10n、首页桥|首页与关联任务入口|
|声明式表单|FormService + skills|七字段 team-intake；三步 travel|
|MCP Apps|contributes.mcpApps + Operation metadata|cardRender、cardSave|
|独立本机业务服务|Node fetch / SSE|可选报销 SQLite、推送服务|
|错误码透传|宿主 H-01 修复|复用真实桌面回归确认 FORBIDDEN / UNSUPPORTED|

认证登录、非空通知 actions、系统级提醒实际投递保持待支持/待专项验收。不增加未公开的 forms RPC。
