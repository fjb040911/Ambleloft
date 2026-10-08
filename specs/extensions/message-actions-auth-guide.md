# 消息按钮与企业认证：源码预览接入规范

更新：2026-10-08。本文描述可调用入口；历史设计中尚未实现的目标不覆盖本文。独立 SDK/CLI 的本地工作区为 alpha.6，本次没有发布 npm 包。

## 消息操作

通过 `@ambleloft/extension-sdk/messages-preview` 的 `getMessages(context)` 获取消息接口。
`actions` 最多两项，每项为 `{id,label,commandId,arguments?}`。commandId 引用当前扩展的 Operation ID，该 Operation 必须允许 page 调用；arguments 按其 inputSchema 校验。界面只提交 messageId、actionId、expectedRevision，不信任页面提交的操作名、参数或来源。

写操作每次经过 Amblelost 确认，不复用免确认记录。操作、授权、扩展版本及消息有效性在派发前再次校验。按钮处理函数通过 `invocation.message` 获取宿主生成的 invocationId、messageId、actionId。不要使用页面字段制造这些标识。

```ts
const records = await messages.listActionInvocations();
const record = records.find(r => r.id === invocation.message?.invocationId);
if (!record) throw new Error('Invocation unavailable');
// 调用业务服务，以 record.id 作为幂等键；业务状态由服务端决定。
await messages.reportActionResult({
  invocationId: record.id,
  reportId: 'accepted',
  expectedRevision: record.revision,
  outcome: 'accepted',
  remoteTaskId: 'business-task-id'
});
```

reportActionResult 可返回 accepted、completed、failed、unknown，并可原子附带 `messageUpdate:{patch,expectedRevision}`。执行记录与消息分别维护 revision。相同 reportId 和同一内容重试返回原提交结果；内容不同拒绝。消息 CAS 冲突时执行结果也不落盘。重试结果回报不能再次执行远端业务。

处理函数正常返回不等于业务完成，必须显式回报。未回报、超时或崩溃后保留 unknown；派发前确定未执行时为 notExecuted。启动恢复 prepared 为 notExecuted、dispatching 为 unknown，不自动重放。扩展启动后可查询 dispatching、accepted、unknown 记录并向服务端核对。该列表仅返回本扩展记录，不含账号目录或令牌。

同一消息的 prepared、dispatching、accepted、unknown、completed 写操作阻止重复写入；completed 不自动把消息业务状态设为 resolved，需要显式更新。明确失败后可重新发起新 invocation。读取操作不占用写锁；消息已完成、过期、撤回或清除后不能再执行按钮。普通更新保留阅读状态，结果回报不触发额外提醒。

## 企业认证声明

```json
{
  "authentication": {
    "resources": [{
      "id": "business",
      "title": "团队业务服务",
      "baseUrl": "https://api.example.com/v1/",
      "audience": "https://api.example.com/",
      "scopes": ["tasks.read"]
    }]
  }
}
```

baseUrl 为 HTTPS，必须以 `/` 结尾，不得含凭据、查询参数或片段。audience 是 OIDC resource 参数，企业身份提供方须支持这个资源及所申请 scopes。title 支持扩展的 `%key%` 多语言机制。

企业管理员在身份提供方注册公共桌面客户端，允许 Authorization Code + PKCE S256，以及本机 `http://127.0.0.1:{随机端口}/callback` 回调。用户在“设置 > 账号”配置 issuer 和 clientId；租户限制字段目前应留空，租户访问策略由身份提供方管理。不会收集密码或使用客户端内置 secret。

连接按钮应调用允许 page 的 Operation，建议设置 `timeoutMs:120000`。处理函数调用：

```ts
const session = await invocation.authentication.requestSession('business');
```

Amblelost 展示扩展、服务地址、权限和企业连接列表；用户选择后启动系统浏览器。OIDC 校验 state、nonce、签名、issuer 和 ID Token audience。业务令牌只在宿主内通过系统安全存储加密持久化，不通过 SDK、页面或聊天返回。

后台代码只能静默查询、断开自己的授权及请求已声明服务：

```ts
const session = await context.authentication.getSession('business');
if (session) {
  const response = await context.authentication.request({
    sessionId: session.id,
    path: '/tasks', // 相对于 baseUrl 的路径；此例请求 /v1/tasks
    method: 'GET'
  });
}
context.subscriptions.push(context.authentication.onDidChangeSessions(() => {
  // 重新查询自己的 session；事件不携带全局账号信息。
}));
```

request 仅支持 GET/HEAD/POST/PUT/PATCH/DELETE；字符串 body 按 application/json 发送，最多 256 KiB。响应是 `{status,body,contentType}`，最多 1 MiB，超时 30 秒；不能附加任意请求头、原始 URL 或 Cookie，不跟随重定向。请求结束前再次检查撤销和配置状态。业务 HTTP 非 2xx 不自动重试；401 使该授权失效并要求重新连接。

会话绑定扩展及包版本、资源声明和企业连接配置。编辑连接、扩展更新或失去信任后不继续沿用旧授权。用户可在“设置 > 账号”查看并断开各扩展连接。断开不会退出系统浏览器的企业 SSO，也不撤销其他扩展的授权。

## 当前边界

- 一个扩展资源保存一个已选会话；不同资源/扩展独立授权。当前没有全局已登录账号选择器，同一企业的浏览器 SSO 可减少再次输入凭据。
- Token 到期后由用户重新连接，暂不保存 refresh token。没有设备授权流、SAML 直连、任意 Token 导出或 WebSocket 凭据接口。
- 消息仍为本地作用域，尚未开放账号作用域投递；不应把敏感账号业务消息当成本地永久消息发布。
- 本地撤销不能撤销已经发送至服务器的副作用。业务服务必须验证访问令牌的 issuer、audience、权限与有效期，并提供幂等/查询能力。
- 已通过受控协议与真实扩展进程测试；实际企业 IdP 的客户端注册、resource 参数兼容性与租户策略仍需部署验收。

演示包：[notification-auth](../../examples/extensions/notification-auth/README.md)。
