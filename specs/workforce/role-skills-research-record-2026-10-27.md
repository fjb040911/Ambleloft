# 角色技能推荐与 API：调研交付记录

日期：2026-10-27。范围：用户要求搜索优秀开源技能，设计十角色专业推荐，并让阿里云角色 API 承载关联配置。本轮是方案与契约交付，非安装、实现或上线。

## 产物

- [推荐方案](expert-role-skills-recommendations-v1.md)：十角色默认/可选组合、来源、推荐取舍、运行依赖与代表性任务。
- [具体配置](examples/expert-role-skills.recommendations.json)：11 仓库，40 技能候选，30 默认/13 可选绑定；双语用途/理由/usage，职责及能力关联，真实固定 commit/路径/SKILL.md 摘要。
- [API 增量](role-skills-api-v1.md)和[类型契约](examples/role-skills-api.contract.ts)：服务端默认值、技能详情与来源、适用说明、精确制品及逐环境验证摘要；候选与公开已发布数据分离。
- 产品、角色架构、交付清单和 PRODUCT.md 已同步；新增 PR-31、API-05、AC-39～AC-41，不改旧历史报告为已完成。

## 实际检查

1. 使用 GitHub 公共 API 获取各仓库元数据、默认分支固定 commit 与完整目录树；读取固定提交 SKILL.md、选定许可证和 README。11 棵树均未截断。仅公开读取，没有使用服务器密码或上传工作区材料。
2. 40 个候选的原始 SKILL.md 字节均重算 Git blob SHA-1 并与树条目一致，另计算文档 SHA-256；JSON 保存完整源提交与文档摘要。这不是构建完整包，不把文件摘要当 packageDigest/artifactSha256。
3. 本地 Python 断言通过：十角色与既有角色 ID 对应，默认技能每角色 2～4 项，默认/可选数量正确，同员工无机器名冲突，职责/能力引用有效，中英理由与 usage 齐全。
4. PR-01～PR-31、AC-01～AC-41 连续；新增本地文档链接可解析。
5. `node_modules/.bin/tsc --noEmit --skipLibCheck --target ES2022 --module ESNext --moduleResolution bundler specs/workforce/examples/role-skills-api.contract.ts` 通过。此检查只证明设计类型语法可用，不证明服务实现符合契约。

公开来源及观测时间在推荐 JSON repositories 中；受许可限制的上游正文不复制到本仓库，只保留必要元数据与来源链接。原始读取缓存在本机临时调研目录，未加入产品安装包。

## 未完成和部署步骤

- 候选全部保持 release=null、installable=false；无真实 Store 制品或签名快照生成。
- 尚未审核全部源代码及跨目录资源，未运行第三方脚本；Impeccable 引擎、Taste 运行资源、shadcn CLI、Cowork 连接器和 Superpowers 跨技能依赖需在发布前闭合。
- 未进行真实安装、模型角色任务、浏览器交互、Windows、SSH/Docker 或打包验证。未远端核查当前阿里云 API；部署现状描述来自仓库说明。
- 下一工程阶段按 W01～W11：固化契约 → 打包和核验资源/许可 → 隔离测试来源与角色任务验证 → 构建同快照签名角色/技能/推荐 → 部署公共只读 API，同时保留旧目录兼容。
- 本轮没有 SSH、线上写入、定时采集、员工迁移或生产发布；未重置和覆盖已有未提交工作。
