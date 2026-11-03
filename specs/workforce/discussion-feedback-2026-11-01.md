# 讨论页：滚动、主持人反馈与当前方案

日期：2026-11-01。状态：本地开发、隔离页面验收和真实模型流式验证完成，未部署。本轮覆盖 H08～H10；主持人路由、任务授权及调度仍以 [主持人设计](discussion-host-2026-11-01.md) 为准。

## 用户反馈与改动

1. **空讨论不应凭空滚动。** 原空间页签至少占一个完整视口，再叠加标题与导航，空内容也多出约 160～171 px。讨论现在只填满标题以下的可用高度；输入框贴近底部，真实内容增加后才自然滚动。切换空间页签时保留已有的导航固定与滚动记忆；重新回到页面顶部时不会留下先前固定导航产生的空白。
2. **主持人应有与聊天一致的运行反馈。** 复用现有 `ThinkingWindow`、Marker、Spinner 和 shimmer，按真实阶段显示准备、等待模型、接收思考、整理回复、等待专家。收到模型实际提供的思考或摘要后实时展示，最大高度 180 px，内部跟随更新；用户向上阅读后停止自动追随。长行自动换行。完成或中断后收起为“查看模型思考”。遵循系统减少动画设置。
3. **当前方案不能推走上下文导航。** 右侧统一为“方案 / 讨论 / 文档 / 任务”四个 shadcn Tabs。长方案在自己的面板滚动，页签位置固定；更新不自动切换页签。首次仍打开讨论列表。方案尚未产生时展示明确空状态。来源跳转和“整理为任务”继续有效。窄窗口保留“查看讨论与相关内容”入口。英文短标签使用 Brief / Chats / Docs / Tasks，同时保留完整无障碍名称，避免文字互相挤压。

按 Impeccable 布局/动效规范及 shadcn 组件契约检查，保留工作台现有主题与设计 token；Taste-skill 的落地页布局不套用到产品讨论界面。

## 真实数据与执行边界

- `core/automation/provider.cjs` 增加可选的流式进度回调。现有不带回调的调用保持原请求路径。
- `provider-stream.cjs` 复用 Chat Bridge 的 SSE 解析；支持 Chat 的 reasoning 字段、Responses 的 reasoning/summary 事件和最终结构化结果。限制响应体与累计文本尺寸，校验完成状态，拒绝截断、断流和非法 JSON。
- DeepSeek 按现有 reasoningSummary 设置请求 thinking；关闭思考展示时不发布 reasoning。服务不返回思考时只显示等待/整理状态，不生成虚假的思考文案。返回普通 JSON 的服务仍可完成处理。
- `SpaceRequest.host.activity` 保存本次调用 ID、阶段、实际思考文本、格式和开始时间；通过现有空间事件刷新，最多每 120 ms 持久化一次进度，最终完整进度单独保存。
- 结构化 JSON 尚未完成和校验时，不创建问题、方案决定或专家委派。停止、超时与当前调用 ID 检查共同隔离迟到回调。
- 过程文本只用于运行反馈；`sourcesFor` 和任务草稿只引用既有最终步骤与方案，思考内容不成为可采纳证据，不重新注入后续决策。
- 历史记录没有 activity 时仍可阅读，不伪造之前的运行过程。本次没有修改或重放用户讨论。

## 验证记录

| 范围 | 结果与证据 |
| --- | --- |
| H09 服务与协议 | `node --test tests/provider-stream.test.cjs tests/workforce-discussion-host.test.cjs tests/automation*.test.cjs`：37 项通过。覆盖 Chat/Responses SSE、UTF-8 分块、思考关闭、非 SSE 回退、断流/截断/超限、取消与迟到回调、持久化恢复及任务来源隔离。这里的模型响应为可控替身，SQLite 为真实实现。 |
| H08/H10 完整讨论回归 | `PLAYWRIGHT_CHANNEL=chrome npx playwright test tests/e2e/discussion-feedback.spec.ts tests/e2e/discussion-host.spec.ts tests/e2e/discussion-delete.spec.ts tests/e2e/workforce-spaces.spec.ts --workers=1 --reporter=line`：71 项通过；随后补充短窗口与英文间距断言，重跑 feedback + host 共 16 项通过。所有页面使用隔离 API 数据，未连接真实用户记录。 |
| 视觉与键盘 | 实际查看空白页、长方案、思考过程截图；覆盖 390/800/1280 px、720/950 px 高度、中英文、深浅色、长文本、来源焦点、页签方向键、思考手动滚动及减少动画。空讨论的滚动差值 ≤ 1 px；方案内部滚动不改变外层位置；英文页签文本间距 ≥ 8 px。 |
| 原聊天回归 | `chat.spec.ts` 的 4 项过程/思考/动态提示测试通过，共享组件的思考跟随、手动阅读、隐藏更新、停止与减少动画行为保留。 |
| 类型与构建 | `npx tsc --noEmit`、`npx vite build` 通过；仍有既有大分块和 FileCode 静态/动态混合导入提示。 |
| 设计检查 | Impeccable `detect --json --scope layout src/WorkforceSpaces.tsx src/DiscussionHost.tsx` 无发现；自动扫描不替代上述截图验收。 |
| 真实模型 | [DeepSeek 流式证据](evidence/discussion-feedback-live-2026-11-01.json)：调用已配置的 deepseek-flash，虚构工单目标、临时 SQLite、无专家/项目/工具。观察到 waiting → reasoning → responding，首段思考约 850 ms、31 次运行中思考更新、最终产生 1 个待补充问题。一次探针的时间不构成性能承诺。 |

真实探针：`node_modules/.bin/electron scripts/probes/discussion-feedback-live.cjs`。仅主动执行时调用配置的 DeepSeek；只读本机模型配置，凭据只用于该服务鉴权。探针输出计数和状态，不输出凭据或模型思考文本。不启动专家运行，不创建施工计划。真实模型/服务持久化与浏览器视觉验收分别进行，不能称为完整打包桌面端端到端验证。

原聊天组件回归命令：`PLAYWRIGHT_CHANNEL=chrome npx playwright test tests/e2e/chat.spec.ts --grep 'thinking|loading markers|process' --workers=1 --reporter=line`。

## 应用与剩余边界

源码应用需要重新启动 Electron 主进程，才能加载新的流式适配；仅前端热更新不够。重启后在“协作工作平台 → 项目空间 → 讨论”输入目标即可验证。无用户数据迁移、Store 更新或远端部署步骤。

本轮未验证 Windows、打包版、SSH/Docker；没有对所有模型服务做真实兼容性测试。Responses 路径使用协议级测试，真实调用本轮只验证 DeepSeek Chat。

## 追补：长思考误报 Response too large（2026-11-01）

用户报告主持人思考中断。只读检查失败记录的状态与长度：模型为 deepseek-flash，失败时在 reasoning 阶段，已保存 13,268 个字符，未生成最终主持步骤。没有读取或输出用户讨论原文。

原因：流式适配的累计传输上限仅 1 MiB。每个 SSE 片段都会重复携带模型、ID、用量等字段，少量实际文字也可能超出该传输预算。之前的小规模真实探针没有覆盖这个边界。

修复：将流式传输预算独立设置为 32 MiB，允许最多 16K token 请求的片段协议开销；实际结构化输出和思考分别保持 256K 字符上限。没有取消大小保护、截断最终方案或增加自动重试。非流式调用保持原行为。

新增验证先复现旧代码失败，再验证修复：

- Chat 与 Responses 各 8,192 个细碎思考片段，协议数据超过旧 1 MiB 上限，最终结果和完整思考均正确保留。
- 通过真实 provider 适配、主持服务与隔离 SQLite 跑通同规模流；最终进入 completed，未触发专家或施工。模型网络响应为替身。
- 思考/结构化输出超限仍拒绝；累计协议数据超过 32 MiB 时关闭 reader；取消、断流、迟到响应与既有自动化回归保留。
- `node --test tests/provider-stream.test.cjs tests/workforce-discussion-host.test.cjs tests/automation*.test.cjs`：42 项通过；`node --check core/automation/provider-stream.cjs` 通过。本次未重新调用真实模型；上方真实证据属于前一轮短输出验证。

应用方式：重启源码应用的 Electron 主进程，在原讨论发送“继续”重新请求。原输入、讨论与此前有效结果保留；本次没有修改用户数据库或自动重放失败请求。
