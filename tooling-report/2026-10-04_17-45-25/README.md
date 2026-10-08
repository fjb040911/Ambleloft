# H-01 修复及 SDK/CLI 报销联调复验

需求：v0.3.0。修复前基线：[2026-10-04_17-07-20](../2026-10-04_17-07-20/README.md)。本目录以本轮首次定向测试开始时间（Asia/Shanghai）命名，历史证据未覆盖。

## 结果

H-01 已修复。真实报销桌面复验中 **T19、T21 均由 BLOCKED-HOST 转为 PASS**。

- T19：未声明的 getProjectPath 返回 FORBIDDEN，服务写入计数不变。
- T21：缺少 context.form 的专用 handler 返回 UNSUPPORTED，服务写入计数不变；普通 Operation 的 form 为 undefined，继续正常工作。
- 确认取消、写后丢响应、unknown 核实、明确未执行后的用户主动重试继续通过，不自动重放业务写入。

## 修改

1. errors.cjs 保留既有公开码，补齐 sdk.d.ts 的 Failure code（包括 OUTCOME_UNKNOWN）；只接收精确字符串 code，不根据扩展异常文本猜测。
2. bootstrap 仅发送白名单 code，不发送异常 message、stack、input、details 或扩展自称的 effectStatus。
3. HostManager 再次校验 code，兼容旧 error:true 为 INTERNAL；已调度失败仍为 unknown。
4. OperationRouter 使用同一白名单，effectStatus 仍由 binding.started 计算；未调度取消仍 notStarted，取消不代表服务回滚。
5. 新增真实 fork 后端经 bootstrap → HostManager → OperationRouter 的回归：公开码、资源 FORBIDDEN、无 form 的普通调用、未知码、抛错 getter、伪装成公开码的文本、敏感文本不泄漏、伪造 effectStatus 无效、没有自动重试。原存储撤权断言由 INTERNAL 更新为正确的 FORBIDDEN。

## 本轮执行

- npm run build：PASS。
- npm test：**202/202 PASS**（包含新的真实后端链路测试）。
- 在相邻 extension-tooling 执行 npm run test:expense:desktop：PASS，使用现有本地 tarball 生成的 expense-clean-install.amble-extension 和隔离临时配置；未修改 SDK/CLI 源码或重新发布包。

原始证据：[桌面报告](evidence/desktop/report.json)、[桌面日志](evidence/expense-desktop.log)、[完整单元日志](evidence/host-unit.log)、[构建日志](evidence/host-build.log)、[宿主指纹](evidence/fingerprints.json)。归档包含桌面截图，扩展包指纹和测试环境在桌面报告中。

桌面验证使用本机 Responses 模型 fixture、真实 Agent/MCP 引擎、Node 扩展后端和持久化模拟服务，不代表真实企业认证或远程模型质量验收。本轮没有重跑工具库全部离线打包/CLI 矩阵，因此不把历史 22 项全部宣称为本轮重新通过。桌面报告里的 crossExtensionAndNonPage 字段含历史 CLI 引用；本轮实测的跨扩展拒绝以 T19-cross 为据。

没有提交、推送或发布。
