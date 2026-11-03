# 经典专家角色、技能结构与双语 API 设计 v1

日期：2026-10-26。状态：**设计更新，未实现、未发布 Store 数据**。依据用户要求补充经典专家角色，重点明确职责、技能列表及中英文 API。本文补充[产品设计](role-skills-product-v1.md)和[技术架构](role-skills-architecture-v1.md)，本节双语契约替代原架构中含糊的 `zh-CN/en → zh/en` 新数据约定；旧数据只在适配层兼容。实施状态在[验收清单](role-skills-delivery-checklist.md)追踪。

2026-10-27 修订：依据用户澄清，官方角色必须提供经过验证、默认选中的技能组合，替普通用户完成专业选型。本文与样例已覆盖旧“不预选”规则；尚未完成真实制品绑定与任务验证，不代表可安装或已发布。

同日具体选型与接口补充见[十角色推荐配置](expert-role-skills-recommendations-v1.md)、[候选关联 JSON](examples/expert-role-skills.recommendations.json)和[角色技能 API 增量](role-skills-api-v1.md)。已核实真实仓库、技能目录和固定源提交；制品、许可分发审核及宿主实跑仍待完成，不将候选源提交当成已发行 release。

## 1. 首批角色及边界（ROLE-01）

推荐首批 10 个经典角色。用户明确要求产品经理、架构师、Web UI 设计师、测试工程师及文案文档专家；文案与技术文档拆分，另补后端集成、前端、数据分析和 DevOps。后续可扩展安全评审、用户研究和项目交付经理，暂不增加模板以免职责重叠。

| 稳定 ID | 中文名 / 英文名 | 定位 | 重点技能需求 |
| --- | --- | --- | --- |
| amble.product | 产品经理 / Product Manager | 用户问题、范围、优先级、验收 | 需求规划与验收；用户研究；优先级与路线图 |
| amble.architecture | 架构师 / Software Architect | 系统边界、契约、质量属性和演进 | 架构分析；接口与状态机；迁移兼容 |
| amble.web-ui | Web UI 设计师 / Web UI Designer | 信息结构、交互、视觉和设计交付 | 交互评估；视觉与组件系统；无障碍与响应式 |
| amble.qa | 测试工程师 / QA Engineer | 风险、验证、缺陷、回归与验收证据 | 测试设计；自动化与端到端；性能诊断 |
| amble.copy | 文案专家 / Copywriting Specialist | 受众、价值表达、语气和传播内容 | 文案创作；编辑校对；界面微文案 |
| amble.tutorial | 技术文档专家 / Technical Documentation Specialist | 准确知识、可执行教程、API 与操作文档 | 技术写作；文档校验与来源；文档排版 |
| amble.integration | 后端与集成工程师 / Backend and Integration Engineer | 服务、数据、外部集成及可靠性 | 后端实现；接口集成；数据库迁移 |
| amble.frontend | 前端工程师 / Frontend Engineer | 将设计实现为实际可用界面 | 组件与状态；浏览器测试；Web 性能 |
| amble.data | 数据分析师 / Data Analyst | 指标、数据质量、分析、图表和解释 | 数据清洗分析；可视化；电子表格 |
| amble.devops | DevOps 工程师 / DevOps Engineer | 构建发布、观测、运行恢复 | CI/CD；可观测性；回滚与恢复 |

现有七个角色保留 ID，新标题与职责发布为新版本。`amble.web-ui` 从工程倾向明确为设计职责，由新增 `amble.frontend` 承担实现；`amble.tutorial` 扩展为技术文档专家。**旧模板版本及用户员工不自动改名或换职责**。在详情提供版本与用途，不给已有员工强制迁移角色。

协作交接：产品经理给问题与验收，架构师给技术契约，设计师给交互和状态，前后端给实现与验证，测试给验收证据，文案和文档负责不同读者的表达，数据与 DevOps 提供分析和运行支持。这是职责分工，不构成自动执行、生产部署或项目访问授权。

## 2. 核心字段结构（ROLE-02）

角色模板、推荐关系、实际技能制品、个人员工分开存储。职责必须是可执行的工作范围，不写“你是世界顶级专家”等无验收含义的人设。模板不绑定模型。

### 2.1 已发布角色（权威内容）

```ts
type Locale = 'zh-CN' | 'en';
type Localized<T> = Record<Locale, T>;
type RoleContent = {
  name: string;                     // 人类可读角色名
  summary: string;                  // 一句话用途
  domain: string;                   // 专业领域展示文本
  responsibilities: Array<{id: string; text: string}>;
  requiredInputs: string[];
  deliverables: Array<{
    id: string; name: string; acceptanceCriteria: string[];
  }>;
  workingMethods: string[];
  boundaries: string[];             // 职责边界，不是系统权限配置
};
type RoleSkillBinding = {
  id: string;                       // 角色内稳定关系 ID
  capabilityId: string;             // 跨语言、跨角色能力分类
  recommendationId: string;         // 对应精确角色版本的推荐理由
  release: ReleaseRef;              // sourceId/listingId/version/两种摘要
  priority: 'core' | 'recommended';
  responsibilityIds: string[];      // 对应 responsibilities[].id
  defaultSelected: boolean;         // 官方基础组合为 true，可选补充为 false
  usage: {
    mode: 'when-relevant';
    when: Localized<string>;
    whenNot: Localized<string>;
  }; // 对该角色何时使用；有界用途说明，不授予执行权限
};
type PublishedRole = {
  sourceId: string; id: string; version: string; publisher: string;
  status: 'published'; defaultLocale: Locale;
  categoryIds: string[];
  content: Localized<RoleContent>;
  skills: RoleSkillBinding[];
};
```

- **职责**：`responsibilities` 为主字段，逐条明确负责什么；输入、交付、方法和边界补全执行条件。中英文责任项 ID 和交付项 ID 必须一致，不能只翻译角色名称。
- **技能**：`skills` 是实际可解析技能列表，不是关键词字符串。技能名称、用途、作者、许可证来自同快照的 SkillListing；理由来自 Recommendation。角色不重复保存这些文案，以免翻译和版本漂移。
- `core` 表示与核心职责高度相关，影响推荐排序/说明，**不表示强制安装、不可取消或自动授予权限**。`defaultSelected` 独立定义官方审核的默认组合；每个新发布的官方专家角色至少有一项真实默认技能，用户无需逐项选择即可沿用。可选补充设为 false；客户端不得仅按 priority 推导选择。复制或编辑个人员工保留用户原有选择，不受模板默认值影响。
- 默认组合需有任务适配、许可证、宿主兼容、组合冲突检查及代表性任务验证记录，不能仅凭名称或仓库 Stars 入选。多项职责可以由同一真实技能覆盖，不按“三项能力”强凑三个安装包；以完整覆盖主要工作为准。
- Recommendation 增加 `sourceId`（角色所属 Store 来源），身份为 sourceId+roleId+roleVersion+id；其 skill 与 binding.release 必须完全一致。角色 skills 与推荐页同一关系源生成，不保留另一套手填 recommendationIds。
- 角色 ID、技能 ID、责任 ID、分类 ID、版本、平台枚举及摘要不翻译。相同 roleId 的中文与英文不是两个角色，也不是两份技能安装。
- 建议边界：名称 1–80 字符、summary 1–240、domain 1–120；职责 1–12 项、每项 1–1200；输入 0–12、方法 1–12、边界 1–12，每项 1–1200；交付 1–12 项、名称 1–120、每项验收 1–8 条且每条 1–1200；技能 0–20；推荐理由每语言 1–600。按 Unicode 码点计数，校验去除首尾空白后非空；不能无提示截断正文。
- 发布失败：重复 ID、责任引用不存在、双语条目 ID 不一致、未解析制品、同名技能冲突、超过限制、空职责/翻译、官方专家角色无真实默认技能或缺少组合验证记录均阻断，返回字段路径。新加字段用 schema 版本演进，不允许客户端任意扩展命令或权限。

### 2.2 编写阶段的技能需求，不冒充已发布技能

[双语角色样例](examples/expert-roles.authoring.json)包含 10 个完整角色和 30 项技能设计，结构为：

```ts
type SkillPlan = {
  id: string; capabilityId: string; name: Localized<string>;
  priority: 'core' | 'recommended'; responsibilityIds: string[];
  reason: Localized<string>; defaultSelected: boolean;
  resolution: {state:'unresolved'} |
              {state:'resolved';release:ReleaseRef};
};
type AuthoringRole = Omit<PublishedRole, 'status'|'skills'> & {
  status:'draft'; skillPlans:SkillPlan[];
};
```

样例顶层 `kind=expert-role-authoring-fixture`、`installable=false`、`status=design-only`；`schemaVersion=1` 仅指此编写夹具格式，**不是公共角色 schema，也不是现有 Store roles.json**。样例 version 1.0.0 是目标版本占位，不宣称已发行。

2026-10-27 样例将核心能力计划暂列默认组合（true），补充能力为可选（false），仅表达编写意图。发布人员在选定真实制品和验证组合后显式确定最终值，不从 priority 自动生成；所有 unresolved 仍阻断发布，true 不构成可安装依据。

`capabilityId` 是技能需求分类，不能拿它直接调用安装 API。发布人员为每项选择经过核验的真实技能，冻结 release，生成 RoleSkillBinding 和 Recommendation；多项需求可合并到一个技能，但理由需覆盖所关联职责。一项需求需多个技能时拆成不同 binding。没有可靠技能时保留编写草稿；若从首发移除未解决需求，需要编辑明确更新范围，不能生成空包/假摘要。

现有 `roles.product / roles.architecture / roles.web-ui / roles.integration / roles.copy / roles.tutorial / roles.qa` 可作为待核对的工作法候选，不能因名称匹配就自动当成这 30 项能力的完整实现。2026-10-26 初稿未调查热门项目；2026-10-27 已补充[真实来源调研](expert-role-skills-recommendations-v1.md)，其中初步来源核查与发布/安装验证分开记录。

## 3. 双语源数据与查询协议（I18N-01）

### 3.1 唯一规范

新签名角色/技能/分类/推荐分片统一 `zh-CN` 与 `en` 键。角色为 `content:{"zh-CN":RoleContent,"en":RoleContent}`；技能 title/summary/description、分类 title/description、Recommendation.reason、RuntimeRequirement.description 同样为 Localized。旧 `zh/en`、`labelEn/purposeEn` 只由旧目录适配器转换，禁止新 API 混用这几套格式。

官方首批角色及其绑定技能的用户可见说明、角色推荐理由均要求双语完整后发布。技能代码、原始 README、品牌名、标识符不要求翻译；不要把中文技能全文伪称为英文版技能。`contentLanguages`（包内容实际语言）是 SkillListing 独立枚举字段，可为 `['zh-CN']` 或 `['en']` 或两者，与 UI 展示语言无关，不因语言切换下载另一个包。

公共 API 提供**单语言投影**，签名分片保留双语原文。接口中不混用 `name/nameEn` 或同时塞两套语言到每条列表；发布工具在离线源文件编辑双语，普通 GET 不提供修改入口。

### 3.2 语言解析与回退

1. `locale` 查询参数最高优先级。仅接受 `zh-CN/en`，兼容输入别名 `zh→zh-CN`、`en-US/en-GB→en`，响应一律规范化。显式不支持值（如 `fr`、`zh-TW`）返回 400 `UNSUPPORTED_LOCALE`，不擅自把繁体当简体。
2. 参数省略时，按 `Accept-Language` 的 q 顺序匹配支持项/上述别名；无法匹配或没有头时用来源 defaultLocale（首批 zh-CN）。响应记录来源 `query/header/default`。头部协商到默认不冒充内容翻译缺失。
3. 内容回退顺序为 requestedLocale → 条目 defaultLocale → en → zh-CN，去重。角色、技能用各自 defaultLocale，分类/推荐理由/运行需求继承所属来源 defaultLocale。按**整个内容块**回退，不拼接半中半英职责。若一个语言块存在但缺必填字段，视为无效而非完整；官方新发布必须在发布校验时拦住，回退主要服务兼容旧条目。
4. 每个角色 content、技能展示块、推荐理由和运行需求说明分别携带 `{resolvedLocale,fallback}`；响应顶层携带 `{requestedLocale,localeSource}`。页面整体中文、某第三方技能描述英文时可就地显示“原文：English”，不能给全页一个错误的统一 resolvedLocale。两种内容均不存在返回 `CONTENT_UNAVAILABLE`，不得静默删掉技能选择或造文案。
5. 双语翻译只改文字，不改变责任 ID 集、交付 ID 集、技能、排序、版本、平台支持或错误码。排序使用 rank+稳定身份，不用翻译后的名称作为分页尾键。

### 3.3 接口更新（API-04）

继续使用 `/store/api/v1`，不另建中文/英文 API。签名 manifest schemaVersion 仍为2；它绑定的角色文档显式 `kind:'roles',schemaVersion:2`，避免与 legacy roles.json 混淆；其他分片同样声明 kind 与 schemaVersion，capabilities 按 kind 宣告支持的文档版本。

| 接口 | 补齐内容 |
| --- | --- |
| GET /capabilities | supportedLocales:['zh-CN','en']、defaultLocale:'zh-CN'、localeAliases、documentSchemaVersions:{roles:[2],skills:[2],recommendations:[2],categories:[2]}、roleProjectionSchemaVersion:2；默认组合增量加 roleSkillBindingSchemaVersion:1、roleSkillDefaults:true、roleSkillUsage:true |
| GET /roles | sourceId、snapshotId、categoryId?、locale?、cursor?、limit?；返回固定身份、版本、name/summary/domain 投影、技能数、分类及逐条 l10n。列表不发送全部长职责 |
| GET /roles/:roleId | sourceId、snapshotId、version、locale?；返回完整 RoleContent 投影与 `skills`，每项展开真实技能摘要、推荐理由、角色职责关联与精确 release |
| GET /roles/:roleId/recommendations | sourceId、snapshotId、roleVersion、locale? 等原分页参数；返回相同角色版本的绑定关系与理由，和详情一致，不引入另外的排序/推荐真相 |
| GET /skills、/skills/:listingId、/categories | 均明确 sourceId、snapshotId、locale?；文本单语言投影，各内容块有 l10n；非语言字段不变 |
| GET /releases/:listingId/:version | 身份、摘要、URL 和平台字段保持语言无关；接口说明文字通过技能详情获取，不用 locale 选择不同安装包 |
| GET /snapshots/:snapshotId/documents/:documentId | 根据 snapshot 确定 sourceId，仍是不可变原始双语分片，不做本地化替换、不设置虚假的 Content-Language |

所有查询的 sourceId 必须与 snapshot 绑定来源一致；ID 为来源内唯一，不仅靠角色名查询。详情响应 envelope schemaVersion=2；分页 envelope 维持 schemaVersion=1，并加 `itemSchemaVersion=2`，items 使用本文类型，顶层添加 requestedLocale/localeSource。capabilities 的新能力缺失则由兼容适配器消费旧签名文件，不能试读新投影为旧 RoleFields。

完整角色详情投影示例（**结构示意，不是实际发布记录**；`${...}` 仅表示已验证真实内容，示例不允许作为安装 fixture）：

```json
{
  "schemaVersion": 2,
  "snapshotId": "${verifiedSnapshotId}",
  "requestedLocale": "en",
  "localeSource": "query",
  "item": {
    "sourceId": "curated", "id": "amble.product", "version": "1.0.0",
    "publisher": "Ambleloft", "status": "published", "categoryIds": ["product"],
    "l10n": {"resolvedLocale":"en","fallback":false},
    "content": {
      "name":"Product Manager",
      "summary":"Turn user problems into scoped, testable product plans.",
      "domain":"Software products",
      "responsibilities":[{"id":"r1","text":"Identify target users, scenarios and problems; distinguish evidence, assumptions and open questions."}],
      "requiredInputs":["Business goals and user feedback"],
      "deliverables":[{"id":"d1","name":"Requirements and user stories","acceptanceCriteria":["Each requirement links to a user problem, scope and priority."]}],
      "workingMethods":["Gather evidence before proposing options and trade-offs."],
      "boundaries":["Do not invent user research or business data."]
    },
    "skills":[{
      "id":"s1", "capabilityId":"product.requirements", "priority":"core",
      "responsibilityIds":["r1"], "defaultSelected":true,
      "usage":{"mode":"when-relevant","when":"Use before drafting product requirements.","whenNot":"Skip for unrelated implementation-only work.","l10n":{"resolvedLocale":"en","fallback":false}},
      "recommendationId":"${verifiedRecommendationId}",
      "release":{"sourceId":"curated","listingId":"${verifiedListingId}","version":"${verifiedVersion}","packageDigest":"${verifiedPackageDigest}","artifactSha256":"${verifiedArtifactSha256}"},
      "listing":{"title":"${verifiedEnglishSkillTitle}","summary":"${verifiedEnglishSkillPurpose}","contentLanguages":["en"],"l10n":{"resolvedLocale":"en","fallback":false}},
      "recommendation":{"reason":"Connect problems, scope and acceptance to reduce handoff gaps.","reasonSource":"editorial","l10n":{"resolvedLocale":"en","fallback":false}}
    }]
  },
  "verification":{"documentIds":["roles-01","skills-01","recommendations-01"]}
}
```

中文查询同一身份返回 `requestedLocale:'zh-CN'` 与中文 content/理由；sourceId、id、version、责任/交付 ID、release、顺序全部一致。真实完整双语正文见样例文件，不以这个缩写示例覆盖全文。上例 listing 仅为摘要；2026-10-27 的完整默认技能计数、来源、环境、validation 和 usage 投影以[可检查的完整类型](examples/role-skills-api.contract.ts)为准，不能把此缩写示例作为完整响应 fixture。

### 3.4 验签、缓存、搜索、错误

- 先校验 manifest 及角色、技能、推荐分片，再在宿主投影；网络 API 只是读取便利。接口返回的翻译必须与已验签源内容及解析规则一致，不由 API/模型即时改写。多分片展开使用 `verification.documentIds`，每个 ID 在 manifest 中取得 sha256/size 并核对；替代旧单 documentId 示例，不能只验角色而漏验技能/理由。
- ETag 针对 source+snapshot+过滤+排序+规范 locale+投影版本，不能让英文 If-None-Match 命中中文返回304。JSON 仅使用 UTF-8。可本地化的响应统一 `Vary: Accept-Language`，即使显式 query 也保持缓存规则一致；URL query 自然区分 locale，缓存键另外纳入规范化语言。
- locale 绑定分页 cursor，换语言从第一页重新取；已选集合以 ReleaseRef 为键独立保留。不同 locale 的旧 cursor 返回400 INVALID_CURSOR。使用相同 snapshot 和过滤条件时，分页顺序与成员不因语言变化。
- 私有搜索在本地对双语公开索引匹配，中文界面也能搜 Product Manager，去重为同一角色；返回按请求语言显示。匹配结果没有翻译时按上述整块回退。公共 API 不接收员工职责等私有 q。
- 错误保留稳定 code、requestId、retryable、字段路径；API message 按协商语言返回并附 l10n，客户端优先用本地 code 文案。400 UNSUPPORTED_LOCALE 错误使用默认语言并给 supportedLocales；内容缺失503 CONTENT_UNAVAILABLE。错误详情不含本地路径或私人员工正文。

## 4. 从角色模板到个人员工（ROLE-03）

```ts
type RoleDefinitionV2 = {
  schemaVersion: 2;
  definitionLocale: Locale;
  content: RoleContent; // 单份用户可编辑配置，不是两份互相覆盖的译文
  templateRef?: {sourceId:string;roleId:string;version:string;snapshotId:string;locale:Locale};
  skills: EmployeeSkillReference[];
};
type EmployeeSkillReference = {
  name: string; label: string; purpose: string; // name 为技能机器名；后两者为展示缓存
  source: {kind:'store';sourceId:string;listingId:string;version:string;snapshotId:string;
           packageDigest:string;artifactSha256:string} |
          {kind:'import';importId:string;packageDigest:string};
  usage: {mode:'when-relevant';when:string;whenNot:string};
  selectionOrigin: {
    kind:'template-default'|'user-selected'|'imported'|'legacy';
    templateBindingId?:string;recommendationId?:string;roleVersion?:string;
  };
};
```

宿主沿用 employee/draft 自身的 ID、revision 等外层元数据，不混入模板内容；现有扩展业务字段迁移时保留到明确的旧版兼容记录，不直接丢弃。legacy installed 身份按原架构的迁移方案兼容读取，不是新建提交可任选的来源。运行时对 name 与来源包真实机器名核验，label/purpose 缓存不作为身份或 dirty 差异依据。


- “查看详情”跟随界面语言；“添加为我的员工”明确当前配置语言 `definitionLocale`，一次性复制该语言完整职责、交付、方法和边界，以及已验证模板中 defaultSelected=true 的固定技能引用，记录 templateRef={sourceId,roleId,version,snapshotId,locale}。默认组合只在显式采用模板的新建起点初始化；恢复草稿、换语言、刷新、编辑或复制员工不能重新套用。详情展示默认技能与可选补充，查看不创建草稿、不安装。
- RoleDefinitionV2 的目标字段采用 RoleContent 的结构，加 `definitionLocale`、templateRef? 和用户已选的技能引用。用户可以改职责、删除或替换技能，不再保持模板实时绑定。运行时按固定顺序生成结构化职责上下文，并自动提供已选技能的精确版本与适用说明，要求相关工作前读取并遵循，不只注入角色名称或让用户再次点名技能。实际加载记录与任务结果按 ARCH-10 验证。
- UI 语言、员工配置语言、用户当前任务的回复语言分开。切换 UI 仅翻译按钮和 Store 展示标签，**不自动翻译用户填写的内容、不修改员工、不生成草稿、不重装技能**。任务输出语言依据当前用户任务及已有运行规则，而非强制等于模板语言。
- 用户主动请求翻译员工内容时，通过现有模型能力生成待审更改，确认后按正常提交生效；没有模型时可手工编辑。新版本/翻译更新只改变模板库，已有员工保持原文和引用。
- legacy name/domain/responsibilities/deliverables/methods 字符串迁移为对应结构化字段：正文整体保留，职责生成一个稳定 legacy ID，交付原文整体保留为一个项；旧 methods 不按标点猜测拆分，新增输入/边界/验收为空并标明 legacy。旧数据允许兼容空值，编辑未变不强制补写；新官方模板和新建员工必须通过各自新校验。模板版本升级不能重写员工。
- 草稿 canonical 只比较实际员工正文、definitionLocale、技能身份及其他业务字段；排除 Store 显示语言/标签。用户主动改变配置语言或正文算实质更改，纯 UI locale 不算。
- 2026-10-27 增量：usage 随当前配置语言复制并进入员工/任务快照，其实质变化参与 dirty；selectionOrigin 只作追溯。旧员工补缺省说明不改正文、不重装或增加业务版本，规则见[API 增量 §4](role-skills-api-v1.md#4-从-api-到员工任务)。

## 5. 发布和验收（ROLE-04）

1. 官方编写双语角色与技能需求 → 核对职责边界与可验收交付 → 选择真实技能固定版本及许可/平台 → 写双语推荐理由 → 校验双语结构与跨对象引用 → 签名发布。
2. 双语内容或职责改动发布新角色 version；只更新独立目录的非绑定推荐排序可发布新 snapshot。**角色绑定技能、绑定理由、优先级或 defaultSelected 变化也需新 roleVersion**，避免同一角色版本前后不同。与 binding 对应的 Recommendation 内容不可原地修改。
3. 适配旧七角色 ID；前端/数据/DevOps 使用新 ID；中文英文结构、技能和排序一致。未解析 SkillPlan 只能存在编写源文件，公共接口拒绝出现 unresolved 或占位 release。
4. 交付验收新增 AC-28～AC-34：双语十角色、发布完整性、语言选择与回退、分页/缓存隔离、员工语言独立、legacy 迁移、双语职责实际加载。检查表逐项关联 ROLE/I18N/API 条款。
5. 默认组合补充 AC-35～AC-38：不逐项选择即可创建、用户调整不被覆盖、真实任务使用与默认组合发布门禁。旧已发布模板只做兼容读取，不追写默认值或把此门禁用于拒绝旧员工。

本文角色和技能需求为产品设计建议，不代表已获得具体第三方技能或其效果保证。现有应用、Store 公网和历史员工数据均未修改。
