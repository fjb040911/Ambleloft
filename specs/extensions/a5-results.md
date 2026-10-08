# A5 窗口、扩展页面与交互授权

状态：已接入桌面并在 macOS arm64 开发环境验证。A6 OperationRouter 和 Agent 工具适配尚未实现；本记录不代表 M1 或三平台发行验收完成。

## 已实现

- WindowRegistry 按主 webContents、主 frame、宿主 URL 与 profile 校验身份。支持新建窗口，各窗口拥有独立扩展页面，同一 profile 复用 A4 后台管理器。workspace、Agent 运行及扩展状态使用宿主广播；旧整份 workspace 写入入口继续关闭。
- 主导航的扩展列表与设置中的扩展管理分开。点击扩展打开首页；没有首页时显示页面可见操作的元数据，暂不允许调用。旧文本扩展保留兼容展示。
- 静态首页使用独立 WebContentsView、临时 session、专用 preload 和每页唯一来源。只暴露声明 webRoot 内允许类型的资源，拒绝路径穿越、链接及后台代码访问。页面没有 Node、宿主 desktop API、webview 或系统权限；禁止页面原生 alert/confirm/prompt。
- 页面桥校验协议版本、递增 requestId、来源、主 frame、安装 revision 和 generation；限制请求体与并发。已接入 initialize、selectProject、requestGrant、requestSecretInput 及 context 更新。invoke 明确返回 UNSUPPORTED，不直接连接后台 handler。
- 项目选择器、授权确认和秘密输入均由宿主渲染；只有页面先经选择器选中的项目才能发起项目授权。项目 DTO 不包含目录路径。秘密值存入宿主安全存储，页面只收到保存结果。
- 所有宿主 Modal 和原生对话框显示期间通过租约隐藏扩展 view。支持尺寸/缩放同步、Escape 返回宿主工具栏、设置遮挡、页面切换清理和窗口独立取消。
- 页面关闭或完整导航取消在途请求并释放资源，不终止共享后台。停用、卸载、版本变化使旧页面失效。授权变化更新 generation 并取消其他旧请求；后台仍遵循 A4 的停用/重新激活规则。
- 显式从目录安装的扩展，可经宿主确认接入本地 HTTP 开发 origin；仅允许 localhost/回环地址，页面和 HMR WebSocket 限于同一 origin。该选择不持久化。完整文档重载关闭页面，需要重新打开；进程内 HMR 可用。

## 验证与复现

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 全量单元/数据库/契约测试 | `npm test` | 140 项通过 |
| 类型与生产前端构建 | `npm run build` | 通过；保留现有大 chunk 提示 |
| A4 生命周期回归 | `npm run test:extensions:hosts` | 真实 utilityProcess、更新、停用、重启、卸载通过 |
| 静态页面与真实合成层 | `npm run test:extensions:pages -- --screen` | 通过 |
| 开发服务器与 HMR 链路 | `npm run test:extensions:pages -- --development` | 通过，实际完成 WebSocket 握手 |

桌面测试使用临时 profile 与 fixture，不连接用户服务。三个宿主窗口分别创建隔离页面，按需激活共用一个后台实例；授权变更可能先停止后台，测试在重新激活后比较并发窗口的启动次数。关闭一个等待选择器的窗口，不影响其余窗口。覆盖猜测 projectId、错误 frame、重复请求、秘密资源与外网请求拒绝、缩放、焦点、设置隐藏及停用清理。

macOS 的 `--screen` 使用系统屏幕截图，验证真实宿主 React 授权弹窗期间原生扩展 view 已隐藏；采样区域由扩展红色变为宿主中性色。该证据补充 A0 中仅通过 Electron 截图无法判断原生合成遮挡的缺口。测试中安装等原生对话框的回答是模拟的，授权 React Modal 是实际组件。

## 保留边界

- A6 才实现操作输入/输出验证、统一风险审批、资源 API 路由与模型目录；A0 旧线程追加工具失败仍未关闭。
- SDK 发布与可安装开发 Demo 属于 A7。现有桥是内部实现，不宣称完整公开 SDK 可用。
- `home.when` 在打开及上下文变化时校验；页面接收语言、主题与项目上下文。扩展页面内容的翻译由扩展负责，管理列表动态切换语言尚需完善。
- 本阶段广播不是可靠业务事件；hook/outbox 与通知中心仍按 M2 单独实现。模型/Skills 设置等既有页面的跨窗口即时刷新仍需集成验收补齐。
- Windows/Linux、A5 发行产物、跨显示器 DPI、屏幕阅读器和系统原生弹窗的人工交互验收尚未完成。不得用本机结果代替三平台验收。
