# 左侧导航统一与交互复验

日期：2026-10-25。范围：现有宿主导航，Operate 模式；延续既有视觉体系。

## 问题与修复

此前协作平台绕过宿主 Sidebar，在正文中另设一套导航；分组栏中又是单独一行入口。它与项目、任务、扩展在结构、宽度、折叠、移动抽屉及历史选中状态上不一致。

现在四类入口共用名称、顺序和图标定义：**项目 → 任务 → 协作工作平台 → 扩展**。复用现有 shadcn/Base UI 的 Sidebar、SidebarGroup、SidebarMenuButton、CollapsibleTrigger 和 Tooltip，不安装第二套组件。

| 行为 | 分组侧栏 | 活动栏 |
| --- | --- | --- |
| 一级入口 | 同级分组，统一标题、图标、箭头和动作区域 | 同序图标入口，统一提示与选中态 |
| 点击分组 | 展开/收起该组，不切换正文 | 显示对应列表；再次点击当前组收起/展开侧栏 |
| 协作子入口 | 项目空间、我的员工、角色库 | 相同三个菜单项 |
| 当前项 | 菜单项使用 `aria-current=page` | 图标选中表示当前模块；`aria-expanded` 单独表示侧栏是否展开 |
| 宽度 | 默认 224px，可拖动或键盘调整 | 默认 256px，四组共用同一宽度与调整器 |
| 窄窗口 | 统一 Sidebar Sheet | 相同 Sheet；选择子页面后关闭 |

分组标题为 32px 行高、16px 图标，四组箭头处于同一水平位置。标题与具体条目区分层级。折叠使用组件行为，折叠内容不可聚焦；Tab、Enter、Space 与 Escape 沿用标准控件行为。

切换主模块保留已挂载的协作页面及角色草稿；在协作内部离开未保存角色仍须确认。保存过程中的内部切换保持禁用。模式切换保留当前页面；当前模块和协作子页面写入既有会话恢复记录。分组折叠状态保留于当前界面实例，不宣称跨重启持久化。

扩展仍提供独立业务 UI 入口；协作不再挂在扩展下。全局技能由既有“技能与扩展”管理入口访问。

## 验证证据

使用当前宿主 React App 和上一轮 AI Coding 真实记录进行只读界面检查；未启动模型或修改业务记录。审阅页允许将布局、语言、主题偏好保存在自身浏览器中，日常宿主数据不受影响。

- 四个活动入口逐项切换：每次只有一个选中图标，均控制 `workspace-sidebar`，桌面实测均为 256px；对应标题和列表同步更新。
- 重复点击协作入口可收起；Enter 恢复；收起时仍保留模块选中态。
- 分组标题统一，Enter / Space 可折叠；任务组收起后保持其它分组可用。
- 新角色填入测试文本，切出再返回未丢失；活动栏切为分组栏后草稿与当前项仍在；内部切换弹出确认，取消保留输入。
- 650px 活动栏使用统一抽屉，点击子页面自动关闭；Escape 后焦点返回原活动入口。
- 390px 深色分组抽屉、900px 英文 Windows 样式、1280px 浅色桌面均做了视觉检查。Windows 为浏览器中的平台布局分支检查，不是原生 Windows 进程验收。
- `npm run build` 通过（含 TypeScript 检查），保留既有 bundle 大小警告；`git diff --check` 通过。
- Impeccable 机械扫描结果为 `[]`。扫描不是完整读屏与所有平台的可用性认证。
- 已更新既有布局 E2E 用例中的说明文案匹配；本轮交互通过 CUA 实测，没有另行运行 Playwright 测试套件。

截图位于 `../../../agent-flow/designs/agent-workforce/review/navigation-unification/`。

## 复查入口

- [分组栏预览](http://127.0.0.1:4187/__review/?layout=classic&theme=light)
- [活动栏预览](http://127.0.0.1:4187/__review/?layout=activity&theme=dark)
- [窗口尺寸与平台样式检查](http://127.0.0.1:4187/tests/manual/navigation-review.html)

启动方式沿用 [真实验证报告](ai-coding-validation-2026-10-25.md) 的本机只读审阅服务。

组件依据：[Sidebar](https://ui.shadcn.com/docs/components/base/sidebar)、[Collapsible](https://ui.shadcn.com/docs/components/base/collapsible)、[Tooltip](https://ui.shadcn.com/docs/components/base/tooltip)。局部样式继续使用宿主颜色、圆角和焦点 tokens。
