# Equipment service desk 0.2.0 / 设备售后

Internal lifecycle sample: chat form → ticket → progress → supplemental text → resolution → customer-confirmed close. This source is newer than the signed Store 0.1.0 release; it has not been published or deployed.

Configure `serviceUrl` with the loopback SSH tunnel address. Open the extension page and use **Set test credential / 设置测试凭据** to save a server-issued test credential through host secrets. Do not put credentials in chat, form fields, ordinary configuration or source files. Grant the declared configuration and secrets permissions. Use a local project for the chat form; remote-project execution does not imply remote extension execution.

The server assigns customer/operator roles. Customers can only see their own tickets. Operators move received → processing → resolved and may request information. Customers supply requested text, return unresolved tickets to processing, or confirm resolution and close. All changes require a current revision and stable operation ID. Unknown outcomes are reconciled before another write. Manual refresh only; no background polling or wakeups.

The business page stores non-secret draft/pending-operation data on this device, scoped by service address and identity. Clearing application browser data removes these local drafts. The test API lists the latest 20 visible tickets and caps per-ticket history at 24 events. No production IAM, attachments, queue management or delivery SLA is implied.

中文：三步登记在聊天中完成；处理进展、补充资料、未解决退回和确认关闭在扩展页完成。设置服务地址后，使用安全输入保存测试凭据；不要发送给模型。页面只明确刷新，提交未知先核实，不自动重复写入。服务端角色与对象权限决定可操作范围。`resolved` 是处理方已处理，`closed` 仅在客户确认且服务返回后展示。

完整 API、迁移与本地测试：工作区 `agent-flow/labs/service-desk/README.md` 与 `server/openapi.json`。This source includes a copy of the host webview client in `web/host-client.mjs`; update it from the host SDK when that contract changes.
