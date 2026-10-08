# A7 SDK、Demo 与开发者工具交付

状态：SDK 开发者预览、完整示例、打包工具与公开文档已交付并验证。未发布公共 npm registry；未将 `1.0-draft` 宣称为稳定 API。macOS arm64 开发环境通过不代表三平台正式发行完成。

## 交付物

- `packages/extension-sdk`：`@ambleloft/extension-sdk@0.1.0-alpha.1`，Node CJS/ESM 导出、类型、浏览器客户端、清单 Schema 与许可证。没有运行时 npm 依赖。公开类型/Schema 从 contracts 构建复制，避免维护两套定义。
- `examples/extensions/project-card`：可构建 Node 后台与 apple-design 风格独立页面，使用实际 SDK、国际化文案、宿主主题/语言更新、项目选择、读取和取消。后台 require 包内 node_modules 的 SDK，页面客户端单独 bundle。
- `scripts/pack-extension.cjs`：复用宿主 PackageStore 校验与隔离快照，生成确定性 ZIP，回读解压并校验内容摘要后发布文件；默认不覆盖输出、不执行扩展代码。
- [开发入门](./developer-guide.md)：从 SDK 安装、handler 注册、页面调用到权限、存储、开发 origin、校验和分发。

构建命令：

```sh
npm run extensions:sdk
npm run extensions:demo
```

生成 `dist/sdk/ambleloft-extension-sdk-0.1.0-alpha.1.tgz`、`dist/extensions/project-card/` 和 `dist/extensions/project-card.amble-extension`。生成文件不纳入源码版本管理，可从源码重建。SDK 版本和 package.json 固定在源码中；Demo 构建期间不会访问 registry。

## 预览契约收敛

SDK createClient 要求先握手；初始化不兼容或宿主不存在时明确失败。invoke 返回 Result，unwrap 抛出保留 failure 的 ExtensionError；断连可能已派发的操作返回 HOST_UNAVAILABLE/unknown，不自动重放。用户取消项目选择映射为成功值 null，取消单独授权映射为 false。AbortSignal 继续使用 A6 主世界取消桥。

存储实现已修正草案与运行时的差异：

1. get 返回 null 代表无值；真正存储的 JSON null 返回带 revision 的 entry。
2. expectedRevision=null 仅在当前无值时允许创建，包括删除后重建。
3. 删除后的 revision 继续增加，不回到 0；旧数字 revision 不可覆盖新值。
4. Node RPC 错误补充 code，远端堆栈不进入 SDK 错误。key 上限文档统一为实际的 200 字符。

底层 IPC 信封不作为 SDK 公共类型承诺；开发者使用 WebviewClient。类型声明与接口均仍为预览版本。

## 验证证据

| 验证 | 结果 |
| --- | --- |
| `npm test` | 155 项通过，包含 SDK 和存储修正回归 |
| `npm run build` | 通过；保留现有大 chunk 提示 |
| `npm run extensions:demo` | 严格 TypeScript、后台/页面构建、实际包校验与归档回读通过 |
| `npm run extensions:sdk` | 生成本地 npm tarball |
| `npm run test:extensions:sdk-package` | 在仓库外临时项目离线安装 tarball；CJS、ESM、浏览器入口导入以及严格 TypeScript 正反例通过 |
| `npm run test:extensions:demo` | 真实 Electron 分别从开发目录、ZIP 安装 Demo；包内 SDK、项目授权、真实资源读取、取消、主题/语言、Agent 同一操作和撤权拒绝通过 |
| 打包器单测 | 同输入归档字节一致、回读摘要一致；已有输出、源内输出和链接拒绝；main 中主动 throw 仍可打包，证明没有执行代码 |

桌面测试使用临时 profile 与本地 Responses fixture，不连接用户模型或真实账号。原生安装信任对话框回答由测试模拟，项目授权使用实际宿主 Modal。截图检查了中文浅色空态及英文深色项目卡片；截图只用于页面样式，不替代 A5 原生合成层验收。

## 下一阶段

A8 仍需完整发行产物、三平台原生运行、既有功能集成与长期运行验证。SDK 没有开放 M2 hooks、通知、任意 IPC 或系统级资源沙箱。Demo 刻意只实现项目卡片读取，不把 PM 业务规则固化到平台。

当前宿主扩展管理列表的动态国际化、配置编辑及扩展包 Skills 接入仍需在 A8 集成审计中核对；本阶段不以 Demo 单一读取路径通过代表所有 M1 扩展点都已验收。
