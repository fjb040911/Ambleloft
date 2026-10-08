# v0.1.0 真实桌面验收矩阵

共 51 项：PASS 48，FAIL 0，BLOCKED-HOST 2，NOT-RUN 1。

SDK-16 队列缺码等 SDK 审计结论另见 capability-matrix.md，不混入这 51 项统计。

每行原始要求、前置条件、时间和实际结果见 [cases.json](cases.json)；原始调用回执见 [机器记录](evidence/desktop/report.json)。PARTIAL 不用作状态；混合场景有不可用子项时按 BLOCKED-HOST 保守标记。

| ID | 操作场景 | 要求断言 | 状态 | 实际结果摘要 |
| --- | --- | --- | --- | --- |
| UI-01 | 安装并首次打开，无项目授权 | 正确空状态；不枚举未授权项目内容；无假成功 | PASS | {"storageCode": "FORBIDDEN"} |
| UI-02 | when 从 false 切 true 再切 false | 管理命令隐藏/出现正确，后台执行仍校验 | PASS | {"falseTrueFalse": true, "executionRechecked": true} |
| UI-03 | enablement=false 直接 invoke | 明确拒绝，不派发；与 when 区分 | PASS | {"code": "FORBIDDEN"} |
| UI-04 | 中文→英文、亮→暗，第二窗口同时打开 | 入口、命令、通知来源、配置描述、页面随当前语言更新，合理回退 | PASS | {"twoPages": true, "sources": true, "configurationDescriptions": true, "commands": true} |
| UI-05 | 长名称、窄窗口、键盘操作、打开关闭页面 | 无遮挡/焦点丢失，监听释放，不额外生成业务记录 | PASS | {"narrow": true, "longName": true, "keyboardFocus": true, "reopened": 3, "noExtraBusinessRecords": true, "dispose": "SUB-05"} |
| UI-06 | 取消宿主确认；记住后撤销 | 取消零副作用；撤销后恢复确认；页面不能自报批准 | PASS | {"cancelled": true, "remembered": true, "reset": true} |
| CHAT-01 | 新建 A 并打开，不发送 | 只有一个草稿，无 run/模型调用；回执 ID 与宿主一致 | PASS | {"conversationId": "9aa1740e-ec33-45e0-9e7b-d351dd64058d", "noRun": true} |
| CHAT-02 | A 首次发送及后续继续 | 同一 conversationId，业务关联仍指向 A | PASS | {"conversationId": "9aa1740e-ec33-45e0-9e7b-d351dd64058d", "modelCalls": 3} |
| CHAT-03 | 打开 A 多次 | 不重复创建，不重复注入或发送用户消息 | PASS | {"draftCount": 1} |
| CHAT-04 | 同一业务任务新建 B | A/B ID 不同，列表可分别打开，A 关联保留 | PASS | {"a": "9aa1740e-ec33-45e0-9e7b-d351dd64058d", "b": "b1ad198e-4622-41d4-8795-f73fbb330192"} |
| CHAT-05 | 归档草稿 A，再从扩展打开 | 展示归档交互，不进入可误发送状态，不自动还原或创建 | PASS | {"conversationId": "b1ad198e-4622-41d4-8795-f73fbb330192", "archived": true} |
| CHAT-06 | 明确选择还原并继续 | 原 ID 保持，归档解除，发送成功 | PASS | {"conversationId": "b1ad198e-4622-41d4-8795-f73fbb330192"} |
| CHAT-07 | 归档草稿选择复制/当前内容新建 | 新 ID，与旧 ID 分离，旧草稿仍归档 | PASS | {"source": "0100e20e-b428-4efb-8db5-5d9d153125bc", "sourceStillArchived": true} |
| CHAT-08 | 打开草稿后在另一窗口修改/归档/删除 | 发送前核对，不执行旧内容；用户输入保留，恢复路径可用 | PASS | {"changed": true, "archived": true, "deleted": true, "inputRetained": true, "modelNotCalled": true} |
| CHAT-09 | 仅版本变化、内容未变 | 采用最新版本，发送成功；提交时仍有事务校验 | PASS | {"conversationId": "ea05f82e-6ec6-44c4-8c7a-6143be335110"} |
| CHAT-10 | 已执行聊天归档/删除后扩展再次打开 | 不自动执行/复活；归档可查看或提示还原，删除明确失败 | PASS | {"archivedPreserved": true, "deletedCode": "NOT_FOUND"} |
| CHAT-11 | 不传/空 ID、未知 ID、跨项目 ID | 不隐式创建，返回真实错误，不泄漏未授权内容 | PASS | {"empty": "INVALID_ARGUMENT", "unknown": "NOT_FOUND", "crossProject": "FORBIDDEN"} |
| CHAT-12 | 项目重命名、删除或授权撤销后调用 | 不使用失效范围；可理解错误；不改变旧聊天 ID | PASS | {"renamed": true, "revoked": "FORBIDDEN", "deleted": "FORBIDDEN", "idsPreservedBeforeUnlink": true} |
| MSG-01 | 新事件、同 key 重复发布 | published→duplicate，只有一条消息、一次首次提醒意图 | PASS | {"pub": {"status": "published", "id": "8a0f950f-3513-4cc2-8550-dad63a8eba0c", "revision": 1, "remind": true}, "dup": {"status": "duplicate", "id": "8a0f950f-3513-4cc2-8550-dad63a8eba0c"}} |
| MSG-02 | 更新正文后查回 | revision 递增，另一窗口刷新，eventKey/来源不变 | PASS | {"revision": 2, "unread": 0} |
| MSG-03 | 标记已读后更新 | 保留已读，不新增未读或主动提醒 | PASS | {"revision": 2, "unread": 0} |
| MSG-04 | 旧 revision 更新/撤回 | CONFLICT 原样可判别，原内容不被覆盖，不自动重试 | PASS | {"code": "CONFLICT", "unchanged": true} |
| MSG-05 | 撤回、过期、已完成后更新 | 不恢复有效待办；记录保留，终态约束有效 | BLOCKED-HOST | {"expired": "expired", "resolvedTerminal": true, "reactivation": "CONFLICT", "nonemptyActionDispatch": "BLOCKED-HOST"} |
| MSG-06 | 拒收新事件、再打开接收并重发同 key | rejected 保持，不复活；查询无可见结果 | PASS | {"rejected": {"status": "rejected"}} |
| MSG-07 | 拒收期间更新/撤回已有消息 | 允许状态更新，不增加未读/提醒 | PASS | {"validity": "withdrawn", "unread": 0} |
| MSG-08 | 静音后发布 | 仍有消息与未读，无主动提醒意图；解除后只影响后续事件 | PASS | {"muted": {"status": "published", "id": "a3da7d5a-dedb-4f4f-9bf5-0b99cba87a34", "revision": 1, "remind": false}} |
| MSG-09 | 用户清除再查/重发 | 查询 null，同 key dismissed，不重新出现 | PASS | {"query": null, "publish": "dismissed"} |
| MSG-10 | 全部已读/按来源筛选/清除已读 | 范围正确；待办保护符合现行规则，不误清其他来源 | PASS | {"bulk": true, "otherSourcePreserved": true, "pendingProtected": true} |
| MSG-11 | 重启后重复发布、恢复列表 | 记录、版本、已读、拒收标记和偏好保留 | PASS | {"dataRestored": true, "rejectedPersistent": true, "readTime": 1790678145109, "muted": true} |
| MSG-12 | 双窗口读消息/改接收设置 | 同步更新；扩展不获得 readAt/dismissedAt | PASS | {"readSynchronized": true, "preferencesSynchronized": {"receive": true, "muted": false}} |
| MSG-13 | 非空 actions、伪造来源/账号、非法超大输入 | 真实拒绝，无假消息按钮或跨来源写入 | PASS | {"actions": "UNSUPPORTED", "identity": "FORBIDDEN", "oversize": "INVALID_ARGUMENT"} |
| MSG-14 | 系统通知允许/静音/拒收/点击 | 支持平台观察横幅与打开消息中心；权限受系统阻止时记 NOT-RUN，不用 remind 代替系统实测 | NOT-RUN | "未观察操作系统横幅及点击；宿主有 Electron Notification 实现，不能以 remind 代替平台验收。" |
| SUB-01 | 本地服务推送新事件 | 真实后台收到并发布通知，页面不直接写宿主消息 | PASS | {"eventId": "event-1"} |
| SUB-02 | 两窗口打开 Demo | 服务端观测一个有效订阅连接；同事件一条通知 | PASS | {"connections": 1, "windows": 2} |
| SUB-03 | 服务断线、重启、重复与乱序事件 | 有界重连、去重、旧版本不覆盖；无无穷重复提醒 | PASS | {"version": 3, "staleIgnored": true, "reconnected": true, "serviceRestarted": true} |
| SUB-04 | 改地址/关连接、停用/卸载 | 旧连接释放，旧 generation 的在途回调不能写入 | PASS | {"manualDisconnect": true, "configChange": true, "disable": true, "uninstall": true} |
| SUB-05 | 配置/context listener dispose | 释放后不再回调，重复开关页面不堆积 | PASS | {"configurationBeforeDispose": 1, "afterDispose": 1, "contextAfterDispose": 0} |
| CFG-01 | 未授权访问配置，后通过宿主授权 | 前者拒绝，后者读取成功；信任安装不自动授权 | PASS | {"before": "FORBIDDEN", "after": ""} |
| CFG-02 | 设置页编辑 string/enum/boolean/integer | 保存后后台 get 与 change 事件一致，刷新/重启保持 | PASS | {"limit": 8, "density": "compact", "changes": 2} |
| CFG-03 | 不合法类型、必填缺失、越界、复杂 JSON 错误 | 保存被拒绝，旧有效配置未覆盖 | PASS | {"invalid": ["range", "type", "array", "unknown"], "unchanged": true} |
| CFG-04 | 两窗口打开配置，先后保存 | 旧 revision 冲突，输入保留，不静默覆盖 | PASS | {"twoWindows": true, "conflict": true, "inputRetained": true} |
| CFG-05 | 恢复默认值 | 宿主清除配置、后台收到空对象、应用默认行为恢复；重启一致 | PASS | {"emptyObject": true, "defaultsRestored": true, "restartConsistent": true} |
| CFG-06 | 未保存退出、扩展升级/停用时保存 | 有退出保护；generation 变化拒绝旧表单写入 | PASS | {"unsavedExitProtected": true, "staleGenerationRejected": true} |
| DATA-01 | KV null、缺失、CAS、删除再创建 | 返回语义正确；revision 单调，旧写入不能穿透 | PASS | {"missing": true, "nullValue": true, "increasing": true, "staleCode": "CONFLICT"} |
| DATA-02 | 测试 secret 输入/后台读取/删除 | 页面和日志无秘密；跨扩展读取拒绝；加密不可用不降级 | PASS | {"saved": true, "deleted": true, "noPageValue": true, "crossExtension": "FORBIDDEN", "otherSecretAbsent": true} |
| LIFE-01 | 安装、激活、关闭页面重开、重载开发包 | 状态和实例变化符合设计，业务数据保持，无额外后台 | PASS | {"installation": true, "reload": true, "closedPages": true} |
| LIFE-02 | 在途写操作时停用/卸载 | 后续调用拒绝，过期实例不能写；历史通知按设计保留 | PASS | {"disabledInFlightBlocked": true, "uninstallNewCallBlocked": true, "uninstallInFlightBlocked": true} |
| LIFE-03 | 后台崩溃、超时、取消 | 用户可恢复；不自动重放未知结果的写操作 | PASS | {"timeout": "TIMEOUT", "effectStatus": "unknown", "crash": "HOST_UNAVAILABLE", "recovered": true, "cancelled": "CANCELLED"} |
| LIFE-04 | 应用重启、安装版本更新/回退 | 数据和身份保持，旧确认/权限版本不能误用于新实例 | PASS | {"restart": true, "upgrade": "0.2.1", "rollback": "0.2.0", "identityPreserved": true} |
| AGENT-01 | Agent 发现并调用声明 Operation | 项目范围、输入、确认、错误和返回正确；不借页面桥绕过 | PASS | {"discovered": true, "read": true, "writeConfirmed": true, "invalidInput": "INVALID_ARGUMENT"} |
| AGENT-02 | Agent 尝试页面交互能力或无权限操作 | 拒绝或要求用户交互，不伪造用户点击 | BLOCKED-HOST | {"expected": "INTERACTION_REQUIRED", "actual": "INTERNAL", "pageOnly": "FORBIDDEN", "output": {"type": "function_call_output", "id": "fco_01a0ecbb-bc35-7f83-a350-d04f39f322a1", "call_id": "lab-agent-8", "output": [{"type": "input_text", "text": "Wall time: 0.1263 seconds\nOutput:"}, {"type": "input_text", "text": "{\"ok\":true,\"value\":{\"success\":false,\"code\":\"INTERNAL\",\"data\":\"\"}}"}]}} |
