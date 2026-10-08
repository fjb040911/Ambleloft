# SDK/CLI alpha.7 公开分发准备

## 结果

已完成低门槛脚手架、许可证及发布产物准备；**尚未发布 npm**。npm whoami 返回 E401，等待用户在本机登录并确认 @ambleloft 的发布权限。公开 registry 对四个包的查询均为 404，仅说明查询不到公开包，不证明 scope 可用或具有发布权限。

开发者入口（发布后可用）：

```sh
npm create ambleloft-extension@alpha my-extension
cd my-extension
npm run build
npm run validate
npm run pack
```

## 变更

- 增加 create-ambleloft-extension，复用 CLI init；默认安装依赖，自动从目录生成扩展名称，支持模板、publisher/name 和 skip-install；安装失败保留文件并提示重试。已有目录不覆盖，原有 CLI init 仍只生成文件。
- SDK/core/CLI/create 统一为 0.1.0-alpha.7，模板和 lockfile 同步。publishConfig 固定 public、alpha、npm 官方 registry。
- 新增开发工具分发许可证，允许商业扩展、模板修改和必要 SDK runtime 再分发。旧 Apache 授权与声明原样保留，不能撤回；来自宿主的旧代码不因新条款变为闭源。第三方授权保留。
- 五个使用 SDK 的模板在构建目录自动携带 third-party/ambleloft-sdk 下两份许可证。静态 task-form 未打包 SDK，未额外携带 SDK 声明。
- 中英文 README 改为 npm create 入门路径，发布前状态明确标注；本地 tarball 路径移入开发文档；模板文档不再要求访问私有仓库。
- release:prepare 生成四个归档及文件/哈希清单；release:publish 校验全部哈希后按依赖顺序发布确切归档。未执行 publish。

## 验证

- npm test：72/72 通过，包含安装成功/失败保留、skip-install、路径、错误退出、非交互创建及拒绝覆盖。
- check:upstream：16 文件通过。仅显式允许分发 metadata 差异，宿主源码未修改。
- test:packages：实际 tarball 在仓库外离线安装，六模板 build/validate/pack 通过，SDK 类型和导出、归档确定性通过。
- 本机回环 registry 托管实际四包及已安装依赖的打包产物；空缓存执行 npm create，自动安装依赖并 build/validate/pack 成功。不是对 SDK 或宿主能力做 mock，也不是公网 npm 验收。
- 独立消费者包内许可证内容与 SDK 原文一致。
- release:prepare 通过，发布包文件清单未发现不应携带的指定文件名；包含完整许可证。
- git diff --check、中英文 README 本地链接与代码围栏通过。

## 产物与后续

发布产物：extension-tooling/dist/alpha-release；本报告附 release-manifest.json 与验证日志。维护说明：extension-tooling/docs/alpha-release.md。

用户完成 npm login 后检查发布权限，然后发布准备好的 alpha 包。公网空缓存安装验证通过后，再移除 README 的发布准备提示。若需要 OTP，应由用户在本机处理，不向对话发送 token/密码。

本轮在 macOS / Node 24.14.1 验证；未做 Windows/Linux 原生运行验收，未重新做桌面功能全量回归，未上传 npm、GitHub，未标记稳定版。新文件分发条款不是对既有 Apache 权利的撤回。
