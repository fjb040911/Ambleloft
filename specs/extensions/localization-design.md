# Skill 与 Extension 多语言设计

日期：2026-10-12

状态：宿主首版已实现（2026-10-13），以运行时能力探测为准。支持 Skill 词典、模板显示投影、动态通知文本、语言热切换和历史翻译快照。SDK/CLI 增量交接见 `tooling-report/requirement/v0.6.7/`，独立 SDK/CLI 的发布状态需由其维护项目验证。

## 1. 开发者只需理解三件事

1. 单语言直接写文字，不要求创建词典。
2. 需要多语言时，显示文字写成 `%key%`，翻译放在所属模块根目录的词典文件中。
3. 宿主自动发现词典、选择语言、回退和刷新，无需配置路径、手动加载或为切换语言重建界面。

一个 Skill 单独安装、通过仓库安装或随 Extension 安装，采用完全相同的规则。宿主渲染的表单、编辑器、table/cards 复用同一解析器和显示字段规则。

## 2. 词典归属与文件格式

```text
extension.json
extension.nls.json
extension.nls.en.json
skills/
  travel/
    SKILL.md
    reimbursement.yaml
    skill.nls.json
    skill.nls.en.json
```

- Extension 根目录的词典用于扩展入口、设置、操作说明及扩展发布的可翻译通知。
- 每个 Skill 根目录（SKILL.md 所在目录）的词典用于该 Skill 的展示元信息及其引用的全部表单/集合模板。模板放在子目录时，仍使用 Skill 根目录词典。
- 独立 Skill 使用 `skill.nls.*.json`；扩展内 Skill 也使用此命名。
- 不隐式继承扩展、父目录、其他 Skill 或宿主词典。不允许通过 key 或参数选择其他模块的词典。
- 默认文件 `skill.nls.json` / `extension.nls.json` 是完整回退词典；`*.nls.<locale>.json` 是可选覆盖。无需额外清单声明默认语言。
- 文件为 UTF-8 JSON 对象，key/value 都是字符串，采用平面 key，例如 `expense.amount`；点号仅用于组织名称，不表示对象寻址。
- 相对路径必须在所属包的安全边界内，不读取远程 URL、不允许通过符号链接越界。保留安装包现有大小/文件数量限制。
- 拒绝非法 JSON、重复 key、非字符串值和原型相关危险 key。语言文件缺少 key 可以回退；使用中的 key 缺失默认值属于错误。
- 词典值为纯文本，不支持 HTML、脚本、递归 `%key%` 展开或执行表达式。

### 最小示例

以下是表单字段片段，提交配置仍遵守现有表单协议：

```yaml
title: "%expense.title%"
fields:
  - name: amount
    type: money
    label: "%expense.amount%"
```

`skill.nls.json`：

```json
{
  "expense.title": "差旅报销",
  "expense.amount": "报销金额"
}
```

`skill.nls.en.json`：

```json
{
  "expense.title": "Travel reimbursement",
  "expense.amount": "Amount"
}
```

不要求把所有字符串一次性迁移。普通字符串保持原样；仅整个值精确符合 `%key%` 时作为引用，不对一句话中的任意百分号进行替换。

## 3. 什么可以翻译

| 内容 | 规则 |
| --- | --- |
| Extension 显示名称、介绍、设置标签/帮助/选项标签、操作标题/说明、风险显示文案 | 在清单明确允许的显示字段解析 Extension 词典 |
| Skill 展示名称、展示简介 | 使用 Skill 词典，不改变发现与执行身份 |
| 表单标题/说明、步骤标题/说明、字段 label/help/placeholder、选项 label、提交/返回等模板按钮文案 | 使用 Skill 词典 |
| UI 集合/编辑器标题/说明、字段标签/帮助、valueLabels 的值、动作 label | 使用 Skill 词典，table/cards 一致 |
| 宿主自带“搜索”“下一页”“查看详情”、权限说明及通用错误 | 由宿主自己的词典提供，扩展不能覆盖 |
| 用户输入、任务名称、审查发现、服务端正文、文件路径、data.rows、summary/coverage | 原样展示，不自动翻译，不递归解析 `%key%` |
| 字段 name、模板/操作/事件 ID、选项 value、绑定表达式、eligible、when、权限、路由、路径 | 语义字段，禁止翻译 |
| SKILL.md 指令正文、用于技能发现的能力描述、动作 prompt、提交 payload | 保持原定义，不随界面语言替换 |

实施时必须为各协议列出确切字段白名单，不能把“所有字符串”当作显示字段。UI `rows.card.*Field` 只引用稳定字段名，不翻译这些引用。状态 `open` 可通过 `valueLabels.open: "%status.open%"` 展示为“待处理”，条件判断和提交仍使用 `open`。

Skill 的展示与执行元信息分离：目标采用可选 `displayName` / `displayDescription` 作为宿主展示覆盖，不重用现有 name/description 的身份或模型发现语义；缺省保持旧显示行为。使用前探测 `skillLocalization=1`；旧宿主不保证展示这两个字段。模型可获得当前 UI locale，但用户在聊天中要求的回复语言优先，界面语言不等于回复语言。

## 4. 语言选择与回退

宿主将设置中的“跟随系统”解析成有效 locale 后下发，不把 `system` 当作语言传入。使用标准 BCP 47 语言标签与平台标准 canonicalization，不能只依赖 lowerCase 或下划线替换。现有历史命名如需兼容，在统一入口规范化并检测冲突；多个文件规范化到同一 locale 时拒绝安装。

回退按每个 key 进行：

1. 精确语言，例如 `zh-Hant-TW`。
2. 去掉 region 保留 script，例如 `zh-Hant`。
3. 无歧义、适合该 script 的语言级词典；不能从 `zh-Hant` 自动选用简体 `zh-Hans`，反之亦然。
4. 默认词典。

`en-US → en → default`。对于 `zh-TW` 等带有隐含 script 的 locale，统一解析器通过标准 locale 信息推导 script，优先 `zh-Hant`；泛 `zh` 不能作为自动简繁转换依据。默认词典是开发者明确提供的最后回退，不保证与目标语言相同，不声称发生了翻译。

无匹配语言可正常使用默认词典。目标语言缺 key 给开发者 warning；默认词典缺引用 key 给 error。已有损坏/旧记录在显示时回退到保存的默认文本，无法恢复时显示可诊断的 key，不导致整个聊天崩溃。

## 5. 安装、渲染、切换与执行

```text
安装/发现 Skill 或 Extension
  → 校验原始模板、显示字段引用、词典和语言标签
  → 记录来源版本及模板/词典摘要
展示表单、集合或通知
  → 绑定来源身份
  → 保存必要的模板/翻译快照
  → 按宿主有效 locale 生成显示投影
用户操作
  → 使用原始 ID、原始值和既有授权路由执行
```

UI 语言切换只更新显示投影：不得重新调用 present、生成新 conversationId/instanceId、改变 revision 或提交指纹、重放请求、清空编辑草稿/筛选/选择/分页。筛选以稳定业务值存储，选项显示语言可变；搜索匹配当前显示标签和原始值，不修改业务数据。

运行中的后台和推送连接不因切换语言重启。所有窗口使用宿主同一语言设置，收到同一变更事件。进行中的操作使用调用开始时的 locale 快照，后续新操作取得新 locale；不要让 await 前后拼出的单次反馈混用语言。

后台 SDK 目标增量：`context.l10n.locale`（只读有效语言）、`context.l10n.onDidChangeLocale(listener)`（返回可释放订阅）、已有 `t(key,args)` 按当前语言解析；操作 invocation 增加只读 `locale` 快照。以上属于目标接口，当前只有初始化时构建的 t，需宿主与 SDK 同步交付。后台切换是更新解析环境，不是重新 activate。

自定义 iframe 页面继续使用现有宿主 locale/theme 上下文及变化事件。宿主不重写页面 DOM、不强制框架；SDK 可提供复用词典的便捷函数，但页面内容和布局仍由开发者负责。MCP Apps 自定义 HTML 不能因此被视作已获得宿主模板翻译能力。

## 6. 动态通知的文本契约

普通字符串继续有效。需要随宿主语言变化的内容使用可选目标类型：

```ts
type LocalizedText = string | {
  key: string;
  args?: Record<string, string | number | boolean>;
};
```

```json
{
  "eventKey": "task:42:ready",
  "title": { "key": "notification.taskReady", "args": { "projectName": "客户门户" } },
  "body": "来自业务服务的原始说明"
}
```

默认词典：`"notification.taskReady": "{projectName} 已准备就绪"`。

- 首版作用于通知 title/body 和 action.label 的输入，publish/update 均遵守同一规则；业务通知仍走原有来源绑定、接收偏好、去重、权限和操作状态机。
- 从调用扩展的词典解析，不允许传入词典路径、extensionId 或 Skill ID 改变归属。普通 Skill 没有因此新增通知发布权限。
- 占位符只做具名参数替换，不支持表达式、递归展开、富文本、ICU plural 或隐式业务数字格式化。数字/金额需要地区格式时，由对应类型控件或业务逻辑明确处理，不改业务值。
- 静态校验同一 key 的各语言占位符集合；动态调用校验必需参数是否齐全。参数按纯文本渲染，禁止 HTML 注入。
- 后台先执行 t() 再发布字符串，只能得到固定语言通知；需要动态切换的开发者应直接传 LocalizedText。
- 内部持久化保留结构化文本与来源快照；宿主 UI 取得当前语言的显示投影。已有 SDK 通知读取返回字符串的行为应保留，不能突然返回对象；如需公开原始结构，用独立、显式类型增量。
- 翻译不改变 eventKey、revision、有效性、已读/清除状态和 action ID。语言切换绝不重新提醒，也不会把已清除通知恢复。

本轮不把 LocalizedText 扩展到任意 data.rows、summary/coverage 或用户数据。动态业务内容多语言另行设计，避免给基础表单作者增加理解成本。

## 7. 历史快照与生命周期

保存原始模板与被其引用的必要翻译条目（默认及已有各语言），同时保存来源版本与摘要。通过去重的不可变词典快照表或等价机制，避免每张卡片复制整包词典。渲染历史使用创建时的快照，不读取后来更新/重装的扩展词典；卸载后仍能显示历史。

词典变更计入来源版本/完整性校验；切换宿主语言不属于来源更新。来源升级后的旧可交互实例继续遵守既有来源版本失效规则，不能靠重新翻译绕过授权。通知自身内容更新时，涉及的翻译引用与其来源快照一并原子保存，仍遵守已有 revision/CAS 和终态规则。

已提交操作保存当时的实际显示文案与 locale，作为审计快照；普通历史 UI 可按保存的词典重新选择显示语言。旧记录只有字符串时保持原文，不推测原 key，不借用当前包翻译。

翻译快照不得绕过资源配额。实施时将词典、参数、所有可用语言展开后的显示文本纳入大小检查，复用各渠道现有内容限制；快照存储配额须单独明确，不能无限增长或挤占既有 192 KiB 业务数据而无兼容说明。不得截断后改变按钮含义。具体新增包/词典配额在实现契约评审中冻结。

## 8. 兼容性和实施分段

1. 统一解析器与 CLI 校验：文件发现、locale、静态引用、占位符和安全边界。
2. Skill 展示与模板渲染：表单、编辑器、集合双布局、历史快照、无损语言切换。
3. 后台 l10n 更新、动态通知、本地持久化/系统通知渠道、Web SDK 文档。

能力必须按交付范围分别协商，不能用已有 Extension 本地化或 UI v1 推断全链路可用。建议目标能力命名：`skillLocalization: 1`、`templateLocalization: 1`、`notificationLocalization: 1`、`liveLocalization: 1`；由对应运行时通道暴露并由 CLI 的 host target 清单镜像，精确承载接口在宿主实现时冻结。本设计文档不向现行 host-capabilities.json 添加虚假支持声明。

旧包普通文本继续工作。旧宿主不能识别新增能力时，CLI 给出兼容错误或生成显式单语言兼容包，不能把 `%key%` 原样展示给用户。兼容包是构建时产物，不在 ui_present 时偷偷修改注册模板。

## 9. 验收

- 独立/随扩展分发的同一 Skill 使用同一词典，嵌套模板可正确读取根词典，同名 key 不串包。
- 中文、英文、跟随系统和缺少目标翻译均可渲染；默认 key 缺失阻止发布；简繁回退可解释。
- 表单未提交输入、混合开关状态、cards/table 的筛选/多选/页码在切换时不丢失，且无网络业务重放。
- 值中包含 `%key%` 的用户内容不被替换；字段 ID、选择值、条件、冻结 payload 和幂等键保持一致。
- 通知可翻译 title 与普通 body 混用；后台推送连接在切换时持续；已读/清除/拒收状态不变且不再提醒。
- 历史在扩展升级、卸载、重装后仍按旧词典显示；旧纯文本不被强行翻译；审计保留提交时文案与语言。
- 无原型污染、占位符脚本执行、词典越界读取、超限绕过；未知 key/缺参数给出可定位错误。
- Web iframe 能收到 locale 变化，但不受宿主 DOM 翻译干预；SDK/CLI 干净安装和打包产物包含所需词典。

## 首版实现与接入

- `forms_capabilities` / `ui_capabilities` 返回 `skillLocalization=1`、`templateLocalization=1`、`liveLocalization=1`；Node Extension 的 `context.capabilities` 另提供 `notificationLocalization=1`。
- 示例：[可导入的双语 Skill](examples/localized-skill/SKILL.md)。词典与 SKILL.md 同目录，内联或文件引用模板共用此词典。
- 模板显示白名单：title/description；fields 的 label/help/placeholder/options.label；steps 的 title/description/fields/next.label；submit.label、actions.label；rows.fields 的上述字段和 rows.valueLabels 的标签。业务 values、prompt、bindings、条件和 IDs 保持原样。
- 数据库存储引用文案的独立快照，按内容散列去重；单快照 256 KiB，总计 64 MiB，超限明确失败。当前不自动清理历史快照。
- 每个词典文件 256 KiB，最多 32 种翻译加默认词典，每份最多 2000 个 key，模块词典总计 1 MiB。通知参数最多 32 项且 JSON 编码不超过 64 KiB，展开后仍受原通知字数限制。
- 普通字符串保持原样；缺失默认 key、重复或危险 key、占位参数不一致、重复规范化 locale、符号链接及显示文案越界在安装/发现时拒绝。
- 旧历史记录不补猜词典；已有翻译快照的历史可随界面语言显示，提交时的 locale/标签记录保持冻结。
- 此版本不提供机器翻译、ICU 复数规则、业务数据翻译或 iframe DOM 翻译。系统语言采用 Electron 提供的 locale；更改操作系统语言后重新启动应用以刷新系统 locale。

验证入口：`tests/localization.test.cjs`、`tests/extension-hosts.test.cjs`、`tests/message-service.test.cjs` 和 `tests/e2e/localization.spec.ts`。
