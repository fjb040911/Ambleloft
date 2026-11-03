# 阿里云 Store：角色默认技能与使用信息 API 增量契约（API-05）

日期：2026-10-27。状态：**只读 API 已部署阿里云测试 Store，宿主接入已验证**；完整异常与平台矩阵尚未全部验收，见[实施记录](implementation-2026-10-27.md)。补充 [Store 架构](role-skills-architecture-v1.md)、[双语角色契约](expert-role-catalog-v1.md)及 [具体推荐配置](expert-role-skills-recommendations-v1.md)。可类型检查的完整字段见 [TypeScript 契约](examples/role-skills-api.contract.ts)。

2026-10-28 用户决定：产品尚未正式发布，不再为旧客户端设计兼容路径；本文历史兼容描述以此决定为准。现有用户选择及任务使用的固定版本、签名与撤回状态仍需正确处理。

## 1. 数据必须包含什么

角色 API 不能只返回岗位名称与职责。官方为普通用户选好的具体技能、默认选择、推荐理由与适用场景都来自可验证的服务端角色版本，客户端不另写一份推荐表。

| 数据 | 必须字段与含义 | 权威存储 |
| --- | --- | --- |
| 角色 | sourceId、id、version、双语 RoleContent、分类、publisher | 签名 roles 分片 |
| 角色—技能绑定 | binding id、精确 release、capabilityId、responsibilityIds、recommendationId、priority、defaultSelected | 签名 roles 分片 |
| 使用方式 | usage.mode=when-relevant、双语 when/whenNot：什么工作应读取、何时不适用 | 同一角色绑定内，随角色版本固定 |
| 推荐理由 | 对该角色有何价值、rank、reasonSource、审核信息与证据引用 | 签名 recommendations 分片 |
| 技能说明 | 机器名、双语名称/用途/详情、内容语言、author（上游作者/组织）、publisher（发布者）、许可、official/third-party | 签名 skills 分片 |
| 上游来源 | repository.url/directory/commit；每个固定制品保留真实来源 | 技能条目及制品来源记录 |
| 热度 | 仓库 stars、starsObservedAt、activityObservedAt；缺失为 null | 技能条目，按仓库显示，不冒充技能下载量 |
| 安装身份 | sourceId/listingId/version、packageDigest、artifactSha256、artifactPath/Size | 固定 release；不能只有 GitHub URL 或 main |
| 环境 | 声明支持的平台/架构、minHostVersion、runtimeRequirements | release；二进制、MCP、凭据、网络分别说明，不能含密钥或安装命令 |
| 验证情况 | sourceCheckedAt、packageVerifiedAt、hostChecks 中按平台/架构/local/SSH/Docker 记录通过、失败、未测 | 本次增量加入 SkillListing.release.validation；同 skills 分片签名 |
| 可信与语言上下文 | snapshotId、requestedLocale/localeSource、逐内容块 l10n、verification.documentIds | 响应 envelope；宿主还须独立验签 |

`validation` 是发布者的验证记录，不是客户端验签结果，不是操作系统沙箱或安全认证。安装来源可信与实际环境验证分别判断；只测过 macOS/local 就不能让 Windows、SSH/Docker 显示通过。角色组合的业务试跑证据保留在发布审核记录中，不公开私有项目和测试正文。

## 2. 对外读取接口

继续使用来源 `https://47.116.195.229/store/` 和路由 `/store/api/v1`；内容 schema v2 不等于 URL 改为 v2。接口及签名发布物已通过真实 HTTPS 和隔离宿主安装检查，具体证据见实施记录；未覆盖的运维与异常语义仍需逐项验证。

| 接口 | 本次明确的返回 |
| --- | --- |
| GET /capabilities | 原有版本/语言信息加 roleSkillBindingSchemaVersion:1、roleSkillDefaults:true、roleSkillUsage:true |
| GET /roles | 轻量卡片字段、skillCount、defaultSkillCount、最多 3 项 defaultSkillsPreview；预览不足 4 项时不能漏装第四项 |
| GET /roles/:roleId | 固定 roleVersion 的完整 RoleContent 与全部 skills（最多 20）；每项含 defaultSelected、用途、理由、适用/不适用、精确 release、上游与环境/验证情况 |
| GET /roles/:roleId/recommendations | 同一 roleVersion 的绑定集合分页，返回 RoleSkillProjection，不另建手填推荐或默认列表 |
| GET /skills、/skills/:listingId | 全部技能及详情；用途来自技能，角色理由仅在有具体角色关联时提供 |
| GET /releases/:listingId/:version | 固定制品身份、下载与运行要求，版本不存在不得回退 latest |
| GET /snapshots/:snapshotId/documents/:documentId | 不可变、原始双语签名分片 |

列表、详情和推荐都使用 sourceId、snapshotId 与固定版本；沿用原契约的 locale、cursor、limit 和分类筛选。详情技能完整返回，不依赖用户翻完推荐分页才能选齐默认项。defaultSkillCount、预览和投影 rank 均从同一签名关系派生，不能成为另一套可编辑真相。

公开接口只 GET/HEAD；候选采集、许可审查、推荐编辑、打包和签名发布在受控后台或 CLI。不得通过公开请求触发采集、安装或发布。

## 3. 新字段与签名归属

`RoleSkillBinding` 增加：

```ts
usage: {
  mode: 'when-relevant';
  when: Localized<string>;
  whenNot: Localized<string>;
}
```

每种语言 when 非空且最多 600 个 Unicode 码点，whenNot 最多 600；这是有界的用途描述，不是任意工具调用或绕过权限的命令。与职责、默认值、绑定版本一起签入 roles 分片，变化发布新 roleVersion。API 将 usage 作为整个块按角色语言规则投影，附 l10n，不即时用模型生成。

`SkillListing.release.validation` 增加真实检查记录。每条 hostCheck 的 evidenceId 只指公开可展示摘要或内部受控审计 ID，不能泄漏本地路径、任务正文或凭据；not-tested 的 checkedAt/evidenceId 为 null。角色详情展开这些字段时，verification.documentIds 必须覆盖角色、技能与推荐全部相关分片，不能只验角色标题。

API 使用一份完整角色与技能关联，`RoleSkillProjection` 的 release 必须与 listing.release、Recommendation.skill 完全一致。authoring SkillPlan、候选 candidateId、源文件摘要和 null release 不允许进入已发布接口。

## 4. 从 API 到员工、任务

1. 查看角色：展示默认技能及作用，可查详情；不安装、不建草稿。
2. 明确添加：先验证完整角色详情，复制 defaultSelected=true 的精确绑定和当前配置语言的 usage，记录模板版本、bindingId 与推荐来源。普通用户无需自行勾选才能继续。
3. 调整：所有选择都保留在个人草稿；刷新推荐不重置。可选技能只在用户选择后加入。导入技能与普通目录选择获得默认 when-relevant 语义，不自动冒充官方角色推荐。
4. 提交：按既有 prepareSubmission 固定 candidate，自动准备缺少的制品，成功才原子生效。
5. 任务：从员工有效配置及任务快照加载固定技能和 usage，不回查最新模板。要求相关工作前读取内容、依方法执行；允许记录不适用、缺依赖或未成功加载，不把可用清单当已使用证据。

EmployeeSkillReference 增加单语言 usage 和 selectionOrigin。usage 的实质修改影响工作行为，应进入 canonical dirty 和配置版本；只切 UI 语言不重翻。selectionOrigin 只作来源追踪，不能授予权限，也不独立造成业务 dirty。旧员工缺 usage 时保留正文与技能，使用已有 purpose 作 when、whenNot 为空，不重装或增加业务版本；若需宿主存储迁移，按原有幂等迁移方案执行。新建普通目录/导入项将已验证用途或解析预览用途复制为初始 when。

“默认使用”在宿主任务指令中明确，**不设计无条件 always 模式**；避免数据分析任务加载整套设计技能、非 React 项目被改成 React 或文案技能接管开发流程。

## 5. 发布前与失败状态

- 当前 [推荐配置 JSON](examples/expert-role-skills.recommendations.json) 是后台候选提案：来源固定到真实 commit，但 release=null、installable=false。它不能覆盖现有 roles.json。
- 新发布官方角色须有至少一项已核验默认制品，并完成完整资源闭包、许可、环境、组合冲突和代表性任务检查。测试来源先验证，正式发布后对外读取；不把未经试跑的组合标为可用专家。
- 缺资源、同名冲突、不可再分发、未闭合的跨技能依赖都在发布阶段处理。runtimeRequirements 不是给任意网络脚本放行的机制。
- 旧服务不声明默认/usage 能力时，宿主走明确的旧目录适配；不能猜默认、全选新接口条目或静默换成最新版本。旧目录已有显式技能声明按原版本兼容，不迁移现有员工到新组合。
- 新增字段仍服从完整内容块语言回退、locale 分页/ETag、签名缓存到期与撤回校验，不改变此前接口约束。

## 6. 实施与验收衔接

W01 固化本增量类型与拒绝用例；W02 按实际候选制品完成十角色；W03/W04 发布与读取同快照关系；W05/W09 默认集合从服务端初始化；W06/W07 固定 usage 与制品；W11 做不点名技能的代表性任务。新增 AC-39～AC-41 追踪 API 展开与全量默认集合、usage 快照、来源/许可证/平台验证状态。

部署时保留旧静态签名接口，以隔离环境先验证 capabilities、双语分页、下载和失败恢复，再安排实际服务部署。生产发布、定时采集和日常用户数据迁移均不在本轮设计操作中执行。

## 7. 专家创建中的宿主 AI 命令（2026-10-28）

这些命令是桌面宿主内部 IPC，不属于公共 Store API。用户主动请求时，`suggestExpertSkills` 接收 requestId、draftId、draftRevision、可选 snapshotId、providerId、model 和 locale；宿主先验签并从公开技能分片本地召回最多 30 个已发布候选，再把必要角色字段和候选摘要发送给所选模型。角色字段限于专业方向、职责、交付和工作方法；不向 Store 查询发送这些自由文本。结果包含 requestId、draftRevision、snapshotId、inputDigest、ruleVersion、status、items 和 unmatchedCapabilities。匹配理由与 `high` / `additional` 是模型建议，官方角色审核理由仍来自签名角色绑定。

模型只能返回候选的 id、固定 version、reason、match 和 responsibility；宿主检查未知、重复、版本不符和不可用状态，并在返回后重新验证快照和角色输入。`resolveExpertSkillSuggestion` 在用户单项采用时再次核验当前草稿和同一有效快照，返回固定来源的技能声明；失效或撤回时拒绝，不能回退到同名最新版本。`cancelExpertSkillSuggestion` 取消该请求并使对应结果失效；超时或过期响应不可应用。没有可信候选、模型或网络时仍可手工搜索、导入和编辑。建议结果是临时的，重启后需要重新请求，不自动安装或修改有效专家。

角色分析使用仅在专家创建页面显式调用的宿主规则 `expert-role-assistance-v1`；技能匹配使用 `expert-skill-matching-v1`。规则版本用于追踪，可信来源、版本与状态由宿主独立校验，不交给模型判断。当前实现与真实服务、隔离测试的边界见[实施记录](implementation-2026-10-28.md)。
