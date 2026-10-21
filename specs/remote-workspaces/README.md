# SSH 与 Docker 工作环境

实现状态（2026-10-21）：已完成本轮代码与模拟集成验证；尚未在真实 SSH + Docker 环境验收。不作为生产环境兼容性保证。

## 使用方式

1. 完全退出并重新启动宿主。源码开发使用 `npm run dev`；仅刷新窗口不能注册新增桌面 IPC。
2. 创建项目，选择 SSH 远端项目并连接服务器。
3. 在“工作环境”选择“Docker 容器”。搜索名称、镜像或 ID。
4. 双击运行中的容器，或单击选中后点击“进入容器”；键盘 Enter 同样可进入。
5. 在容器目录列表选择工作目录，也可以在选中容器后输入绝对路径。保存时重新校验。
6. 保存后项目记住服务器连接、Docker 端点与服务身份、完整容器 ID、镜像 ID、用户、Shell 和目录。文件、命令、终端使用同一目标。

默认不显示停止的容器，勾选“显示已停止容器”可见。选中停止容器不会启动它，点击“启动并进入”才执行启动。容器 paused / restarting 等状态需要在远端处理，不自动取消暂停或重启。

## 首版依赖与范围

- 通过当前 SSH 连接在服务器上调用 Docker CLI，使用服务器本机 Unix socket。
- 自动探测 `/var/run/docker.sock` 和当前 SSH 用户的 rootless socket，按顺序尝试。高级设置可指定本机 Unix socket；不使用本机电脑上的 Docker，也不沿用指向另一台主机的 Docker context。
- 当前 SSH 用户需要访问所选 Docker daemon 的权限，不自动 sudo 或变更用户组。
- 容器需要 `python3`（标准库即可）和 `/bin/bash` 或 `/bin/sh`。这些是开发镜像的前提条件；不会自动安装依赖。辅助脚本通过标准输入执行，不安装远端 Agent，也不在容器内持久化该脚本。
- 用户默认沿用容器配置；高级设置支持用户名、UID、用户:组和 bash / sh。默认优先 bash，否则 sh。终端会话中的 cd / export 不传播给独立的 Agent 命令。
- 首版不含镜像构建、Dev Containers、端口转发、Windows 容器、Podman、Kubernetes 或嵌套 Docker。

## 状态与恢复

SSH 状态和容器工作环境状态分别显示。容器环境在连接后、刷新时、窗口重新获得焦点时检查；可见窗口每 15 秒复查。每次实际文件 / 命令 / 终端访问仍独立校验目标身份。

容器不存在时，在连接设置中“更换容器”，选择新容器和目录并保存。即使新容器名称相同，也不会自动替换原 ID。历史任务保留，位置改变后需要新建任务。进行中的任务和存活终端会阻止项目目标修改。

SSH 断开、输出超限、超时或取消时，执行结果可能未知，不会自动重复命令。关闭 SSH 或窗口不会停止或删除容器。

只读目录可以浏览，写操作返回权限错误。目录列表标注卷 / bind mount、容器可写层和 tmpfs 的差别；可写层在容器被删除后不保留，tmpfs 随停止 / 重启消失。目录条目有上限，截断会显示提示。

## 实现分层

- `core/ssh/environment.cjs`：目标结构校验、身份键、任务快照。
- `core/ssh/docker.cjs`：daemon / 容器发现和校验、进入、显式启动、执行和 PTY。
- `core/ssh/channel.cjs`：有界 SSH 命令流、超时 / 中断未知结果、PTY。
- `core/ssh/container-files.py`：容器文件协议，UTF-8 / 二进制、目录边界、符号链接检查、临时文件替换和 SHA-256 冲突检测。
- `core/ssh/files.cjs`：原有远端预览和文件接口按目标路由；缓存与预览 URL 隔离环境。
- `src/DockerProjectFields.tsx`：容器发现、搜索、目录、设置和恢复 UI。

写入校验是尽力检测跨进程冲突；不能宣称 Python/SFTP 提供跨客户端原子 CAS。项目根目录限制文件工具的访问范围，不代表 Shell 命令被目录沙箱隔离。

扩展 SDK 的公开 Project 目前仅包含 id/name/description，getProjectPath 返回字符串，未新增外部接口。内部项目和任务目标扩展了 environment。远端任务继续使用 remote_* 工具，不新增本地扩展的远端执行承诺；不要将远端路径交给本地 Node fs 当作本地路径使用。

## 验证记录

运行：

```sh
node --test tests/docker.test.cjs tests/ssh.test.cjs tests/terminal.test.cjs tests/workspace-resources.test.cjs
PLAYWRIGHT_CHANNEL=chrome npx playwright test tests/e2e/docker-project.spec.ts tests/e2e/navigation.spec.ts --workers=1
npm run build
```

自动化覆盖：结构化目标与注入拒绝、daemon / 容器绑定、显式启动、真实 Python 辅助脚本在本机临时目录的文本和二进制处理、冲突和符号链接边界、远端工具路由、预览目标隔离、命令流中断与输出边界、终端输入 / resize / 退出，以及容器选择、保存恢复、错误恢复、环境切换和窄窗深色 UI。

以上 SSH / Docker 响应为模拟。真实环境验收另行执行，至少包括：

- Linux SSH 主机 + Docker Engine，普通用户和 rootless 两种端点。
- Ubuntu / Debian + Python 3 + bash，Alpine + Python 3 + sh；没有依赖的镜像要正确拒绝。
- 文件面板 / Agent / 终端访问同一个容器，服务器同路径哨兵文件不变。
- 默认非 root 用户、指定 UID、只读挂载、卷和 tmpfs。
- PTY resize、交互程序、Ctrl+C、后台子进程的实际退出行为。
- SSH 断网、容器停止和同名重建，执行结果不误判、不重放。
- 接近大小上限的二进制预览与文件版本变化。

## English quick start

This iteration is implemented and tested with simulated SSH/Docker responses. Real Docker integration remains pending.

Create an SSH project, connect to the server, select **Docker container**, choose a running container, then choose its working directory and save. Use **Show stopped containers** and explicitly choose **Start and enter** when needed. Advanced settings allow a local Unix socket, container user, and shell.

The remote SSH host needs the Docker CLI and permission to access its local daemon. The container needs Python 3 and `/bin/bash` or `/bin/sh`. Nothing is installed automatically. Files, Agent commands, and terminals target the pinned container ID. Container recreation requires selecting and saving a replacement, then starting a new task. Interrupted operations are never replayed automatically.
