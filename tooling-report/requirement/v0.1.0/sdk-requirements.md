# SDK 完善需求

需求版本：v0.1.0。目标：SDK 能准确使用最新宿主已实现能力，错误和限制可预测；不是把所有未来接口先写进类型。

## 1. 依据与开工产物

优先逐项对照宿主源码与契约，二者有差异时报告，不静默选择：

- specs/extensions/contracts/{extension.schema.json,sdk.d.ts,README.md}
- specs/extensions/{developer-guide.md,message-runtime-handoff.md,authentication-design.md}
- core/extensions/{bootstrap,hosts,service,operations,manifest,message-handlers,messages}.cjs
- electron/extensions/{page-host,page-preload}.cjs
- src/{ExtensionsPage,ExtensionSettings,ExtensionInteraction,MessageCenter}.tsx

SDK-01：输出能力矩阵，附宿主源码指纹、tooling Git 状态/源码指纹、依赖锁文件与安装包 hash。区分 Node 后台 API、扩展页面 API、宿主内部 IPC；window.desktop 不是扩展 API。

SDK-02：稳定/预览入口分开标明。已存在的 messages-preview 可以保持预览；不得在未协商时声称最低宿主版本。方法存在检测只能判断可调用入口存在，不代表语义版本兼容。

## 2. 当前能力与要求

| ID | 范围 | SDK 必须做到 | 当前边界 |
| --- | --- | --- | --- |
| SDK-03 | 清单/UI | 对齐包内 home、commands、operations、权限、激活事件、contextKeys 和 nls；校验 unknown 字段、路径、schema 和条件表达式 | 不新增树 provider、远程网页、任意菜单/表单插槽等未实现贡献点 |
| SDK-04 | 页面桥 | initialize、invoke、项目选择/授权、安全输入、宿主 context 更新及取消；类型和实际 Result 对齐 | 页面不得直接访问 Node context、window.desktop、其他扩展或宿主私有 IPC |
| SDK-05 | 后台 | activate/deactivate、同步注册 Operation、subscriptions 清理、调用上下文 signal/resources | 不伪造 userInitiated、projectId、generation 或授权证明 |
| SDK-06 | 项目与聊天 | getProject/getProjectPath/createConversation/openConversation 正确绑定调用项目 | 打开必须传已有 conversationId；新建必须显式 create，再 open；不因缺 ID、归档或不存在而静默创建 |
| SDK-07 | 配置 | configuration.get 和 onDidChange；Disposable 与监听生命周期；schema 类型对齐 | Node 只读配置，编辑由宿主设置页完成；当前无字段 default 声明，恢复默认值后 get 返回空对象，由扩展应用自身默认值 |
| SDK-08 | KV/Secrets | 保留 revision、null 值与不存在的区别；安全凭据只在后台使用 | 不在普通配置、日志、页面回执或通知中放凭据；不要将包信任等同 self 资源授权 |
| SDK-09 | 本地通知 | 五方法类型、返回联合类型、可空投影、错误及 local scope 与宿主一致 | 无非空 actions、业务账号范围消息和通用消息订阅 API；不新增虚构 messages 权限 |
| SDK-10 | 本地化/上下文 | 页面跟随 locale/theme；声明字段支持字典回退；区分 command.when 显示与 operation.enablement 执行 | 宿主显示已随语言刷新；Node context.l10n 当前在激活时构建字典，不能声称后台已支持运行中语言切换 |
| SDK-11 | Agent | 暴露给 Agent 的 Operation 使用同一权限、输入校验、确认和输出路径 | Agent Hook、完整回合订阅、提示词摘要作业尚未开放 |

### 聊天身份语义

- SDK 将空/缺失 conversationId 作为无效输入处理，不能降级为新建。宿主仍做独立校验。
- create 返回新 ID；草稿首次发送、后续继续及还原归档均保持原 ID。
- open 只负责打开；已归档时由宿主展示归档交互，不隐式还原。删除、不存在或跨项目必须明确失败。
- 不新增“查询聊天是否归档”的伪接口。若业务需要此状态而公开 API 不提供，记录契约需求；不得调用 window.desktop 或解析宿主 DOM 实现 SDK 功能。
- 成功打开不等于已发送、完成任务或模型已执行。

### 通知五方法

```ts
context.messages.publish(input)
context.messages.getByEventKey(eventKey)
context.messages.update(id, patch, expectedRevision)
context.messages.withdraw(id, expectedRevision)
context.messages.getPreferences()
```

SDK-12：精确描述 published / duplicate / rejected / dismissed，以及各分支真实包含的字段，不假定都有 id/revision/remind。getByEventKey 及更新/撤回投影按实际允许 null 的行为定义。示例需处理拒收、清除与不可见结果。

SDK-13：eventKey 为业务事件稳定 ID，不用每次重试时间戳替代。update 与 withdraw 携带版本，冲突返回 CONFLICT；普通内容更新不变成新消息，不增加未读或重提醒。remind 只代表提醒意图，不能承诺系统横幅已出现。

### 配置

SDK-14：宿主目前提供字符串、数字/整数、布尔、枚举表单，复杂对象和数组为 JSON 编辑。说明字段可本地化，字段键当前不是用户友好标题贡献点。CLI 校验器不得擅自接受 default/title/when 等当前 configuration schema 未支持的字段。

提供类型安全的应用侧默认值示例：读取配置后与开发者定义默认值合并；收到空对象变化后回到默认行为。需要 schema.default、字段标题、设置项条件时，另交契约提案，未批准前不伪造支持。

## 3. 错误与并发

SDK-15：真实远端 CONFLICT 必须保持 code。未知内部错误保持 INTERNAL，不泄漏堆栈、路径、凭据；禁止解析中英文 message 猜错误码。

SDK-16：审计初始化失败、桥销毁、队列满、超时、取消及进程退出。若宿主本地错误只有文本没有结构化 code，报告 BLOCKED-HOST；SDK 不用字符串推断掩盖它。错误类型契约与可用的真实字段一致。

SDK-17：任何可能产生副作用的失败都不自动重放。取消等待不代表撤销已发生的业务，effectStatus=unknown 不等于执行失败。后端资源回调只在有效调用期间使用。

SDK-18：同一监听器只注册一次，销毁页面或 deactivate 后释放；配置、主题变化不造成重复连接、重复通知或悬挂 Promise。

## 4. 发布物与验证

SDK-19：SDK/CLI 的版本、exports、声明文件、清单校验器、模板、README 与生成工程一致；CJS/ESM 及严格 TypeScript 在隔离目录安装 tarball 后验证，不依赖 monorepo 源码或偶然的间接依赖。

SDK-20：保留现有 team-tasks 模板，并增加本版 Demo 的生成或清晰安装方式。新工程一条创建命令后，按文档安装依赖、构建、校验、打包可完成。未知宿主能力显式显示不可用，不返回假成功。

最低交付：能力矩阵、SDK/CLI 改动及变更说明、tarball、真实 Demo 安装包、测试源码、执行日志、阻塞清单。准确记录实际包版本，不能因为目录 v0.1.0 就倒改 SDK 的 alpha 版本。

## 5. 明确不由 SDK 补造的功能

认证：宿主已有连接配置、内部 OIDC 协议适配和登录尝试模块，尚无完整扩展认证授权代理。SDK 不另建登录体系，不暴露平台 Token，不发布草案 auth 方法为可用能力。

消息动作：内部 action journal 不代表非空通知 actions 已可用。保持 UNSUPPORTED 验证，不以 Demo 自行执行按钮替代宿主动作派发。

消息订阅：仅有配置订阅和页面宿主上下文订阅可公开使用；宿主通知列表刷新属于内部 UI 行为。业务服务推送由扩展自行维护连接，详见 Demo 需求。
