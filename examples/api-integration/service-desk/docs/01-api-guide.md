# 云桥设备维修系统 · 接口接入文档

接口版本：1.0.0。文档日期：2026-11-10。此系统是虚构业务、真实 HTTP 服务，仅用于开发测试和演示，不连接企业设备，也不会派出维修人员。

本文件可单独交给 AI 阅读；同目录 `openapi.json` 是可机读契约，`02-business-rules.md` 补充人机交互要求。它们描述同一个版本；冲突应报告，不能猜测。文档未包含 Ambleloft 扩展实现，目的是验证从接口资料生成新集成的能力。

## 业务目的

员工希望通过聊天找到设备，登记故障，获得工单编号，之后查询处理状态。接口同时允许查询个人工单列表。首轮只做报修和查询；不包含审批、自动维修、附件上传、删除、指派维修人员或状态修改。

## 环境与认证

- 本机测试服务根地址：`http://127.0.0.1:47835`。这是部署配置，不是业务表单字段。API 路径已含 `/api/v1`，不要重复拼接。
- 除 `GET /health` 外，都需要 `Authorization: Bearer <API_KEY>`。
- 本机演示 Key 是 `local-demo-key-not-for-production`，只用于 loopback 测试，不是真实密钥。扩展通过宿主凭据输入与保存机制配置；不要写入生成的 Skill、表单、源代码或日志。
- 所有已认证请求对应虚构员工 `demo-employee`。演示不实现企业登录或多租户；正式环境需替换认证。
- JSON 请求用 `Content-Type: application/json`，最大 16 KiB。响应成功统一为 `{"data": ...}`；失败为 `{"error":{"code":"...","message":"...","field":"可选字段名"}}`。
- 字符串不能有首尾空白；客户端可以提示修正，但不可静默修改用户确认的业务内容。

## 接口清单

### GET /health

无需认证。200：`{"data":{"status":"ok","mode":"synthetic-demo","version":"1.0.0"}}`。只证明服务可访问；检查凭据还需调用 `/api/v1/me`。

### GET /api/v1/me

200：`{"data":{"id":"demo-employee","displayName":"演示员工","email":"employee@example.test"}}`。
创建人由服务器决定，不能让用户填写或提交 `createdBy`。未填写联系邮箱时由服务器使用这里的邮箱。

### GET /api/v1/devices

可选参数：`q`（ID、名称、位置的子串），`status`（`active` 或 `retired`），`offset`（默认 0，0–1000000），`limit`（默认 20，1–100）。稳定顺序；继续请求 `nextOffset`，为 null 时结束。

200 示例：
```json
{"data":{"items":[{"id":"dev-printer-01","name":"三楼共享打印机","location":"上海办公室 · 三楼","status":"active"}],"total":1,"nextOffset":null}}
```

以上不是完整设备字典。请查询实际服务；不要根据名称推造 ID 或将示例写死成永久选项。演示还包含研发测试笔记本、会议室网络设备及一个退役设备。只有 active 设备可以报修。

### POST /api/v1/tickets

必须带 `Idempotency-Key`：8–128 位字母、数字、下划线或短横线。每次新业务提交生成一个标识；同一次提交重试或查询保持不变。

| 字段 | 类型/长度 | 规则 |
|---|---|---|
| deviceId | string，1–100 | 必填，真实且可用的设备 ID |
| summary | string，5–100 | 必填，故障标题 |
| description | string，10–2000 | 必填，故障现象 |
| priority | string | 必填，只能是 normal（普通）、urgent（紧急） |
| impactReason | string，10–500 | urgent 必填；normal 可以省略 |
| contactEmail | string，3–254 | 可选，格式须为邮箱；省略使用当前员工邮箱 |

不接受额外字段。可选空值应省略，不发 null 或空字符串。没有 `confirmed`、申请人、工单状态或日期字段；如果客户端设了确认勾选，它仅是 UI 控件，不可直接传给该接口。

请求示例：
```json
{"deviceId":"dev-printer-01","summary":"三楼打印机持续卡纸","description":"今天上午连续三次打印均卡纸，重启后仍然出现。","priority":"normal"}
```

首次成功 201，同标识同内容重放 200；两者都返回完整工单：
```json
{"data":{"id":"TKT-示例编号","deviceId":"dev-printer-01","deviceName":"三楼共享打印机","summary":"三楼打印机持续卡纸","description":"今天上午连续三次打印均卡纸，重启后仍然出现。","priority":"normal","contactEmail":"employee@example.test","status":"submitted","createdBy":"demo-employee","createdAt":"2026-11-10T08:00:00.000Z"}}
```

实际编号由服务器生成 `TKT-<UUID>`；时间是服务器 UTC 时间。状态 submitted 只表示已登记，不表示维修完成。提供的 impactReason 会保留在结果中。

### GET /api/v1/tickets/{ticketId}

200 返回 `{data: 工单}`；当前身份下找不到返回 404 NOT_FOUND。须使用实际返回的工单编号。

### GET /api/v1/tickets

返回当前身份的工单，按创建顺序倒序。offset/limit 同设备查询。200：`{"data":{"items":[],"total":0,"nextOffset":null}}`。不存在其他用户的数据入口。

### GET /api/v1/submissions/{submissionId}

参数是原始 Idempotency-Key。用于写入请求超时或失败后查证结果。

- 已持久化：200，`{"data":{"status":"succeeded","ticket":{...完整工单...}}}`。
- 未找到记录：200，`{"data":{"status":"unknown"}}`。这不保证另一个延迟请求不会到达，**不能转换为 notExecuted，不应自动换新标识提交**。
- 查询也失败：仍然无法判断提交结果。

幂等记录与工单在同一 SQLite 事务持久化，重启仍可查询；演示无 TTL、不自动清理。同标识同规范化字段顺序的内容返回原工单；内容改变返回 409。空可选字段与省略不等价：空值本身无效。校验拒绝不会创建记录，但恢复查询仍保守返回 unknown。

## 错误与恢复

| HTTP | code | 处理方式 |
|---|---|---|
| 400 | INVALID_JSON / INVALID_QUERY / INVALID_IDEMPOTENCY_KEY | 修正调用参数 |
| 401 | UNAUTHORIZED | 打开扩展设置修正凭据，不在聊天索取 Key |
| 404 | NOT_FOUND | 检查工单编号或路径 |
| 409 | DEVICE_UNAVAILABLE | 重新查询可用设备，请用户选择 |
| 409 | IDEMPOTENCY_CONFLICT | 同一标识的内容不同，先核查已有提交 |
| 413 / 415 | BODY_TOO_LARGE / CONTENT_TYPE | 修正请求体大小或格式 |
| 422 | VALIDATION_ERROR / DEVICE_NOT_FOUND | 根据 field 修正表单，保留其他填写 |
| 503 | RESULT_UNKNOWN | 按原提交标识查询，不把错误当作未提交 |
| 500 | INTERNAL_ERROR | 显示失败；写入结果不明时先查询 |

测试专用：服务以 `DEMO_FAULTS=1` 启动时，POST 可加 `X-Demo-Fault: after-commit`，使首次请求在入库后返回 503。用原标识查询应成功，同标识同内容重放仍只有一条工单。未开启或不支持的故障参数返回 400 FAULT_DISABLED。此参数不是业务表单字段，不应默认加入正常请求。

## 接入验收

查询设备 → 普通或紧急工单填写 → 用户确认 → 服务真实写入 → 返回真实编号 → 查询工单；另检查错误凭据、未知/退役设备、紧急缺少原因、失败后内容保留以及提交结果不明后的查询恢复。

接口中的所有设备和员工都是虚构数据。文档、静态检查或一次模拟响应不能证明实际安装和业务联调成功。
