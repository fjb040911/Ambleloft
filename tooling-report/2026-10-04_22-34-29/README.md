# 项目授权与 Demo 任务关联诊断

## 结论

主要是扩展 Demo 的数据模型与界面表述不清晰，不是宿主丢失项目授权，也不是 SDK 传递失败。权限页授权表示允许访问项目；体验馆“项目与聊天”展示的是扩展私有存储中的团队任务。授权不会自动创建团队任务。

| 层级 | 当前行为 | 判断 |
| --- | --- | --- |
| 宿主 | 权限页持久化 capability + project:id 授权；返回首页后仍保留 | 本次路径正常 |
| SDK | selectProject 返回用户选中的项目；ProjectResources 提供读取项目、路径、创建/打开聊天 | 当前接口行为正常；没有已授权项目枚举 API |
| Demo | status 从 tasks-v1 读取业务任务；只有 addTask 会写入项目关联 | 空状态和按钮混淆授权与业务关联，是主要体验问题 |

## 真实桌面验证

运行 `node scripts/test-project-grant-desktop.mjs`，使用真实宿主 Electron、隔离用户目录及现有 acme.extension-lab 安装包，无远程服务、无模型服务。测试自动接受原生安装/授权确认；权限 tab、项目选择、确认授权和扩展写操作确认均经过真实 UI。没有改动用户日常配置。

1. 通过“设置 → 扩展详情 → 权限 → 管理权限”授权诊断项目；详情页显示该项目已授权。
2. 检查宿主保存了 projects.read、projects.path.read、conversations.create/open 对应项目授权及 storage/configuration/secrets 私有授权。
3. 返回首页打开体验馆，status.tasks 为 []，storageCode 为空：授权有效且存储读取成功，但没有业务记录。
4. 点击“选择项目并关联任务”，选择同一项目并确认执行后，tasks 出现一条指向该项目的记录。
5. 对比两步之间 grants 完全一致：显示变化来自 addTask 写入，非权限修复。

结果：4 组断言全部 PASS，详见 [原始结果](report.json)。首次测试因未等待 webContents 创建而退出，修正测试等待后完整重跑通过。此报告不声称直接检查了用户当前桌面的存储。

## 代码依据

- `agent/src/ExtensionsPage.tsx`：管理权限调用 extensions.grants，没有执行扩展 addTask。
- `agent/src/ExtensionDetail.tsx`：已授权项目从 item.grants 解析。
- `agent/electron/extensions/page-host.cjs`：host context 不包含已授权项目列表；selectProject 通过用户选择返回项目。
- `agent/specs/extensions/contracts/sdk.d.ts`：ProjectResources 没有枚举授权项目的接口。
- `extension-tooling/examples/extension-lab/src/team.ts`：read/status 读取 tasks-v1；addTask 才保存 projectId/projectName。
- `extension-tooling/examples/extension-lab/src/page.ts`：空状态“还没有任务。先选择一个本地项目并授权。”容易让已授权用户误认为授权失效。

## 修复建议与契约边界

最小 Demo 修复：将空状态明确改为“尚未创建团队任务。权限页授权不会自动创建任务；请选择项目并创建任务。”按钮改为“选择项目并创建任务”，已关联任务与项目访问授权分别说明；同步 CLI 模板和 README。

若产品目标是“权限页授权后，扩展首页直接列出全部已授权项目”，则需要宿主与 SDK 共同新增公开能力：限定当前扩展、按有效授权过滤的项目引用查询，以及授权变化后的刷新机制。方法名和签名应先确认；不得访问宿主私有 IPC、绕过选择上下文校验或将授权自动转化为写任务授权。Demo 获得公开能力后展示项目列表，创建任务仍需用户明确操作。

本轮仅诊断并新增回归脚本和报告，未修改宿主、SDK 或 Demo 产品行为，未发布安装包。

## 给宿主的协作 Prompt

> 请阅读本报告。真实 Electron 已证实项目授权持久化正常，问题是体验馆用 tasks-v1 业务任务列表表达项目关联，授权不会自动生成任务。请先确认产品期望是否需要扩展查询自身已授权项目列表。如果需要，请对照现有选择上下文与项目资源权限规则提出公开查询接口、最小返回字段、授权变更通知或刷新方式，以及撤销/停用/卸载边界。不要默认 SDK 已支持，也不要把授予访问权限等同于创建业务任务。先冻结契约，再由 tooling 实现 SDK 封装与 Demo 消费。若不需要新增能力，采用 Demo 文案和步骤说明修复即可，无需修改授权安全规则。

安装包 SHA256：`0bc69169bbf9f5865e823ac290437191493631f724a93a6ccdbe116f123f7b28`。
