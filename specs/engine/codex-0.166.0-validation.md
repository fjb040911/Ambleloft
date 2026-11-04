# Codex 0.166.0 upgrade validation

Date: 2026-11-04. Platform: macOS arm64. Previous engine: 0.153.4.

Pinned @openai/codex and its platform packages to npm latest stable 0.166.0, checked the platform tarball against official SHA-512 integrity, refreshed upstream LICENSE/NOTICE references and prepared 44 runtime resource files. Historical validation records retain their original engine versions.

Validation uses the real engine with isolated temporary profiles and deterministic localhost inference, not paid model endpoints.

- Backend: 691 passed, 1 platform-specific skip.
- Production build and macOS application packaging passed.
- Real engine: streaming, persisted resume, model/provider changes, error propagation, stop, shell and structured plans passed.
- Extension probes: dynamic tools and unified MCP in Responses/Chat, including new, resumed and pre-existing threads passed.
- Input probes: native questions/interruption, turn steering, late-answer handling and nonblocking host forms in Responses/Chat passed. Native request_user_input_async is not exposed by this engine; host forms use the existing asynchronous host path.
- Native subagents: Responses, Chat, parallel execution, full-access file write, approval routing and individual stop passed.
- Packaged app: engine version assertion, isolation, database/history, Office worker, shell, plan, approval, restricted-network approval recovery, errors, stop, crash, restart and coexistence passed.
- After packaging-loader fixes: 76 discussion/task-guide/project-relation tests passed.

Updated probes for structured provider health checks, namespaced Chat tools, process-exit synchronization before thread resume, and stopping native children by thread identity without requiring a turn-start notification.

Packaging exposed existing direct imports of development-only schema/template dependencies in workforce guides. Added runtime loaders for the bundled input definition and form template, preserving source-mode behavior.

Not verified: Windows/Linux runtime, real remote model services, SSH/Docker execution. No GitHub push or release publication performed.

Protocol reference: https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server
