# M1 开发任务与验收

状态：A0/A1 已按用户要求启动；探针结果、已实现校验范围与未关闭门槛见 [A0/A1 记录](./a0-a1-results.md)。A0 旧线程适配的 macOS 双协议证据已由 A6 补充，页面合成层 macOS 证据已由 A5 补充，公开契约仍是草案；A2 资源基础和 A3 包/授权基础已接入，分别见 [A2 记录](./a2-results.md) 与 [A3 记录](./a3-results.md)；A4 独立后台已接入，见 [A4 记录](./a4-results.md)；A5 页面和多窗口已接入，见 [A5 记录](./a5-results.md)；A6 统一路由与内部 MCP 已接入，见 [A6 记录](./a6-results.md)；A7 SDK、Demo 与打包工具已交付，见 [A7 记录](./a7-results.md)；A8 与跨平台正式发行验收仍待完成。

## 1. 进入开发的条件

1. [设计](./m1-design.md) 的 R1 稳定聊天身份与操作确认策略均已确认；技术选型、组件协议及默认参数按探针结果冻结。产品身份规则不再作为未决阻塞项。
2. A0 使用本地模拟模型服务验证固定引擎的工具新建/恢复协议。若不支持，补充内部 MCP 适配方案评审，不以删历史、放开权限或升级依赖绕过。
3. Windows、macOS、Linux 均为正式发行目标，按 [跨平台矩阵](./platform-support.md) 分别确定打包 Node/ABI 事实及运行可用性。未通过的平台标记发行阻塞，不据此缩减范围；三平台发行完成必须有各平台真实产物验收证据。
4. 对 manifest/SDK 草案收敛并标注冻结 revision。禁止开发 Agent 自行扩大 API 范围。

## 2. 顺序与交付物

| 任务 | 依赖 | 修改范围建议 | 交付与验收 |
| --- | --- | --- | --- |
| A0 协议与容器探针 | 评审后的探针任务 | 独立 fixture/test，不接入业务 UI | dynamic tools 新建/恢复/旧线程；utilityProcess Node/ABI；WebContentsView preload、modal 遮挡和页面来源验证；失败提供证据 |
| A1 契约与校验 | A0 路线明确 | core/extensions/manifest、打包校验工具 | schema＋语义校验、有效和无效 fixtures、i18n/条件解析；不能用 eval |
| A2 资源与数据库迁移 | A1（R1 已确认） | store/database-worker/AgentRuntime identity、UI 写入调用 | 资源级写入与 revision、稳定聊天引用；新旧用户数据迁移可恢复、并发不丢数据 |
| A3 包与授权 | A1、A2 | package/grants/storage、管理设置 | staging/不可变 revision、信任、按项目授权、手动更新、卸载数据选项；旧扩展迁移不自动授予代码执行 |
| A4 扩展宿主 | A0、A3 | hosts/process-adapter/bootstrap | 独立进程、激活去重、绑定 handler、取消/停用/有限恢复；包内依赖运行 |
| A5 窗口与页面 | A2、A4 | window-registry/page-host/page-preload、扩展操作列表 | 跨窗口共享后台、专用页面桥、授权选择器、设置与页面分离；多窗口事件同步 |
| A6 操作与 Agent | A0、A4、A5 | OperationRouter、agent adapter、审批 UI | 页面和模型相同操作；page-only 防绕过、project 范围、取消和未知结果 |
| A7 SDK 与 Demo | A1–A6 | SDK 构建、examples、打包配置 | 最小项目卡片扩展从开发目录到 ZIP 安装；不依赖全局 npm 包，不临时安装 |
| A8 集成验收 | A1–A7 | 必要回归与桌面发布包测试 | 既有聊天/Skills/文件/模型设置无回归，重启/恢复/撤权可复现，记录目标平台版本 |

A2 和 A5 必须一起关闭旧的无版本整份 workspace 写入口。单独新增新表或锁并不足以宣称多窗口安全。

## 3. 必须验证的行为

以下通用行为必须在 Windows、macOS、Linux 保持一致。A0/A8 必须补齐原生环境和发行产物矩阵；单平台通过不能关闭三平台验收。

### 包与兼容

- 非法 ZIP 路径、链接、大小写重复和解压超额被拒绝，失败不触发扩展代码。
- 校验失败不停止旧实例；切换中断后不会运行两个版本，旧包可手动恢复。
- 旧文本扩展仍可打开/禁用；同 ID 新 Node 包必须重新信任，权限扩大不自动授权。
- 生产包依赖完整，不靠仓库 node_modules 或 PATH Node。原生依赖仅在实测兼容平台宣称支持。

### 生命周期与多窗口

- 同一 profile 三个窗口并发打开只产生一个 Node 实例，页面实例各自隔离。
- 关闭窗口 A 取消 A 的在途页面调用，不终止 B 的调用或后台连接。
- 扩展 A 崩溃不终止扩展 B；恢复到阈值后暂停，无无限重启。
- 停用后旧 generation 的页面与 handler 回复被拒绝；应用退出先清理再关闭 DB。

### 资源与权限

- 未选项目列表、目录路径、模型凭据不会通过项目 DTO 或错误信息泄露。
- 页面绕过选择器传入任意 projectId 不能访问；后台不能发起交互授权。
- 撤权影响后续调用与输出交付；已读取数据不可收回，界面不作相反承诺。
- 两窗口更新不同项目、插件创建草稿并发时不丢记录；同资源旧 revision 更新返回冲突。
- 创建→用户首次发送→继续聊天保持 conversationId；复制为新聊天产生新 ID，原引用不变，创建和复制均不自动启动执行。
- 应用重启后通过原 conversationId 仍能定位同一聊天；draft→run 转换失败回滚，不能出现丢失引用或同时指向两条记录。
- 旧数据迁移重复启动不重新分配 conversationId；内部 recordId 或引擎 threadId 变化不改变已发给扩展的引用。

### Operation 和页面

- page-only 从模型目录和 invoke 入口均不可达；invalid input 在 handler 前拒绝。
- handler 输出 schema 错误不误报业务已回滚；超时与取消无自动重放。
- handler 忽略取消不能释放无限并发槽位，Host 无响应可诊断和有限恢复。
- 页面跳转、伪造身份、子 frame、错误版本、重复 requestId 均被拒绝或明确终结。
- 扩展 view 不覆盖宿主审批 modal，resize/zoom/focus 行为正确；不载入主 preload。
- 页面关闭不停止独立后台；模型取消关闭相关 invocation。

### 操作确认

- 已授权读取不弹确认；未知风险写操作默认逐次确认。
- 普通可撤销写操作只有用户为精确范围开启后免确认，跨项目、调用来源、更新或撤销后不沿用失效记录。
- external/destructive/bulk/permissions 操作忽略普通免确认记录，逐次确认。
- 页面宿主提交组件只确认一次；插件自报 approved 或猜测确认 ID 不生效。
- 改参、撤权、换版本、页面销毁及确认超时后不能派发；重复确认事件最多派发一次。
- 免确认不绕过资源授权，取消确认不启动 handler；重试不是复用旧批准。

### Agent

- 固定引擎上验证新线程、恢复线程、已有旧线程三条路径，不跳过失败路径。
- Chat Completions 和 Responses 兼容 fixture 均能调用操作，工具执行仍归引擎循环管理。
- 运行身份与 project 由宿主绑定，不接受模型自报 thread/window/profile；Agent full 模式不能绕过扩展授权。
- 关停扩展后目录更新，旧工具请求返回确定错误，不保留旧实现权限。

## 4. 验证层次与停止标准

单元测试覆盖校验、作用域、路由和状态机；DB 测试用临时目录覆盖事务与故障恢复；本地 fixture 验证模型协议，不使用用户真实端点或凭据；Electron E2E 验证实际窗口/页面/IPC；打包 smoke 验证资源路径与运行时。

完成相关测试后进行现有测试集与 build 回归。新接口无法验证时不得以 mock 全通过替代实际桥接验收。每个任务记录命令、结果、平台和剩余限制；通过后不反复跑无关测试。

## 5. M2 衔接

M1 只预留身份、授权及提交边界。M2 另行设计：终态与 outbox 同事务、重投 ACK、快照保留、提示词预算与 outcomeUnknown、站内消息持久化和账号过滤。M2 不应复用 250ms UI publish 冒充可靠事件；已有数据库迁移需顺序升级。
