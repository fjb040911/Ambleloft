# 专家角色默认技能：实施记录

日期：2026-10-27。状态：**本轮“官方角色 → 自动准备默认技能 → 任务加载”流程已完成，并部署阿里云测试 Store**。完整产品验收清单仍有平台、发布后台和故障矩阵待补项，见下表；不据此标记 W01～W11 全部完成。

设计基线为 [推荐方案](expert-role-skills-recommendations-v1.md)、[API 增量](role-skills-api-v1.md)、[产品要求](role-skills-product-v1.md)、[架构](role-skills-architecture-v1.md)及[验收清单](role-skills-delivery-checklist.md)。现有未提交改动已保留，未提交 Git、未推送分支、未操作生产用户数据。

## 1. 使用路径与交付

更新源码后**重新启动宿主主进程**，仅刷新渲染页面不足以载入新的 IPC、Store 及安装逻辑。

1. 协作工作平台 → 角色库：可查看十个角色的双语详情、默认/可选技能、推荐理由与用途。查看不会安装。
2. 点击添加员工：默认组合只在这一步初始化一次。可以删改；技能选择器保留“角色推荐 / 全部技能”和独立导入来源。
3. 单次提交：宿主检查并复用或安装所选技能，显示真实阶段进度；可以关闭面板，在员工卡片返回查看。
4. 全部技能准备成功后配置原子生效。失败可重试或返回调整；编辑失败仍保留原有效员工配置。
5. 使用员工开始任务：传入完整职责、方法、交付要求，以及固定技能正文、摘要、资源位置和保存的 usage。对相关工作默认使用声明技能；不因此扩大任务权限。

既有员工不会随角色库更新重新套用默认技能。共享技能仍在全局管理，同名不同来源/固定版本可共存，用户已停用的包不会被自动启用。

| 角色 | 默认技能（包内名称） |
| --- | --- |
| 产品经理 | create-prd、user-stories、prioritize-features |
| 架构设计师 | architecture-patterns、api-design-principles、architecture-decision-records |
| Web UI 设计师 | impeccable、responsive-design、wcag-audit-patterns |
| 测试验收工程师 | test-scenarios、webapp-testing、verification-before-completion |
| 文案大师 | product-marketing、copywriting、copy-editing |
| 教程文档工程师 | documentation-writer、openapi-spec-generation、changelog-automation |
| 系统集成工程师 | api-design-principles、error-handling-patterns |
| 前端工程师 | web-component-design、shadcn、e2e-testing-patterns |
| 数据分析师 | explore-data、validate-data、data-visualization、statistical-analysis |
| DevOps 工程师 | deployment-pipeline-design、incident-runbook-templates、slo-implementation |

合计 30 条默认关联、13 条可选关联，去重后发布 40 个技能包。不是每个角色都安装全部候选，也不把卡片前三项预览当成完整默认集合。

## 2. 实施依赖与工作包

顺序：固定来源与契约 → 构建制品 → 隔离 Store/宿主/模型试跑与审核 → 签名快照 → 测试服务器部署 → 公网宿主重测。authoring JSON 始终是设计输入；只有解析到真实制品的推荐才能发布。

| 工作包 | 本轮交付 | 完整清单的剩余边界 |
| --- | --- | --- |
| W01 契约 | 共享签名快照校验、双语角色、defaultSelected/usage/固定 release 交叉引用 | 完整异常字段、旧版本迁移夹具仍需扩充 |
| W02 数据 | 十角色完整双语资料、40 个真实固定技能包、来源与角色组合审核记录 | 模型输出的专业质量仍需持续评审，不保证所有任务答案正确 |
| W03 发布 | 固定 commit/blob 采集、包内来源记录、许可文件、ZIP 往返校验、不可变发布账本、签名、人工触发部署 | 通用 GitHub 发现分类后台、自动采集调度、限流退避未完成 |
| W04 读取 API | 角色/技能/推荐/详情/分类/固定 release、分页、语言、ETag、兼容目录 | API 频控及完整撤回/历史多快照运维矩阵待补 |
| W05 宿主读取 | Ed25519/文档摘要校验、快照一致性、缓存、离线浏览、安装前重新解析固定 release | 429/代理故障及旧源升级全矩阵待补 |
| W06 技能准备 | 共享全局包、固定版本隔离、实际下载/验证/安装、导入固定来源、完整资源冻结 | Windows、SSH/Docker、缺外部依赖的实机验证未做 |
| W07 提交作业 | 持久受理、幂等、真实逐项事件、后台进度、重试、中断恢复、CAS 原子应用 | 进程在每个文件/数据库提交边界被强杀的测试未覆盖完整 |
| W08 草稿 | 无修改不产生持久草稿/作业/新 revision，修改后还原清理，失败提交恢复候选 | 全部历史版本真实用户数据迁移未做 |
| W09 选择 UI | 只读详情、默认一次初始化、推荐/全部技能、导入、跨页选择、usage/来源详情 | 自定义角色的本地语义匹配推荐未实现；合理空态与全部技能可用 |
| W10 进度 UI | 统一提交、后台查看、真实阶段状态、失败重试/调整、旧配置继续有效 | 完整读屏、200% 字号和双窗口故障注入 UI 回归待补 |
| W11 集成 | macOS 源码组件与真实服务、40 包公网安装、十角色文本模型任务、真实 AgentRuntime/RPC 一次任务 | 打包版、Windows、SSH/Docker 和全面迁移验收未通过实机验证 |

主要代码入口：

- 发布与服务：`scripts/fetch-expert-skills.py`、`build-expert-skills.cjs`、`publish-store.cjs`、`publish-expert-snapshot.cjs`；`store/server.py`。
- 签名读取与固定安装：`core/catalog-store/expert-contract.cjs`、`expert-client.cjs`、`fixed-install.cjs`，以及 `electron/skills.cjs`。
- 员工作业与任务：`core/workforce/preparation.cjs`、`role-drafts.cjs`、`service.cjs`；`electron/main.cjs`、`preload.cjs`、`agent-runtime.cjs`。
- 界面：`src/Workforce.tsx`、`WorkforceRoleEditor.tsx`、`WorkforceRoleDetails.tsx`、`WorkforceInputs.tsx`、`WorkforcePresentation.tsx` 及现有主题样式。

## 3. 真实发布与来源

- 测试 Store：[中文角色 API](https://47.116.195.229/store/api/v1/roles?locale=zh-CN)、[英文角色 API](https://47.116.195.229/store/api/v1/roles?locale=en)、[能力接口](https://47.116.195.229/store/api/v1/capabilities)。
- 当前 snapshot：`5f913d6bfb5437bc4bccc2cf512616ced49d050b9130c492832158a7a786d667`，sequence `2`，10 个角色、40 个本轮技能、版本均为 `1.0.0`。
- 兼容 `catalog.json` 保留原有 10 项，共 50 项；兼容 `roles.json` 只投影默认集合，不把可选技能变为预选。
- 11 个上游仓库，321 个固定 blob、6,108,136 字节已核验。来源 commit、目录、许可依据、仓库 stars 及采集时间保留；仓库热度不是单技能安装量。
- 技能目录包含 `AMBLELOFT-SOURCE.json`。数据分析插件的 `CONNECTORS.md` 调整为包内相对路径；systematic-debugging 的框架技能引用改为包内依赖文档；这些适配均有记录。
- 可选 Vercel React 技能的许可依据为上游 SKILL frontmatter 与 README；包中保留该原始声明，未伪造独立版权文本。
- Unix 安装会在内容摘要校验后恢复带 shebang 资源的可执行位；不会执行安装脚本或自动安装外部运行依赖。
- 签名私钥只在本地发布端，未上传服务器。`testOnly:false` 表示已完成本轮制品审核；部署目标仍是用户授权的测试服务器，不是生产发行。

## 4. 验证证据

证据归档：[/Users/gavin.fang/opensource/agent-flow/.state/workforce-expert-skills-20261027](/Users/gavin.fang/opensource/agent-flow/.state/workforce-expert-skills-20261027)。只归档公开源文件/制品、虚构任务、校验日志和截图，不复制模型配置、私钥、真实用户数据库或凭据。

| 层级 | 已执行与结果 | 证据 |
| --- | --- | --- |
| 源与包 | 40 包真实源码、许可/引用审阅；固定 blob、内容 SHA256、压缩/解压往返摘要与名称一致 | `sources/bundles-evidence.json`、`packages/*/AMBLELOFT-SOURCE.json`、`publication-review.json` |
| 单元与回归 | 最终 470 项：469 通过、0 失败、1 跳过；初次沙箱不允许监听端口，获得本机监听权限后重跑通过 | `expert-all-tests-final.txt`；`tests/expert-publisher.test.cjs`、`tests/workforce-preparation.test.cjs` |
| 构建 | TypeScript + Vite build 通过；仍有既有大 chunk 提示 | `expert-build-final.txt` |
| 公网 API | 13 组真实 HTTPS 检查通过：签名、文档篡改拒绝、中英/语言别名、分页、ETag、cursor 语言隔离、固定 release、离线缓存模拟 | `expert-remote-api.txt`、`tests/expert-store-live.cjs` |
| 公网宿主安装 | 十角色默认技能分别自动准备；全部可选制品单独验证；40 个真实包完成下载、校验、SQLite 保存和完整技能上下文加载 | `remote-trial/installation-evidence.json`、`expert-remote-install.txt` |
| 模型文本试跑 | 使用已授权 DeepSeek，十角色完成虚构业务目标；直接调用宿主生成的 roleInstructions，逐项记录审阅和修订 | `host-trial/model-results.initial.json`、`model-results.json`、`review-feedback.json` |
| 真实任务运行 | 使用实际 AgentRuntime → Codex RPC → DeepSeek，数据角色四项默认技能正文/摘要进入 thread/start；虚构汇总数据输出 4.0%，保留只读权限、无工具执行 | `host-trial/runtime-evidence.json`；本次使用本地隔离 Store 的同一固定制品，公网安装独立验证 |
| 实际 UI | 真实 React/App 组件与宿主服务、隔离 profile；查看/添加/安装、后台返回、取消一项后保存、无修改编辑、语言往返；浅/深色、活动栏/分组栏和窄窗口人工查看 | `employee-ready.png`、`zh-dark-classic.png`；不是生产用户 profile，也不是 Electron 打包版验证 |
| 样式审查 | Impeccable 检查结果空列表 | `expert-design-detect-final.json` |
| 测试部署 | Store 容器 healthy，server.py SHA256 与发布输入一致，备份存在；本轮只重启 Store 容器 | `expert-deployment-check.txt`、`deployment/` |

模型试跑与包验证分开：安装成功不代表任意业务交付正确。审阅仍记录文案冗长、接口错误码例子的细化、教程 header 示例及 SLO 口径等质量改进点。没有执行十角色产出的全部代码，也没有配置/执行这些技能所需的所有浏览器、MCP、云 CLI 或硬件工具。组合审核的通过范围为制品安装及默认上下文，模型试跑标记为 `completed-with-review-findings`。

## 5. AC 逐项覆盖

“已验证”仅指本行所述环境；“部分”不等于完整验收通过。

| AC | 状态与证据范围 |
| --- | --- |
| 01 | 部分：双语用途/角色推荐理由/usage API 与详情可见；多角色理由展示的逐张截图未齐 |
| 02 | 已验证：来源、author、license、仓库热度与采集日期保留，UI 展示固定来源；无虚构安装量 |
| 03 | 已验证：推荐/全部技能与独立导入，选择独立于已安装状态；实际 UI 取消不应用 |
| 04 | 部分：API 分页与跨语言 cursor、UI 跨页选择和取消已测；完整分类/20 项上限键盘矩阵未齐 |
| 05 | 部分：固定导入来源进入准备，真实本地目录和同名隔离有单测；全部 GitHub ref 输入失败 UI 路径未重测 |
| 06 | 部分：真实 40 包安装复用、零技能/停用不自动启用已有测试；资源删除后的完整修复集成待补 |
| 07 | 已验证：打开、切步骤、详情返回不持久化修改草稿；UI 与数据库测试 |
| 08 | 部分：真实修改、还原、失败调整候选有测试；所有旧草稿与进程重启路径未覆盖 |
| 09 | 已验证：无修改提交不产生作业、revision、时间戳更新或安装；单测及 UI |
| 10 | 已验证：安装前先持久受理；实际阶段进度、关闭后返回可查看 |
| 11 | 部分：注入安装失败，保留已成功包，重试复用有单测；逐类网络/兼容故障未全覆盖 |
| 12 | 已验证：新员工待完成、编辑失败旧配置有效；恢复调整不丢模板/语言/选择 |
| 13 | 部分：重复幂等键与不同内容冲突有测试；真实两个窗口与 IPC 响应丢失未全覆盖 |
| 14 | 已验证：准备期间旧配置 revision 更新触发 CAS 冲突，不覆盖其他窗口结果 |
| 15 | 部分：同名不同来源共存、共享复用、任务快照冻结有测试；多进程同包并发下载未验证 |
| 16 | 部分：持久事件、返回页面/刷新恢复可见；乱序/重复事件故障矩阵未齐 |
| 17 | 部分：重启状态恢复与重试测试使用持久状态模拟；没有逐阶段强杀进程测试 |
| 18 | 部分：合成的两个真实签名发布版本验证旧制品/固定 release 保留，默认变更要求角色升版；全部服务端历史分页矩阵未齐 |
| 19 | 部分：真实签名/摘要篡改拒绝、离线缓存模拟通过；撤回/过期/429/旧 API 的完整矩阵待补 |
| 20 | 未完成：本轮固定来源采集不等于完整 GitHub 发现分类和限流恢复后台 |
| 21 | 部分：公共读取不上传员工职责/资料；自定义角色空态与全部技能可用，本地语义匹配建议未做 |
| 22 | 部分：中英、深浅色、窄窗口、两种侧栏实际 UI 已查；200% 字号及全面读屏回归未做 |
| 23 | 未完整验证：只有 macOS；Windows 未执行 |
| 24 | 未验证：本轮未在 SSH/Docker 任务中运行默认技能或配置其外部工具 |
| 25 | 部分：保留旧来源/字段和保存激活兼容通路；全部历史版本迁移夹具未齐，未迁移用户数据 |
| 26 | 部分：源码默认可信来源及真实服务已测；打包应用未验证 |
| 27 | 部分：取消不应用、失败返回调整有单测；取消/应用全部时序和迟到事件 UI 注入未齐 |
| 28 | 已验证：十角色完整中英职责/输入/交付验收/方法/边界与技能关系；发布校验、真实 API 与角色详情 |
| 29 | 部分：固定引用、双语 ID、未解析包阻断、不可变版本有测试；完整所有畸形 fixture 待扩充 |
| 30 | 部分：中英、q 值、en-US/zh 别名、fr 拒绝已测；旧缺翻译与所有错误文案未全覆盖 |
| 31 | 部分：真实 ETag/304、跨语言 ETag 与 cursor 隔离、分页全部角色通过；代理缓存专项未做 |
| 32 | 已验证：实际中英来回切换保留员工语言、revision 与取消后的技能集合；新建保存 templateRef/definitionLocale |
| 33 | 部分：保留旧角色 ID 及旧 employee 表示，未强改旧员工；全部旧数据无损迁移待验证 |
| 34 | 已验证：实际 AgentRuntime/RPC 冻结完整职责和四项固定技能正文/摘要，权限未扩大；任务恢复冻结有单测 |
| 35 | 已验证：十角色真实自动安装；UI 只读查看不安装、添加时完整默认集合；数据角色四项不遗漏 |
| 36 | 部分：取消后换步、保存、刷新、换语言、再次编辑不恢复默认；同版本默认变更发布拒绝；复制/所有草稿恢复矩阵未齐 |
| 37 | 部分：十角色文本试跑 + 一次真实运行时任务，已核对正文注入和产出；不声称所有默认技能辅助脚本与外部环境均已实跑 |
| 38 | 部分：真实固定包、来源/许可、组合审核门禁、不可变版本已验证；全部专业成果质量与运行依赖组合仍需验收 |
| 39 | 已验证：API 卡片预览 3 项、详情 4 默认，宿主实际默认安装 4 项，UI 和任务上下文都不漏选 |
| 40 | 部分：usage 冻结、语义差异、语言切换/追溯元数据与旧快照有回归；全体旧版本迁移边界待补 |
| 41 | 部分：真实来源/摘要/固定版本/采集时间，源/制品/宿主文本任务分级记录；未验证平台和外部运行依赖不标通过 |

## 6. 部署、复现与回退

服务器路径 `/opt/ambleloft-store-lab`；备份 `/opt/ambleloft-store-lab/backups/expert-roles-20261027`。只替换 Store 的只读服务代码/发布目录并重启 `catalog`；容器仍监听 `127.0.0.1:18081`，由现有 Apache HTTPS `/store/` 提供公共读取。

收尾检查补齐了固定 release API 的运行要求与验证范围字段，使其与角色/技能详情一致，并重跑公网契约检查通过。该服务代码补丁另备份于 `backups/expert-release-metadata-20261027`；最终 `server.py` SHA256 为 `c25df8f02759a6e438aaef31d7d6a2645150d31c33234becb9df1a5305be0ef7`，归档为 `deployment/server.final.py`。

此次部署脚本与 bundle 保存在证据的 `deployment/`。脚本先验证旧目录保留和所有制品摘要，再备份，再复制不可变资源，最后替换索引（manifest 最后）。脚本故意拒绝覆盖已存在的同名备份，**不能原样重跑为下一次发布**。

复现命令入口与参数见 [Store README](../../store/README.md)。证据 `sources/` 保留固定 tree + blob，`packages/` 是实际制品输入，`skills.json` 已改为归档绝对路径。复现或续签必须使用新的独立输出目录/备份标识；不得把未审核候选或 `test-only` 快照上传公共目录。

当前目录最早过期时间为 **2026-11-10 12:34:38 UTC（北京时间 20:34:38）**；manifest/roles 为 13:09:02 UTC。须在最早时间前重新验证并签名发布，TLS 自动续期不会续签目录。不降低签名或过期检查，不配置新的自动采集/定时发布。

数据回退应将已审核的上一版内容发布为**新的更高 sequence**，并保留旧固定制品；不能覆盖同一版本或简单降低 manifest.sequence，宿主会拒绝回滚。服务代码紧急回退可恢复备份 server.py/compose；旧服务不具备新的专家 API，届时只能按兼容/离线能力运行，需明确暂时不可用状态。不要删除新员工仍引用的技能制品。

本轮没有生产发布、线上定时采集、生产数据迁移或操作系统打包发行。后续上线前须补齐上面的未验收项，尤其跨平台、远端、打包、故障恢复和发布后台。
