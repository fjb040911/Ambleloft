# 角色推荐技能与员工提交准备：技术设计 v1

日期：2026-10-26。状态：**设计契约，尚未实现或部署**。本次不运行 GitHub 抓取、不创建定时任务、不改变用户员工配置。产品定义见 [产品设计](role-skills-product-v1.md)，开发与验收逐项见 [交付检查表](role-skills-delivery-checklist.md)。后续明确用户要求优先于旧设计中的“仅保存 / 保存并激活”双入口。

## 1. 现状与改造边界（ARCH-01）

核对 `PRODUCT.md`、外部 `../agent-flow/designs/agent-workforce/{decision-log,requirements}.md`，以及以下实现：

| 当前实现 | 已有能力 | 本次必要差异 |
| --- | --- | --- |
| `core/catalog-store/catalog.cjs` | Ed25519 签名 v1 目录、来源校验、哈希、平台兼容；单目录最多 200 项、2 MiB | 增加独立 v2 发布集合与索引；不能直接把全量发现结果塞进 v1 |
| `scripts/publish-{store,roles}.cjs` | 内容哈希包发布、角色引用已发布技能检查、原子替换文件 | 统一 roles/skills/recommendations 发布快照，保留旧客户端产物 |
| `store/deploy/apache-store.conf` | `/store/` 只读 GET/HEAD，后端仅静态 catalog.json、roles.json、health、包 | 以下 HTTP API、持久查询索引、发现作业均为新增服务，不宣称现网已支持 |
| `core/catalog-store/service.cjs` | 安装日志、摘要校验、全局复用、同名冲突 | 现有 install 按 listing 返回既有安装、重新读最新目录；需改为精确 release 解析，不得错装新版 |
| `core/workforce/{service,contract}.cjs` | 声明 store/import/installed，导入冻结，save 后 activate，运行快照 | 提交准备成功前不得覆盖员工；统一新 prepareSubmission 流程 |
| `core/workforce/role-drafts.cjs` | 打开编辑即持久 createDraft；step 变化也保存 | 引入基线与语义 dirty，无修改不产生草稿或版本 |
| `src/workforce-types.ts`、`electron/{main,preload}.cjs` | save/activate/roles/import IPC、变更通知 | 增加结构化契约与持久 job/events；只刷新 snapshot 不足以恢复过程 |

既有来源 ID `curated`、技能 ID `roles.architecture` 是内部真实条目标识，不等于 GitHub 热门技能；页面标题、来源、推荐理由必须分字段。此功能不引入角色权限、不上传私人员工数据、不复制项目。

## 2. 系统职责与可信边界（ARCH-02）

- **Store 发布端**维护官方角色、分类、角色—技能关系、推荐理由和可安装版本；GitHub 发现只是候选，发布产物通过校验后签名。官方自研与官方精选第三方分开标记。
- **Store 公共读 API**只查询已发布快照。API 不接收员工职责、项目路径、员工 ID、聊天或安装清单。用户自由文本搜索在下载的公开索引本地执行；不能偷偷把职责作为 q 上传。
- **宿主 CatalogClient**获取、验签、缓存快照；按公开角色/分类 ID 查询，私有职责与公开能力标签在本地匹配。用户确认增加模型个性化建议：仅在用户主动请求时调用用户选择的模型服务，发送所提示的必要角色字段及可信候选摘要，不变成公共 Store 的推荐 POST；详见[运营设计](store-skill-recommendation-operations-v1.md)。
- **Workforce SubmissionService**冻结提交、维护作业、核对技能、调用现有包校验/全局库、最终原子应用员工配置。
- **Renderer**展示推荐、勾选、导入和实际准备状态；不直接访问下载目标、签名密钥、任意磁盘路径或执行第三方代码。

## 3. 版本化数据模型（ARCH-03）

下列类型为新契约；字符串 ID 使用现有合法 ID 规则，摘要为完整 64 位 SHA-256，ISO 时间均 UTC，数组/字符串须有界。沿用每员工最多 20 项技能。新数据的展示与存储语言统一 `zh-CN/en`，旧 `zh/en` 只在兼容适配层转换；详见[经典角色与双语契约](expert-role-catalog-v1.md)。字段未列入 allowlist 时拒绝写入。

```ts
type SkillIdentity = {sourceId: string; listingId: string};
type ReleaseRef = SkillIdentity & {
  version: string; packageDigest: string; artifactSha256: string;
};
type Recommendation = {
  id: string; sourceId: string; roleId: string; roleVersion: string;
  skill: ReleaseRef; rank: number; categoryIds: string[];
  reason: Localized<string>;
  reasonSource: 'editorial' | 'model-assisted-reviewed';
  evidenceRefs: string[]; reviewedAt: string; reviewedBy: string;
};
type SkillListing = SkillIdentity & {
  entityName: string; title: Localized<string>; summary: Localized<string>;
  description: Localized<string>; defaultLocale: Locale; contentLanguages: Locale[]; publisher: string; license: string;
  origin: 'official' | 'third-party'; author: string; categoryIds: string[];
  capabilityIds: string[]; repository?: {
    url: string; directory: string; commit: string;
    stars: number | null; starsObservedAt: string | null;
    activityObservedAt: string | null;
  };
  release: ReleaseRef & {
    artifactPath: string; artifactSize: number;
    platforms: ('win32'|'darwin'|'linux')[];
    architectures: ('x64'|'arm64')[]; minHostVersion: string;
    runtimeRequirements: RuntimeRequirement[];
    validation: SkillValidationSummary; // 精确字段及逐平台证据见 role-skills-api-v1.md
  };
};
// RoleContent / RoleSkillBinding 的完整定义见 expert-role-catalog-v1.md。
type Locale = 'zh-CN' | 'en';
type Localized<T> = Record<Locale,T>;
type Role = {
  sourceId: string; id: string; version: string; publisher: string;
  status: 'published'; defaultLocale: Locale;
  content: Localized<RoleContent>;
  categoryIds: string[]; skills: RoleSkillBinding[];
};
```

`RoleContent` 包含名称、摘要、领域、带稳定 ID 的职责、必需输入、交付物及验收条件、工作方法、职责边界。`RoleSkillBinding` 包含真实 release、能力分类、职责关联、推荐 ID、优先级及 `defaultSelected:boolean`。2026-10-27 用户决定覆盖旧默认不选中规则：官方角色提供审核后的默认组合（true）与可选补充（false）。详情见[字段与双语协议](expert-role-catalog-v1.md)。新发布结构替代旧 RoleFields 字符串结构；旧员工迁移不得丢正文或因 UI 语言变化生成草稿。角色版本发布后不可改写；双语职责、绑定技能、绑定理由或默认选择变化均发布新角色版本。推荐关系是多对多，同技能对不同角色理由不同。分类记录 `{id,parentId:null|string,title:Localized<string>,description:Localized<string>}` 必须无环，ID 稳定，变更保留重定向。`RuntimeRequirement={kind:'binary'|'mcp'|'credential'|'network',id,description:Localized<string>,scope:'host'|'task-environment',required:boolean}` 只声明需求，不含凭据或可自动执行命令。

**热度必须保留证据范围**：stars 是仓库指标，不能称为目录中某一技能的 stars；monorepo 用仓库+子目录识别候选，多个候选不累加同一仓库 stars。缺失数据用 null，不填 0；展示采集时间。推荐理由描述适配职责的可验证能力，不能凭 stars 声称安全、官方出品或效果最佳。原因支持模型辅助起草但必须经过发布端校验/编辑审核；此为内容发布流程，不新增用户逐次安装审批。

2026-10-27 具体候选来源、默认组合和 API 展开字段见[选型方案](expert-role-skills-recommendations-v1.md)及[API 增量契约](role-skills-api-v1.md)。绑定新增双语 usage，release 新增真实 validation 摘要，均受对应分片签名约束。员工复制单语言 usage 并保留到任务快照，实质变化参与 canonical；selectionOrigin 仅作来源追溯。角色详情需返回全部默认绑定，不能将卡片预览或推荐第一页当完整集合。

### 同一发布集合

新增签名 manifest：`{schemaVersion:2,sourceId,snapshotId,sequence,generatedAt,expiresAt,documents:[{documentId,path,sha256,size,kind}]}`，envelope 复用 `{keyId,payload,signature}` Ed25519 机制。`snapshotId` 为整个规范化 manifest 内容（不含自身 snapshotId）SHA-256；sequence 单调递增，防回退。manifest 固定角色、技能列表、推荐关系、分类、release 列表及公开搜索索引各分片的哈希，各分片显式 kind/schemaVersion；角色新结构使用 roles schemaVersion=2。客户端只消费验签 manifest 下可校验的内容。

发布流程：收集候选 → 标准化和去重 → 包与许可证/来源检查 → 编辑推荐关系 → 构建所有分片 → 交叉引用验证 → 上传不可变文件 → 上传 manifest → 原子切换 current 指针。任何推荐引用必须解析到同 snapshot 内的精确 release。旧 snapshot 和被员工引用的 release 不因新版发布而删除；撤回以独立最新签名状态表表达，不改写历史快照。

## 4. Store API v1（API-01）

Base：`/store/api/v1`。这是 **HTTP API 版本**，其签名内容 schemaVersion=2，避免与旧 catalog schema 混淆。以下均 GET，HEAD 支持资源元信息。公开接口无写权限。以下表为基础路由；[API-04](expert-role-catalog-v1.md#33-接口更新api-04)补齐 sourceId、单语言投影、双语 schema、locale 协商及错误，发生字段冲突时以 API-04 为准。

| 路径 | 参数 | 返回数据 |
| --- | --- | --- |
| `/capabilities` | 无 | apiVersions、manifestSchemaVersions、pagination、支持的locale |
| `/snapshots/current` | sourceId | 签名 manifest envelope，ETag 为内容哈希 |
| `/snapshots/:snapshotId` | sourceId | 固定签名 manifest |
| `/roles` | sourceId,snapshotId,categoryId?,locale?,cursor?,limit? | 角色分页 |
| `/roles/:roleId` | sourceId,snapshotId,version,locale? | 固定角色详情 |
| `/roles/:roleId/recommendations` | sourceId,snapshotId,roleVersion,categoryId?,locale?,cursor?,limit? | Recommendation + SkillListing 摘要，不返回安装状态 |
| `/skills` | sourceId,snapshotId,categoryId?,capabilityId?,locale?,cursor?,limit?,sort? | 已发布技能页；sort=relevance或recent或repository-popularity |
| `/skills/:listingId` | sourceId,snapshotId,version,locale? | 技能详情和精确 release |
| `/categories` | sourceId,snapshotId,locale? | 分类树 |
| `/releases/:listingId/:version` | sourceId,snapshotId | 固定下载身份、摘要、兼容性 |
| `/release-status` | sourceId | 最新签名状态清单：release key→published/yanked/revoked + reason/observedAt/expiresAt |
| `/snapshots/:snapshotId/documents/:documentId` | 无 | manifest 绑定的不可变分片，用于验签与离线本地搜索 |

所有分页返回 `{schemaVersion:1,itemSchemaVersion:2,snapshotId,requestedLocale,localeSource,items,nextCursor,verification}`。`verification` 引用 manifest 中的签名分片，客户端下载并核验后确认返回条目属于该分片；未核验 API 排序仅作建议，任何安装身份均从已验证分片解析。不得认为 HTTPS 分页响应天然等同签名目录。默认 limit=20、最大50；cursor 是服务器生成的不透明值，绑定 snapshot、所有过滤参数、排序和稳定尾键，客户端不得自己偏移。排序并列用 `sourceId/listingId` 稳定打破。翻页时 snapshot 固定；更换筛选从第一页开始。未知版本不回退 latest。

API 返回单语言文本及 requestedLocale / 分内容块 l10n，签名分片保存 `zh-CN/en` 双语源数据；详见[详情响应示例](expert-role-catalog-v1.md#33-接口更新api-04)。展开多个对象时 verification.documentIds 引用所有参与的分片，并按 manifest 哈希全部核验，替代早期只引用单个分片的示例。

### 缓存、失败与权限（API-02）

- current/capabilities/status 使用 ETag、If-None-Match、304；current 缓存5分钟，status最多5分钟，验签过期优先于 HTTP cache。不可变分片一年 immutable；客户端以 source+snapshot+query+locale 存缓存。分片不能让新技能绕过最新撤回状态。
- 旧缓存可继续浏览，明确更新时间/离线；新准备安装必须拥有未过期签名发布信息与撤回状态；无法取得则待重试，不把离线当作成功。旧员工既有任务不因推荐服务离线中断；已确定 revoked 的包不新启任务。
- 统一错误 `{error:{code,message,retryable,requestId,details?}}`；400 `INVALID_ARGUMENT/INVALID_CURSOR`，404 `NOT_FOUND/RELEASE_NOT_FOUND`，409 `SNAPSHOT_MISMATCH`，410 `SNAPSHOT_EXPIRED/RELEASE_REVOKED`，429 `RATE_LIMITED`（Retry-After），503 `CATALOG_UNAVAILABLE`。未知错误显示可定位 requestId，不泄露服务器路径。snapshot过期不静默换引用，需要重新解析所选项并显示真实变更。
- API 404 或 capabilities 缺失时降级已有 `roles.json/catalog.json`：验签后本地筛选，理由缺失则不杜撰；v1只能安装它实际包含的精确版本，找不到报 RELEASE_NOT_FOUND，不安装 latest。旧客户端继续使用原路径，不向旧文件塞 schemaVersion=2。
- 后台抓取/分类/发布 CLI 与公共读服务隔离；GitHub token、签名私钥不进入客户端或公开镜像。发布账号仅写暂存/发布目录，公共进程只读；若引入后台HTTP，独立内网认证+最小权限，不通过公开GET触发作业。部署变化单列后续工程，不在本轮执行。

## 5. 候选发现与定期刷新（ARCH-04）

2026-10-28 用户确认按人工精选 → AI 匹配与辅助更新 → 扩大发现的阶段实施；推荐理由、热度口径及审核、签名和隐私要求见[Store 技能推荐运营设计](store-skill-recommendation-operations-v1.md)。下方周期为可调整建议，不表示已部署。

Store 后台增加持久 `DiscoveryRun` 与 `Candidate`：来源repo+directory、resolvedCommit、observedAt、发现规则版本、分类建议、许可证、包检测结果、去重键、发布状态。定期任务建议每日增量、每周全量复核，最终频率是可配置运营参数，本轮不创建自动化。GitHub请求按ETag增量、限流Retry-After退避，有上次成功检查点；失败不清空线上推荐。

抓取只分析仓库内容，不执行 SKILL.md 指令或 setup；识别 SKILL.md 的候选包，保留根目录/子目录准确范围。候选状态 discovered→validated→reviewed→published/rejected；停止维护、许可证缺失或支持平台不符不能因热度高直接上架。分类、目录热度更新构成新 snapshot；代码内容变化构成新 release；已绑定角色的职责、翻译、技能、理由、优先级变更需新 roleVersion，保持相同角色版本不可变。已发布 release 同版本不同摘要拒绝。内容变更与纯推荐排序更新分别记录，不能触发员工自动更新。

## 6. 宿主提交与进度契约（API-03）

公开 renderer API 仅经授权 IPC；沿用 profile/window authorize，不新增远程执行入口。新增方法：

```ts
prepareSubmission(input: {
  commandId: string; employeeId?: string; expectedEmployeeRevision?: number;
  draftId?: string; expectedDraftRevision?: number; value: RoleDefinitionV2;
}): Promise<{unchanged:true;employeeId:string;revision:number} | {jobId:string}>;
preparation(input:{jobId:string}): Promise<PreparationJob>;
preparationEvents(input:{jobId:string;afterSeq:number;limit?:number}):
  Promise<{events:PreparationEvent[];nextSeq:number;hasMore:boolean}>;
retryPreparation(input:{jobId:string;commandId:string;expectedJobRevision:number}):
  Promise<{jobId:string}>;
cancelPreparation(input:{jobId:string;commandId:string;expectedJobRevision:number}):
  Promise<{state:'cancelled'|'succeeded';appliedRevision?:number}>;
repairEmployeeSkills(input:{employeeId:string;expectedRevision:number;commandId:string}):
  Promise<{jobId:string}>; // 只修复有效定义的包，不增加配置 revision
// onPreparationChanged({jobId,lastSeq}) 为唤醒信号，不是事件真相来源。
```

`RoleDefinitionV2` 按[模板到员工规则](expert-role-catalog-v1.md#4-从角色模板到个人员工role-03)扩展为结构化职责/交付/方法/边界，并记录 definitionLocale 与 templateRef；旧字段通过无损适配兼容。技能 source 使用 `store:{sourceId,listingId,version,snapshotId,packageDigest,artifactSha256}` 或 `import:{importId,packageDigest}`，旧 installed 仅迁移兼容。label/purpose 为展示不作身份；自由文本不得包含执行授权。提交端重新解析可信发布/本地导入记录，不能相信 renderer 给的摘要或下载URL。

```ts
type PreparationJob = {
  schemaVersion:2; id:string; kind:'configuration'|'repair'; commandId:string; requestFingerprint:string;
  revision:number; employeeId:string; expectedEmployeeRevision:number|null;
  draftId:string|null; expectedDraftRevision:number|null;
  candidate:RoleDefinitionV2; candidateDigest:string;
  state:'queued'|'checking'|'preparing'|'applying'|'succeeded'|
        'failed'|'interrupted'|'conflict'|'cancelled';
  steps:Array<{key:string;label:string;releaseRef?:ReleaseRef;
    state:'pending'|'checking'|'downloading'|'validating'|'installing'|
          'ready'|'failed';
    bytesReceived?:number;bytesTotal?:number;
    reused?:boolean;error?:{code:string;message:string;retryable:boolean}} >;
  lastSeq:number;createdAt:string;updatedAt:string;appliedRevision?:number;
};
type PreparationError = {code:string;message:string;retryable:boolean};
type PreparationEvent = {jobId:string;seq:number;at:string} & (
  | {type:'state';payload:{state:PreparationJob['state'];jobRevision:number}}
  | {type:'step';stepKey:string;payload:{state:PreparationJob['steps'][number]['state'];
      reused?:boolean;error?:PreparationError}}
  | {type:'progress';stepKey:string;payload:{bytesReceived:number;bytesTotal?:number}}
  | {type:'error';stepKey?:string;payload:PreparationError}
  | {type:'applied';payload:{employeeId:string;employeeRevision:number;
      candidateDigest:string;kind:'configuration'|'repair'}}
);
```

契约约束：编辑无语义差异时 `draftId/expectedDraftRevision` 可同时省略，服务端依据 `employeeId/expectedEmployeeRevision/value` 做 canonical 比较并返回 unchanged；不得为了调用 API 创建空草稿。编辑有差异或新建提交时，两字段必须同时提供且匹配现有草稿，否则返回 `DRAFT_REQUIRED`；只提供一项返回 `INVALID_ARGUMENT`。repair 作业从有效员工读取 candidate，不接收自由定义，draft 字段为 null；它与 configuration 共享事件结构，但 applied.kind=repair，employeeRevision 保持原值。进度字节为非负整数，bytesTotal 有值时 bytesReceived 不得大于它；同阶段进度单调，未知总量省略字段。

只展示真实 bytesTotal 下的下载百分比；校验/安装只显示阶段，整体显示“技能已就绪 n/m”，m=0 显示“正在保存配置”。复用项直接 ready；reused 是内部事实，UI无需区分“原已安装”。错误项仍计入分母但不计入就绪数；步骤全ready仍需applying成功才报告提交完成。

每次状态更新及事件在同一数据库事务保存；进度采样最多每250ms或每1MiB，持久状态与事件序号仍一致。原有 database `writeSetting` 能存完整状态，可先在串行 mutation 中一次写入 jobs+events+employee 实现小规模原子性；大规模迁移表时必须事务，不先发事件后持久化。get/replay 默认100最大500条，afterSeq不能为负；超过保留事件窗口返回 `EVENT_CURSOR_EXPIRED`，客户端重新拿 snapshot+lastSeq 后接续。保留未完成作业全事件，完成后保留30天最近事件与最终摘要，应用完成幂等记录长期保留。

Renderer先拿job快照，再从lastSeq回放；订阅丢包时按序补齐，按(jobId,seq)去重。离开页面不取消，列表显示准备状态；重新打开从持久状态恢复。新建时保留 pending 创建记录/草稿，不将未就绪候选冒充正式员工；员工编辑中显示“更改准备中”，原员工照常使用。

## 7. 事务、安装、并发与恢复（ARCH-05）

1. 校验 profile、输入上限、草稿/员工 revision 和语义差异。无变化立即返回 unchanged，不安装、不增版本、不产生job。dirty draft才允许提交；无草稿且未改动由编辑器直接退出。
2. 将候选、精确依赖、输入 fingerprint 和 commandId 持久冻结后返回jobId，工作不能等模型或网络响应才出现反馈。commandId作用域为profile；同commandId+同fingerprint返回同job，异内容报 `IDEMPOTENCY_CONFLICT`。每员工最多一个未完成提交；第二窗口不同提交报 `EMPLOYEE_PREPARATION_BUSY`。
3. 检查全部技能身份、内容摘要、平台兼容和撤回状态。检查可并行，安装按独立包锁处理。同名不是复用证据。已存在但被用户修改的安装不覆盖；从可信包创建另一内容版本。
4. 缺失包先下载到暂存，限流限大小（沿用50MiB/1000文件，SKILL.md既有大小约束需统一为200000字节），拒绝符号链接、越界解包和硬链接；验 artifactSha256 → 解包校验 → packageDigest → 原子移动全局不可变内容目录。不得执行第三方setup脚本。
5. 所有包就绪后进入applying，再次校验兼容、撤回状态与候选固定引用；CAS检查员工revision、草稿revision及candidateDigest。事务内写新员工revision+技能绑定、已应用command记录，清除**对应版本**草稿，标记job succeeded及 applied事件。任何步骤失败不覆盖原员工，不清除更新后的草稿。
6. CAS冲突标记conflict，保留候选和已安装包，回编辑器合并；不得无限重试自动覆盖。删除员工/放弃草稿会使其未应用job失效，明确终态；不能后台再次复活它。

### 全局共享版本，不能以名字静默覆盖

现状全局库以name去重，无法满足两个员工固定不同版本。目标为共享内容寻址包库 `global-skills/packages/<packageDigest>/`，身份索引 `sourceId/listingId/version/digest`，员工只存引用；**不是每员工复制私有技能**。全局“当前版本”可作为一般聊天默认，员工/任务解析必须使用固定引用，不随默认版本切换。

同源同版本不同digest拒绝 `IMMUTABLE_RELEASE_CONFLICT`；同源不同版本可以并存。同name不同来源在全局可有不同identity，但**同一个员工选择两项同name**时拒绝 `SKILL_NAME_COLLISION`，显示两项来源让用户调整；不偷偷加后缀造成内容内部引用失效。多个员工分别引用同名不同来源时，任务选择器按身份映射，不能按name找第一项。这需要 `electron/skills.cjs`、运行时prepare与全局库管理适配并验收后上线；未完成此改造的阶段必须明确报版本冲突，不声称端到端完成。

下载锁用artifactSha256，安装锁用packageDigest；身份映射更新锁用sourceId/listingId/version。锁记录带owner/lease并支持崩溃恢复，同一包多个job订阅同一次传输、各自拥有状态；一个job失败不得取消其他引用者。安装原子性使用临时目录+rename+数据库journal，启动校验未完成journal，不能只凭文件存在视为ready。GC只清理无员工、草稿、job、运行快照引用的内容，移除勾选不卸载共享包。

跨任务：已启动会话保留职责、技能正文和资源版本的快照；后续聊天原任务不悄悄切新版本。新增任务读已应用employee revision。保留旧包直到所有运行引用释放，禁止在应用新配置时停用旧任务依赖。全局禁用/移除的既有管理权限不能被普通“保存员工”绕过；如旧禁用是用户明确阻止使用，显示 `SKILL_DISABLED_BY_POLICY` 及到管理入口，不能悄悄重新启用。

### 失败与重启

成功包无需回滚删除，因为可能被其他员工使用；重试仅检查/准备失败或未完成项，已成功项验证digest后复用，不能重复下载。retry操作创建新attempt但沿用同冻结candidate；改变技能选择应创建新提交，旧job不可被改写。

重启后把未完成checking/preparing标记interrupted，恢复展示；用户“继续准备”后从持久checkpoint恢复，不重用已过期发布状态。applying崩溃先查applied command记录：已提交则恢复succeeded，未提交则重新校验CAS，避免产生第二员工或两次版本增长。UI离开不会中断作业；应用退出不承诺安装继续，重启给出真实中断状态。

宿主错误补充：`DRAFT_CONFLICT`、`EMPLOYEE_CONFLICT`、`IMPORT_CHANGED_OR_MISSING`、`PACKAGE_INTEGRITY`、`PLATFORM_UNSUPPORTED`、`DISK_FULL`、`DOWNLOAD_FAILED`、`SKILL_NAME_COLLISION`、`SKILL_DISABLED_BY_POLICY`。每项有retryable和恢复动作；非重试类错误引导返回调整，不统一“重试”死循环。

## 8. 导入来源与环境边界（ARCH-06）

保留现有 `importLocal/importRepository` 的预览冻结，不在勾选时安装。GitHub解析出repo+directory+commit，预览与提交使用同一冻结包；本地选择通过系统dialog授权，复制到宿主受控暂存后计算摘要，提交不追随可变路径。来源内容变化要重新预览/添加，不能换包不换digest。导入身份基于导入记录和digest，与Store同名不自动合并为“官方”。原路径只保存在本地详情，不上传Store；凭据从现有凭据设施读取，不进入provenance/日志。临时预览未被草稿引用可定期清理，正式引用依GC规则保留。

包安装成功表示技能内容在宿主可用；二进制、外部账号、MCP连接、远端环境依赖不是下载包即可满足。已声明且可静态验证为不兼容的平台在提交时阻断；需任务环境才能判断的需求显示“运行时检查”，任务启动前验证。不得把“包已就绪”宣传为“远端所有工具已配置”。

Windows/macOS必须覆盖路径规范、大小写同名、文件占用、原子rename与kill恢复；包identity不采用本地文件路径或大小写不稳定名字。SSH/Docker中仍在宿主共享库准备；任务执行遵循现有技能文本与资源安全传递/适配，宿主绝对路径不可直接传给远端工具。需资源但现有远端适配不支持时明确 `REMOTE_SKILL_RESOURCE_UNSUPPORTED`，不暗中上传整库或扩大项目权限。能力检查不得自动运行第三方setup或索要与当前任务无关凭据。

## 9. 草稿与迁移（ARCH-07）

编辑器初次只读employee生成baseDefinition/baseRevision，step/打开详情/滚动记录为view state，不是内容dirty。第一次语义变更才createDraft；自动保存只在语义变化时触发。canonical比较包括规范化文本、排序稳定的技能身份/固定版本，排除updatedAt、展示label本地化、step、临时key及推荐排序；不把正文内部空白任意折叠。skills为集合，反复勾选恢复原集合等价；工作方法正文换行保留意义。

回退到base完全相等时，以CAS清除当前草稿；其他窗口更新过则不能删除它。返回/未修改保存无版本增长、无自动安装。单纯浏览角色模板不生成草稿。用户明确点击“新增员工 / 添加为我的员工 / 复制员工”后可以持久保留创建草稿，即使尚未填写也便于继续；这属于用户明确发起的创建意图。编辑已有员工则必须首次实质内容变化才生成草稿，不能因进入编辑或切换步骤产生。真实旧草稿继续恢复，不能因切换步骤被覆盖。

迁移版本 `workforce.v2`（实际键名由实现统一）：先备份原持久值，事务一次迁移，标记migrationVersion。旧employee保持id/revision/status；现有ready映射摘要可证明则导入共享identity，证明不了保留记录并在下一提交检查，绝不静默换源。旧source.kind=installed转legacy identity绑定现有revision+digest，不重新拉取同名网络技能。旧编辑草稿只有employeeRevision仍匹配且canonical内容完全相等才自动清理；基线无法还原或有真实内容的保留，不以时间猜测。旧未完成激活记录保留为legacy interrupted，可重试走新准备流程；迁移不自动激活/下载。先上线兼容读和job存储，再切换UI；旧IPC save/activate仅兼容已知legacy调用，不允许绕过新员工提交的CAS与原子语义。

## 10. 分阶段实现及验收（ARCH-08）

1. **契约与夹具**：v2 schema、稳定身份、canonical dirty、快照交叉引用、结构化错误；写示例和兼容读测试，保持旧发布可用。
2. **Store能力**：候选管道、推荐编辑/发布、签名集合、GET API、固定版本解析、权限隔离和缓存；发布独立测试环境并验签，不改公网即可先用fixture联调。
3. **共享库与宿主**：全局多版本/引用、journal/锁/GC、prepareSubmission持久状态和CAS、进度replay与迁移。原有任务默认行为回归。
4. **UI**：推荐/全部/导入与统一已选集合，提交进度、失败重试、离开返回、dirty草稿；去除安装状态页签和双提交按钮。
5. **集成验收**：真实Store下载+本地/GitHub导入+跨平台，完整提交成功/失败/恢复/旧任务快照；完成前不得标称功能已交付。

必须覆盖以下反例测试，并在交付检查表逐项附证据：

- 推荐页翻到第二页恰逢发布新版，结果不混snapshot；推荐旧version仍可精确下载，撤回或签名失效阻断。
- q/职责/项目路径/员工ID均未出现在Store请求、日志、telemetry；仓库stars不误标成单技能热度。
- 无更改打开/返回/提交/切换步骤不生成草稿、job、版本；修改后恢复原值；两个窗口真实修改不得被另一个清理。
- 提交返回立即有job；慢网下载真实bytes；未知总量无假百分比；离开/漏事件/重启能恢复同一作业。
- 三技能两成功一失败：旧配置可用，重试只补失败项；新建失败不会成为正式可用员工。
- 两员工同时安装相同包只传输一次；不同版本并存；不同来源同名在同员工内明确冲突；已有本地修改不覆盖。
- 最后一包完成后employee或draft被另一窗口修改，CAS拒绝应用；applying前后崩溃都只生成一个应用版本。
- Windows文件锁/大小写、macOS路径、磁盘不足、坏zip、digest错、symlink/越界、超过限额均能恢复且无目录污染。
- 已运行任务保留旧职责和技能/资源，提交不改变其权限；SSH/Docker只把可用包视为宿主准备，不跳过环境验证。
- v1目录回退、离线浏览、旧草稿迁移、原activate兼容、撤回状态不可用时错误提示符合设计。


### 补充一致性约束（ARCH-09）

- **返回调整与取消竞态**：准备中选择“返回调整技能”先调用cancelPreparation，主进程串行判定并持久取消应用资格，再允许编辑新候选；同job的下载可供其他job继续，不删除成功共享包。取消赢过应用锁则job终态cancelled，之后所有worker回调不得应用；应用已完成则返回succeeded及appliedRevision，编辑器加载此新基线再修改。迟到事件按jobId/候选摘要隔离，不覆盖新表单。重复cancel command幂等。离开页面与取消不同，普通离开保持后台运行。
- **无变更但包被外部移除**：未修改提交仍返回unchanged；技能缺失显示独立“恢复准备”动作，通过 `repairEmployeeSkills({employeeId,expectedRevision,commandId})` 对原有效定义建 repair 类型作业，完成不增加员工配置版本，只更新可用性。repair与编辑提交共享员工互斥和包锁；发生revision变更则旧repair不能宣告新配置就绪。
- **历史发布有效性**：历史snapshot过期仍可读取验签；下载旧release需要当前未过期签名发布授权覆盖该精确身份/摘要（当前manifest的release索引应保留历史已发布版本）和新鲜撤回状态。引用snapshot保存推荐来源，安装授权可由新manifest续期但不能改version/hash。yanked禁止新绑定/新安装，已有有效任务可继续；revoked禁止新加载且现有任务下次受控执行点按既有任务安全策略报告，不以更新推荐名义静默替换。
- **个性化本地理由**：公开Recommendation.reason为编辑理由；客户端按私有职责匹配时另加本地`localMatchReason`与`reasonSource:'local-rule'`（不写回Store），没有证据则仅显示技能用途，不伪造官方背书。公开GET筛选仅使用公开ID，不上传用户搜索词或自由文本。
- **环境配置**：第三方MCP凭据等仅在实际使用相关能力时按现有配置流程提示，不把它们变成保存员工的统一前置条件；静态包平台明确不兼容仍阻断该技能包的准备。

## 11. 官方默认组合与任务使用（ARCH-10，2026-10-27）

角色提供专业选型而不是让普通用户从空技能列表开始。默认绑定是模板的版本化业务数据，运行时使用来自个人员工的固定技能引用，不能每次读取最新模板覆盖用户配置。

1. **发布**：新官方专家角色至少有一项 `defaultSelected=true` 的真实固定 release。后台审核记录关联角色版本、精确制品、职责覆盖、许可、宿主兼容、组合冲突及代表性任务验证证据；缺项不能发布为就绪专家。记录属于发布审核，不把用户业务资料放入公共分片。默认标记与绑定一样参与签名，改默认值需新 roleVersion；旧签名目录和旧员工兼容读取，不补写或重新安装。
2. **初始化**：明确从官方模板添加员工时，先核验角色/技能/推荐同快照内容，再一次性复制完整正文与 defaultSelected=true 的固定引用。不按 priority、已安装状态或客户端独立推荐算法推导默认集合。创建草稿持久化后，以其当前集合为准；取消项不得被重新打开、分页、换语言或刷新恢复。编辑、复制员工只使用个人集合，模板更换造成覆盖时展示差异由用户明确采用。
3. **准备**：默认项和用户补充项使用同一 prepareSubmission 流程；无需逐项安装确认，全成功后原子生效。已禁用策略、不兼容平台等明确报告，不自动启用或剔除。所有项目授权和凭据仍沿用现有规则。
4. **任务上下文**：prepare 固定员工 revision 与技能身份/摘要/资源快照，在任务入口自动提供技能适用说明及读取入口；在职责指令中要求“执行相关工作前，优先读取并遵循已配置技能，无需用户再次指定”。通过现有技能加载机制按任务适用性读取正文和所需资源，而不是只传名称，也不无条件将所有技能全文塞入上下文。技能内容不能扩大工具或项目权限。
5. **使用证据**：复用任务审计链，区分“配置中包含”“内容已提供/读取”“实际执行与结果验证”。记录精确技能身份、内容摘要及加载/工具事件引用；不记录模型私有思考。宿主注入正文或读取工具实际返回内容才算加载；仅列清单或模型自称使用不算。无法加载、缺运行依赖或不适用的情况如实反馈，不能标记已使用。
6. **验收**：每个默认组合选代表性任务，用户提示只描述业务目标，不点名 Skill。通过真实上下文/读取事件、工具证据和可检查交付物核对技能要求是否落实；同时测试不相关任务、技能移除、资源缺失与旧任务版本。mock 只验证传递机制；模型实跑单独记录服务、环境和结果，不承诺提示词保证模型必然遵循。端到端标准见 AC-35～AC-38。
