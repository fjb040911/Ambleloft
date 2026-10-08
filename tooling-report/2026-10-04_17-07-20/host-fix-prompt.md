请阅读本目录 README.md、blockers.md、acceptance-matrix.md 和 evidence/desktop/report.json，对照 requirement/v0.3.0 修复宿主 H-01。忽略 ai-rules 目录。

在真实 Node 后端 → bootstrap → HostManager → OperationRouter 链路中保留已允许的公开错误码。当前 bootstrap.cjs 将所有 handler 异常发成 error:true，hosts.cjs 因此固定返回 INTERNAL。应使用严格白名单，不向页面或模型传播任意 message、stack、输入或凭据；未知异常继续 INTERNAL。核对 OUTCOME_UNKNOWN 等已定义 Failure code 的端到端支持，不由扩展声称 effectStatus=notStarted/completed；effectStatus 仍由宿主真实调度状态决定，取消不能代表回滚。

补测试：1. handler 缺失 context.form 时抛 UNSUPPORTED，客户端得到 UNSUPPORTED，服务写计数不变；2. 未声明 resources.getProjectPath 抛 FORBIDDEN，经 handler 原样传回客户端，服务不写；3. 普通 Operation 的 form undefined 仍工作；4. 未知异常保持 INTERNAL 且无敏感消息；5. 写入错误、确认取消与 unknown 恢复不自动重试。

不要在 SDK 重建登录、表单渲染或错误文本猜测。宿主修复后在 extension-tooling 执行 npm run test:expense:desktop（使用现有本地 tarball 构建归档和隔离配置），T19、T21 应转为 PASS；新建 tooling-report/${datetime}/ 保留本轮证据，不覆盖历史报告。不要自动提交、推送或发布。
