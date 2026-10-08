# 团队任务真实桌面验收报告

2026-09-29，SDK/CLI 0.1.0-alpha.2，macOS arm64，测试驱动 Node 24.14.1。
结论：16 组实际桌面检查通过，另确认 4 项宿主缺口。因此不能将宿主国际化、条件隐藏或错误码完整性标成全部通过。

## 验收环境与方法

运行相邻 agent 开发树的真实 Electron、React 页面、Node 扩展进程、RPC、SQLite 和 Agent 引擎。
独立临时 profile 和空本地项目；两扇真实窗口；测试结束清理 profile，不改用户现有配置。
原生文件/信任对话框由测试适配器选定文件及确认，资源授权和写入确认通过真实宿主按钮。
安装、生命周期和工作区初始化使用真实桌面 preload API；消息使用扩展页面公开 Operation 桥接，未替换宿主实现或数据库。

只有模型回答使用本机 127.0.0.1 Responses 固定响应。它用于无账号、无远程服务地验证真实引擎首次发送/继续的身份链路，不能代表真实模型质量或远程提供商兼容性。Demo 不启动也不依赖此服务，创建草稿不执行模型。
本次不是签名发行版验收，也未运行 Windows/Linux 桌面。

[完整机器记录及源码指纹](evidence/team-tasks/report.json)保留真实回执、实例 ID、消息版本、错误码和安装包 SHA-256。

## 结果

| 检查 | 实际结果 |
| --- | --- |
| 安装和激活 | 安装 archive、确认信任，打开入口，Node 状态 active |
| 页面和条件 | 未关联时隐藏创建按钮、summary 返回 FORBIDDEN；授权关联后显示并可调用 |
| 本地项目和聊天 | 真实项目选择器授权，保存 KV，创建一个真实草稿；创建时没有 run |
| 首次发送和继续 | 实际点击两次发送，两轮完成；草稿转为 run；conversationId 不变 |
| 消息发布和去重 | published 后同 key 返回 duplicate，记录数保持 1；第二窗口自动出现 |
| 查询和更新 | 扩展投影没有 readAt/dismissedAt；更新 revision 1→2，第二窗口显示新正文 |
| 阅读与撤回 | 第二窗口点击阅读后 unread=0；更新、撤回都保留 readAt；显示已撤回 |
| 版本冲突 | 旧 revision 被拒绝，内容未覆盖；错误码丢失见下表 |
| 拒收 | 宿主设置关闭接收，新 key 返回 rejected/query=null；开启后同 key 仍 rejected |
| 清除 | 宿主清除后 query=null，同 key 返回 dismissed，不重新出现 |
| 多语言和主题 | 自定义页面中文/英文及亮色/暗色切换成功；宿主名称问题见下表 |
| 重启 | 同 profile 关闭并重新启动应用；bootId 变化，任务/聊天/通知及拒收标记恢复 |
| 停用 | 在途延迟发布后立即停用；等待超过延迟，无消息写入；runtime stopped；新页面调用拒绝 |
| 启用与重载 | 启用后数据保留；重新安装开发目录生成新进程，重新授权后 KV/conversationId 保留 |
| 卸载 | 在途发布后卸载，无消息写入；安装记录移除，新页面调用拒绝；历史消息保留 |

本次 conversationId：`ba2ee556-112b-47fb-961f-0c727b6a237e`；
runId：`e1c516a9-d70e-43a7-ba47-6951fefca0a2`；两次本地模型请求。
停用/卸载验证的是正常在途调用取消和新页面拒绝，不宣称完成恶意扩展渗透测试。

## 宿主问题（待宿主修复，SDK 不模拟）

| 问题 | 证据/定位 | 影响及建议 |
| --- | --- | --- |
| 条件不满足的命令仍显示 | service.cjs snapshot 映射 commands 时去掉 when；[管理界面](evidence/team-tasks/00-condition-management.png) | 执行实际被拒绝；宿主应保留并在 UI 应用条件 |
| 消息 CONFLICT 变成 INTERNAL | hosts.cjs:84 仅识别 error.code 或带冒号前缀；消息层抛裸 CONFLICT | 无法准确分辨版本冲突；宿主统一结构化错误码；SDK 保留真实错误，不自动重试 |
| 通知来源显示 %name% | message-handlers.cjs:6 直接使用 manifest.displayName；[消息界面](evidence/team-tasks/03-messages-withdrawn.png) | 来源未本地化；宿主应使用统一字典解析 |
| 扩展名称不跟随语言 | service.cjs:21 displayName 始终用 default 字典 | 页面能英文切换，入口仍中文；宿主应随当前 UI locale 解析名称及贡献标签 |

没有新增虚构 messages 权限、reload API 或最低宿主版本号。五方法可用性检测只能证明方法存在，正式能力版本协商仍待宿主提供。
认证登录、账号消息、非空通知 actions、系统级提醒投递均待支持；remind 仅为意图。

## 构建与复现

在 extension-tooling 根目录安装依赖后执行：

```sh
npm test
npm run check:upstream
npm run test:packages
npm run demo:build
# 相邻 agent 已安装依赖，并执行过 npm run build
npm run test:desktop
# 其他源码位置：AMBLE_HOST_PATH=/absolute/path/to/agent npm run test:desktop
```

本轮 53 个测试通过；M1 来源一致性检查通过；隔离目录中 tarball 安装、CJS/ESM、严格 TypeScript、两个 CLI 模板生成/构建/校验/打包通过。
桌面命令生成 test-results/team-tasks/report.json 和截图；本次交付快照保存在 agent/tooling-report/2026-09-29_16-42-00/evidence/team-tasks。
签名发行版和跨平台桌面测试尚未执行；CI 配置不等于已经运行的证据。

直接安装 [Demo 包](../../../extension-tooling/dist/team-tasks.amble-extension)，使用步骤见 [运行说明](../../../extension-tooling/examples/team-tasks/README.md)。
脚手架：`amble-extension init my-team --template team-tasks --publisher acme --name team`。

## 截图检查

已查看中文/英文页面、真实聊天和消息截图，未发现本轮页面布局重叠；未覆盖所有窗口尺寸。

- [中文关联页面](evidence/team-tasks/02-linked-conversation.png)
- [英文暗色页面](evidence/team-tasks/04-english-dark.png)
- [两轮真实聊天](evidence/team-tasks/06-real-conversation.png)
- [跨窗口消息更新与撤回](evidence/team-tasks/03-messages-withdrawn.png)
