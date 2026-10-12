# 声明式任务 UI v1（源码预览）

2026-10-10 首版范围已确认：普通 skill 安装、编辑器、结果集合、用户单击发送与持久化。完整逐行业务状态回写、项目修复互斥队列、跨平台发行验收后续交付。不改变旧 `amble-form` / `amble-form-ref` v1。

## 声明与工具

在 `SKILL.md` 顶层使用 `amble-ui` YAML/JSON 围栏，或 `amble-ui-ref` 围栏 `{path: editor.json}` 引用技能目录中的资源。整个来源存在错误时不注册其中任何新 UI；旧表单继续独立解析。不执行模板脚本，不支持任意 HTML/JS、URL、HTTP 提交或模板内业务逻辑。

先调用 `ui_capabilities` 检测正在运行的宿主；源码 inventory 和 SDK doctor 不能替代运行时结果。返回 `declarativeUi: 1`、支持类型与限额。调用 `ui_list` 获取可用模板 key 和诊断；`ui_present({key,data})` 绑定当前聊天/项目/来源并生成不可预测实例 ID。模型提供实例数据，不能指定所属聊天、来源、项目或操作路由。

`ui_update({id,expectedRevision,data})` 创建新的实例，旧实例保留并停止执行。这是替换整个报告的入口，不是逐行实时业务状态回写。`ui_read_submission({submissionId})` 仅可读取当前聊天有效来源的冻结提交。不要重复读取旧报告来修复新报告中同名 ISSUE。

## 模板契约

参见 [JSON Schema](contracts/ui.schema.json) 和 [完整技能示例](examples/declarative-ui/SKILL.md)。模板 `version: 1`，`type: editor | collection`，固定 `fields`、动态 `rows`、`actions`。字段沿用旧表单的确定性字段规范；行 `key` 为宿主使用的稳定字符串标识，可独立于可编辑业务编号。`unique` 为集合内唯一性约束；`columns`、`detailFields`、`filterFields` 只能引用声明字段。

`rows.location: {pathField: file}` 可将文件字段渲染为定位按钮。要求绑定项目、受限项目相对路径，禁止绝对路径、协议、反斜杠及 `..`；点击时重新校验实例、来源和项目，并由现有文件服务检查真实路径及符号链接。首版在系统文件管理器定位文件，不支持跳转行号。

长路径使用 [宿主文件引用组件](file-reference-design.md)：skill 只声明上述 pathField 并传入完整相对路径，不导入 React 组件、不截断数据。正式 TaskUi 的路径列和路径详情字段已接入文件名优先、目录消歧、Tooltip、完整路径浮层、复制及定位。点击名称只查看详情，定位另行触发既有宿主校验；只读卡片与无项目仍可查看/复制。无新增 SDK API、模板属性或 capability，行号声明与编辑器行导航尚未支持。

动作仅支持 `kind: chat`，范围 `data | row | selection | all`。`input` 是命名绑定：`{from: values}`、`values.field`、`row.field`、`selection.field`、`all.field`、`context.projectId`、`context.instanceId`，或者 `{value: JSON值}`。不支持表达式、脚本、环境变量或任意属性遍历。字段引用和动作范围须通过语义校验。`row` 仅用于行动作；`selection` 用于行/多选/全部动作。`all` 永远读取整个报告的有效目标，忽略当前搜索、分页和筛选。`eligible: {field: status, notEquals: resolved}` 排除已解决条目。

提示词只允许 `{{input.bindingName}}` 占位符，值使用 JSON 表达；正文不需要承载全量规则。宿主追加提交 ID，Agent 按需读取冻结结构化参数。任意描述、代码和业务提示作为数据处理，技能不会获得超过用户和平台的权限。

## 数据与编辑

实例 `data` 含 `values`、`rows`，可含 `state`、`summary`、`coverage`。结果状态为 `ready | empty | incomplete | failed | uninitialized`。失败和未完成不能显示成检查通过；行、选择和全部动作仅允许完成的结果，`data` 动作可用于重新检查。

编辑器支持新增/删除、必填/类型/集合唯一性校验。保存草稿仅保存 UI 快照，不写项目文件；“保存并发送”先保存草稿再投递按钮意图。未声明的高级属性从原快照保留，不允许通过界面修改；最终写文件由 Agent 执行。已有字段修改不会丢失高级数据，业务层仍须验证磁盘版本并处理文件冲突。

操作使用 expected revision 的 CAS。多窗口冲突不会静默覆盖，当前输入保留，用户可明确重新载入。用户离开或退出前应保存草稿；未保存输入没有持久化保证。搜索与分页不会修改数据。

## 投递、恢复与生命周期

真实点击即可进入所属聊天的既有 `chat_inputs` 队列，不弹旧表单的额外确认。代码执行仍受 Agent 原有权限控制。提交快照与队列项在同一数据库事务中创建；相同实例、动作、参数指纹不重复发送，参数变化创建新提交。发送前再次检查来源、实例、项目、聊天和归档。

显示“等待发送 / 已发送 / 发送失败 / 待核实”；`delivered` 不等于保存或修复成功。空闲启动、运行中追加与轮次竞态复用原队列。重启恢复已保存卡片和待发送队列；已发送项不重放，曾进入发送但回执不明的项成为 unknown，不自动重试，只提供只读核实入口。停用、来源更新、聊天归档或移项后旧卡片保留只读。

模板 128 KiB；实例 192 KiB；500 行；每组最多 50 字段；8 动作；提示词 8000 字符（展开后 12000）；每聊天最多 100 实例、每实例最多 64 提交；界面每页 20 行。快照和提交与本机配置中的聊天数据共同保留，归档不清理；本轮没有按时间自动清理，应在后续数据管理中提供删除/保留策略。限额控制累计数量，不能代替存储容量治理。

## GitHub 子目录安装

`skills_install({repository, directory, ref?, replaceId?, asNew?})` 仅接受 HTTPS GitHub 仓库和安全子目录，需要本机 Git；宿主显示安装确认。默认 HEAD 被解析成不可变 commit，存储仓库、目录、请求 ref、实际 commit。复制完整技能资源（排除 `.git`、`node_modules`），拒绝符号链接及超限包，不执行安装脚本，不初始化项目。

同名返回 duplicate，不静默替换；用户明确选择更新后传 replaceId，或者另装传 asNew。更新保留原启用状态。临时 checkout 成功/失败均清理；安装失败不发布半成品。下一次模型请求刷新目录，当前请求可读取工具返回的技能路径。可取消下载，Git 下载超时 120 秒；完整资源仍受现有包 50 MiB/1000 文件限制。

## 验证边界

服务测试验证契约、冻结目标、去重、来源/归档失效、CAS、高级字段保留与 SQLite 持久化。浏览器 fixture 验证 shadcn/ui 渲染、筛选、选择、单击请求与投递标签。这些不证明真实模型修复质量，也不代表 Windows/Linux 或打包发行验收通过。SDK/CLI 独立项目必须按交接要求完成干净安装、验证与打包测试。

## 集合显示标签增量（2026-10-10）

运行时 `ui_capabilities.collectionValueLabels: 1` 表示支持 `rows.valueLabels: {status: {unresolved: "待处理"}}`。此可选 UI v1 增量只调整列、详情和筛选选项文字；冻结数据、eligible 条件与选择键保持原值。字段须已声明，每字段最多 100 标签，键 1–120 字符、标签 1–200 字符；总模板限额保持不变。未知值显示原值，select 字段也可复用 options 的 label；valueLabels 优先，编辑控件仍使用 options。旧宿主须单独探测该能力，不能仅根据 declarativeUi=1 推断支持。静态声明在目录发现时校验；不支持的宿主应使用兼容包或回退聊天，不能靠展示参数删除模板属性。

summary/coverage 应为自然语言文案，原始统计结构可保留在 values。宿主不会把序列化 JSON 推断为特定业务摘要。长内容折行，宽表独立横向滚动且操作列保持可见；空列表隐藏无用搜索和表头。

## 模板 key 与错误恢复

模板 key 包含宿主安装的来源身份。删除后重装 skill 会生成新身份，不能继续使用聊天历史中的旧 key；更新或重新安装后先调用 ui_list，再使用当前注册条目的 key。旧身份不可自动重绑定到同名新 skill，避免绕过来源权限与版本校验。

宿主 MCP 的工具执行失败返回 HTTP 200 的标准工具结果 isError=true，内容保留 code、message 和可选字段 errors（fields）。模板失效返回 NOT_FOUND，并提示重新调用 ui_list；字段校验失败返回 INVALID_ARGUMENT。它们不是传输错误，不应只清洗原载荷或无限重试旧 key。无效 JSON 等请求格式错误仍是 HTTP 400。任务卡片展示成功后才进入渲染；仅凭存在审查报告不能认定 UI 已展示。

## 集合双布局（2026-10-12）

探测 `ui_capabilities.collectionLayouts === 1` 后，collection 可声明以下可选增量。编辑器不支持这些属性。旧模板未声明时仍为 table；宿主不会根据业务字段名猜测布局。

```yaml
rows:
  key: id
  # fields 中声明以下引用的全部字段
  layout: cards
  card:
    titleField: subject
    descriptionField: description
    badgeFields: [status]
    metadataFields: [id, owner]
  columns: [subject, status, owner]
  detailFields: [notes]
```

- `layout`: `table | cards`，默认 table。cards 必须提供 card；table 提供 card 后也可由用户切换。
- `card.titleField` 必填；`descriptionField` 可选；`badgeFields` 最多 3 个；`metadataFields` 最多 8 个。各字段必须已声明，四种角色之间不允许重复。未提供的可选字段值显示为空值标记。
- 提供 card 后显示表格/卡片切换。视图选择仅为本次挂载的展示状态，不修改实例或提交数据；重开恢复模板默认。筛选、搜索、页码和选择在切换时保留。
- 卡片单列纵向排列，标题、徽章、说明、元信息、折叠详情、行操作按此顺序展示。徽章使用字段 label 与 valueLabels/options，不推断业务颜色或严重程度。
- `rows.location.pathField` 引用的路径在卡片元信息、表格、详情中复用宿主文件组件；文件定位沿用当前实例、项目和来源授权。没有文件字段的集合也完整可用。
- 表格保留横向滚动和可见操作列，详情以独立浮层展示，避免把长说明挤入操作列。卡片无横向数据表，适合描述较多、逐项处理的任务。大量数值对比优先选择 table。
- 每页 20 项。选择本页只增加当前页条目；筛选和翻页不清空选择，界面显示跨页已选总数，可清除选择。隐藏的已选项仍参与 selection 提交。all 始终针对全实例符合 eligible 的行，不受筛选影响。
- 两种布局复用动作路由、冻结数据、eligible、投递状态、去重和只读限制。切换/查看详情/筛选不会投递；已发送不等于业务完成。
- summary/coverage 默认收起至“查看说明与范围”，失败/不完整提示保持可见。空态使用通用文案，不把无条目解释为审查通过。

通用示例见 `examples/declarative-ui/requests.json`（服务请求，无文件字段）；文件审查见 `review-cards.json`。正式组件交互预览：`/tests/fixtures/collection-layouts.html`。SDK/CLI 必须同步 schema 和引用校验，不能仅依据 UI v1 推断此增量已支持；旧宿主使用不含 layout/card 的兼容模板。

### 卡片视觉层级

正式卡片通过 CollectionItemCard 组合既有 shadcn/ui 组件：条目标题优先，徽章保留字段语义并弱化标签，辅助元信息使用次级文字；详情入口与行操作合并在底部一行，不再使用独立底栏色块。展开详情在当前卡片内显示，选中态用主题强调色描边，同时保留 checkbox 状态。窄屏允许内容及操作自然换行，减弱动画偏好下禁用过渡。此为宿主统一呈现，不增加模板配置或业务字段约定。
