# 项目卡片示例

[本目录的 extension.json](./extension.json) 保留为最小契约清单片段；只有这份 JSON 仍不能安装。

A7 已提供 [完整可构建 Demo](../../../examples/extensions/project-card/README.md)，包括 Node 后台、独立页面、国际化、SDK 依赖及打包流程。使用方式见 [开发入门](../developer-guide.md)。

闭环：用户信任并启用扩展 → 打开首页 → 宿主项目选择器授权 projects.read → 页面调用 describe → Agent 在同一项目中调用相同 describe → 返回名称与说明，不返回工作目录。

```sh
npm run extensions:demo
npm run test:extensions:demo
```

构建后的开发目录与 `.amble-extension` 安装包均经过真实桌面验证。SDK 当前为本地交付的开发者预览，未发布公共 registry，不代表稳定 1.0。

## 声明式表单设计示例（尚未实现）

见 [单步与多步骤 YAML](./declarative-forms/README.md)。这些是待评审协议示例，不能作为当前可安装扩展或已经可执行的 Skill。
