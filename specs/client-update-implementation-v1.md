# 客户端更新实施记录

2026-11-04。代码已接入，尚未通过签名安装包之间的真实升级验收，不能将本记录视为已上线。

## 已实施

- electron-updater 6.8.12，固定 GitHub Releases provider；stable 检查、自动检查/下载偏好、取消、重试、差分与库内全量回退。
- 主进程单一状态，受信 IPC；普通退出不自动安装。蓝色按钮首次点击下载，再次点击详情；关于和设置共享卡片，支持进度和失败状态。
- 固定活动栏，旧 classic 偏好不影响渲染。
- 手动重启需原生确认。空闲自动更新为单次运行/单目标版本许可，每 10 秒尝试检查，10 分钟仍被阻塞则取消；可取消计划。当前实现没有独立的可视倒计时，按钮明确写“空闲时自动重启更新”。
- 安装前阻止新 IPC、Runtime 启动、计划调度、自动化和扩展调用；检查活跃执行、扩展 RPC/操作及终端。窗口有可见非空输入时保守阻塞，用户先保存/清空；不是通用编辑器草稿自动保存协议。
- 有序关闭后备份 atelier.sqlite 相关文件和 codex-home，再触发安装。失败不继续安装；关闭阶段失败要求重开应用，不能当成普通 ready 重试。
- 写入安装事务；新版本启动时检查内置引擎，再依赖现有数据库/Runtime 初始化判定 healthy。保留备份，不自动降级或覆盖新写入。
- Windows NSIS；macOS electron-builder 原生 ZIP/DMG 与 blockmap。updater 及依赖打包为 resources/tools/updater.cjs，避免应用依赖白名单漏包。
- 手动 release workflow：校验 tag、构建签名产物、检查元数据摘要和 blockmap、上传 Draft Release。不自动公开发布。

## 验证

- TypeScript 与 Vite 生产构建通过。
- 更新状态机 8 项单测通过：检查/下载、关闭自动安装、目标版本绑定、阻塞、失败、并发、取消、计划撤销及关闭失败恢复。
- Chrome Playwright 验证蓝环点击下载、42% 进度、关于与设置同步、取消下载、移除布局设置；这是模拟更新源的 UI 验证，不是实际下载节省率验证。
- macOS arm64 开发签名目录包成功生成，包含 updater bundle；未公证，不代表生产自动安装验收。

## 发布前必须完成

1. GitHub release environment 配置 CSC_LINK/CSC_KEY_PASSWORD（按平台环境提供对应证书），macOS 配置 APPLE_ID/APPLE_APP_SPECIFIC_PASSWORD/APPLE_TEAM_ID。发布前核对 Windows 发布者身份校验和 macOS 签名身份连续性。
2. 首次手动安装带更新器的基线版本，再发布更高版本至测试仓库，真实验证 NSIS/macOS ZIP 的下载、Range、签名、缓存和安装重启；记录宿主变化/引擎不变时的实际网络字节。
3. 当前 CI 构建 macOS runner 的原生架构和 Windows x64，其他架构需独立构建并合并元数据，不能声称全架构覆盖。
4. 实机验证安装前门禁、崩溃恢复和历史线程恢复；当前保守输入检查可能阻塞含非空搜索框的窗口，需清空后更新。
5. 将 release-info、版本特定发布说明、日志导出及更细粒度草稿保存协议作为发布加固项；当前发布说明链接指向官方 Releases。

用户数据备份位于应用数据目录 updates/backup-<timestamp>。不会自动删除，也不会自动回灌。第一版不远程收集更新日志。
