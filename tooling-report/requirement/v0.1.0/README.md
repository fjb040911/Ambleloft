# SDK 与全场景 Demo 交付需求 v0.1.0

日期：2026-09-29。需求状态：供 SDK/CLI Agent 实施及宿主 Agent 联调。

本目录是双方交流工件，版本号仅表示需求版本，不表示 SDK、CLI、宿主最低版本或 API 稳定等级。tooling-report 是交流目录，不替代 specs/extensions 的正式契约来源，也不意味着所有需求均已被宿主实现。

## 交付文档

1. [SDK 完善需求](sdk-requirements.md)：对齐最新宿主、公开类型、错误、能力边界、包及 CLI 交付。
2. [Demo 施工与验收](demo-implementation.md)：UI、项目与聊天、消息推送和订阅、配置、安全、生命周期及异常流程。

基线：[首次桌面报告](../../2026-09-29_16-42-00/team-task-desktop-report.md)、[四项缺陷修复验收](../../2026-09-29_16-58-10/host-fix-report.md)。后续又增加扩展设置、草稿发送前核对与归档草稿打开交互；不得把旧报告直接当作新版验收结果。

## 执行与交流规则

- SDK/CLI 与 Demo 在相邻 extension-tooling 项目开发；宿主在 agent 项目开发。先检查当前源码，不按历史行号修改。
- 开工先交付能力对照表：需求 ID、契约、实际宿主入口、SDK 状态、测试和缺口。SDK 不得模拟尚不存在的宿主能力。
- 宿主缺口记录为 BLOCKED-HOST，提交最小复现、期望/实际结果和必要契约建议；不删除用例、不偷偷改变语义。修复后重跑。
- 每轮结果写入 tooling-report/YYYY-MM-DD_HH-mm-ss/（Asia/Shanghai），包含报告、机器结果、日志、截图、源码/包指纹，并更新 tooling-report/README.md。保留历史证据。
- 验收状态采用 PASS / FAIL / BLOCKED-HOST / NOT-RUN；条件性平台测试可以说明适用范围，不能计入 PASS。
- 本版要求修改时新增版本目录并写变更摘要；不要覆盖已用于施工验收的版本。报告必须注明依据哪个需求版本。
- 本轮不自动发布 npm、提交、推送或合并。具备本地 tarball 安装验证及可安装 Demo 包即可交付审阅。
