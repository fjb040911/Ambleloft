# H-01：后端 Operation 异常丢失公开错误码

状态 BLOCKED-HOST，影响 T19、T21。

- 项目夹具 saveDraft 先成功 getProject，再请求未声明的 getProjectPath。宿主拒绝资源，服务 drafts 计数不增加，但表单最终显示 `提交未完成：INTERNAL`，不是 FORBIDDEN。
- 普通 probe Operation 的 form 为 undefined，正常成功。随后直接通过真实首页公开 ambleExtension.invoke 调用表单专用 saveDraft；SDK Demo 在 configuration/fetch 前抛出 code=UNSUPPORTED，宿主最终返回 INTERNAL；服务没有新增写入。
- `core/extensions/bootstrap.cjs` 的 invoke catch 只发送 `error:true`；`core/extensions/hosts.cjs` result 分支固定构造 INTERNAL，错误码在这里丢失。OperationRouter 的 code 白名单另缺 OUTCOME_UNKNOWN；不要未经核对就只改最外层名单。

最小复现及完整 fixture 构造保存在 evidence/test-expense-desktop.mjs，执行命令 npm run test:expense:desktop。evidence/desktop/report.json 保留原值、服务计数和对应状态。

资源隔离没有被绕过；本问题是错误契约与客户端可诊断性，不是已发生越权写入。SDK 不根据 message 文本猜测 code、不吞错并模拟成功。

## 未声明为已支持

无公开表单 capability 协商、forms_resume、旧模板迁移、动态选项、附件、密码字段、YAML 自动本地化。认证登录仍待宿主契约共同确认；非空通知 actions、系统级提醒实际投递未在本轮新增/验收。第三方 @modelcontextprotocol/ext-apps SDK 未集成。
