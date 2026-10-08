# v0.3.0 SDK/CLI 与声明式报销 Demo

本轮交付 SDK/core/CLI **0.1.0-alpha.4**、财务报销助手 **0.1.0**、独立 SQLite 本机服务 **0.1.0**。未发布 npm、未提交/推送、未改宿主业务源码。

验收 **20 PASS / 2 BLOCKED-HOST**（T19、T21，均为后端错误码折叠为 INTERNAL）。工具库 **65/65**，宿主本轮重跑 **201/201**；5 种脚手架真实 tarball 干净离线安装构建通过；服务幂等/故障测试通过。

- [能力对照](capability-matrix.md) · [初始基线](capability-matrix-initial.md) · [逐项验收](acceptance-matrix.md)
- [宿主缺口](blockers.md) · [交给宿主的修复 Prompt](host-fix-prompt.md)
- [运行说明](../../../extension-tooling/examples/expense/README.md) · [SDK 兼容说明](../../../extension-tooling/docs/declarative-forms.md)
- [桌面原始结果](evidence/desktop/report.json) · [指纹](evidence/fingerprints.json) · [基线](baseline.json)

## 交付包

- [ambleloft-extension-sdk-0.1.0-alpha.4.tgz](../../../extension-tooling/dist/npm/ambleloft-extension-sdk-0.1.0-alpha.4.tgz) · SHA-256 `df983a5f433a4ce7a16e234f9add3798449b2878d61921db87f42d74581a8235`
- [ambleloft-extension-core-0.1.0-alpha.4.tgz](../../../extension-tooling/dist/npm/ambleloft-extension-core-0.1.0-alpha.4.tgz) · SHA-256 `fb5b9d9d72d1fc78893cbd3da61213ffd71bbf75d41ebc24261b74d5c7207fd0`
- [ambleloft-extension-cli-0.1.0-alpha.4.tgz](../../../extension-tooling/dist/npm/ambleloft-extension-cli-0.1.0-alpha.4.tgz) · SHA-256 `2ed572e9c6d812485a39113231dc8dca4d2ce7692ec39bf7509d09d5d3d2dae8`
- [expense-clean-install.amble-extension](../../../extension-tooling/dist/npm/expense-clean-install.amble-extension) · SHA-256 `36bee181195dae128fde5e5d027e9bfeca1ca30266700c56116b51822233430d`
- [expense.amble-extension](../../../extension-tooling/dist/expense.amble-extension) · SHA-256 `0e54ec3f3405d8ed8ec6f42481ddf566d6a951ba6db8e679dd57b0f61886a761`

桌面实际安装的是 **acme.expense** 的 expense-clean-install.amble-extension，它是在仓库外从实际 SDK/CLI/core tarball 构建的；example.expense 是仓库普通构建版。两包身份和哈希分别记录，不冒充同一个包。

## 环境与执行

需求 v0.3.0；宿主 HEAD `ab4072f3c4e3f5a0f533fac55e81bf2209a09958` 加当前未提交工作区实现，实际文件与 dist/index.html 指纹见 evidence。Node `v24.14.1`、Electron `41.10.7`、macOS-26.6.2-arm64-arm-64bit。

工具库执行：`npm test`、`npm run check:upstream`（14 文件）、`npm run test:packages`、`npm run expense:build`、`npm run test:expense:service`、`npm run test:expense:desktop`。宿主执行：`npm run build`、`node --test tests/forms.test.cjs`、`npm test`。另执行 `node scripts/test-form-diagnostics.cjs`：10 组真实 CLI 正反例通过，原始 JSON 见 [CLI fixtures](evidence/cli-fixtures.json)。日志分别归档 evidence/。本机端口/Electron 测试使用隔离临时目录，结束关闭进程和服务并清理测试数据。

真实 Electron 使用本机 Responses 模型协议 fixture 驱动真正 Agent/MCP 引擎；没有远程模型或真实企业服务。forms_list 实际响应、forms_present、真实扩展 Node、OperationRouter、确认 UI、数据库和 HTTP 服务均参与。模型 fixture 不代表真实模型自然语言选择质量评测。

T07 使用真实 FormService.action 完成后的可释放响应屏障；暂停期间继续输入并验证焦点/启用状态与最终日期。T18 在第二窗口请求进入真实方法前暂停，第一窗口先保存，再释放旧 revision，观察冲突且本地输入保留。T13/T14/T15 使用持久 pending、显式 release/cancel、断线和服务重启控制，不以固定 sleep 推断业务是否执行。屏障仅在测试进程内包装真实调用，不替换宿主结果、不写宿主源码。

恢复坏结果通过真实 Operation 输出校验被拒，UI 保持 unknown；成功查询才推进。服务 trace 仅保留人工测试的宿主标识，证明 flowInstanceId/conversationId 稳定、不同提交 submissionId 不同且不等于 requestId。

## 可查看的桌面证据

[行程](evidence/desktop/01-itinerary.png)、[费用](evidence/desktop/02-expenses.png)、[确认](evidence/desktop/03-confirmation.png)、[完成](evidence/desktop/04-completed.png)、[丢响应待核实](evidence/desktop/05-unknown-drop.png)、[恢复](evidence/desktop/06-recovered-drop.png)、[窗口冲突](evidence/desktop/07-conflict.png)。

认证登录、非空通知 actions、系统提醒实际投递以及第三方 MCP Apps SDK 集成不列为本轮新增能力。未执行旧版全量桌面矩阵；T22 表示本轮 65+201 回归通过，不引用历史桌面测试冒充本轮。
