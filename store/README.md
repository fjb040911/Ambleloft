# Curated Store publishing / 精选 Store 发布

First implementation: a signed catalog, immutable packages, and the host's existing installers. `curated.json` is the team-maintained candidate list. The current two releases are internal test examples, not a public marketplace or a claim of manual security certification.

第一期只提供团队维护的精选目录。当前两条内容为内部联调样例；签名校验只证明来源和完整性，不代表操作系统沙箱或全面安全认证。技能大师继续由宿主内置，不重复发布安装包。

## Publish / 发布

Generate an Ed25519 private key on the publishing machine. Keep it outside source control with mode `0600`; distribute only its public key in trusted source configuration. Never upload the private key to the catalog server.

```sh
node scripts/publish-store.cjs \
  --spec store/curated.json \
  --key /absolute/private/path/publisher-key.pem \
  --out /absolute/release/directory \
  --reviewed-by 'Reviewer or validation process identity' \
  --expiry-days 14
```

The command checks identity, localization, license/README presence, package limits, and archive round-trip integrity without executing extension code. It writes content-addressed artifacts and a signed index. A repeated version with different package bytes is rejected. The live index changes only after validation and artifact writes complete. The `.publish.lock` directory prevents competing publishers; investigate a stale lock before removing it.

Optional `previewSteps` metadata contains 1–6 steps, each with bilingual `title` and `description` (nonempty, at most 2,000 characters per language). The host and website render these signed descriptions as a read-only walkthrough; they never execute the package to generate a preview. Keep the descriptions aligned with the actual declared forms when reviewing releases.

发布前还需审核具体源码、依赖、许可和试用记录。`reviewed-by` 必须如实填写实际审核人或自动验证流程；本轮目录明确标注自动化校验，没有伪造人工审核。

`requirements` declares host/platform requirements; it is not evidence of real-machine testing. These samples use portable formats and JS handlers, but this round's real desktop verification is on macOS. Windows/Linux still need release testing. Changes to package content require a version bump in the catalog and extension manifest where applicable.

## Use the internal test source / 试用内部测试源

`sources.test.example.json` contains only the test source's public verification key and a loopback URL. It contains no credential. Start the separately documented SSH tunnels, then launch the host from this repository:

```sh
AMBLE_STORE_SOURCE_FILE="$PWD/store/sources.test.example.json" npm run dev
```

The host must be restarted when source configuration changes. Existing instances do not inherit a new environment variable. Without a configured source, the installed-content manager remains available. Public builds do not silently trust the test server.

服务源必须由可信本地配置提供；网页和深链接不能注入任意 URL 或公钥。正式部署使用 HTTPS 域名，测试机 IP 不写入客户端代码。第一期仅一个精选源，不提供自助添加公共源或社区上架。

## Refresh the website / 同步网站

In the Web repository:

```sh
npm run store:sync -- /absolute/release/directory/catalog.json
npm run build
```

The website receives the signed catalog only; downloads and package execution stay in the host. The catalog expires (default 14 days), so republish a newly dated signed index before expiry and synchronize the website. No background renewal is configured by this task.

## Checks / 验证

```sh
node --test tests/catalog-store.test.cjs tests/install-confirmation.test.cjs tests/store-publisher.test.cjs tests/store-samples.test.cjs
node tests/catalog-store-live.cjs /trusted/source.json http://127.0.0.1:18080
```

The live probe creates fictional test tickets in the configured test API and uses an isolated temporary profile. For real desktop/model acceptance, see `scripts/test-store-desktop.mjs`; only set `AMBLE_STORE_LIVE_PROVIDER_PROFILE` when explicitly testing with an existing configured provider. That probe copies encrypted provider configuration to a temporary profile and removes it afterwards; it does not print keys or change the original profile.

The desktop probe saves model runs to `test-results/store-desktop-live.json` and model-free runs to `test-results/store-desktop-smoke.json`. Native install confirmation is accepted by a test callback; business confirmation is clicked in the actual renderer. URL routing is exercised through the main-process event, which does not replace packaged OS protocol-handler acceptance.

第一期不会覆盖更新已安装内容。卸载/重新导入仍由现有管理器处理；下一阶段再提供发行差异、本地修改保护下的升级、回滚以及私有目录。不要将商店版本号与技能本地 revision 混用。
