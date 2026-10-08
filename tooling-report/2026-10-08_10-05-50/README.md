# SDK/CLI alpha.6 与最新宿主对齐交付

依据：specs/extensions/current-capabilities.md、contracts/host-capabilities.json、tooling-report/requirement/v0.4.0；忽略 ai-rules。包版本 0.1.0-alpha.6，综合 Demo 0.3.1；未发布 npm，未提交或推送 Git，未修改宿主运行时代码。

## 能力对照与改动

| 规范/宿主 | SDK/CLI/Demo | 结果 |
| --- | --- | --- |
| 宿主统一 sdk.d.ts / messages-preview.d.ts / Schema | 构建直接同步，表单命名类型不再由 tooling 另行追加 | 对齐；基础同步在本轮开始前已由宿主侧落地，本轮承接验证 |
| QUOTA_EXCEEDED 公开错误码 | SDK 类型导出、白名单集合一致性测试、实际 tarball TypeScript 编译验证 | 对齐 |
| host-capabilities 源码清单 | doctor --host --require --json | 公开的 5 项 preview 能力可检查；3 项未开放能力明确失败 |
| 页面桥、消息投影/存储、包校验链 | doctor 基线扩展至 21 文件，逐文件漂移回归 | 只读、不执行候选源码；源码匹配不等于运行时验收；build 不更新指纹 |
| 项目访问授权 / 业务任务记录 | Demo 双语空状态、按钮及 README 区分两步骤 | 不新增私有项目枚举 API，不自动创建任务 |
| 六套模板 | SDK/CLI 依赖 alpha.6，保留现有公开 API | 独立安装、构建、校验、打包通过 |
| 系统通知 | 复用现有消息 publish；文档说明宿主已接入但送达未验收 | 不将 remind 当送达回执 |

更新了表单文档，删除已经修复的错误码折叠阻塞说明；新增 alpha.6 changelog 和当前使用说明。配置、存储、资源、消息、表单、MCP Apps 原有入口兼容，无稳定能力升级。

## 验证

- SDK/CLI 单元与回归：67/67 PASS。
- check:upstream：16 文件一致。
- 宿主受影响测试：页面桥、清单/包校验、消息服务/存储、表单，共 68/68 PASS。新增的基线文件经这些检查与真实桌面验证后接受；未将自动更新指纹写入构建。
- 独立 tarball：空缓存离线安装、CJS/ESM/webview、严格 TypeScript（含 QUOTA_EXCEEDED）、doctor、六套模板 init/build/validate/pack、确定性归档、处理器执行全部通过。最后仅更新 CLI README 并重新 pack；没有后续可执行代码变更。
- 真实 Electron：showcase/report.json 的 8 组均 PASS：README、项目聊天、本地消息、KV、7 字段本地表单、3 步业务表单、MCP Apps 取消/保存、重启恢复。
- 真实授权/任务关联回归：project-grant/report.json；权限页授权保留，任务须明确创建。
- doctor.json：当前源码 matched，runtimeStatus 仍正确为 not-tested（该命令本身不做桌面测试）。

桌面使用隔离用户目录、真实宿主 React/Electron/扩展桥。原生安装/信任对话框由测试驱动接受；业务确认和项目选择走真实 UI。表单 Agent 流程使用本机 Responses fixture，业务表单使用独立本机 SQLite 演示服务，不构成远程服务验收或未实现宿主能力的 mock。未改动日常用户数据。

打包时默认 npm 缓存不可写，已改用 /tmp 独立缓存成功；无需修改用户缓存权限。

## 交付与运行

extension-tooling/dist/npm 下有 SDK/core/CLI alpha.6 三个 tgz；extension-lab-clean-install.amble-extension 是本次桌面验收的 acme.extension-lab@0.3.1。安装到宿主“设置 → 扩展”后可见 README。dist/extension-lab.amble-extension 是 example.extension-lab@0.3.1，身份不同，不用于替换 acme 包。

解压 extension-tooling/dist/extension-tooling-alpha.6.zip 后，在自己的项目中执行：

```sh
npm install --save-dev /absolute/path/ambleloft-extension-sdk-0.1.0-alpha.6.tgz /absolute/path/ambleloft-extension-core-0.1.0-alpha.6.tgz /absolute/path/ambleloft-extension-cli-0.1.0-alpha.6.tgz
npx --no-install amble-extension doctor --host /absolute/path/agent --require operations,localMessages,declarativeForms,mcpApps --json
```

具体模板构建命令见生成的 README。依赖和工具未发布到公共 registry，本地 tarball 安装不会使私有仓库公开。

## 边界与宿主协作 Prompt

认证、Agent hooks、forms_resume、SDK 直接显示/迁移表单、授权项目自动枚举、非空消息 actions 均未新增。真实系统通知横幅/点击、真实 IdP、其他操作系统以及旧版安装包兼容未验收。

> 请依据本报告维护宿主 current-capabilities 和公开契约。当前无需为 SDK alpha.6 另加运行时方法；如需认证、授权项目查询或 Agent hooks，请先提出公开契约与实现边界，双方确认后再实现封装。后续修改 doctor 覆盖文件时，审查差异并重跑相关验收后显式更新指纹，不要在 build 自动刷新。系统通知仍需独立 OS 桌面送达/点击验收。
