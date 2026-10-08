# SDK/CLI 增量交接 v0.5.0

更新：2026-10-08。本目录是宿主与独立 SDK/CLI Agent 的交流材料。文档版本不等于 npm 版本，不授权自动发布或提升包版本。

## 当前基线

宿主参考 SDK alpha.1；独立 extension-tooling 工作区 alpha.6。manifest 为 1.0-draft，API 为 1。已同步 Schema、核心校验器、SDK 消息方法、认证类型与 CLI doctor 源码基线；不是要求重新实现宿主逻辑。

当前规范优先级：宿主 contracts + 实际实现/测试 → 现行接入指南 → 本交接 → 历史设计/旧报告。发现冲突须反馈宿主，不能自行创造宿主能力。宿主公开文档位于 specs/extensions；宿主 docs 不作为公开材料。

## 已有能力

| 主题 | 现行接口 | 依据 |
| --- | --- | --- |
| 自定义图标 | manifest.icon 字符串或 light/dark，包内 PNG；无 setIcon API | specs/extensions/icons.md、extension.schema.json、manifest.cjs |
| 消息操作 | messages-preview 的 listActionInvocations/reportActionResult；Operation context.message | message-actions-auth-guide.md、messages-preview.d.ts |
| 认证 | authentication.resources；InvocationContext.authentication.requestSession；ExtensionContext.authentication 的 getSession/request/disconnect/onDidChangeSessions | sdk.d.ts、extension-auth.cjs |
| 兼容诊断 | check:upstream；doctor --host --require messageActions,extensionAuthentication | host-capabilities.json、CLI host-baseline.json |

图标在安装时校验并随包版本持久化；不依赖扩展启动。单张最多 64 KiB，正方形 16–512px，推荐透明 128px。包外路径、缺失文件、symlink、非 PNG、动画/不完整 PNG 拒绝；解码失败由 UI 回退。主题跟随应用，更新移除声明回退默认。

消息最多两个按钮，引用本扩展 page Operation；页面只提交标识及消息 revision。写操作确认不可省略。通过宿主 invocationId 关联远端幂等与恢复；正常 handler return 不等于完成。accepted/unknown/completed 保留写锁，报告和可选消息更新原子提交。不能自动重放写操作或修改用户接收偏好。

认证由用户交互触发，宿主提供企业连接选择和系统浏览器 OIDC Code + PKCE。扩展不能拿到 Token、全局账号目录或任意带凭据请求头。每资源一个会话，过期需重新连接。声明并不自动授权。

## 下一位 Agent 要完成的工作

1. 审核独立仓库现有增量，不回滚已同步的 Schema/validator/helper。补充 CLI 对图标的正反例、目录和 archive 校验测试，不能只检验 JSON。
2. 完善脚手架：至少一个可生成的 Demo 带实际 light/dark PNG；build 必须复制 assets，pack 必须包含它们。保持已有无 icon 项目兼容，不要求所有模板都增加图标。不要仅添加不存在的图标路径。
3. 扩充综合 Demo：已受理→完成、未知→业务查询回报、撤回/过期、重复 reportId、并发 CAS、重启锁、跨扩展拒绝；调用真实宿主，不以 SDK mock 成功代替。
4. 认证 Demo 提供管理员配置说明、连接/断开、静默缺失、拒绝授权、会话过期、企业配置变化、HTTP 401、越界 URL 与撤权期间请求。无真实 IdP 时标记受控测试，不宣称企业生产环境通过。
5. tarball 干净安装验证 CJS/ESM/类型、生成项目 build→validate→pack→真实宿主安装。新图标资源不能遗失；至少一次截图检查浅色/深色/跟随系统/默认回退。
6. 同步 README、CLI --help/模板 README、示例清单及能力矩阵。历史发布记录保留日期；过时提案明确标记“已被现行规范替代”。
7. 在 tooling-report 新建带日期的实现报告，列文件、命令、证据、未覆盖项与需要宿主修复的问题。不得把计划写成通过。

## 验收命令

独立仓库：npm run build、npm run check:upstream、npm test、npm run test:packages。
宿主：node --test tests/extension-icons.test.cjs；PLAYWRIGHT_CHANNEL=chrome npx playwright test tests/e2e/extension-icons.spec.ts；node scripts/test-message-actions.mjs（先构建桌面资源）。

check:upstream 依赖相邻宿主源码。当前 test:packages 中的 doctor 用例也读取相邻宿主，不能宣称整套测试完全无此依赖。运行时与用户项目生成不因此依赖宿主源码。

不得每次构建自动重写 host-baseline.json；先审查差异并联调后才更新。

## 明确不在本轮自由实现范围

SVG/远程/动态图标、账号作用域消息、刷新令牌、全局多账号选择器、WebSocket 凭据、任意 MCP Apps 兼容、公共 Agent hooks、正式运行时能力协商。新增这些能力须与宿主共同设计，不能靠 SDK 假实现。

## 已有证据

宿主消息与认证报告：tooling-report/2026-10-08-message-actions-auth/README.md。
图标实现已通过 53 项宿主图标/Manifest/包测试、主题与回退浏览器测试；独立 SDK/CLI 68 项回归通过。它们不代表新增脚手架图标模板或真实企业 IdP 已验收。

可直接交给下一位 Agent 的启动说明：[agent-prompt.md](agent-prompt.md)。
