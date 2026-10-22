# Equipment service desk · 设备售后工单

An internal test integration: conversation → three-step form → user confirmation → a ticket in an existing service.

内部联调示例：聊天 → 三步表单 → 用户确认 → 业务服务返回工单号。

## Setup / 设置

1. Install and enable the extension; grant access to its own configuration. / 安装并启用，授权读取自身配置。
2. Start the SSH tunnel to your test service. Set `serviceUrl` in extension settings, for example `http://127.0.0.1:18080`. This sample deliberately accepts loopback HTTP only. / 建立测试服务隧道，在扩展设置中填写本机地址；样例仅接受本机回环 HTTP。
3. In a local project, ask to use the equipment service desk. Use fictional device/contact data. / 在本地项目中使用设备售后工单，填写虚构设备与联系人。
4. Confirm the form to submit; keep the returned ticket ID. / 核对并确认表单后提交，保存返回的工单号。

The extension runs locally and connects to a remote API through a tunnel. It does not install a server or run inside a remote container. Configuration saved is not proof of connectivity; use the `health` read operation to check the service. Confirmed writes use the host submission ID for idempotency and recovery.

扩展在本机运行，经隧道连接远端 API，不安装服务器，也不在远程容器中运行。保存配置不代表连通成功，可调用 `health` 只读操作检查。确认后的写操作使用宿主 submissionId 去重和核实结果。

The test service returns `received` only. Enterprise authentication, tenancy and dispatch are outside this sample. It is not a public production API. / 测试服务仅返回 received，不包含企业认证、多租户或派单能力，不是生产 API。

License: Apache-2.0.
