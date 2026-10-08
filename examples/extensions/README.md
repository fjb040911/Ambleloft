# Extension examples

Current source supports trusted Node.js extension packages and isolated UI. Public APIs are a developer preview, not VS Code API compatibility.

| Example | Purpose |
| --- | --- |
| [project-card](project-card/README.md) | Packaged extension with backend operations and a homepage |
| [task-form](task-form/README.md) | MCP Apps task UI rendered by extension-provided HTML |
| [Declarative forms guide](../../specs/extensions/declarative-forms-guide.md) | YAML forms rendered by the host and submitted through extension operations |
| [Travel Skill](../skills/travel-expense/SKILL.md) | Importable information-collection example; sends to chat, not to a reimbursement service |

For new extensions, start with the [developer guide](../../specs/extensions/developer-guide.md). The JSON format below is a retained legacy example, not the capability limit of current extension packages.

## Legacy plain-text manifest

This legacy format is a restricted declarative subset. It is not a VS Code extension API and does not execute JavaScript, HTML, CSS or shell commands.

In the desktop app, open **扩展 → 安装扩展**, select `workspace-guide.json` from this directory and confirm installation. The installed extension adds a sidebar page and an “打开指南” navigation command. Disable it to remove its contributions, enable it to restore them, or uninstall it. These actions do not modify conversations or projects. State persists in the core SQLite database; the original JSON is not reread at startup.

## Manifest

- `id`: namespace and name (`publisher.name`, lowercase letters, numbers and hyphens).
- `name`, `description` (optional), `version` (`major.minor.patch`), `apiVersion` (`"1"`).
- `requiredCapabilities`: unsupported capabilities reject installation.
- `optionalCapabilities`: supported capabilities are advertised; unknown optional capabilities do not grant anything or enable unsupported contributions.
- `contributes.views`: up to 20 `{ id, title, body }` entries; body is plain text, at most 50,000 characters.
- `contributes.commands`: up to 50 `{ id, title, viewId }` entries. Each target must be a view in the same manifest.
- Contribution IDs must start with the extension's ID plus a dot and must be unique.
- Supported capability names: `ui.views`, `ui.commands` (version 1).

Manifest files are limited to 256 KB. Unknown manifest/contribution fields and executable entry points are rejected. Updates currently require uninstalling the previous declaration and installing its replacement. No package scripts, dependencies, workspace access, task creation, secret access or network permissions are available. Display text is escaped by React.

Executable extension packages use a separate versioned manifest and runtime; the restrictions above apply only to this legacy format. The `window.desktop.extensions` bridge is internal to the trusted application UI; it is not a public plugin SDK.

- [通知与认证演示](notification-auth/README.md)：消息操作、结果回报及企业连接源码预览。
