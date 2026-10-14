# U9 本地集成验收与工具链交接

日期：2026-10-14。结论：**本轮约定的本地验收完成；不等同全部平台正式发行批准。** 用户已明确将真实模型质量抽样留待后续，本轮没有调用付费模型或读取用户凭据。

## 环境与验证层级

macOS darwin arm64，应用源版本 0.4.1，固定项目 Codex 0.153.4，Electron 41.10.7。测试采用临时独立用户目录和本机 HTTP 推理 fixture，没有重启正在运行的开发实例。

| 验证 | 结果及范围 |
| --- | --- |
| 全量 Node 回归 | 342 项，341 通过、1 跳过、0 失败 |
| 最终工具契约检查 | 4 项通过，包含七个模型工具与冻结契约名称一致性；在全量测试后补入 |
| 正式组件浏览器 | 26 项通过：补充消息、字段、dock、旧表单、技能和多语言 |
| npm run build | TypeScript、资源生成与生产前端构建通过；保留既有大 chunk 警告 |
| 原生问题/steer 探针 | 实际 Codex 引擎：回答、中断均收到匹配 resolved；错误/已结束 turn 拒绝；clientUserMessageId 跨引擎重启可读 |
| 开发 Electron，Responses | 实际界面、IPC、SQLite、MCP 和固定引擎端到端通过 |
| 开发 Electron，Chat Bridge | 同上，适配后的 Chat 路径通过 |
| macOS arm64 .app 构建 | 临时目录构建成功，ad-hoc 签名，未公证 |
| 打包 .app，Responses + Chat | 两条端到端路径均通过，包含内置技能资源、答案持久化和重启不重发 |
| 真实模型自动选型/语义质量 | 按用户决定暂缓；本地 fixture 不证明模型判断质量 |
| Windows/Linux 实机、正式签名公证 | 本轮未执行；不能外推 macOS 结果 |

原生 request_user_input_async 在固定引擎的工具列表中不存在；这不是宿主持久补充表单失败。原生问题探针覆盖 Responses，双协议验证指宿主补充表单/steer，不能泛化为所有原生工具双协议均已验证。

## 新增正式应用验收入口

`scripts/test-user-input.mjs` / `npm run test:inputs:desktop` 使用真实 Electron 和固定引擎、本地确定性推理服务，按 Responses、Chat 依次执行：

1. 新配置自动安装内置 Skill；引擎请求包含其发现路径。
2. 调用 input_capabilities、input_request，之后继续独立工具调用，表单仍 pending，无投递。
3. 正式 Conversation 的固定待补充区填写、自动保存、提交。
4. outbox delivered，任务仍在原 turn 执行；后续推理请求包含确认答案。
5. 正常结束，答案只存在一条投递；关闭并重启应用，答案恢复且无新推理请求，内置 Skill 不重复安装。

设置 `ATELIER_TEST_APP=/absolute/path/Ambleloft.app` 可对 macOS 打包应用运行同一验收。探针只发送合成数据；finally 关闭隔离应用与本机服务、删除临时用户目录。截图在 test-results，不作为公开业务数据发布。

```sh
npm test
PLAYWRIGHT_CHANNEL=chrome npx playwright test tests/e2e/user-input.spec.ts tests/e2e/supplemental-dock.spec.ts tests/e2e/input-request-fields.spec.ts tests/e2e/form-onboarding.spec.ts tests/e2e/skills.spec.ts tests/e2e/localization.spec.ts
npm run build
npm run test:inputs:engine
npm run test:inputs:desktop
# 构建到自选临时输出目录，避免覆盖既有发行产物：
npx electron-builder --mac --dir --config build/electron-builder.cjs -c.directories.output=/tmp/amble-u9-package
ATELIER_TEST_APP=/tmp/amble-u9-package/mac-arm64/Ambleloft.app npm run test:inputs:desktop
```

## 验收矩阵对应证据

| 用例 | 本轮/累积可复现证据 |
| --- | --- |
| V01–V02 运行中补充、幂等 | chat-inputs 单元；user-input 浏览器；实际应用提交链路 |
| V03 preparing/结束边界/空闲 | chat-inputs/runtime 测试；固定引擎错误 turn 拒绝及迟到答案新 turn |
| V04 停止、排队、恢复 | SQLite 持久策略及并发测试；dock 提交并继续浏览器测试 |
| V05 不确定投递 | 恢复 dispatching→unknown、只读核实、禁止重排测试；实际引擎历史读取 |
| V06–V07 动态定义与拒绝越界 | definition/contract/model 测试；正式应用旅游补充表单 |
| V08 独立工作继续 | 开发与打包应用双协议：请求后独立工具执行，再接受表单回答 |
| V09 并发/崩溃窗口 | 请求/答案/outbox 同事务与幂等测试，冲突回滚；实际应用重启不重发 |
| V10 交互与语言 | dock/字段/多语言浏览器：焦点、窄屏、切换、折叠和本地缓冲 |
| V11 原生问题失效 | 固定引擎回答/中断 resolved；runtime typed RPC 清理及全部旧问题重启失效测试 |
| V12 / V18 取消、替换、来源 | service/model 的 CAS、提案、配额、永久失效；正式组件预览、接受/拒绝 |
| V13 旧业务表单 | forms/declarative-ui Node 回归、form-onboarding 浏览器；本轮未跑完整外部报销服务 |
| V14 发现与双协议 | 实际应用验证发现目录、工具探测、提交和继续；模型自主读 Skill/语义判断抽样暂缓 |
| V16 文字来源 | 用户来源过滤、已送达证据、冻结解释、不重复原文的持久服务测试 |
| V17 部分/含糊回答 | 字段不完整拒绝、草稿提案机制与 Skill 指导已验证；真实模型语义质量暂缓 |
| V19 折叠/取消/停止 | 浏览器与持久队列测试；通知到达空闲边界变 held，不自动唤醒 |
| V15 独立 ExecutionUnit | U10 后续设计范围，不属于本轮能力 |

测试数量不取代分层证据。所有“浏览器”均使用正式组件和模拟 IPC；只有上表明确标记的 Electron/.app 探针使用真实 IPC 与固定引擎。没有将 fixture 输出当成真实模型质量评测。

## 工具链与发行边界

[SDK/CLI 公开对接要求](user-input-sdk-cli-requirements.md)（本地交流批次 v0.6.8） 已建立，要求校验动态定义、生成兼容示例、区分内部模型工具和公开扩展 API。该编号是需求交流批次，不代表 npm 包已发布。内部 input_* 不写入 ExtensionContext.capabilities，不虚构 Node SDK 方法；旧静态表单与 operation 权限保持。

发行前仍需：真实模型质量抽样、目标平台实机结果、正式签名/公证，以及 SDK/CLI 独立项目交付回执。本轮没有创建发行版、发布 npm 包或推送代码。
