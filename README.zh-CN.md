<div align="center">
  <img src="public/brand/icon-128.png" width="96" height="96" alt="Ambleloft" />
  <h1>Ambleloft</h1>
  <p>本地优先的个人 AI 工作台。</p>
  <p><a href="README.md">English</a> · <strong>简体中文</strong></p>
  <p>v0.2.1 预览版 · macOS · Apache-2.0</p>
</div>

Ambleloft 将对话、项目文件和 AI 任务执行整合到一个桌面工作台。连接自己的模型服务，围绕自己的文件开展工作，并在执行过程中查看和审批 Agent 的操作。

本仓库包含通用桌面客户端。规划中的模型与插件托管平台是独立的闭源服务；行业专用方案通过在通用工作台基础上的合作定制交付。

## 当前能力

- **自选模型：**配置多个本地或云端服务，选择模型并测试连接。支持 Responses API 和 Chat Completions 适配；工具兼容性取决于服务及模型。
- **项目工作：**将对话关联到文件夹，并排浏览文件与预览代码、Markdown、HTML、图片和 PDF。
- **执行可见：**查看流式回答、可用的推理摘要、工具活动和任务计划，审批操作或停止任务。
- **保存工作：**草稿、会话恢复、归档与本地 SQLite 持久化。
- **复用技能：**创建、编辑、导入和启用本地 SKILL.md 技能包。
- **丰富呈现：**Markdown、代码、公式、Mermaid、ECharts、SVG 和基础 draw.io 内容渲染。
- **个性设置：**中文与英文、浅色/深色/跟随系统，以及可折叠工作区。

## 预览版范围

**0.2.1 是早期预览版，并非稳定发行版。** 当前已验证的桌面目标为 macOS Apple Silicon；现有打包流程尚不提供 Windows 和 Linux 发行包。

模型目录及部分集成页面包含预览或占位功能。自动模型下载、托管本地推理、插件商城安装和远程节点管理尚未提供。本地模型需要已运行并提供兼容端点。

## 从源码运行

需要 macOS、**Node.js 22.13+**（建议 Node.js 24 LTS）及 npm。引擎准备步骤使用当前机器的架构。

```bash
git clone https://github.com/fjb040911/Ambleloft.git
cd Ambleloft
npm ci
npm run engine:prepare
npm run dev
```

应用使用官方 npm 包中的固定版本 Codex app-server 引擎，无需另外安装 Codex CLI、官方 Codex 或 ChatGPT 桌面应用。引擎在本机下载、准备，不提交到本仓库。

运行生产前端构建：

```bash
npm run build
npm start
```

`npm run dev:web` 仅提供浏览器界面预览。本地文件访问和 Agent 执行需要桌面应用。

## 连接模型

1. 打开「设置 → 模型提供商 → 添加服务」。
2. 填入 Base URL、准确模型 ID 和 API Key；无鉴权的本地服务可留空密钥。
3. 选择适用协议，保存并测试连接。测试会发送少量请求，可能产生服务费用。
4. 新建对话，可选项目文件夹，然后发送任务。

Base URL 示例为 `https://api.example.com/v1`，不要追加 `/responses` 或 `/chat/completions`。公网端点要求 HTTPS；支持的本机与局域网地址可使用 HTTP。Agent 任务需要模型支持兼容的工具调用；原生网页搜索需要支持该能力的 Responses 服务。

## 数据与执行权限

「本地优先」描述工作台数据的存储方式，并不意味着模型一定在本地运行。提示词、所选文件和工具上下文可能发送到你配置的模型服务。

- API Key 通过 Electron safeStorage 加密保存，不回传渲染进程。
- 默认执行模式从只读开始，写入或提权需要审批。可选的完全访问模式允许不经逐次审批执行操作。
- 项目目录是工作上下文，并不保证它是唯一可读目录。
- 应用维护独立的引擎配置，不复用官方 Codex 的登录与配置。
- 为兼容早期开发版本，macOS 数据仍位于 `~/Library/Application Support/Atelier`，包含 `atelier.sqlite` 和独立的 `codex-home`。浏览器预览数据与桌面版分离。

## 构建 Mac 应用

```bash
npm run package:mac   # 构建当前 Mac 架构的 .app
npm run dist:mac      # 在 release/ 生成 .app、DMG、ZIP 和校验文件
```

本地包使用 ad-hoc 签名，不是经过 Apple 公证的正式分发版本。正式签名与公证发布需要配置 Developer ID 签名及 Apple 公证凭据，再运行 `npm run release:mac`。

## 开发与验证

技术栈：Electron、React、TypeScript 和 Vite。

```bash
npm test                         # 单元与本地集成测试
npx playwright install chromium
npm run test:e2e                  # 浏览器界面测试
npm run test:desktop              # 使用本地模拟模型服务的桌面冒烟测试
npm run test:codex                # 固定版本引擎集成测试
npm run test:credentials          # 重启后的密钥持久化验证
```

桌面验证在 macOS 上运行，可能使用系统钥匙串。本地模拟服务测试不代表对所有第三方模型服务的兼容性保证。

内部规划 `docs/`、生成产物 `output/`、依赖、引擎二进制、用户数据和构建输出不提交 Git。运行所需资源由初始化与构建脚本准备。

## 反馈与贡献

欢迎[提交 Issue](https://github.com/fjb040911/Ambleloft/issues)，附上复现步骤、应用版本、macOS 版本和模型服务/协议信息。分享日志前请移除密钥、私有文件及敏感对话。较大的改动请先通过 Issue 讨论，再提交 PR。

## 许可证与致谢

Ambleloft 使用 [Apache-2.0](LICENSE) 许可证。第三方组件保留各自许可证，参见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

Ambleloft 是独立项目，并非 OpenAI 官方产品。项目使用 Codex 引擎、Electron、React、Vite、Lucide 等开源组件。
