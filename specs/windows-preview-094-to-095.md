# Windows v0.9.4 → v0.9.5 预览升级验证

这是一条明确选择加入的单次验证通道。两个 Release 保持 GitHub Pre-release 状态，原安装包不替换。v0.9.4 已将 `allowPrerelease` 固定为 false，不能只靠上传元数据让原 GitHub provider 发现预览版；配置脚本将这台测试机的 `resources/app-update.yml` 切换为 generic provider，读取 v0.9.5 的 `preview.yml`。

## 操作步骤

1. 下载并手动安装 [v0.9.4 Windows x64 安装包](https://github.com/fjb040911/Ambleloft/releases/download/v0.9.4/Ambleloft-0.9.4-windows-x64.exe)。保留下载的安装包，不要先安装 v0.9.5。这是未签名预览包。
2. 完全退出 Ambleloft。下载 [配置脚本](https://github.com/fjb040911/Ambleloft/releases/download/v0.9.5/enable-windows-preview-094.ps1)，与安装包一起放在“下载”目录。
3. 在当前 Windows 用户的 PowerShell 中执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "$env:USERPROFILE\Downloads\enable-windows-preview-094.ps1" -Installer "$env:USERPROFILE\Downloads\Ambleloft-0.9.4-windows-x64.exe" -Launch
```

如果更改过安装位置，加上 `-InstallDirectory "你的 Ambleloft 安装目录"`。脚本不会安装应用，默认目录是 `%LOCALAPPDATA%\Programs\Ambleloft`。ExecutionPolicy 参数仅影响这次进程，不修改系统策略。

4. 脚本验证 0.9.4 程序版本和安装包 SHA-256，备份原更新配置和缓存，放入校验过的旧安装包及 blockmap，配置预览地址并启动应用。它会输出本轮日志目录。
5. 打开“设置 → 版本与更新 → 检查更新”，或等待启动后约 60 秒的自动检查。应提示 0.9.5，左下角出现蓝色下载图标。
6. 点击蓝色图标：图标变为进度圈。下载完成后，保存编辑并结束任务、关闭终端，选择“重启并更新”。
7. 重启后在“版本与更新”确认当前版本为 0.9.5，并确认原会话仍在。验证回到最新消息后继续输出能自动跟随。

## 判断是否真的使用差分

查看脚本输出目录中的 `stdout.log` / `stderr.log`。更新器会记录 `Full: ... To download: ...`、`Differential download`；出现 `fallback to full download` 表示发生全量回退。进度圈的百分比本身不能证明差分成功。

配置脚本准备了原版 0.9.4 的缓存以保证这次验证有可复用基线。下载的目标仍是 GitHub 上原有的 0.9.5 安装包，更新器执行完整 SHA-512 校验。网络问题、缓存损坏或不支持 Range 的代理仍可能导致回退。

## 边界和恢复

- 此配置仅用于 0.9.4 → 0.9.5；升级安装会覆盖 `app-update.yml`，恢复 0.9.5 包内的默认更新配置。它不等于后续版本已具备永久的预览渠道选择功能。
- 退出应用后，可将 `resources/app-update.yml.before-preview-时间戳` 复制回 `resources/app-update.yml` 撤销本次地址变更。脚本不会修改聊天数据、正式发布签名要求或 Mac 配置。
- `latest.yml` 和 `preview.yml` 均与已发布的 0.9.5 安装包匹配。默认 GitHub provider 仍排除该预览 Release；只有主动运行本脚本的测试机使用此次入口。
- 尚未在用户机器上执行安装、点击下载和重启升级；这些步骤由用户完成验证。

## 发布前实测

2026-11-11 使用 Electron 更新器及真实 GitHub 入口，从原版 0.9.4 安装包缓存完成差分下载：28 个 Range 响应、8,259,850 字节安装包数据（另有少量元数据和 blockmap），全量为 233,177,466 字节，节省约 96.46%。状态到达 ready，合成文件 SHA-256 与发布附件一致。此结果不替代用户机器上的安装重启验收。

可使用 Electron 运行 scripts/test-preview-094-to-095.cjs 并传入原版 0.9.4 安装包路径复现。

