请在 AmbleLoft 宿主项目 agent 中，根据 tooling-report/2026-09-29_16-42-00 的真实桌面报告修复四项已确认缺陷。忽略 ai-rules 目录。直接实施修复并验证，不只输出方案。

先阅读：
- tooling-report/2026-09-29_16-42-00/team-task-desktop-report.md
- tooling-report/2026-09-29_16-42-00/team-task-capability-matrix.md
- tooling-report/2026-09-29_16-42-00/evidence/team-tasks/report.json 及相关截图
- specs/extensions/message-runtime-handoff.md，以及相关扩展规范和实际实现

报告是修复前基线；先核对当前源码差异，定位行号仅供参考。不要覆盖基线证据。SDK/CLI 和团队任务 Demo 位于相邻 ../extension-tooling。

修复范围及验收条件：
1. 命令条件显示：核查 core/extensions/service.cjs 的 snapshot、管理页面和相关类型。when=false 的命令应隐藏，条件改变后正确刷新；when=true 可显示和执行。保留宿主执行时条件校验，不能仅做前端隐藏；区分 when 与 enablement，不改变规范语义。
2. 消息错误码：核查 core/extensions/messages.cjs、message-handlers.cjs 和 hosts.cjs 的 RPC 错误序列化。真实版本冲突应向扩展返回 CONFLICT，不能折叠为 INTERNAL。采用规范内结构化错误码，未知内部错误仍安全地返回 INTERNAL，不泄漏堆栈或内部信息。不要让 SDK 根据错误文本猜测，也不要自动重试写操作。验证旧 revision 仍拒绝且不会覆盖内容。
3. 通知来源国际化：消息中心及通知设置应解析 displayName 的字典占位符，不再显示 %name%。复用宿主本地化规则，覆盖缺失翻译的合理回退；不得改变来源 ID、去重范围、用户偏好或历史消息身份。
4. 扩展入口国际化：切换宿主中文/英文后，入口名称、管理页及相关贡献标签随当前语言刷新，不再固定 default 字典或启动时语言。多窗口表现一致，扩展页面原有 locale/theme 更新继续正常。

为实际根因补充有意义的回归测试，执行相关测试和宿主构建，再运行真实 Electron 验收。可复用 ../extension-tooling/scripts/test-team-tasks-desktop.mjs，但先修正其中与修复前缺陷绑定的检查：条件命令测试目前等待该按钮 attached，修复后应等待管理页加载完成并断言命令不可见，而非等待按钮存在；将四项 HOST GAP 探测升级为明确断言。不要删除或跳过失败检查来宣称通过。保留修复后的脚本改动及运行记录。

从 extension-tooling 运行 npm run demo:build 和 npm run test:desktop；脚本默认读取相邻 agent，也可用 AMBLE_HOST_PATH 指定宿主路径。宿主须先安装依赖并 npm run build。验收必须使用真实宿主、扩展进程、RPC、数据库和窗口；允许现有本机模型固定响应仅用于首次发送/继续执行链路，不得 mock 缺失宿主能力。

回归确认：安装/激活/停用/重新加载；项目授权关联、创建草稿不自动执行；首次发送与继续保持同一 conversationId；通知发布/查询/更新/撤回、eventKey 去重、拒收标记、保留已读、跨窗口同步；重启恢复；停用和卸载阻止后续调用及在途写入。

边界：不在 SDK 新建登录流程，不冻结或发布尚未确认的认证接口/清单字段。认证登录、非空通知 actions、系统级提醒投递继续列为待支持；remind 不等于系统投递成功。不虚构 messages 权限、reload API 或最低宿主版本。若修复确需改变扩展契约，先记录兼容影响和接口提案，不擅自发布稳定能力。

交付：完成宿主修复代码、针对性回归测试，为本次修复验证新建 tooling-report/${datetime}/ 目录（datetime 使用 Asia/Shanghai 时区的 YYYY-MM-DD_HH-mm-ss），在其中的 host-fix-report.md 写明每项根因、修改文件、实际运行命令和结果、剩余问题及未验证平台；新的截图和机器记录存本次新目录下的 evidence/host-fix/，保留修复前证据，并在 tooling-report/README.md 增加本轮索引和基线链接。若任何验收受阻，明确阻塞与未验证范围，不能把单元测试替代为真实桌面通过。不要自动发布、推送或合并。
