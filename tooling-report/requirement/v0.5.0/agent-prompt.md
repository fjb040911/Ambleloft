请继续迭代独立 extension-tooling 项目的 SDK/CLI 与 Demo。先阅读相邻 agent 仓库 tooling-report/requirement/v0.5.0/README.md，再核对 specs/extensions/current-capabilities.md、icons.md、message-actions-auth-guide.md，以及 contracts 下的 Schema 和类型。

宿主已实现图标声明、消息 Operation 按钮及持久结果回报、企业 OIDC 和宿主认证请求代理；SDK/CLI 已同步基础契约与校验，不要重复实现或依据旧提案撤回现有能力。

本轮重点是脚手架真实图标资源与构建复制、消息/认证综合 Demo、CLI 反例校验、tarball 干净安装和真实桌面验收。清单声明不等于宿主已经授权。不能导出原始 Token、伪造宿主方法或自动重放未知结果的业务操作。

保留现有改动；以实际代码、测试和现行规范为准。宿主 docs 不公开，不要把新公开材料放进去。在 tooling-report 中记录增量结果、失败证据、未验证项与需要宿主修复的具体问题。不要自动发布 npm 或修改发布版本；不要每次构建自动接受新的 host-baseline。
