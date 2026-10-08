# A4 独立 Node 扩展宿主实现记录

日期：2026-09-28。验证平台：macOS arm64。A4 接入独立后台运行，未开放 A5 页面桥或 A6 Agent 操作入口。

## 实现

- 每个 profile 的 ExtensionService 共享一个 HostManager；按 extensionId 保存实例，同一扩展并发激活去重。Electron 适配使用 `utilityProcess.fork` 和应用内 bootstrap，不调用 PATH Node，不在主进程 import 扩展代码。
- 激活前重新检查已安装 revision 的内容摘要、信任、启用和更新状态。支持 CJS/ESM 入口及包内依赖。静态页面或 Skills-only 包无需启动 Node。
- 已信任启用的 `onStartupFinished` 后台在核心初始化后启动。按需激活由内部 HostManager 入口提供，管理界面增加“启动后台”及运行状态；页面/Agent 的自动按需触发等 A5/A6 接入。
- activate 同步阶段注册清单 handler；未声明、重复、异步补注册或缺失 handler 不能进入 active。activate 的异步初始化仍有独立超时。
- 停用、更新、回退、撤权、卸载先拒绝新调用并取消已有请求，再 deactivate、清理 subscriptions，必要时强制终止宿主。新版本只在旧进程确认退出后启动。应用退出先停止扩展和 Agent，再关闭数据库。
- 自动恢复最多退避 1/5/15 秒三次，之后 paused；稳定运行 5 分钟重置故障计数，用户可手动重新启动。恢复不重放失败或取消的操作。
- 子进程环境只传语言、代理、证书、临时目录等明确允许项，不继承模型密钥、NODE_OPTIONS、PATH 或全部环境。cwd 为安装包目录。stdout/stderr 仅收集为每实例最多 64 KiB 的内存诊断日志，不充当 RPC，也不放入普通列表快照。

## 通道与操作传输

- 每次进程激活有独立通道 token，与数据库授权 generation 分开。通道绑定扩展身份，不能由子进程参数切换为其他扩展；旧通道结果丢弃，重复 RPC 请求 ID 拒绝。
- 私有 storage、只读 configuration、配置变更监听、secrets、上下文键和本地化已通过 bootstrap 提供；宿主依赖 A3 进行权限、generation、版本、配额和加密校验。配置不能由扩展通过该桥写入，secrets 不暴露给 renderer。
- 内部操作传输支持 AbortSignal、schema 校验、有界队列、超时和输出验证。每扩展默认 4 个在途槽位、32 个等待项；输入校验占用槽位，入队即开始 deadline。运行中的 handler 忽略取消时继续占位，直到返回或进程结束，不能靠反复超时获得无限并发。
- 默认操作 30 秒、最高 120 秒；激活 10 秒，deactivate 5 秒；心跳每 5 秒，连续 3 个周期无回应则终止并进入有限恢复。
- 未派发的失败标记 `notStarted`；已派发后取消、断连或输出错误标记 `unknown`，不宣称业务副作用已回滚。激活本身使用独立 deadline，操作 deadline 从激活成功后的入队开始。
- `HostManager.invoke` 是宿主内部传输接口，未添加 renderer/Agent invoke IPC。A6 必须先完成 exposure、项目权限、条件和风险确认，再进入此接口，不能将传输接口直接公开。
- InvocationContext 中项目/聊天资源方法目前明确返回 UNSUPPORTED；后续 ResourceBroker 接入前不提供假数据，也不向后台泄露全量工作台。

## 验证证据

- `npm test`：136 项通过，0 失败，包括新增 10 项宿主测试。
- `npm run build`：类型检查和构建通过，仍有现有大 chunk 提示。
- 宿主测试使用真实独立 Node 子进程及相同 bootstrap，覆盖并发激活去重、包内依赖、环境过滤、私有存储桥、取消占位、队列超额、迟到结果、缺失/异步 handler、同 profile 扩展进程隔离、崩溃重试阈值、事件循环阻塞、强制 deactivate、运行中更新、激活中停用、schema 错误及配置事件。
- `node scripts/test-extension-hosts.mjs`：真实应用、真实 Electron utilityProcess、临时 userData、生成的本地扩展。验证 startup 激活、与主进程一致的 ABI、包内依赖、环境哨兵隔离、运行中更新的 stop→dispose→新 activate 顺序、停用/启用、应用退出、再次启动及卸载清理。
- 桌面测试的安装/信任弹窗由测试适配器响应，不操作已有用户配置；没有调用真实模型或外部业务服务。

## 后续边界

- A5 才提供实际多窗口注册、页面实例、页面 RPC、交互授权路由及来源校验。本轮证明共享 HostManager 的并发激活去重，不等价于三个真实窗口的完整验收。
- A6 才接入公共 OperationRouter 和 Agent。A0 的旧线程工具适配、原生页面遮挡仍未关闭。
- A7 仍需对外 SDK 包、开发脚手架和完整 Demo；bootstrap 提供的上下文不代表公开 npm SDK 已发布。
- 当前为可信 Node 代码，不是系统沙箱；终止扩展宿主不承诺撤回外部副作用，也不承诺清理开发者自行启动且脱离宿主的外部进程。
- 正式打包 A4 运行链路、Windows/Linux、原生 npm 模块及真实多窗口仍待目标环境验收，不能据此关闭 M1 发行门槛。
