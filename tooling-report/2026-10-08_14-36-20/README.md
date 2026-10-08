# npm alpha.7 发布前权限检查

- npm whoami：成功，账号 fjb040911。
- npm org ls ambleloft --json：E404 Scope not found。
- 四个准备归档 SHA-256 与发布清单全部匹配。
- 未执行 npm publish，未修改包名或发布任何部分依赖。

下一步：在 npm 网站创建 ambleloft 组织，选择免费公开包方案；若组织已存在，确认账号获得正确 scope 的发布权限。就绪后按原计划发布四个 alpha.7 包并做公网空缓存安装验收。

组织说明：https://docs.npmjs.com/creating-an-organization/
发布归档：extension-tooling/dist/alpha-release
