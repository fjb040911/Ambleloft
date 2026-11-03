# AI Coding 真实协作验证

日期：2026-10-25，19:24–19:29（Asia/Shanghai）。

本次通过 Ambleloft 的 `WorkforceService → SpaceService → AgentRuntime → Codex app-server → Chat Bridge → DeepSeek` 实际执行。不是将预写回答放入原型，也没有用 Codex 子代理代替宿主角色运行。三轮共六个真实任务均完成，六份结果保存为草稿文档，重启后资料 hash、版本引用、结果和来源任务仍一致。

## 审阅入口

- 源码宿主：ActiveBar 中的 **协作工作平台**，与项目、任务、扩展并列。经典布局也有独立一级入口。
- 本次记录：[只读审阅页](http://127.0.0.1:4187/__review/)，进入 `AI Coding · Gateway / Router 边界验证`。这里使用当前宿主 React 界面和真实试跑的导出记录；不开放模型执行或修改。
- 资料目录：`/Users/gavin.fang/opensource/agent-flow/.state/workforce-ai-coding-20261025/`。与日常宿主资料隔离，未把测试员工、项目或会话写入用户日常数据库。
- `verification.json` 为机器检查结果；`runs.json` 为实际任务；`snapshot.json` 为请求、引用与产物；`instruction-evidence.json` 记录引擎收到的指令 hash 与权限。

只读页关闭后可重启：

```sh
cd /Users/gavin.fang/opensource/agent
node tests/manual/workforce-review.mjs \
  /Users/gavin.fang/opensource/agent-flow/.state/workforce-ai-coding-20261025
```

## 输入与角色

项目空间逻辑关联真实的 AI Coding 设计资料目录和 `model-router` 目录。没有凭空创建 `api-gateway` 项目：本次读取范围中未找到独立 Gateway 目录，仅有架构设计和接口规划。

最小摘录来自三份真实文件，保存源文件 SHA-256、相对路径、日期和行号：

| 空间资料 | 原文件 | 摘录范围 |
| --- | --- | --- |
| 总体设计摘录 v1 | `docs/ai-coding-platform-high-level-design.md` | L114–120、205–222、246–266、575–584、600–615 |
| 模块交付摘录 v1 | `docs/ai-coding-modular-delivery-solution.md` | L133–138、157–165 |
| Router 当前实现说明摘录 v1 | `model-router/README.md` | L1–5、126–128、168–170、172–189 |

原项目根目录：`/Users/gavin.fang/work/ai-coding`。没有向外部模型发送完整仓库、凭据或业务数据；没有执行工具或修改 AI Coding 文件。提供给模型的 README 是现状说明，不能代替代码和运行时验收。

角色从阿里云测试 Store 的签名目录加载，激活时走真实全局技能安装器：

| 角色 | 固定的默认技能 |
| --- | --- |
| 产品经理 v1 | `amble-project-context`、`amble-product` |
| 架构设计师 v1 | `amble-project-context`、`amble-architecture` |

两个角色共用一项技能，共安装三项；Store 发布版本均为 0.1.0。界面中的技能 v1 指宿主本地技能修订号。完整技能正文通过角色快照送入引擎。模型自称使用某项技能不构成加载证据；UI 展示的是宿主冻结的技能清单。第三轮产品经理曾额外提到 `amble-architecture`，宿主并未把它作为该角色的默认技能正文注入，因此不计作已验证的额外技能使用。

## 三轮过程与证据

| 轮次 | 输入 | 结果 |
| --- | --- | --- |
| 1：独立提案 | 三份来源摘录 | 产品经理提出范围和验收；架构师提出契约、连接管理和失败恢复建议 |
| 2：交叉审阅 | 原摘录 + 第一轮两份结果 v1 | 实际引用对方结果；指出双层重试问题；usage 发布责任出现分歧 |
| 3：证据校正 | 原摘录 + 第二轮两份结果 v1 + 审阅校正文档 | 撤回“Responses 转换本身是缺陷”等错误推断；区分单机代理与 K8S Service 模式；保留未决项 |

第三轮校正文档由主审阅者根据源文摘录加入，不能把这次过程宣传为完全自主达成共识。每轮由验证脚本调用产品已有 API；自动轮次编排仍是测试驱动，而非已交付给用户的自动辩论功能。

实际任务 ID：

| 轮次 | 产品经理 | 架构师 |
| --- | --- | --- |
| 1 | `3d87e7ca-6b40-44a7-9b40-17af049b6f36` | `327cc2eb-42ab-4ccd-9770-d1bff0c8ceae` |
| 2 | `52d37ad0-d8e9-44db-9207-6dd608ae5b2a` | `354560ca-cd1d-42b0-bbd0-db3071732e01` |
| 3 | `9ef60a0d-8704-4745-a59f-69285b5879d2` | `9b33d748-f50a-4f2c-b673-2a9a09a06278` |

调用模型为本机已配置的 `deepseek-flash`。读取日常数据库的加密 provider 配置使用只读 SQLite；解密和服务凭据仅在进程内存中使用。任务继续沿用 `read-only` sandbox / `on-request` 审批，角色未扩大权限。第一、二轮重复调用使用同一 `clientRequestId`，没有重复启动任务。

## 讨论沉淀：建议而非已采纳架构

1. **Gateway** 作为目标态外部入口，负责客户端协议、鉴权、请求标识、错误和对外流式格式。
2. **Router** 负责模型别名、profile、健康、负载、亲和和路由决策。保留已有实现，不因层次命名立即重写。
3. **按部署模式确定数据路径**。单机/实例代理可由 Router 持有上游连接；K8S Service 模式可保留原设计的决策与转发分离。不要将某一种模式的职责直接套到另一种。
4. **每条数据路径只有一个模型调用重试执行者**。路由策略提供方和连接执行方不一定是同一进程。不能把多个角色都称为“唯一重试方”。
5. **保留 Responses 能力并建立回归**。README 明确记载 Responses → Chat Completions 转换；高层摘录未列出它，不等于应删去已有能力。

仍未决定：MVP 主部署模式、usage 最终发布者及可靠投递边界、取消后的用量口径、迁移阶段外部协议适配的位置。两位角色最后倾向 Gateway 统一发布 usage，但这只是建议；不能宣称 exactly-once 投递已经可用。可采用稳定逻辑请求 ID、至少一次投递与消费端幂等，并另做崩溃/取消/丢事件验证。首字节前取消也可能已消耗上游资源，不应直接将模型给出的“记零”建议视为计量事实。

下一阶段工程输入应为 ADR + 双边契约：先明确数据路径和重试责任，再冻结 canonical request/event、错误枚举、usage 来源及去重规则。此轮没有施工或修改 Gateway / Router。

## 本轮修复

- 将协作功能移出扩展列表，新增 ActiveBar 独立入口 **协作工作平台**；修正选中态、刷新恢复与扩展页切换。
- 协作页面使用自己的内部导航，避免同时显示扩展侧栏。打开任务后可返回平台，当前空间保留；临时切页不销毁角色编辑状态。
- 讨论页展示执行时冻结的角色名、版本和默认技能。修改或移除员工不会让历史结果改名。
- 引用由纯文字改为按钮，打开任务当时引用的具体版本；结果文档继续可回到来源任务。
- 结果使用宿主 Markdown 渲染器，表格与列表可读；新建协作任务标题包含角色名，减少同题任务混淆。
- 讨论任务标题栏不再显示临时工作目录 UUID；桌面内部导航在长结果滚动时保持可见。

## 验证范围

- 六次真实宿主任务完成，模型请求成功，零工具执行；每次冻结两项角色技能。
- 六份结果均有 `sourceRunId`；后一轮引用前一轮的准确版本。
- 服务重建后结果一致，引用正文 SHA-256 校验通过；已有测试覆盖后续编辑不替换历史引用。
- 浏览器实测：ActiveBar 打开/刷新/切回扩展，引用 → 版本 → 来源任务，任务 → 返回当前空间，六份结果文档可见。
- `npm test`：437 项，436 通过、1 跳过、0 失败。需本机回环监听权限，沙箱内初次执行被 EPERM 阻止；允许本机测试监听后通过。
- TypeScript 检查通过；生产构建通过，保留既有 bundle 大小警告。

本次验证证明宿主服务的模型执行和数据链路可用，以及当前 React 界面的记录导航可用。它不等于从原生 Electron 窗口点击“开始任务”的完整验收；也没有验证 ai-coding 施工、并行代码合并、自动 DAG、长期记忆或所有模型的质量。

可重复的真实探针：`scripts/probes/workforce-discussion.cjs`，必须显式用 Electron 启动，并提供独立资料目录、可信 Store 配置和 AI Coding 根目录；不加入普通 `npm test`。只读审阅不重新调用模型。

独立审阅 disposition：**ship，限定本轮既有 Operate 页面修复与六条记录的追溯检查**。四张桌面截图有效，没有发现本轮可复现的 material bug；不扩展为原生启动、全部设备或自动编排验收。见 [审阅记录](../../../agent-flow/designs/agent-workforce/review/ai-coding-trial/review.md)。
