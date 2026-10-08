# 契约一致性与 CLI 兼容性诊断

2026-10-08。对应[增量需求 v0.4.0](../requirement/v0.4.0/README.md)。修改宿主公开契约及相邻 extension-tooling 工作区；未发布 npm、未提交或推送。SDK/CLI 保留 alpha.5 本地预览版本，本轮 tarball 指纹单独归档，不以同名版本冒充历史构建。

## 交付

- [当前能力表](../../specs/extensions/current-capabilities.md)和源码能力机器清单，区分公开预览与未开放入口。
- 表单命名类型集中到 sdk.d.ts；独立 messages-preview 契约集中维护；SDK 构建直接同步，不再追加表单类型。
- 宿主参考 SDK 包含 form.schema.json；补齐 QUOTA_EXCEEDED 类型和错误码白名单测试。
- check:upstream 核对 16 个同步文件，忽略包元数据无语义的顺序差别。
- CLI doctor --host --require --json 检查记录的源码基线；漂移、缺失、未开放能力、未知 ID 有明确诊断及退出码。runtimeStatus 始终 not-tested，不替代实际应用验收。

## 本轮验证

- SDK/CLI npm test：66/66 PASS。
- 宿主契约及 SDK 定向测试：5/5 PASS。
- npm run check:upstream：16 文件一致。
- npm run test:packages：真实 tarball、空缓存离线安装、CJS/ESM/严格 TypeScript、安装后的 doctor、全部现有脚手架构建/校验/归档通过。
- 文档入口链接校验通过。

证据见 [evidence](evidence/)。本轮没有重新运行全量宿主测试或真实桌面业务矩阵；没有新增认证、Agent hooks、运行时 capability 协商。源文件注释变化也会触发 baseline 漂移，需审查而非默认为不兼容；普通 build 不自动刷新已验收基线。
