# npm alpha.7 发布与公网验收

## 结果

四个包均已公开发布 0.1.0-alpha.7，alpha 标签均指向该版本：

- https://www.npmjs.com/package/@ambleloft/extension-core
- https://www.npmjs.com/package/@ambleloft/extension-sdk
- https://www.npmjs.com/package/@ambleloft/extension-cli
- https://www.npmjs.com/package/create-ambleloft-extension

发布账号 fjb040911，为 ambleloft 组织 owner。使用此前验证过的确切 tarball 发布，未重新打包或覆盖版本。公网下载的全部 SHA-256 / integrity 与发布清单匹配。

## 开发者使用

```sh
npm create ambleloft-extension@alpha my-extension
cd my-extension
npm run build
npm run validate
npm run pack
```

Node >=22.13；无需 npm/GitHub 登录或私有源码仓库权限。安装 dist/my-extension.amble-extension 到 Ambleloft。

## 真实验证

1. 不携带认证的 HTTPS 请求读取四个包 metadata、alpha tag 和 tarball，逐个比对归档 SHA-256 与 npm integrity。
2. 使用空 npm user/global 配置、空缓存及独立临时目录，从官方 registry 执行 npm create；自动安装全部依赖，SDK/core/CLI 锁定 alpha.7，resolved 均为官方 registry。
3. TypeScript 编译、bundle、CLI validate 和 pack 全部通过；安装包保存在 public-registry/my-extension.amble-extension。
4. 在独立临时 Electron profile 安装这个公网生成的包，打开项目卡片，选择本地测试项目并确认授权；扩展页面成功显示“我的第一个项目”。
5. 宿主扩展详情 README 展示通过。截图位于 public-registry/project-card.png 和 extension-details.png。临时资料与测试项目已清理，未使用用户现有项目。
6. 中英文 README 已去掉发布准备状态；本地链接、代码围栏与 git diff --check 通过。

## npm registry 行为与限制

首次 publish 均返回成功，但有短暂的 processing 阶段，部分包 404、脚手架先出现 0.0.0-stage 占位版本。等待最终 alpha 版本可见后才执行公网验收；npm stage list 返回空数组。

发布显式使用 --tag alpha，registry 仍自动添加 latest 指向同一 alpha.7。用户完成标签修改二次验证后，DELETE latest 仍返回 HTTP 400；未删除版本、未发布伪稳定占位包。官方问题记录：https://github.com/npm/cli/issues/8490 。保留实际标签状态，文档安装命令均显式 @alpha，版本与 API 不声明稳定。新版 CLI 的重试再次要求认证，已中止，不再重复要求用户验证。

## 修改与未做事项

发布脚本改为继承交互终端，使 npm 浏览器二次验证可继续；新增 test:registry 脚本执行可重复的公网安装测试。中英文文档与分发说明已更新。

本轮未提交/推送 GitHub、未做全量桌面功能重测或 Windows/Linux 验收。公开安装功能已验证；后续 alpha 发布继续使用精确版本依赖与 alpha 标签。
