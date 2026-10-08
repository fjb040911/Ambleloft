# A0 技术探针与 A1 契约校验记录

日期：2026-09-28。平台：macOS darwin/arm64。只使用隔离临时目录和本地模拟模型服务，没有读取应用用户数据、连接真实模型或修改现有聊天/UI。用户已要求开始 A0/A1；本轮不扩展到 A2–A8。

> 后续状态：本页主体记录 A0/A1 当时结果。A5 已补充 macOS 页面合成证据，A6 已验证统一内部 MCP 的新建、恢复与旧聊天路径，见文末后续记录。

## 结论与状态

发行范围已明确为 Windows、macOS、Linux，见 [跨平台要求](./platform-support.md)。以下 macOS 结果只是当前已执行证据；Windows/Linux 待验证是交付缺口，不是范围排除。当前 macOS 专用打包探针也需要后续通用化。

- A0 引擎路径已实测：新线程可用 dynamic tools，进程重启后恢复仍可调用；已有无工具线程不能通过 resume 增加 dynamic tools。**A0 不能整项关闭**：旧线程需要内部 MCP 路线评审和后续探针，原生页面遮挡还缺屏幕级验收。
- A0 容器基础能力已实测：Electron 41.10.7，Node 24.18.0，Node modules ABI 145，N-API 10；开发态和临时 ASAR 打包态一致。utilityProcess 使用应用自带 Helper，不使用 PATH Node。
- A1 独立校验器已实现并测试，内部实现 revision 为 `m1-a1-r1`；公开 `specVersion` 仍为 `1.0-draft`，**不是公开 SDK 冻结或整个 M1 验收通过**。由于 A0 门槛尚未全部关闭，本轮只交付与引擎路线无关的契约校验，不接入安装、页面或 Agent 业务链路。

## 引擎证据

执行 `npm run test:extensions:engine`。固定 vendor 引擎通过 `--version` 检查，版本为 0.153.4。

| 用例 | Responses | Chat Completions（现有 bridge） |
| --- | --- | --- |
| experimentalApi=false，携带 dynamicTools 新建 | 拒绝，错误指出 experimental | 拒绝，错误指出 experimental |
| experimentalApi=true，新建含固定两工具线程 | 2 次 item/tool/call，完成 | 2 次 item/tool/call，完成 |
| 关闭 RPC 进程后重启，resume 不传 dynamicTools | 2 次 item/tool/call，完成 | 2 次 item/tool/call，完成 |
| 无工具旧线程先完成一轮，重启并 resume 额外传 dynamicTools | 请求被接受，但模型工具目录无扩展工具、0 次调用 | 请求被接受，但模型工具目录无扩展工具、0 次调用 |

固定工具为 extension_list_operations / extension_invoke_operation。探针使用最小空对象输入测试传输，不是对外冻结的工具参数 schema。每次调用检查 threadId/turnId/callId、返回 `{success:true,contentItems:[{type:'inputText',text:...}]}`，并确认结果进入模型后续请求；工具执行循环由真实引擎负责。

固定版本实际要求 dynamicTools 项带 `type:'function'`。`thread/resume` 不支持增加工具，额外字段被忽略，不能把 RPC 成功当作目录更新成功。探针不更换引擎、不删除历史、不放宽 sandbox，也不使用外部端点。

## 内部 MCP 适配提案（待评审，未实现）

建议为每个执行上下文创建独立的宿主内部 MCP 连接，新旧线程统一通过该连接访问固定两工具，避免长期维护两种权限入口。MCP 服务只做协议适配，仍调用同一 OperationRouter，不允许扩展 manifest 声明 MCP binding。

1. 宿主在启动对应 RPC 时创建短期连接凭证，绑定 profile、run、project 和 RPC generation；不使用模型参数声称的身份。连接信息只传给内部 MCP 子进程，不持久化到线程或暴露模型凭据。
2. list 输出只包括当前项目下可调用的 agent 操作；invoke 再查 exposure、input schema、grant、generation 和确认策略。Agent full 不绕过这些检查。
3. 取消、RPC 退出和撤权终止关联请求及连接，拒绝迟到结果；有副作用的调用不自动重放。后台 Node 实例生命周期仍归 HostManager。
4. 必须新增真实固定引擎探针：先创建无扩展工具的持久旧线程，再在新进程配置内部 MCP 并恢复，验证 tools/list、tools/call、历史保留、双协议、双项目隔离、取消和凭证失效。未通过前不得接入 A6。

需要评审的技术选择是“统一内部 MCP”还是“新线程 dynamic tools＋旧线程内部 MCP”；本轮证据只证明旧线程不能走原 dynamicTools 注入路线，不证明 MCP 候选已可用。

## Electron 证据与限制

执行 `npm run test:extensions:electron`（开发态）和 `npm run test:extensions:packaged`（隔离临时 unsigned ASAR 应用）。后者用本地 Electron distribution 和 electron-builder 26.15.3，无依赖下载，不改 release 下既有产物。最终打包探针成功退出。

已验证：utilityProcess parentPort、主/子进程 ABI 一致；sandbox/contextIsolation 开启且 nodeIntegration 关闭；专用 preload 可调用；页面没有 require/process/宿主 atelier；主 frame、webContents 和 URL 绑定检查；子 frame 不具有桥；宿主窗口被拒绝；导航到其他来源后桥返回 FORBIDDEN；bounds 和 zoom API 可设置。

未关闭事项：

- capturePage 的可见/隐藏原生子视图截图均得到宿主背景色 BGRA `[76,251,117]`，不能据此证明原生合成层遮挡正确。探针明确输出 `compositorCaptureIncludesView:false` 和 `modalVisualStatus:requires-screen-capture`；退出码 0 仅表示其余断言通过。仍需屏幕级截图、真实审批弹层、resize/focus/键盘和屏幕阅读验收。
- 当前用本地文件页验证专用 preload 与 sender 身份，不是正式 asset scheme/CSP 的实现或安全验收。
- 临时打包应用未签名，不代表完整 Ambleloft 发布包、签名/公证、原生 npm 模块兼容或 Windows/Linux 已通过。engines 暂不新增 Node/ABI 宣称。

## A1 实现边界

- `core/extensions/manifest.cjs`：draft 2020-12 结构校验；贡献 ID/handler 唯一性和绑定完整性；权限与 projectScoped；受限 JSON schema 类型、required、enum、上下限、深度（8）；只读操作风险一致性；配置凭据字段拒绝；旧格式与 M2 字段拒绝。
- `core/extensions/condition.cjs`：独立 tokenizer/parser，支持 !、&&、||、括号、同类型相等/不等、数字顺序比较；没有 eval/Function，未知键和类型不匹配拒绝。内置 project.exists；扩展仅 ext.<publisher.name>.*。不做 JS 类型转换。
- JSON 校验拒绝非 JSON 类型、访问器、原型对象、循环、非有限数、不安全属性，限制 256 KiB、20000 节点和传输结构深度 32；不执行扩展代码。
- 国际化仅替换显示字段，默认词典必须完整；locale 精确匹配→基础语言→默认。ID、handler、权限、路径、条件不翻译。词典只允许非空字符串；配置凭据字段以常见敏感字段名拒绝，不能据此识别任意自由文本中的秘密，宿主配置 UI 仍须引导 secrets API。
- 目录校验检查 main、webRoot/entry、skills/SKILL.md、词典；路径拒绝绝对/回退/空分段/符号链接并检查 realpath。不导入 main，不运行安装脚本。ZIP 全量条目、硬链接/大小写冲突、不可变 staging 与 TOCTOU 防护归 A3；此接口只适用于未激活的目录预检，不能替代安装事务。
- Ajv 8.20.0 已列为明确开发依赖。prebuild bundle 成 `build/extension-manifest.cjs`，生产打包放 `resources/tools/extension-manifest.cjs`；bundle 自带 schema/Ajv，不依赖仓库 node_modules 或 specs。后续安装时须在有超时/内存限额的 worker 调用，不能直接在 UI 主线程校验不可信大包。
- 没有改旧 registry/service 入口、数据库、授权或业务 UI。handler 注册阶段的实际接入属于 A4；当前只提供精确绑定校验函数。

## 复现与回归

```sh
npm run test:extensions:engine
npm run test:extensions:electron
npm run test:extensions:packaged
node --test tests/extension-manifest.test.cjs
npm run extensions:validate -- tests/fixtures/extensions/valid
npm run extensions:validate -- tests/fixtures/extensions/invalid
npm test
npm run build
```

有效 fixture 退出 0，无效 fixture 退出 1。A1 测试为 40 项（含持久化有效/无效包 fixtures），还包含 32 组语义/结构反例。最终全仓 111 项全部通过（其中 A1 为 40 项）。生产 build 已通过，保留既有 Vite 大 chunk 和 FileCode 动静态导入警告。bundle 复制到仓库外临时目录后可独立 require 并校验示例通过。

网络沙箱禁止本机监听时，7 个既有 HTTP 测试报告 EPERM；在允许 loopback 监听的执行环境重跑后全部通过。Electron 需要允许启动桌面进程。首次打包探针清理临时 profile 时遇到 ENOTEMPTY，已加入有限清理重试和确保退出，重新打包运行退出 0。

## A5 后续证据

[A5 记录](./a5-results.md) 补充了 macOS 开发环境真实屏幕合成层、宿主授权 Modal、焦点、缩放与三窗口验证，关闭该环境下的页面遮挡验证缺口。Windows/Linux、A5 发行产物及多显示器仍待验收；旧线程工具注入门槛保持未关闭。

## A6 后续证据

[A6 记录](./a6-results.md) 补充统一内部 MCP 真实探针：固定引擎 0.153.4 在 Responses 与 Chat Completions 下，新建、恢复及无工具旧聊天均可调用两项内部工具。macOS 旧线程接入路径已验证；原 dynamicTools 追加失败的事实不变。统一路由、项目隔离、取消及短期凭证失效由 A6 测试覆盖，其他平台及正式发行产物仍待验收。
