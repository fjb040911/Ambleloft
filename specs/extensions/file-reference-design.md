# 宿主文件引用与长路径展示方案

2026-10-10，H09a 已接入正式任务 UI（源码预览，尚未发布安装包）。通用组件位于 src/HostFileReference.tsx，同名消歧位于 src/file-reference.ts；TaskUi 的路径列及路径详情字段复用该组件。原独立交互原型仍可从 /tests/fixtures/file-reference.html 查看；正式验证使用 tests/e2e/task-file-reference.spec.ts 与 Electron 任务界面。

## 设计判断

面向普通用户的 Agent 桌面应用，保留 Ambleloft 现有视觉体系，使用已有 shadcn/ui 和 Lucide 组件。Taste-skill 明确不覆盖数据表格，本方案采用其审计、层次、信息优先级及克制动效原则；表格结构由业务扩展设计。

DESIGN_VARIANCE 3 / MOTION_INTENSITY 2 / VISUAL_DENSITY 5：可预测布局、无自动动画、日常工具的信息密度。沿用系统字体、语义色、现有圆角和明暗主题；不引入新的设计系统、装饰性大卡片或动画库。

现状：宿主已用列宽、折行、滚动与固定操作列避免裁切，但路径仍占据大量面积。用户最关心文件名及其所属位置，完整目录链只在辨认或操作时需要。不能靠逐字符折行或横向滚动文件名解决日常可读性，也不能只保留文件名导致同名文件混淆。

## 推荐交互

默认文件引用最多两行：第一行文件图标与文件名；第二行必要的目录上下文。行号为未来扩展方向，当前正式组件不猜测或显示其他字段中的行号。文件扩展名与文件名尾部保留，超长名称采用中间省略，按字素处理避免拆开中文或 Unicode 字符。缩略展示不修改原始路径。

示意：

```
[文件图标] ProjectInvitation…ReviewPanel.tsx
           …/components/invitations   第 42 行
```

目录上下文保持单行，省略靠近根目录的部分。行号单独保留，不附着在路径字符串中。同名文件应使用最短可区分的父目录后缀，例如 billing/components 与 organization/components。对整个实例中的文件引用计算提示，不根据当前筛选改变提示；同一完整路径在不同问题中出现仍视为同一个文件。若末尾两个目录不足以区分，逐级增加祖先目录，完整路径始终可查。原型演示常见两级目录，正式组件已经实现按整个实例计算同名消歧。

悬停约 400ms 或键盘聚焦后，Tooltip 显示完整项目相对路径和行号；内容折行，宽度受窗口限制。Tooltip 只用于查看，不放交互按钮。点击路径打开 Popover，展示可选择的完整路径、复制路径和定位文件。按 Escape 关闭，焦点返回触发器；触摸设备使用点击，不依赖悬停。

“复制路径”复制未经省略、重排、编码或附加行号的原始路径；成功反馈“已复制”。复制失败允许直接选中路径。不默认复制包含本机用户目录的绝对路径。

“定位文件”是明确的宿主操作，在现有文件管理器中定位。行号首版只是位置提示，不宣称支持跳转编辑器行号。项目缺失、来源失效或无可访问文件时仍能查看/复制，定位入口禁用并给出原因。不让点击文件名直接产生系统跳转，避免误触和动作歧义。

## 宿主通用性

- 列表或表格：两行文件引用占用有限宽度，业务操作独立。宿主不会为路径把整张表撑宽；过多业务列仍由扩展调整结构。
- 任务卡片：文件引用与修复/执行按钮并列，窄窗口时优先保证操作可见；完整路径在浮层内折行。
- 聊天内联引用：紧凑模式只显示文件名及必要消歧信息，使用相同 Tooltip/Popover。不自动替换聊天中所有看起来像路径的普通文字。
- 扩展自有 iframe：不改写开发者页面；仅给协议由宿主渲染的文件引用提供统一组件。

组件按明确的文件语义渲染，例如已有 `rows.location.pathField`，不靠字段名为 file 或文本含斜杠自动推断。文件身份和定位权限由原有宿主上下文绑定，展示提示不能作为真实文件标识或路径参数。

## ai-rules 与 SDK/CLI 如何使用

这是宿主内部提供并渲染的通用组件，不要求 ai-rules 导入 React 组件，也不是扩展包新增的 UI 依赖。ai-rules 或其他 skill 继续通过现有声明标记文件字段：

```yaml
rows:
  key: issue-id
  fields:
    - name: file
      label: 文件
      type: text
  columns: [file]
  location:
    pathField: file
```

以上只是已有模板中 rows 部分的示意，其余必需字段按 UI v1 契约定义。实例数据中的 `file` 保留完整项目相对路径，例如 `src/features/billing/components/Settings.tsx`，不要提前截断、附加行号、改成 HTML 或展示用文件名。项目和来源由宿主绑定，扩展不能用展示声明绕过定位授权。

宿主已在声明式任务 UI 的指定路径字段自动使用统一组件，包括路径列和声明的路径详情字段。文件名缩略、Tooltip、详情浮层、复制及绑定定位已接入正式源码；这是展示更新，不新增运行时 capability。原型含行号示例，但当前 `rows.location` 仅支持 `pathField`，不要新增 `lineField` 或从其他字段自动推断行号。

SDK/CLI 沿用现有 `rows.location.pathField` 的类型和校验，不新增公开组件导出、SDK 方法、模板属性或 capability。纯展示升级不需要 ai-rules 改成另一种组件协议；其表格列数、业务文案和表格结构仍由 ai-rules 开发者优化。扩展自有 iframe 不会自动应用宿主组件。

## 组件与实施接口

建议内部共用 `HostFileReference`，含完整相对路径、可选行号、显示密度、目录提示、可定位状态、原因及宿主定位回调。调用方提供实例绑定信息和受控回调，不把任意扩展传入的 projectId 当授权依据。组件只管理展示、浮层、复制反馈，文件服务继续检查项目真实路径、越界和符号链接。

复用：Button、Tooltip、Popover、Separator；标题与说明用 PopoverTitle/Description，复制反馈用可访问状态文本。图标使用项目现有 Lucide 家族，不手绘 SVG。无新依赖，不需要复杂表格框架来解决单个路径字段。

本轮完成组件、同名消歧辅助函数以及声明式 UI location 字段的正式接入。其他宿主文件引用后续按需复用；不自动改写普通聊天文字。SDK/CLI 无需因为宿主纯展示组件新增业务 API；若未来增加可声明行号字段，另行冻结契约。

## 原型与验收

原型是使用真实现有组件运行的交互页面，路径为示例数据，不连接实际项目；“定位文件”仅给演示反馈。支持明暗模式、常规/窄窗口、长英文文件名、中文路径、同名文件及无法定位的状态。

正式验收：240/360/640px 容器、超长目录与文件名、保留扩展名、同名文件多级消歧、Unicode 字素、复制原样、Tooltip/Popover 键盘行为、触摸、Escape 焦点、Popover 边界、只读历史及无项目时的定位限制。路径视觉变化不能改变 CAS、冻结提交或既有授权检查。

设计预检：层次、留白、品牌字体和语义颜色沿用现有系统；无营销式 Hero、图片、滚动叙事、数值指标或装饰性动效，相关 Taste-skill 检查不适用于该产品组件。正式任务组件已完成浏览器交互与隔离 macOS Electron 链路验证，其他平台与发行包仍需独立验收。

原型验证记录：`npx tsc --noEmit`、`git diff --check` 和 `PLAYWRIGHT_CHANNEL=chrome npx playwright test tests/e2e/file-reference-preview.spec.ts --reporter=line` 通过。覆盖原始路径复制（测试剪贴板）、聚焦显示完整路径、Escape 焦点恢复、明暗切换、360px 无横向溢出、Popover 边界及无项目时禁用定位。浅色截图 test-results/file-reference-light.png，深色窄窗口截图 test-results/file-reference-dark-narrow.png。以上为此前原型的验证记录；正式接入的最新验证范围见下文及 v0.6.4 记录。

正式验证与 SDK/CLI 对接记录见 tooling-report/requirement/v0.6.4。既有 rows.location.pathField 无需改变；未调用定位时不产生系统跳转。历史只读、归档、无项目仍可查看与复制，定位禁用；其他定位失败在浮层中显示错误，路径仍可选中。实际文件管理器界面效果及所有权限状态须在各平台发行验收中检查。H09b 产物误识别属于独立问题，未在本轮修改。

### 2026-10-12：任务卡片正式接入

`TaskUi` 的 collection 现支持 `rows.layout: cards` 与 `rows.card` 字段映射。文件引用可置于 metadataFields，复用与表格相同的查看、复制、定位能力。只放置文件引用组件不会自动把旧表格改成卡片；模板作者须显式声明。正式组件预览为 `/tests/fixtures/collection-layouts.html`，契约见 [声明式 UI 指南](declarative-ui-guide.md)。
