# 宿主边界与阻塞（v0.1.0）

- SDK-16：core/extensions/bootstrap.cjs 的本地队列满、未初始化、RPC 超时、shutdown 仅抛 Error 文本；page-preload.initialize 将 Failure 转为无 code 的 Error。与公开结构化错误承诺不一致。SDK 不解析字符串；需宿主保留 code / effectStatus。验收使用实际触发并记录，尚未触发的分支不标 PASS。
- SDK-10：Node l10n 在激活时构造字典，不随运行中语言切换；页面/贡献标签可随 locale 更新。后台动态翻译待宿主契约。
- 非空 actions / 账号认证 / 通用消息或 Agent 完整回合订阅：无公开可用接口，BLOCKED-HOST。业务服务连接属于扩展自有 SSE，不冒充宿主订阅。
- 系统横幅需系统权限与平台实际观察，不能用 remind 替代；未观察时 NOT-RUN。

## H-03：Agent 打开聊天的 INTERACTION_REQUIRED 被折叠（真实复现）

前置：授予项目 conversations.open，将只调用 invocation.resources.openConversation 的 Operation 暴露给 Agent。
通过真实引擎的 extension_invoke_operation 调用已有 conversationId。
预期：INTERACTION_REQUIRED；实际：Node 方法拒绝 code=INTERNAL。页面专属 Operation 则仍正确拒绝 FORBIDDEN。
定位：core/extensions/operations.cjs resource 明确抛 INTERACTION_REQUIRED，core/extensions/hosts.cjs RPC 经 errors.cjs publicCode，后者白名单缺该码。
契约建议：统一公开 ErrorCode 的白名单，保留 INTERACTION_REQUIRED，不扩大 Agent 页面访问权。
证据：evidence/desktop/agent-output.json（最终交付副本）；不由 SDK 将 INTERNAL 猜回预期码。

## H-01 实测：本地 RPC 队列饱和

已授权 configuration 后，真实后台 rpcProbe 同时发起 64 个 context.configuration.get()。
32 个成功，32 个失败且 error.code 不存在。期望结构化 BUSY；实际无 code。
Demo 只记录 unstructured，不解析 Error.message。最小复现见 team-lab/src/extension.ts 的 rpcProbe，
原始结果在 evidence/desktop/report.json 的 SDK-16。
建议统一 bootstrap 本地错误与远端 RPC 格式，初始化桥保留原 Failure。修复后补验容量、超时、shutdown 与初始化失败。

## H-02：Node 运行中翻译

激活时记录 context.l10n.t('name')，切换 language 并读取同一后台实例。页面及贡献项会变，bootstrap 创建的字典不会更新。
这是源码确认的协议边界，不宣称后台动态字典实测通过。实现前应确认 locale 更新事件、回退规则和旧 SDK 兼容性，再以同一 bootId 验证。
