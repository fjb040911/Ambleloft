# 团队任务 Demo 宿主问题修复验收

修复前基线：[2026-09-29 桌面报告](../2026-09-29_16-42-00/team-task-desktop-report.md)。本轮保留基线文件，新增独立证据。

结果：报告中的四项缺陷已修复。182 项完整测试、生产构建和 20 组真实 Electron 检查通过，机器记录 issues 为空。

## 根因与修改

| 问题 | 根因 | 修改与验证 |
| --- | --- | --- |
| 条件命令错误显示 | snapshot 丢弃 when，管理 UI 无显示判据；后台上下文变化未广播 | service.cjs 保留 when 并计算 visible，主进程传入当前窗口项目上下文；hosts.cjs 上下文变更广播；ExtensionsPage 过滤不可见命令。执行时校验保持不变，不改变 Operation enablement 语义。真实界面确认 false 隐藏且执行拒绝，true 显示且可执行。 |
| CONFLICT 丢失 | 消息层只有裸错误文本，数据库跨线程丢失 code，RPC 映射为 INTERNAL | errors.cjs 定义结构化错误与公开白名单；messages/message-handlers 使用结构化错误；database-worker/database 保留 code；hosts 只输出允许的代码，未知错误映射 INTERNAL。真实扩展旧 revision 写入返回 CONFLICT，内容保持已保存版本。 |
| 来源出现 %name% | message-handlers 直接读取 displayName | localization.cjs 共用字典解析：精确语言、基础语言、default、键名回退；消息来源读取当前 workspace language。来源 ID、偏好及去重分区不变。 |
| 名称不跟随语言 | displayName 固定 default，服务 locale 固定启动值 | service 的名称与贡献标签共用解析；main 在工作台语言变更后更新 locale 并通知全部窗口刷新扩展与消息；App 用实际解析语言更新扩展页面 context。双窗口英文名称、通知来源及原页面主题/语言切换通过。 |

## 回归测试

新增/扩展 tests/extension-display.test.cjs、extension-hosts.test.cjs、message-service.test.cjs，覆盖条件切换、翻译回退、未知错误脱敏、真实子进程与数据库错误码传递，以及来源偏好保持。

相邻 extension-tooling/scripts/test-team-tasks-desktop.mjs 已将四项 HOST GAP 探测替换为失败即终止的断言。条件 false 不再等待按钮存在；额外验证 true 可显示、执行，以及第二窗口语言与来源一致。脚本快照保存在证据目录，便于复核本轮验证方式。

## 实际执行

宿主目录：

```sh
node --test tests/extension-display.test.cjs tests/extension-hosts.test.cjs
node --test tests/message-service.test.cjs tests/extension-display.test.cjs
npm test
npm run build
git diff --check
```

相邻 extension-tooling：

```sh
npm run demo:build
npm run test:desktop
```

最终真实桌面检查 20 组通过，涵盖安装激活、条件真假、项目关联、草稿首次发送与继续保持 conversationId、消息去重和冲突、阅读撤回、拒收、双窗口同步、语言主题、重启恢复、停用/卸载期间写入取消、开发目录重新加载。

[机器报告与文件指纹](evidence/host-fix/report.json)、[桌面日志](evidence/host-fix/desktop.log)、[完整测试日志](evidence/host-fix/unit-tests.log)、[构建日志](evidence/host-fix/build.log)。已查看条件隐藏和消息来源截图。生产构建仍有既有大 chunk 提示。

## 范围限制

本轮为 macOS arm64 开发 Electron 验收，未验证签名发行包及 Windows/Linux。模型回答仍使用报告既有的本机固定响应服务；宿主、扩展进程、RPC、数据库和窗口均为真实实现。

本轮未新增认证或非空消息 actions 契约，也未将系统通知投递意图当作操作系统投递成功。系统通知横幅不属于本次验收。未提交、推送或发布。
