# 设置页未授权与授权变化修复

用户报错：Error invoking remote method extensions:configuration: FORBIDDEN: Extension grant changed。

## 原因

首次安装没有 configuration/self 授权。详情页 keepMounted 的设置组件立即读取受保护配置，数据库按设计拒绝，但 UI 直接显示底层 IPC 错误。之后授权 generation 改变，原组件仅依赖 id，不重新读取。

## 修复

- ExtensionDetail 根据真实 grants 显示“授权扩展配置”，未授权不读取配置。
- 宿主 grants IPC 新增可选 capabilities 子集，严格核对 manifest 声明并保留原生确认；未提供时维持旧的全声明授权流程。
- 设置入口只请求 configuration，不要求创建或选择项目，不附带 storage/secrets/项目权限。取消不授权。
- ExtensionSettings 监听 generation：无编辑时重新加载；有编辑时保留并提示显式重新加载，不自动覆盖用户输入。加载错误提供重试入口。
- 数据库/SDK 权限校验保持不变。未授权的直接 configuration 调用仍 FORBIDDEN。

## 本轮验证

宿主构建 PASS；配置/安装存储相关 11 项测试 PASS；真实隔离 Electron PASS：原报错复现、首次设置页提示、取消零授权、无项目仅配置授权、保存、generation 变化保留编辑、撤权重新授权、停用重新启用、拒绝未声明 capability。

[桌面结果](evidence/desktop/report.json)、[未授权页面](evidence/desktop/01-permission.png)、[配置加载成功](evidence/desktop/02-configured.png)。

复现：agent 中 npm run build；extension-tooling 中 node scripts/test-configuration-grant-desktop.mjs。测试使用临时隔离配置，未修改用户日常安装和授权。无需重装 Demo；运行中的宿主需要重启更新后的版本才能加载 main/renderer 修复。

未提交、推送或发布；保留工作区其他既有改动。
