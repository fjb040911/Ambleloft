# 角色库入口与阿里云直连

2026-10-25。替代首轮实现中手工指定测试源和 SSH 隧道的日常使用方式。

## 交互

- “协作工作平台 → 角色库”统一选择模板和设计自定义角色。右上角“设计角色”为主要按钮，“刷新”为次要操作。
- “我的员工 → 添加员工”进入角色库；我的员工继续负责使用、编辑、激活和移除已保存员工。
- 从角色库新建或配置模板时，返回按钮显示“返回角色库”；编辑已有员工时显示“返回我的员工”。未保存修改仍有离开确认。
- 保存后进入我的员工；仅保存不安装，保存并激活走原全局技能安装器。

## App 与服务

默认信任源随 `core/catalog-store/sources.json` 打包，读取 `https://47.116.195.229/store/`。源码与安装包使用相同源。当前运行中的旧主进程需要重启一次；普通启动不再需要 `AMBLE_STORE_SOURCE_FILE` 或 SSH 隧道。

仍允许显式本地源覆盖；空值或空数组禁用源；无效文件、明文公网地址或无效公钥会报错，不会静默回退。网页和深链接不能更改可信源。角色、目录签名与制品校验保持不变。

现有角色：产品经理、架构设计师、Web UI 工程师、后端集成工程师、文案大师、教程作者、测试验收工程师。均为已发布的 0.1.1 模板，每个声明两项技能；共享后为八项全局技能。

服务器继续使用 `/opt/ambleloft-store-lab` 容器及原签名文件。Apache 新增 443 HTTPS `/store/` 代理，容器端口仍是服务器回环 18081；只接受 GET/HEAD。原 HTTP 网站、18080/18082 业务 API 和数据未改动。

部署配置在 `store/deploy/`。TLS 使用受信任的 IP 证书；独立 `/opt/ambleloft-certbot` 环境安装 Certbot 5.8.0。`ambleloft-store-certificate.timer` 每天检查四次续签，成功后校验并 reload Apache。测试签发、正式签发与续签 dry run（含 reload hook）均成功。

实现依据：[Let's Encrypt IP 证书与续签说明](https://letsencrypt.org/2026/03/11/shorter-certs-certbot)。证书采用短有效期，所以续签 timer 是部署的一部分。TLS 私钥留在服务器；目录签名私钥仍只在发布机，未上传。

**运维边界：** TLS 自动续签不等于目录自动发布。当前目录签名有效期到 2026-11-08，需在到期前用原发布流程重新签名。未来更换正式域名只需更新可信源地址，不能关闭 TLS、签名或过期检查。

回退直连代理：`a2dissite ambleloft-store && apache2ctl configtest && systemctl reload apache2`；之后可显式指定旧 loopback 源并使用 SSH 隧道。不要删除既有 Store 数据、目录缓存或全局技能。

## 验证

- `node --test tests/catalog-source.test.cjs tests/catalog-store.test.cjs tests/workforce.test.cjs`：19/19 通过，包括普通启动默认源、打包包含、覆盖、禁用及无效配置不回退。
- `npm run build`：通过；仅现有大包提示。
- `env -u AMBLE_STORE_SOURCE_FILE node tests/workforce-live.cjs`：2026-10-25 12:38 UTC，公网 HTTPS 实际下载和验签，7 个角色全部激活，8 项技能、6 次公共技能复用；重启和离线复用通过，原差旅/工单条目保留，模型调用 0 次。临时 profile 已清理。
- 浏览器隔离 UI 使用同一 Workforce 组件与真实默认 Store；确认七个角色可见、设计入口位于角色库、返回路径正确、“我的员工 → 添加员工”进入角色库。没有往用户现有员工池添加测试数据。
- 公网角色目录读取成功；内部备份路径不可访问，写请求被拒绝；不将“下载成功”等同于角色模型工作质量。
- 当前用户的 Electron 进程未被强制重启，避免中断其他任务；主进程默认配置在下次正常启动时生效。

截图：`agent-flow/designs/agent-workforce/review/role-store-direct/role-library.png`。隔离验证页：`http://127.0.0.1:4188/__workforce/`。
