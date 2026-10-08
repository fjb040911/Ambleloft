# Extension 开发入门（A7 开发者预览）

本仓库参考包版本：SDK `@ambleloft/extension-sdk@0.1.0-alpha.1`，宿主 API `1`，manifest `1.0-draft`。SDK 已可构建为本地 npm tarball，尚未发布到公共 npm registry，也不是稳定 1.0。跨平台正式发行验收仍由 A8 负责。

## 1. 构建与安装现成 Demo

在已安装开发依赖的仓库根目录执行：

```sh
npm run extensions:sdk
npm run extensions:demo
```

产物：

| 文件或目录 | 用途 |
| --- | --- |
| `dist/sdk/ambleloft-extension-sdk-0.1.0-alpha.1.tgz` | 本地可安装 SDK，无运行时依赖 |
| `dist/extensions/project-card/` | 可直接加载的开发目录，包含编译后的后台、页面和 node_modules |
| `dist/extensions/project-card.amble-extension` | 可分发安装包 |

应用中先创建一个本地项目，然后打开“设置 → 扩展”：

1. 选择“加载开发目录”，选中构建后的 `dist/extensions/project-card`，确认代码信任；或使用“安装扩展”选择 `.amble-extension` 文件。
2. 返回应用，从“扩展”列表进入“项目卡片”。
3. 点击“选择项目”，在宿主选择器中选择项目并确认读取授权。
4. 页面展示项目名称与说明，工作目录不在返回值中。修改本地项目后可刷新。
5. 在关联同一项目的聊天中，请 Agent 使用 `example.project-card.describe` 读取项目卡片。目录与调用仍由宿主检查授权；安装本身不授予资源权限。

Demo 源码位于 [examples/extensions/project-card](../../examples/extensions/project-card/README.md)。修改源码后重新构建、重新加载开发目录，宿主重新校验与确认；不会监听任意目录并悄悄替换已信任代码。

## 2. 在自己的 Node 项目中使用 SDK

使用上一步生成的 tarball 安装，替换下面的路径：

```sh
npm install /absolute/path/to/ambleloft-extension-sdk-0.1.0-alpha.1.tgz --offline --ignore-scripts --no-audit --no-fund
```

这是开发机器上的依赖准备。用户安装扩展时宿主不会执行 npm、安装脚本或临时下载依赖。构建扩展时须把运行依赖一并打入安装目录的 node_modules，或 bundle 到后台产物。前端入口单独 bundle，不把 Node API 打入 webRoot。SDK 的 Node engines 字段描述 SDK 本身的最低语法环境，不宣称任意原生模块都兼容宿主 ABI。

```ts
import {defineExtension} from '@ambleloft/extension-sdk';

export const {activate} = defineExtension({
  activate(context) {
    context.subscriptions.push(context.operations.register('describeProject', async (input, invocation) => {
      const project = await invocation.resources.getProject(input.projectId as string);
      return {...project};
    }));
  }
});
```

handler 必须在 activate 的同步部分注册，名称与清单精确一致；不要在 await 之后才注册。宿主传入的 InvocationContext 绑定调用来源、项目与取消信号。只在该调用期间使用 resources，不能缓存为后台永久访问权。

## 3. 最小清单与目录

实际示例见 [完整清单](../../examples/extensions/project-card/extension.json)。重要字段：

- `main` 指向编译后的 JS；`contributes.home.webRoot` 限定公开页面资源，entry 相对 webRoot。
- `permissions` 声明申请资格；操作的 `requiredPermissions` 声明本次 handler 需要的权限。两者都不能代替用户授权。
- `operations` 声明 ID、handler、输入/输出 Schema、exposeTo、effect 和项目作用域。项目操作的 inputSchema 必须要求 string projectId。
- `effect:write` 由宿主确认；risk 中的重要影响不可通过普通免确认设置绕过。页面按钮点击本身不代表审批。
- `%key%` 显示文案从 `extension.nls.json` 以及语言文件解析；ID、handler、路径和权限不翻译。
- `when` / `enablement` 使用受限条件语言，不是 JavaScript。只读已声明的 contextKeys 及宿主内置键。

安装目录通常包含：

```text
extension.json
extension.nls.json
extension.nls.en.json
dist/extension.cjs
node_modules/@ambleloft/extension-sdk/...
web/index.html
web/app.js
web/style.css
```

SDK 附带 `extension.schema.json` 供编辑器使用。Schema 只是第一层检查；使用宿主相同校验器检查文件、handler 声明、依赖路径和资源限制。

## 4. 页面调用

```ts
import {createClient, unwrap} from '@ambleloft/extension-sdk/webview';

const client = createClient();
const host = await client.initialize();
const project = unwrap(await client.selectProject({capabilities:['projects.read']}));
if (project) {
  const controller = new AbortController();
  const result = await client.invoke('example.project-card.describe', {projectId:project.id}, {signal:controller.signal});
  if (result.ok) {
    // Render as text. Do not interpret project content as HTML.
  } else if (result.error.effectStatus === 'unknown') {
    // Ask the user to check the result; do not automatically retry.
  }
}
```

先 initialize，再调用其他方法。SDK 仅使用宿主提供的页面桥；普通浏览器没有该桥。初始化失败应显示可理解的错误，不能降级成绕过宿主直接读取用户资源。

用户取消项目选择时 SDK 返回成功值 null；取消单独授权时返回 false。invoke 的取消仍是 CANCELLED，已派发请求可能带 unknown；取消不是回滚。桥断连时 SDK 将 Promise 拒绝收敛为 HOST_UNAVAILABLE，可能已经派发的操作保守标记 unknown。

页面接收 locale/theme 更新，负责自身文本与主题。Demo 采用 apple-design 的系统字体、清晰层级、克制留白与即时按压反馈，支持深色模式、键盘焦点、减少动态效果及高对比度。不要让扩展页面仿冒宿主授权控件。

## 5. 存储与凭据

- storage.get 返回 null 表示不存在。存储 JSON null 会返回 `{value:null, revision}`，与删除区分。
- set 的 expectedRevision=null 表示仅在当前无值时创建；删除后的重建继续增加 revision。数字 revision 必须精确匹配，否则返回 CONFLICT；不要自动覆盖。
- key 长度为 1–200，作为不透明键使用。权限是扩展自身 storage/configuration/secrets 的 self scope。
- Node API 的拒绝携带 error.code；页面 unwrap 抛出 ExtensionError，保留 failure/effectStatus。不要把堆栈或凭据写入页面错误文案。
- 页面用 requestSecretInput 触发宿主安全输入；秘密内容只由后台 secrets 读取，不回传页面。configuration 不能代替秘密存储。
- 当前 Agent 不主动申请项目授权；未授权操作不会出现在其目录中。先通过设置或页面授权，再让 Agent 调用。

## 6. 校验与打包

```sh
npm run extensions:validate -- dist/extensions/project-card
npm run extensions:pack -- dist/extensions/project-card dist/extensions/project-card.amble-extension --force
```

打包器只接受**已准备好的安装目录**，包含目录内全部内容，不猜测哪些源码或依赖该被排除。输出必须位于该目录外，避免安装包递归包含自己。默认不覆盖已有输出；--force 是显式替换目标文件。

工具复用宿主 PackageStore：在隔离 worker 中复制、校验，拒绝链接、危险/冲突路径与超额包；从快照生成确定性 ZIP，再按安装路径解包并比对摘要，成功后发布输出。不执行扩展 main 或生命周期脚本。不把仓库 node_modules、私有配置或无关文件直接作为安装目录。

本地页面服务仅供显式加载的开发目录使用，在“设置 → 扩展 → 本地开发页面”确认精确 loopback HTTP origin。HMR 连接限于该 origin；批准不持久化，完整文档重载需重新打开。生产包默认使用包内页面，不依赖开发服务器。

## 7. 验证命令与边界

```sh
npm run test:extensions:sdk-package
npm run test:extensions:demo
npm test
npm run build
```

SDK package 测试在仓库外离线安装 tarball，检查 CJS/ESM 导出与严格 TypeScript；Demo 测试使用真实 Electron、临时 profile 和本地模型 fixture，覆盖开发目录/安装包、页面/Agent 同一操作、授权、撤权、取消和主题语言。

现有公开 SDK 不提供任意 IPC、额外 grant、后台 Hook 或动态注册工具能力。宿主已新增本地消息预览运行时，独立 SDK 已提供 messages-preview 对接，见 [消息运行时对接说明](./message-runtime-handoff.md)。扩展 Node 代码依然是用户信任后运行的本机代码，核心资源授权不等于系统级恶意代码沙箱。

## 8. 扩展认证源码预览

扩展可声明 authentication.resources，由页面 Operation 调用 invocation.authentication.requestSession；后台通过 context.authentication 查询会话、代理请求和断开授权。令牌留在宿主。完整字段、调用约束及尚未实现的账号选择器/刷新令牌边界见 [消息操作与认证接入规范](message-actions-auth-guide.md)。

## 扩展设置表单

设置 → 扩展中，声明 configuration 的包提供“扩展设置”入口。宿主根据 schema 生成字符串、数值、布尔和枚举控件；复杂对象与数组暂使用 JSON 编辑。description 按扩展本地化字典解析，字段键保留原名。保存经宿主 schema 校验，携带配置 revision 和扩展 generation，冲突不覆盖旧值；成功后通知活动后台 configuration.onDidChange。

当前需要扩展启用、信任并获 configuration/self 授权。表单不会自动授予资源权限。恢复默认值清除宿主保存的配置，后台读取空对象并采用自身默认行为：当前 schema 没有字段 default 声明，宿主不推断默认值。配置不用于密码或 Token；继续使用 secrets 安全接口。

## 聊天内声明式表单

参见[声明式业务表单开发指南](declarative-forms-guide.md)：Skill/YAML 发现、业务 Operation 注册、InvocationContext.form、服务幂等和恢复查询。chat 提交用于信息收集，业务提交由扩展 Node 后端调用服务。普通 Operation 仍允许 form 为 undefined。

## 契约与兼容性检查

独立 SDK/CLI 版本不等于本仓库参考包版本。以[当前能力表](current-capabilities.md)核对公开入口，用 check:upstream 和 doctor --host 检查源码契约；即使匹配，也仍需在目标宿主完成真实联调。

## 自定义扩展图标

在 extension.json 中声明 `"icon":"assets/icon.png"`，即可替换首页侧栏、扩展卡片和设置页的默认拼图。也可使用 `{ "light":"assets/icon-light.png", "dark":"assets/icon-dark.png" }` 适配两种主题。首版支持随包分发的静态 PNG；完整尺寸、路径及失败回退要求见 [图标规范](icons.md)。
