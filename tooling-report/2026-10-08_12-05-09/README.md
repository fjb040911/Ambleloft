# v0.5.0 SDK/CLI 增量实现与验收

完成本轮源码预览要求；SDK/CLI 保持 0.1.0-alpha.6，Demo 保持 0.3.1，没有发布、提升版本、提交或推送。本报告按独立 SHA256 标识本次产物，不能用相同版本号推断与旧产物相同。已保留本轮开始前宿主同步到独立仓库的增量，未回滚 Schema、validator、消息 helper、认证类型或 doctor 基线。没有修改宿主运行时代码。

## 规范—实现—SDK/CLI—Demo

| 要求 | 实现与证据 | 结论 |
| --- | --- | --- |
| 包内图标 | extension-lab 的 assets/icon-light.png、icon-dark.png，128px；manifest.icon；build 复制；tarball 生成项目核对字节 | PASS |
| 图标正反例 | tests/icons.test.cjs 调 CLI 对目录和 raw ZIP 检查；无图标兼容、单图/双图、缺失、路径、SVG、symlink、体积、尺寸、截断、动画 | PASS；不止 JSON 校验 |
| 消息按钮 | SDK 已同步持久方法；Demo actionPublish/actionRun/actionRecords/actionReconcile；独立 SQLite action-service | PASS；真实宿主 OperationRouter/HostManager/bootstrap/DB |
| accepted→completed | 宿主按钮确认后业务服务接受；明确业务完成，再 GET 查询回报 | PASS |
| unknown→查询回报 | 业务服务保存完成后断开响应，宿主记录 unknown；GET 查到完成；写入计数不增长 | PASS；无业务 POST 重放 |
| 报告幂等/CAS | 重复 reportId 同载荷返回原结果、改载荷拒绝；错误消息 revision 执行状态不提交；并发仅一方成功 | PASS |
| 生命周期与隔离 | accepted 锁跨宿主/数据库重启保持、完成后不可重放、撤回/过期拒绝、跨扩展列表隔离与回报拒绝 | PASS |
| 认证 Demo | authStatus/authConnect/authDisconnect/authRequest；管理员 PKCE/回调/resource/tenant 说明；不返回 Token | PASS（下述受控范围） |
| 认证边界 | 静默 null、取消、连接、过期、配置变化、401、越界 URL、请求中撤权 | PASS（真实宿主代理与扩展进程，外部协议/网络受控） |
| 图标主题与回退 | 实际 tarball 生成包安装到 Electron；浅/深主题、系统媒体环境、更新移除 icon | PASS；5 组截图 |
| 原有体验馆能力 | README、项目聊天、消息、KV、声明式本地/业务表单、MCP Apps、重启 | PASS；8 组回归 |

## 文件与职责

- 已同步契约：contracts/sdk.d.ts、messages-preview.d.ts、extension.schema.json、host-capabilities.json；packages/sdk/messages-preview.* 与 core 校验器；本轮审核并验证，未重复实现宿主逻辑。
- 新 Demo 后台：examples/extension-lab/src/actions-auth.ts；主入口注册；extension.json 声明资源和 8 个 page Operations；页面提供动作/连接操作。
- 业务演示服务：examples/extension-lab/action-service/server.cjs；SQLite 持久化、invocationId 唯一键、accepted/丢响应模式、业务查询；只监听 127.0.0.1，不进入扩展安装包。
- 资源与脚手架：examples/extension-lab/assets、build.cjs，同步 packages/cli/templates/extension-lab；不要求其余无图标模板添加 icon。
- CLI：--help 说明、模板生成忽略 SQLite 本机数据；保持 validate/pack 不执行代码。
- 验证：tests/icons.test.cjs、scripts/test-packages.cjs、test-actions-auth-host.cjs、test-actions-desktop.mjs、test-icons-desktop.mjs；package.json 新增相应命令。
- 文档：README、CLI README、模板 README、docs/v0.5.0-capability-matrix.md、changelog、表单说明。历史认证提案已明确标注被现行规范替代。

## 实际执行命令

| 命令 | 结果 |
| --- | --- |
| npm run build | PASS |
| npm run check:upstream | PASS，16 文件 |
| npm test | PASS，69/69 |
| npm run test:packages | PASS；空缓存离线 tarball 安装、CJS/ESM/严格类型、doctor、6 模板生成/构建/校验/打包、PNG 字节保留、服务不入包 |
| doctor --host ../agent --require messageActions,extensionAuthentication --json | PASS，29 文件基线 matched；runtimeStatus 正确为 not-tested |
| 宿主 npm run build | PASS；保留 bundle size 提示 |
| 宿主 node --test tests/extension-icons.test.cjs tests/message-service.test.cjs tests/extension-auth.test.cjs tests/oidc.test.cjs | PASS，13/13（含要求的图标测试） |
| 宿主 PLAYWRIGHT_CHANNEL=chrome npx playwright test tests/e2e/extension-icons.spec.ts | PASS，1/1；这是受控浏览器 UI 测试，不冒充安装链路 |
| 宿主 node scripts/test-message-actions.mjs | PASS；原生扩展页面、两次明确确认、结果持久化、按钮禁用、重启 |
| npm run test:actions-auth:host | PASS，12 组，原始 actions-auth/report.json |
| npm run test:actions:desktop | PASS，2 组，实际生成归档、真实消息按钮与回报；原生认证选择器取消 |
| npm run test:icons:desktop | PASS，5 组，实际安装包浅/深/系统/默认回退 |
| npm run test:showcase:desktop | PASS，8 组，原始 showcase/report.json |
| git diff --check | PASS |

包安装与 doctor 测试依赖相邻宿主源码。所谓“空缓存离线安装”是使用本机锁定依赖的 tarball，不是宣称整套验收无需宿主或 Node 构建环境。运行时和用户生成项目不依赖相邻宿主源码。

## 证据与真实性边界

真实桌面均使用隔离用户数据目录，不改动用户当前 Profile。安装/信任原生框由驱动接受，消息写操作的 React 确认框实际点击。新 Demo 的认证取消用真实宿主原生连接选择器（自动选取消），没有发起外部浏览器登录。

认证进程测试运行真实数据库、ExtensionAuthentication、OperationRouter、HostManager 和 bootstrap 扩展子进程。为了无需真实 IdP，protocol/attempt、fetchImpl 和 encryption adapter 为测试替身；因此只证明接口链路、绑定、状态与撤权规则，不证明企业 IdP、系统 Keychain、真实 TLS 或真实 Token 验证部署可用。另有宿主 OIDC 单测通过，但不替代企业验收。

业务服务是独立真实 HTTP/SQLite 演示程序；故意断开响应验证不确定结果，不用 SDK mock 制造成功。跨扩展/CAS 等异常探针只在测试驱动调用宿主私有服务，未把私有 IPC 加入 SDK 或 Demo。

截图已经查看：图标在浅/深背景清晰，系统媒体模拟选择正确资源，移除声明后为默认拼图。系统主题第一次测试失败是驱动强制 nativeTheme 后被应用的 system 设置覆盖；改为 Playwright colorScheme 媒体模拟后通过。未把该驱动问题登记为宿主缺陷。系统跟随测试不是修改机器操作系统的全局外观。

## 未覆盖与宿主问题

本轮没有发现阻断 v0.5.0 范围的宿主缺陷，未自动改写基线。真实企业 IdP 客户端注册/resource/租户/生产安全存储、OS 通知横幅与点击、其他 OS、账号范围消息、refresh token、全局多账号选择器、WebSocket 凭据、Agent hooks、forms_resume 不在本轮通过声明内。

GitHub Actions 多平台流水线未执行；现有 workflow 只 checkout tooling，而源码对照/doctor 测试需要相邻 agent，后续配置 CI 应提供经过授权且固定版本的宿主 checkout，不能从本机结果推断线上 CI 通过。

## 交付与使用

本次安装包：dist/npm/extension-lab-clean-install.amble-extension（acme.extension-lab@0.3.1），安装后在扩展详情可见 README。本地 dist/extension-lab.amble-extension 是 example 身份，不应混淆。使用本报告 artifacts.json 区分相同版本号的本地快照。

交付 zip 包含 alpha.6 的 SDK/core/CLI tgz、通过桌面验收的 acme 安装包、匹配身份的可生成源码和独立动作服务。宿主安装无需运行 npm 服务即可查看介绍和其他本地能力；消息按钮业务演示需单独运行源码目录的 npm run actions:service，并在宿主配置 actionServiceUrl=http://127.0.0.1:47833。认证 api.example.com 是占位声明，必须按 README 配置自己的企业资源后重新构建，不是假服务。

## 给宿主的后续 Prompt

请阅读本报告及 v0.5.0 能力矩阵。本轮真实宿主消息动作/认证边界及 PNG 图标验收通过，无需为 SDK 新造 API。请安排真实企业 IdP 的 PKCE/loopback/resource/scopes/租户与系统安全存储部署验收，并独立验证 OS 通知实际投递。后续契约或基线文件变化需显式交接并复验；不得在 build 自动更新指纹。若配置跨仓库 CI，请提供固定宿主 revision 和适当读取权限，保持公开材料位于 specs/extensions。
