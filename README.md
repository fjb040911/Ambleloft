<div align="center">
  <img src="public/brand/icon-128.png" width="96" height="96" alt="Ambleloft" />
  <h1>Ambleloft</h1>
  <p>An open-source, extensible Agent workspace.</p>
  <p><strong>English</strong> · <a href="README.zh-CN.md">简体中文</a></p>
  <p>v0.2.1 Preview · macOS · Apache-2.0</p>
</div>

Ambleloft brings conversations, project files, and AI-assisted task execution into one desktop workspace. Connect your own model provider, work with your own files, and review the agent's actions as it works.

This repository contains the free, open-source desktop core. Team collaboration is planned as an Extension backed by a commercial server service; it is not implemented yet. Windows, macOS and Linux are the platform targets.

## What you can do

- **Bring your own model.** Configure multiple local or cloud providers, select models, and test connections. Supports Responses API and a Chat Completions adapter; tool compatibility depends on the provider and model.
- **Work in projects.** Associate conversations with folders, browse files, and preview code, Markdown, HTML, images, and PDFs alongside your work.
- **Follow execution.** See streamed answers, available reasoning summaries, tool activity, and task plans. Approve requested actions or stop a task.
- **Keep your work.** Save drafts, resume conversations, and archive sessions with local SQLite persistence.
- **Use reusable skills.** Create, edit, import, and enable local SKILL.md bundles for tasks.
- **Read rich results.** Render Markdown, code, equations, Mermaid diagrams, ECharts, SVG, and basic draw.io content.
- **Make it yours.** English and Simplified Chinese, light/dark/system appearance, and a collapsible workspace layout.

## Preview status

**0.2.1 is an early preview, not a stable release.** macOS Apple Silicon is the currently validated desktop target. Windows and Linux releases are not provided by the current packaging workflow.

Model downloads and inference-runtime management are outside the product scope. Connect an existing local, private-network or cloud endpoint. The experimental extension slice supports local JSON manifests containing text views and navigation commands; it does not execute extension scripts or provide a marketplace. See [the extension example](examples/extensions/README.md).

## Run from source

Requirements: macOS, **Node.js 22.13+** (Node.js 24 LTS recommended), and npm. The engine preparation step builds for the host architecture.

```bash
git clone https://github.com/fjb040911/Ambleloft.git
cd Ambleloft
npm ci
npm run engine:prepare
npm run dev
```

Ambleloft uses the pinned Codex app-server runtime from the official npm package. You do not need to install the Codex CLI or the official Codex/ChatGPT desktop apps. The runtime is downloaded/prepared locally and is not committed to this repository.

For a production frontend build:

```bash
npm run build
npm start
```

`npm run dev:web` starts a browser-only UI preview. Native filesystem access and agent execution require the desktop app.

## Connect a model

1. Open **Settings → Model providers → Add service**.
2. Enter the provider's Base URL, exact model ID, and API key. A local service without authentication may use an empty key.
3. Choose the appropriate protocol, save, and test the connection. Connection tests send a small request and may incur provider charges.
4. Start a conversation, optionally selecting a project folder, and send a task.

Use a base URL such as `https://api.example.com/v1`, without appending `/responses` or `/chat/completions`. Public endpoints require HTTPS; HTTP is allowed for supported localhost and private-network addresses. Agent tasks require compatible tool calling. Native web search requires a Responses provider that supports it.

## Data and execution

“Local-first” describes where the workspace is stored; it does **not** mean every model runs locally. Prompts, selected files, and tool context may be sent to your configured model service.

- API keys are encrypted using Electron safeStorage and are not returned to the renderer.
- The default execution mode starts read-only and asks for approval when writes or elevated access are required. Optional full access allows actions without individual approval.
- A project folder is working context, not a guarantee that it is the only readable location.
- The app maintains a separate engine configuration and does not reuse the official Codex application's login or configuration.
- For compatibility with earlier development builds, macOS data remains under `~/Library/Application Support/Atelier`, including `atelier.sqlite` and a separate `codex-home`. Browser preview data is separate.

## Build a Mac application

```bash
npm run package:mac   # Build the .app for the current Mac architecture
npm run dist:mac      # Build .app, DMG, ZIP and checksums in release/
```

Local packages use ad-hoc signing and are not Apple-notarized distribution builds. For a signed and notarized release, configure Developer ID signing and Apple notarization credentials, then run `npm run release:mac`.

## Development and validation

Built with Electron, React, TypeScript, and Vite.

```bash
npm test                         # Unit and local integration tests
npx playwright install chromium
npm run test:e2e                  # Browser UI tests
npm run test:desktop              # Desktop smoke test with a local model fixture
npm run test:codex                # Pinned engine integration tests
npm run test:credentials          # Credential persistence across restarts
```

Desktop checks run on macOS and may use the system keychain. Local test fixtures do not establish compatibility with every external model provider.

Internal planning (`docs/`), generated deliverables (`output/`), dependencies, runtime binaries, user data, and build outputs are intentionally excluded from Git. Runtime assets are prepared by the setup/build scripts.

## Feedback and contributions

Please [open an issue](https://github.com/fjb040911/Ambleloft/issues) with reproduction steps, app version, macOS version, and provider/protocol details. Remove API keys, private files, and sensitive conversation content before sharing logs. Discuss substantial changes in an issue before starting a pull request.

## License and acknowledgements

Ambleloft is licensed under [Apache-2.0](LICENSE). Third-party components retain their own licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Ambleloft is an independent project, not an official OpenAI product. It uses the Codex runtime, Electron, React, Vite, Lucide, and other open-source libraries.
