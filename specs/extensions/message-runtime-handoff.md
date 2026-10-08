# 消息运行时与 SDK 对接说明

本文件记录宿主已实现的预览接口，供独立 SDK/CLI 项目对齐；不代表 npm SDK 已发布这些能力。

## 扩展运行时

扩展激活上下文已有以下异步方法：

```ts
context.messages.publish(input)
context.messages.getByEventKey(eventKey)
context.messages.update(id, patch, expectedRevision)
context.messages.withdraw(id, expectedRevision)
context.messages.getPreferences()
context.messages.listActionInvocations()
context.messages.reportActionResult(input)
```

调用通过扩展宿主 RPC 到数据库服务。Profile、扩展来源及 generation 由宿主绑定，扩展不得指定其他来源或账号范围。当前只支持 local 范围；最多两个 actions，引用本扩展允许 page 调用的 Operation。更新和撤回需要内容 revision，阅读状态变化不会影响该 revision。

读取不到 eventKey 返回 null；读取及更新结果经扩展投影，不包含用户阅读和清除状态。publish 的去重与拒收结果应按存储契约处理，不能一律解释为新建成功。测试参考 `tests/extension-hosts.test.cjs`、`tests/message-service.test.cjs` 和 `tests/message-store.test.cjs`。

## SDK/CLI 下一步

- 对照宿主方法、输入验证、返回值与错误测试生成类型，避免只增加类型而没有运行时支持。
- 为消息能力添加真实宿主联调测试，覆盖拒收、重复发布、过期实例与更新冲突。
- 在能力协商设计落地前，不宣称旧宿主支持新增方法。
- 默认模板仍可离线运行；需要消息或认证的模板应明确最低宿主版本。

## 认证边界

宿主已提供 OIDC 企业连接与 authentication 运行时，独立 SDK 已同步类型与 CLI 清单校验。当前每个扩展资源一个会话，没有全局账号选择器、刷新令牌或账号消息投递。参见 [现行接入规范](message-actions-auth-guide.md)。配置本身不是登录凭据，扩展不能自行读取宿主账号目录。

## 交接与兼容

getMessages 仍首先检查五个基础方法；新增的两个动作方法在调用时检查，旧宿主缺少方法时拒绝 UNSUPPORTED，不模拟成功。下一轮 SDK/CLI 工作以 [v0.5.0 交接](../../tooling-report/requirement/v0.5.0/README.md) 为准。
