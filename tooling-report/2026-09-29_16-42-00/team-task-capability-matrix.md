# 团队任务：规范—宿主实现—SDK—Demo 对照

2026-09-29，先建立实现前基线，再据真实桌面结果补齐。依据 agent/specs/extensions/{scope.md,contracts/README.md,message-center-design.md,message-runtime-handoff.md}。真实结果见 [桌面报告](team-task-desktop-report.md)。

| 能力 | 规范 | 宿主实现 | SDK/CLI 差异 | Demo/验收安排 |
| --- | --- | --- | --- | --- |
| 安装/激活/停用 | M1 信任、独立 Node | PackageStore、ExtensionService、HostManager | 已支持 validate/pack | 实际安装包、bootId、停止在途操作 |
| 重新加载 | 开发代码重新校验 | 重新安装开发目录快照；无独立 reload RPC | 不伪造 reload 命令 | 重新加载目录、实例变化、KV 保留、重新授权 |
| 页面/多语言 | 独立静态页面、nls | WebContentsView、页面 context | SDK 已支持 | 中文/英文、主题、真实页面截图 |
| 条件 | when/enablement | 路由校验；管理 snapshot 丢失 command.when | Schema 已支持 | 条件拒绝、页面条件显示；宿主命令隐藏缺口单列 |
| 项目关联 | 精确项目授权，扩展维护关系 | selectProject、resources、KV | SDK 已支持 | 保存真实 projectId，无硬编码宿主项目 |
| 创建/打开聊天 | 稳定 conversationId；创建不执行 | ResourceBroker、identity、AgentRuntime | SDK 已支持 create/open，无公开 resolve | 记录创建 ID；宿主草稿→首次发送→继续执行比对 |
| 本地消息五方法 | handoff 已实现预览 | bootstrap→HostManager→MessageService→DB | 缺公开类型/封装；无 messages capability | 独立 messages-preview 子入口；不虚构权限字段 |
| 去重/拒收/版本 | eventKey、revision、用户偏好 | published/duplicate/rejected/dismissed；投影可能 null | 补精确类型，不统一当成功 | 真实回执、拒收 tombstone、冲突拒绝 |
| 已读/跨窗口 | 内容更新保留已读、同 Profile 同步 | MessageCenter、NotificationSettings、IPC 广播 | 扩展无 readAt/设置偏好权限 | 在真实宿主操作；第二窗口确认；不向扩展开放这些字段 |
| 重启/停用/卸载 | 持久化、generation、历史保留 | DB 持久表与来源检查 | 不新增存储替代层 | 同一隔离 profile 重启、旧调用不能继续写入 |
| 最低宿主 | 未协商前不承诺旧宿主 | context.messages 可检测；无正式能力版本 | engines.api 固定 1 | 记录源码指纹兼容基线、运行时检测，不虚构最低版本号 |
| 认证/账号消息 | 签名未冻结 | 仅连接配置、无认证代理 | 仅提案 | 待支持 |
| 非空 actions | 需持久动作执行 | 明确 UNSUPPORTED | 类型仅空数组 | 待支持 |
| 系统级提醒 | 非首版前置 | remind 只是意图 | 不宣传已投递 | 待支持 |

最终结果：16 组真实桌面检查通过；确认 CONFLICT 被映射为 INTERNAL、来源显示 %name%、
扩展名称不随语言更新、条件命令未隐藏四项宿主问题。详情与证据见桌面报告。
SDK/CLI 差异中五方法封装、模板、安装包与兼容检测已补齐，均为 alpha 预览。
本轮不在 SDK 修补/模拟宿主缺失，不另建认证、消息数据库或全局任意 IPC。
