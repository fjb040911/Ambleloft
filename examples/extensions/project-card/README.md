# 项目卡片 Demo

最小可安装 Extension：页面和 Agent 通过同一个 `example.project-card.describe` 操作，读取已授权项目的名称与说明，不读取工作目录。

从仓库根目录执行：

```sh
npm run extensions:demo
```

在“设置 → 扩展”加载 `dist/extensions/project-card`，或安装 `dist/extensions/project-card.amble-extension`。这是构建后的安装目录；不要直接加载本源码目录。

- `src/extension.ts`：同步注册 handler，通过 invocation.resources 访问宿主。
- `src/page.ts`：使用真实 SDK 握手、选择项目、调用 Operation、处理取消、语言与主题。
- `web/`：apple-design 风格的静态页面和样式，无外部 CDN。
- `extension.json` 与 nls 文件：清单、权限及国际化文案。
- `tsconfig.json`：开发时严格类型检查；构建器将 SDK 自带进 node_modules，页面客户端单独 bundle。

完整说明见 [开发入门](../../../specs/extensions/developer-guide.md)。开发需要仓库已有的 Node/npm 构建环境；用户安装扩展时不运行 npm，不依赖系统 Node 或全局包。Demo 不包含原生 npm 模块。
