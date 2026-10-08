# SDK/CLI 与全场景 Demo 交付报告

依据 [需求 v0.1.0](../requirement/v0.1.0/README.md)。本轮从能力审计开始，补实现并执行真实 Electron 验收。
SDK/core/CLI 为 **0.1.0-alpha.3**，team-lab Demo 为 **0.2.0**；没有将需求目录版本当作 SDK 稳定版。

## 实现

- SDK 新增独立 `runtime-preview`：getResources 拒绝空聊天 ID，不将打开降级为创建；observeConfiguration 先订阅再读取，忽略过期初始值，支持明确释放。M1 类型/Schema 保持宿主来源，messages-preview 保持五个实际方法与精确联合返回。
- CLI 保留 project-card/team-tasks，新增 `init --template team-lab`。三个模板均以隔离 tarball 安装验证 CJS/ESM、严格 TypeScript、构建、校验和打包。
- Demo 提供多任务与每任务多个聊天，显式创建/打开/解除关联；创建未知结果保留待核对意图，不重试。归档、还原、复制由宿主处理，不造归档查询 API。
- 配置示例覆盖 string/boolean/enum/integer/可选字段/JSON 数组；limit 必填。默认值集中在应用代码，宿主清空配置后采用应用默认值，不声明 schema.default/title/when。
- 安全输入由宿主显示；页面仅得到保存/存在性，不获得明文。KV 案例包含 null、缺失、CAS 和删除后单调 revision。
- 本地业务服务采用 SSE，另提供 `npm run service` 独立启动方式；仅监听回环地址。后台单连接，页面只展示状态；有界退避、心跳超时、断开、配置切换和释放。
- 事件使用稳定 eventId 与业务版本，先保存意图，再调用真实宿主消息；重复/乱序不能覆盖新版。不是跨系统事务，不承诺恰好一次；不自动重放未知写入。
- 普通业务界面与折叠技术回执分开，支持中文/英文、亮暗主题、窄窗口、长名称及焦点。开发者诊断 Operation 明确限定用途，仍走真实宿主权限与确认。

## 验证结论与证据

51 项逐例验收：**48 PASS、0 FAIL、2 BLOCKED-HOST、1 NOT-RUN**，见 [验收矩阵](acceptance-matrix.md)。宿主阻塞保留，未用 mock 填补能力；不能称为全部宿主能力验收完成。

- 57 个单元/包安全测试通过：[日志](evidence/unit-tests.log)。此类测试不替代真实桌面。
- 13 文件来源一致性检查通过：[日志](evidence/upstream.log)。新增 preview exports 为明确允许的增量。
- 隔离 npm tarball 安装与三个模板验证通过：[日志](evidence/packages.log)。测试在仓库外、空 npm 缓存安装打包依赖，不依赖宿主的 node_modules。
- 宿主生产构建通过：[日志](evidence/host-build.log)；Demo 构建/打包：[日志](evidence/lab-build.log)。宿主构建存在既有 chunk 大小提示。
- 本地服务独立 Node 进程启动、回环监听、SIGTERM 退出及端口重新绑定通过：[日志](evidence/service-standalone.log)。
- 真实 macOS arm64 Electron 验收：[日志](evidence/desktop.log)、[机器结果](evidence/desktop/report.json)、[Agent 工具回执](evidence/desktop/agent-output.json)。记录各用例参数摘要、错误码、ID、时间和包/源码 hash。

验收使用真实 Electron、Node 后台、页面桥、OperationRouter、SQLite 与 Agent 引擎，两个实际窗口和隔离临时 Profile；测试结束清理资源。
模型固定响应服务仅负责生成已知回答和指定工具调用，不替代引擎、工具路由或权限校验。本地 SSE 服务仅提供业务输入事件，不替代宿主消息服务。

原生文件选择/信任/资源对话框由测试适配器提供确定选择；原生放弃未保存确认使用确定返回值适配。宿主 React 项目授权、操作确认、记住选择与撤销、设置表单冲突实际交互验证。
测试驱动可使用 window.desktop 作为宿主内部验收入口；扩展 SDK/页面/后台不使用它。部分准备和边界操作通过真实宿主 IPC 完成，不声称每项都手动点击 UI。

重点实测：A/B 身份保留、首次发送与继续、归档还原/复制、删除与跨项目拒绝；双窗口草稿变更拦截并保留输入；配置冲突保留输入；安全密钥跨扩展隔离；消息去重/已读/拒收/静音/清除/终态；服务单连接、重连、实例重启、端点切换；默认配置重启一致；升级回退、崩溃恢复、取消、超时与停用卸载边界。

## 阻塞与未验证

- Agent 打开聊天被拒绝，但宿主把 INTERACTION_REQUIRED 改成 INTERNAL；正确身份边界保留，错误语义不完整。
- 后台本地 RPC 队列满等错误没有结构化 code；64 个并发配置读取真实复现 32 个无 code 拒绝。SDK 不猜文本。初始化、shutdown 等相关分支另有源码审计，未逐一声称实测。
- Node l10n 激活时字典不随运行中 locale 更新；页面及贡献标签已实测更新。
- 非空 actions、认证授权代理、通用消息/Agent 完整回合订阅仍无公开可用能力。消息过期/撤回/业务 resolved 状态可验证，但不能把它当作动作按钮派发验证。
- 系统级横幅与点击（MSG-14）未观察，NOT-RUN。当前宿主已有 Electron Notification 投递路径；remind 不证明操作系统投递成功。未执行 Windows/Linux、签名发行包或真实企业 IdP/互联网服务测试。

见 [最小复现与建议](blockers.md)。本轮没有修改宿主运行时来消除缺口，没有另建登录流程。

## 交付与复现

- [可安装 Demo](../../../extension-tooling/dist/team-lab.amble-extension)
- [SDK tarball](../../../extension-tooling/dist/npm/ambleloft-extension-sdk-0.1.0-alpha.3.tgz)
- [CLI tarball](../../../extension-tooling/dist/npm/ambleloft-extension-cli-0.1.0-alpha.3.tgz)
- [core tarball](../../../extension-tooling/dist/npm/ambleloft-extension-core-0.1.0-alpha.3.tgz)
- [Demo/服务源码与教程](../../../extension-tooling/examples/team-lab/README.md)
- [桌面测试源码](../../../extension-tooling/scripts/test-team-lab-desktop.mjs)

在 extension-tooling 根目录：

```sh
npm ci
npm test
npm run check:upstream
npm run test:packages
npm run lab:build
npm run test:lab:desktop
```

宿主先安装依赖并 `npm run build`。桌面测试默认使用相邻 agent；可设置 AMBLE_HOST_PATH 指定另一份源码。
驱动输出 test-results/team-lab，本轮最终证据复制到本目录；下一轮新建 `tooling-report/${datetime}/`，不可覆盖此基线。

已查看并检查：[中文空状态](evidence/desktop/01-empty.png)、[关联后的页面](evidence/desktop/07-linked-chats.png)、[英文暗色](evidence/desktop/04-english-dark.png)、[窄窗口焦点](evidence/desktop/05-narrow.png)、[真实聊天](evidence/desktop/06-conversation.png)。用户输入的项目/任务名称不随语言翻译。未覆盖所有屏幕尺寸。
