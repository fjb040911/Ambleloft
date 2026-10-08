# Preview notes / 预览版说明

## v0.3.0 — Interactive Agent applications preview

- Introduces trusted Node.js extensions, isolated pages, permission-checked operations, configuration, message actions, and OIDC business authentication.
- Adds in-chat forms with linear multi-step flows, drafts, confirmation, and explicit recovery of uncertain submissions; includes limited MCP Apps task UI support.
- Refreshes chat, approvals, settings, skills, extension details, and message center interactions with shadcn/ui components.
- Repositions the bilingual README around building interactive Agent applications, with current UI screenshots and a bilingual travel-expense example.
- Ships macOS Apple Silicon DMG and ZIP with SHA-256 checksums. Ad-hoc signed, not Apple-notarized. Windows/Linux remain target platforms; public task subscriptions and Agent hooks remain roadmap items.
- 新增扩展与聊天表单能力，优化聊天、授权、设置和扩展管理体验；更新中英文文档与截图。此版本为开发者预览，API 尚未稳定，SDK 未发布到公共 npm。

## 2026-10-08 — message actions and extension authentication (unreleased)

- Added persistent notification Operation dispatch, explicit result reporting, atomic message updates, idempotent reports and conservative restart recovery.
- Added declared business resources, interactive enterprise OIDC connection, encrypted host-owned access tokens and bounded HTTPS requests. Settings shows extension connections and supports disconnect.
- Synced independent SDK/CLI contracts and source capability diagnostics; added a notification/authentication demonstration. No npm publication.
- Token expiry currently requires interactive reconnect; account-scoped notifications and WebSocket credentials are not implemented. See [integration guide](specs/extensions/message-actions-auth-guide.md).

## 2026-10-05 — extension heartbeat recovery (unreleased)

- Pause extension heartbeat failure detection during system suspend. On resume, probe active backends and allow a full response window before declaring them unresponsive.
- Use a monotonic heartbeat clock and re-probe after long host timer delays, avoiding false failures when power events are missed. Stopped/stale processes are not reactivated by resume.
- 验证：18 项心跳及真实 Node 后端测试通过，涵盖模拟长时间休眠、唤醒回复、漏报休眠事件、唤醒后真正卡死和过期进程。没有通过自动化让真实电脑进入休眠；此验证不代表跨平台电源事件验收。

## 2026-10-04 — extension source preview (unreleased)

These changes describe the current source tree, not a new installer or npm release.

- Trusted Node.js extension backends, isolated pages, configuration and notification integration, and shared authorization for page/Agent operations.
- Host-rendered YAML forms: strict validation, multi-step drafts, confirmed chat or business submission, and explicit result recovery. MCP Apps remains a separate, limited task UI path.
- Fixed missing approval configuration for forms_list/forms_present and autosave interruptions while typing.
- Preserved allowlisted backend error codes through the host, including UNSUPPORTED, FORBIDDEN and OUTCOME_UNKNOWN; arbitrary exception details are not exposed and effect status stays host-controlled.
- Verification: 202 host tests passed; the local SDK/CLI reimbursement desktop checks T19 and T21 now pass. This is not a cross-platform release certification.

以上为未发布的源码更新：新增业务表单基础链路，修复表单工具审批与自动保存打断输入；后端公开错误码已正确透传。SDK/CLI 仍通过本地预览包联调，未据此发布新版安装包或 npm 包。

## v0.2.1 — macOS Apple Silicon preview

- First downloadable DMG and ZIP for Apple Silicon Macs, with SHA-256 checksums. Ad-hoc signed; not Apple-notarized.
- Includes read-only Excel and PowerPoint previews, conversation archive improvements, per-turn file review, and the extensible workspace platform described below. PowerPoint preview requires a separate LibreOffice installation.
- 首次提供 Apple Silicon Mac 的 DMG、ZIP 和 SHA-256 校验文件。使用 ad-hoc 签名，未经 Apple 公证。
- 包含只读 Excel / PowerPoint 预览、会话归档改进、逐轮文件审阅及下述可扩展工作台能力。PowerPoint 预览需要单独安装 LibreOffice。

## 2026-09-24 — development snapshot (package version 0.2.1)

These notes describe the source snapshot, not a newly signed installer or a new GitHub Release.

### English

- Added per-turn workspace file-change summaries and read-only text diffs. Binary/Office files may show status only. Snapshot limits and external edits mean this is not an exhaustive audit of agent-only changes.
- Added archive search, project/type filters, grouping, selection, restoration and confirmed bulk deletion.
- Improved project selection, composer layout, reply copying, and visibility of the model and skills used for a turn.
- Improved expandable previews and nested preview interactions.
- Included the `diff` runtime dependency in desktop packaging.
- Refreshed the English and Chinese README with reproducible screenshots of the actual UI using synthetic fixtures.

Ambleloft is a general-purpose, extensible desktop AI workspace platform, with specialized workflows delivered through extensions and integrations. Existing local/private/cloud model endpoints are supported; downloading models and managing inference runtimes are out of scope. The declarative Extension preview currently supports plain-text views and navigation commands only.

### 简体中文

- 新增逐轮工作目录文件变更摘要和只读文本差异。二进制及 Office 文件可能仅展示状态；由于快照限制及外部编辑，这并不是只归属于 Agent 的完整修改审计。
- 新增归档搜索、项目/类型筛选、分组、选择、恢复及确认后的批量删除。
- 改进项目选择、输入区布局、回复复制，以及本轮使用的模型和技能展示。
- 改进可展开预览与嵌套预览交互。
- 桌面打包包含 `diff` 运行时依赖。
- 重写中英文 README，加入可复现的真实界面截图，内容使用虚构演示数据。

Ambleloft 定位为通用、可扩展的桌面 AI 工作台平台，专业工作流通过扩展和集成实现。平台连接已有本地/私有/云端模型端点，不负责模型下载和推理运行时管理。声明式扩展预览目前仅支持纯文本视图与导航命令。

这些说明描述源码快照，不代表新签名安装包或新的 GitHub Release。
