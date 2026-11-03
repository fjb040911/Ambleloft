# 聊天内任务整理与等待处理

日期：2026-11-01。范围：当前讨论里的任务准备、页面空间、任务详情中的授权/补充信息。保留仓库已有未提交工作；没有提交、推送、迁移数据库或代用户审批。

## 现状与原因

只读核对“设备维修工单 · 协作试验”：计划正在运行，“接口契约与部署边界”工作包等待处理，关联运行的 run_items 有 1 项授权；输入请求表中没有该运行的待填表单。原来授权藏在默认折叠的“执行过程与工具证据”里。状态是真的，但用户看不到对应操作。

任务整理原来使用独立 Dialog，包含第二个 ChatComposer；固定输入区、吸顶身份栏和任务底部重复返回栏占用空间。窄窗口复查发现，重复底部返回栏还可能遮挡授权按钮。

## 变更与验收映射

| 编号 | 行为 | 实现 | 证据 |
| --- | --- | --- | --- |
| IT-01 | 整理留在当前讨论；一个消息输入框 | TaskCreationGuide 改为内联，使用 portal 将同一整理输入框放到讨论原 footer；保留原普通讨论草稿 | discussion-task-handoff：无 Dialog、composer 数量为 1、模型选择、表单补充、确认启动 |
| IT-02 | 缺项直接填写；明细按需展开 | 复用 FormFields；计划摘要检查成功展开，工作包分别展开；编辑不折叠当前明细 | 缺项补充、六包长内容、编辑后重新检查 |
| IT-03 | 返回和失败不丢内容 | 保存失败留在当前页；缓存未发送文字/回答及同版本编辑；同一问题失败后保留可编辑答案 | 草稿恢复、停止、离线重试、填写失败恢复、保存后启动失败重试 |
| IT-04 | 正文保留主要空间 | 压缩输入区，发送上下文说明按需展开；身份标题随正文滚动；任务取消重复固定返回栏；选择任务直接定位详情 | 390/1280 中英文深浅色、720 高度空讨论、点击中心命中检查、长内容 |
| IT-05 | 等待状态可直接处理 | TaskDelivery 顶部复用 Conversation 待处理控件；证据内不重复渲染；证据中的填写入口可定位顶部 | 授权失败重试、查看详情/返回、本次批准/拒绝、无重复控件、原生问题及持久表单提交 |
| IT-06 | 请求不可读有恢复入口 | 刷新请求 / 打开完整任务；运行中结果尚未产出有明确说明 | 无请求恢复入口、真实目的地联动；未完成任务不能验收 |
| IT-07 | 权限与调度保持原边界 | 未更改 approveRun、answerRun、inputs.action、createGuidedPlan、controlPlan 契约；未改变调度 | 保存不启动、显式启动、重复确认不重复计划；授权与输入参数核对 |

涉及 src/TaskCreationGuide.tsx、WorkforceSpaces.tsx、WorkforcePlans.tsx、TaskDelivery.tsx、Conversation.tsx、workforce.css、en.json。设计覆盖说明已同步 task-creation-and-review-2026-10-30.md 和 ui-design.md。内部任务 Skill 本轮未修改；此前约定的信息收集目标保持。

## 验证

隔离浏览器：macOS Chrome，72 个不同用例分批覆盖以下 7 个文件，最终各项复测通过：

- discussion-host.spec.ts
- discussion-feedback.spec.ts
- discussion-task-handoff.spec.ts
- task-creation-review.spec.ts
- workforce-task-actions.spec.ts
- supplemental-dock.spec.ts
- user-input.spec.ts

过程说明：新增测试初次使用了不正确的英文按钮名称和等待期验收按钮断言，按真实组件修正。原 user-input 的一个旧断言要求“停止”立即把尚未收到回执的发送文字放回输入框，与既有 PendingMessage 行为不符；改为先核对发送气泡保留文字、失败回执后再核对恢复填写，没有改动其生产发送逻辑。另有一次浏览器滚动点击等待超时，单独复测通过，未复现。

静态与构建：tsc --noEmit、vite build、git diff --check；Impeccable detect 针对本轮组件/CSS 无主要发现。构建保留已有大 chunk 和 FileCode 动静态导入警告，不是本轮新增发布功能。

已实际查看截图：

- [桌面聊天内整理](evidence/inline-task-guide-desktop-2026-11-01.png)
- [窄窗口深色整理](evidence/inline-task-guide-narrow-dark-2026-11-01.png)
- [英文窄窗口整理](evidence/inline-task-guide-narrow-en-2026-11-01.png)
- [长工作包编辑](evidence/inline-task-proposals-long-2026-11-01.png)
- [桌面授权](evidence/task-actions-desktop-2026-11-01.png)
- [窄窗口深色授权](evidence/task-actions-narrow-dark-2026-11-01.png)
- [英文深色授权](evidence/task-actions-en-dark-2026-11-01.png)

以上 UI 行为使用隔离 fixture，模型输出、授权和输入 API 响应为模拟；英文界面中的任务内容是 fixture 中文，不代表真实英文模型结果。真实用户状态只做只读排查。本轮没有调用真实模型、批准用户请求、提交真实表单或启动用户任务，也未复测 Windows、SSH/Docker 执行与安装包。

## 使用与发布

源码开发界面刷新后，在讨论里点“整理并检查任务”，于原聊天中填写/补充，展开任务建议核对，最后显式保存或启动。进入任务列表，点等待中的工作包，顶部直接处理授权或表单。无需删除旧讨论或重建计划。

本轮只有渲染层与文档/测试变化，无数据迁移。前端构建已验证；安装包应在后续打包时纳入此版本并单独验收。没有执行生产发布。
