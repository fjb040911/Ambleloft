# 十个专家角色：默认技能组合与来源调研

日期：2026-10-27。状态：**推荐配置及固定技能制品已完成，测试 Store 已发布，宿主自动安装与默认技能上下文已验证。** 完整证据、模型质量评审和未验证环境见[实施记录](implementation-2026-10-27.md)。本文件保留选型依据，不直接修改既有用户员工配置。

配置基于官方角色替非专业用户完成专业选型：默认选中小而明确的技能组合，用户可直接沿用；专项能力作为可选补充。绑定的是具体 SKILL.md 所在目录，不整库安装。默认使用指任务相关时自动读取并遵循，不强制每项技能适用于每次任务，也不授予额外工具权限。当前实现为保证固定内容可追溯，在任务启动时冻结并注入所选技能正文及 usage；按需加载以减少上下文成本属于后续优化，不能把它误记为已经实现。

机器可读配置见 [推荐配置 JSON](examples/expert-role-skills.recommendations.json)，角色职责正文继续使用 [完整双语样例](examples/expert-roles.authoring.json)，对外字段见 [角色技能 API 增量契约](role-skills-api-v1.md)。三个文件分别表达选型、角色定义和正式接口，不将候选 JSON 当可安装响应。

## 1. 推荐配置

以下配置已解析为测试 Store 的固定发布物。包与上下文验证、文本模型试跑和完整外部工具执行分别记录；可选项不是被隐式安装的依赖。前端的 shadcn 技能默认带入，但只在项目采用该组件体系时使用，不要求所有项目改用 shadcn。

| 角色 | 默认技能（具体机器名） | 可选补充 |
| --- | --- | --- |
| 产品经理 | [create-prd](https://github.com/phuryn/pm-skills/blob/07b34f64ee828df08953f505b7f747aef85ae7c6/pm-execution/skills/create-prd/SKILL.md)；[user-stories](https://github.com/phuryn/pm-skills/blob/07b34f64ee828df08953f505b7f747aef85ae7c6/pm-execution/skills/user-stories/SKILL.md)；[prioritize-features](https://github.com/phuryn/pm-skills/blob/07b34f64ee828df08953f505b7f747aef85ae7c6/pm-product-discovery/skills/prioritize-features/SKILL.md) | [summarize-interview](https://github.com/phuryn/pm-skills/blob/07b34f64ee828df08953f505b7f747aef85ae7c6/pm-product-discovery/skills/summarize-interview/SKILL.md)；[outcome-roadmap](https://github.com/phuryn/pm-skills/blob/07b34f64ee828df08953f505b7f747aef85ae7c6/pm-execution/skills/outcome-roadmap/SKILL.md) |
| 架构师 | [architecture-patterns](https://github.com/wshobson/agents/blob/0874a27b17a22e2b7c2e2bcd725768e0803cad06/plugins/backend-development/skills/architecture-patterns/SKILL.md)；[api-design-principles](https://github.com/wshobson/agents/blob/0874a27b17a22e2b7c2e2bcd725768e0803cad06/plugins/backend-development/skills/api-design-principles/SKILL.md)；[architecture-decision-records](https://github.com/wshobson/agents/blob/0874a27b17a22e2b7c2e2bcd725768e0803cad06/plugins/documentation-generation/skills/architecture-decision-records/SKILL.md) | [database-migration](https://github.com/wshobson/agents/blob/0874a27b17a22e2b7c2e2bcd725768e0803cad06/plugins/framework-migration/skills/database-migration/SKILL.md) |
| Web UI 设计师 | [impeccable](https://github.com/pbakaus/impeccable/blob/d34c87e1a00989ae8dbdd7f6b30b70f23319e860/.agents/skills/impeccable/SKILL.md)；[responsive-design](https://github.com/wshobson/agents/blob/0874a27b17a22e2b7c2e2bcd725768e0803cad06/plugins/ui-design/skills/responsive-design/SKILL.md)；[wcag-audit-patterns](https://github.com/wshobson/agents/blob/0874a27b17a22e2b7c2e2bcd725768e0803cad06/plugins/accessibility-compliance/skills/wcag-audit-patterns/SKILL.md) | [design-taste-frontend](https://github.com/Leonxlnx/taste-skill/blob/12af471f627f866411b4bd785b19646d3672784c/skills/taste-skill/SKILL.md)；[shadcn](https://github.com/shadcn-ui/ui/blob/d094cd36caf871f2fde3e339b87aa43b9af5a7d0/skills/shadcn/SKILL.md) |
| 测试工程师 | [test-scenarios](https://github.com/phuryn/pm-skills/blob/07b34f64ee828df08953f505b7f747aef85ae7c6/pm-execution/skills/test-scenarios/SKILL.md)；[webapp-testing](https://github.com/anthropics/skills/blob/dbd4588f9e1033efb41dad4bef2f7947c8993d44/skills/webapp-testing/SKILL.md)；[verification-before-completion](https://github.com/obra/superpowers/blob/2ce8aa15d05bd57213e6f746f953aafb7ded7a8b/skills/verification-before-completion/SKILL.md) | [systematic-debugging](https://github.com/obra/superpowers/blob/2ce8aa15d05bd57213e6f746f953aafb7ded7a8b/skills/systematic-debugging/SKILL.md) |
| 文案专家 | [product-marketing](https://github.com/coreyhaines31/marketingskills/blob/17772c7a80b7b8c7a47af30f648374cd8bd8adc5/skills/product-marketing/SKILL.md)；[copywriting](https://github.com/coreyhaines31/marketingskills/blob/17772c7a80b7b8c7a47af30f648374cd8bd8adc5/skills/copywriting/SKILL.md)；[copy-editing](https://github.com/coreyhaines31/marketingskills/blob/17772c7a80b7b8c7a47af30f648374cd8bd8adc5/skills/copy-editing/SKILL.md) | [customer-research](https://github.com/coreyhaines31/marketingskills/blob/17772c7a80b7b8c7a47af30f648374cd8bd8adc5/skills/customer-research/SKILL.md) |
| 技术文档专家 | [documentation-writer](https://github.com/github/awesome-copilot/blob/d75b41863510272ed217a3074c7045202b96e93f/skills/documentation-writer/SKILL.md)；[openapi-spec-generation](https://github.com/wshobson/agents/blob/0874a27b17a22e2b7c2e2bcd725768e0803cad06/plugins/documentation-generation/skills/openapi-spec-generation/SKILL.md)；[changelog-automation](https://github.com/wshobson/agents/blob/0874a27b17a22e2b7c2e2bcd725768e0803cad06/plugins/documentation-generation/skills/changelog-automation/SKILL.md) | 暂不增加，避免堆叠 |
| 后端与集成工程师 | [api-design-principles](https://github.com/wshobson/agents/blob/0874a27b17a22e2b7c2e2bcd725768e0803cad06/plugins/backend-development/skills/api-design-principles/SKILL.md)；[error-handling-patterns](https://github.com/wshobson/agents/blob/0874a27b17a22e2b7c2e2bcd725768e0803cad06/plugins/developer-essentials/skills/error-handling-patterns/SKILL.md) | [nodejs-backend-patterns](https://github.com/wshobson/agents/blob/0874a27b17a22e2b7c2e2bcd725768e0803cad06/plugins/javascript-typescript/skills/nodejs-backend-patterns/SKILL.md)；[database-migration](https://github.com/wshobson/agents/blob/0874a27b17a22e2b7c2e2bcd725768e0803cad06/plugins/framework-migration/skills/database-migration/SKILL.md) |
| 前端工程师 | [web-component-design](https://github.com/wshobson/agents/blob/0874a27b17a22e2b7c2e2bcd725768e0803cad06/plugins/ui-design/skills/web-component-design/SKILL.md)；[shadcn](https://github.com/shadcn-ui/ui/blob/d094cd36caf871f2fde3e339b87aa43b9af5a7d0/skills/shadcn/SKILL.md)；[e2e-testing-patterns](https://github.com/wshobson/agents/blob/0874a27b17a22e2b7c2e2bcd725768e0803cad06/plugins/developer-essentials/skills/e2e-testing-patterns/SKILL.md) | [vercel-react-best-practices](https://github.com/vercel-labs/agent-skills/blob/6ec269328bc400712ee225a173a14b6b29128df7/skills/react-best-practices/SKILL.md) |
| 数据分析师 | [explore-data](https://github.com/anthropics/knowledge-work-plugins/blob/c75fda00ff0e41c8ee331ae312c8a07f1967653b/data/skills/explore-data/SKILL.md)；[validate-data](https://github.com/anthropics/knowledge-work-plugins/blob/c75fda00ff0e41c8ee331ae312c8a07f1967653b/data/skills/validate-data/SKILL.md)；[data-visualization](https://github.com/anthropics/knowledge-work-plugins/blob/c75fda00ff0e41c8ee331ae312c8a07f1967653b/data/skills/data-visualization/SKILL.md)；[statistical-analysis](https://github.com/anthropics/knowledge-work-plugins/blob/c75fda00ff0e41c8ee331ae312c8a07f1967653b/data/skills/statistical-analysis/SKILL.md) | [sql-queries](https://github.com/anthropics/knowledge-work-plugins/blob/c75fda00ff0e41c8ee331ae312c8a07f1967653b/data/skills/sql-queries/SKILL.md) |
| DevOps 工程师 | [deployment-pipeline-design](https://github.com/wshobson/agents/blob/0874a27b17a22e2b7c2e2bcd725768e0803cad06/plugins/cicd-automation/skills/deployment-pipeline-design/SKILL.md)；[incident-runbook-templates](https://github.com/wshobson/agents/blob/0874a27b17a22e2b7c2e2bcd725768e0803cad06/plugins/incident-response/skills/incident-runbook-templates/SKILL.md)；[slo-implementation](https://github.com/wshobson/agents/blob/0874a27b17a22e2b7c2e2bcd725768e0803cad06/plugins/observability-monitoring/skills/slo-implementation/SKILL.md) | [github-actions-templates](https://github.com/wshobson/agents/blob/0874a27b17a22e2b7c2e2bcd725768e0803cad06/plugins/cicd-automation/skills/github-actions-templates/SKILL.md)；[k8s-manifest-generator](https://github.com/wshobson/agents/blob/0874a27b17a22e2b7c2e2bcd725768e0803cad06/plugins/kubernetes-operations/skills/k8s-manifest-generator/SKILL.md) |

共 10 个角色、30 条默认绑定与 13 条可选绑定，复用 40 个不同技能候选。多角色可以引用同一固定制品；例如 API 设计对架构师强调跨模块契约，对后端工程师强调实现一致性，两者推荐理由不同。

## 2. 选型依据与组合边界

- 产品经理选 PM Skills 的需求文档、用户故事、优先级，不要求用户先学会选用哪个框架。访谈和路线图按具体工作增加。
- 架构师选架构模式、API 设计与 ADR；只定义职责的提示词不计作专业技能包。
- 设计师以 Impeccable 做主导审阅，响应式和无障碍补齐验收。Taste 作为新视觉探索的可选项；同一任务只采用一个主导视觉流程，保留已确认的设计约束。
- 测试工程师覆盖用例推导、真实浏览器执行、完成证据。独立采用 Superpowers 的 verification-before-completion，不把其整套编排或 brainstorming 审批流程默认塞进 Ambleloft。systematic-debugging 仍需核对引用的配套技能，未闭合依赖前不可发布为可用选项。
- 文案专家先整理定位与受众，再写作、编辑；不整套安装营销工具，也不把营销文案技能当通用技术文档技能。
- 技术文档使用 GitHub 的 documentation-writer 区分四类文档，搭配 OpenAPI 与变更记录。上游文档技能要求大纲确认；宿主须识别既有已批准方案，评估适配，不把已确认事项反复问用户。若改写上游指令，需保留来源、变更记录并生成新制品身份。
- 后端默认 API 与错误处理，语言、数据库方案按项目增加；前端默认组件组织、shadcn 与端到端，React 性能规则只用于 React/Next.js 项目。
- 数据分析优先本地文件探索、验证、图表和统计；连接数据仓库是运行时配置，不是安装角色必须拥有的账号。
- DevOps 默认流程、恢复手册与可靠性目标；GitHub Actions 和 Kubernetes 按实际技术栈选择，不默认部署生产。

这套默认组合不声称覆盖每个能力的全部细分场景：专门的压力/性能测试、Excel 文件交付和界面微文案仍需专项选型或试跑评估；不把通用说明当作已验证能力。用户自定义角色和移除全部技能仍允许，官方发布的默认组合则不能是空壳。

## 3. 可核对的来源与热度

下表为 GitHub 公共 API 的本次读数。Stars 属于整个仓库，不属于某个技能；不累加跨角色复用的仓库热度，也不用它证明质量、安全或效果。精确观测时间、commit、路径、SKILL.md 内容摘要在 JSON 中。当前仓库可变，后续安装必须使用审核后的固定制品。

| 仓库 | 本次 Stars | 许可证依据 | 固定提交 |
| --- | ---: | --- | --- |
| [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills) | 56,800 | MIT | [17772c7a80b7](https://github.com/coreyhaines31/marketingskills/commit/17772c7a80b7b8c7a47af30f648374cd8bd8adc5) |
| [phuryn/pm-skills](https://github.com/phuryn/pm-skills) | 27,420 | MIT | [07b34f64ee82](https://github.com/phuryn/pm-skills/commit/07b34f64ee828df08953f505b7f747aef85ae7c6) |
| [github/awesome-copilot](https://github.com/github/awesome-copilot) | 40,463 | MIT | [d75b41863510](https://github.com/github/awesome-copilot/commit/d75b41863510272ed217a3074c7045202b96e93f) |
| [anthropics/skills](https://github.com/anthropics/skills) | 184,123 | 按技能核对（见下） | [dbd4588f9e10](https://github.com/anthropics/skills/commit/dbd4588f9e1033efb41dad4bef2f7947c8993d44) |
| [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) | 33,088 | 按技能核对（见下） | [6ec269328bc4](https://github.com/vercel-labs/agent-skills/commit/6ec269328bc400712ee225a173a14b6b29128df7) |
| [anthropics/knowledge-work-plugins](https://github.com/anthropics/knowledge-work-plugins) | 33,338 | Apache-2.0 | [c75fda00ff0e](https://github.com/anthropics/knowledge-work-plugins/commit/c75fda00ff0e41c8ee331ae312c8a07f1967653b) |
| [wshobson/agents](https://github.com/wshobson/agents) | 41,861 | MIT | [0874a27b17a2](https://github.com/wshobson/agents/commit/0874a27b17a22e2b7c2e2bcd725768e0803cad06) |
| [obra/superpowers](https://github.com/obra/superpowers) | 305,906 | MIT | [2ce8aa15d05b](https://github.com/obra/superpowers/commit/2ce8aa15d05bd57213e6f746f953aafb7ded7a8b) |
| [pbakaus/impeccable](https://github.com/pbakaus/impeccable) | 89,844 | Apache-2.0 | [d34c87e1a009](https://github.com/pbakaus/impeccable/commit/d34c87e1a00989ae8dbdd7f6b30b70f23319e860) |
| [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill) | 103,333 | MIT | [12af471f627f](https://github.com/Leonxlnx/taste-skill/commit/12af471f627f866411b4bd785b19646d3672784c) |
| [shadcn-ui/ui](https://github.com/shadcn-ui/ui) | 126,663 | MIT | [d094cd36caf8](https://github.com/shadcn-ui/ui/commit/d094cd36caf871f2fde3e339b87aa43b9af5a7d0) |

许可检查按具体技能进行：Anthropic webapp-testing 有 Apache-2.0 文件；数据插件有独立 Apache-2.0 文件。Vercel react-best-practices 的 frontmatter 与仓库 README 声明 MIT，打包时仍须保留声明并完成分发审核。

没有选择 Anthropic docx/xlsx：本次固定版本声明 Proprietary，附带限制，不作为公开 Store 默认再分发候选。doc-coauthoring 的固定目录缺独立许可证，仓库只概述部分技能采用 Apache，暂以 GitHub documentation-writer 代替。这里记录候选筛选事实，不把其他技能的许可证推及整个仓库。

## 4. 需要解决的宿主适配

| 来源 | 已查到的具体依赖 | 发布前处理 |
| --- | --- | --- |
| Impeccable | 启动器可能在首次运行下载独立二进制 | 核对脚本、引擎版本与校验值；逐平台固定或封装资源，不能只冻结 SKILL.md |
| Taste v2 | Node、浏览器、参考数据及素材获取脚本；官方站仍标实验阶段 | 暂为可选；打包完整资源，核验浏览器与素材来源；不默认替换现有设计 |
| shadcn | CLI、组件文档、规则和脚本，源文件含 @latest 调用 | 技能版本与工具版本分开管理；固定或采用已批准的项目工具，不把 allowed-tools 当宿主授权 |
| Anthropic 数据插件 | 相对 ../../CONNECTORS.md 引用与 Cowork 连接器约定 | 保留资源闭包或明确适配并记录派生来源；先验证本地文件路径，无连接器不等于安装失败 |
| webapp-testing | Python、Playwright、浏览器和 with_server.py | 准备完整技能资源；运行前检查工具环境，真实执行测试后才标任务验证通过 |
| 工程/营销技能 | references/ 下的模板、规则和补充文档 | 完整打包相关资源与许可，不只保存主 SKILL.md |

选型阶段仅读取说明、目录树与许可；候选设计 JSON 继续保留 release=null、installable=false 等设计状态。实施阶段另行下载核验完整源文件、构建制品并生成签名发布目录；正式包摘要来自真实构建，不能使用单个 SKILL.md 的 SHA-256 替代。上表外部工具仍需在实际任务环境检查，安装与文本任务通过不代表它们全部执行通过。

## 5. 代表性验收任务

用户提示只描述业务目标，不点名 Skill；核对技能实际读取事件、固定内容身份和交付物。

| 角色 | 试跑任务 |
| --- | --- |
| 产品经理 | 围绕一个模糊功能产出范围、用户故事与验收，能指出尚无证据的假设。 |
| 架构师 | 讨论 model-router 与 api-gateway 边界，产出契约与有来源的决策记录。 |
| Web UI 设计师 | 审阅角色添加流程，覆盖空态、错误、390px 与键盘路径，不重做既有视觉体系。 |
| 测试工程师 | 测试员工提交失败和重试，提供真实浏览器路径、断言和未验证项。 |
| 文案专家 | 依据真实产品能力写双语首页文案，保留事实与愿景边界。 |
| 技术文档专家 | 编写三步差旅表单教程和 API 参考，核对示例、版本和错误路径。 |
| 后端与集成工程师 | 实现虚构差旅提交接口，验证校验、幂等与失败恢复。 |
| 前端工程师 | 按既有设计实现技能选择器，验证跨页选择、关闭恢复和窄窗口。 |
| 数据分析师 | 分析含缺失与重复值的虚构任务数据，输出可复现统计、图表与局限。 |
| DevOps 工程师 | 为测试 API 设计构建、发布、观测与回滚演练，默认不操作生产。 |

## 6. API 与部署衔接

阿里云测试 Store 沿用 https://47.116.195.229/store/ 来源，已部署 /store/api/v1 只读 API 及签名快照。旧客户端继续读兼容签名目录；新版从同一签名快照取得默认技能、推荐理由及适用信息，不能由客户端写死这张表。

已执行的工程顺序：选定固定源目录 → 审核完整资源/许可/运行依赖说明 → 构建真实固定包 → 宿主隔离 profile 与文本任务验证 → 生成角色/技能/推荐同快照签名文档 → 部署测试只读 API → 公网宿主重测。受控离线发布与公共读取分离；没有启动自动采集定时任务、生产发布或用户数据迁移。

后续验证已覆盖十角色、40 包真实安装、双语 API、默认选择、实际任务上下文和模型文本试跑。Windows、SSH/Docker、打包版及所有技能辅助工具实跑仍未验证，详见实施记录的逐项边界。
