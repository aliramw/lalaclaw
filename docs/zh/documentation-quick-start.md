[English](../en/documentation-quick-start.md) | [中文](../zh/documentation-quick-start.md) | [繁體中文（香港）](../zh-hk/documentation-quick-start.md) | [日本語](../ja/documentation-quick-start.md) | [한국어](../ko/documentation-quick-start.md) | [Français](../fr/documentation-quick-start.md) | [Español](../es/documentation-quick-start.md) | [Português](../pt/documentation-quick-start.md) | [Deutsch](../de/documentation-quick-start.md) | [Bahasa Melayu](../ms/documentation-quick-start.md) | [தமிழ்](../ta/documentation-quick-start.md)

[返回首页](./documentation.md) | [界面总览](./documentation-interface.md) | [会话、Agent 与运行模式](./documentation-sessions.md) | [API 与排障](./documentation-api-troubleshooting.md)

# 快速开始

## 环境要求

- 开发时使用仓库 [`.nvmrc`](../../.nvmrc) 中定义的 Node.js 版本，当前为 `22`；已发布的 npm 包支持 `^20.19.0 || ^22.12.0 || >=24.0.0`
- 普通本地使用推荐走 npm 安装
- 只有在需要开发模式或本地修改代码时，才需要 GitHub 源码仓库

## 通过 OpenClaw 安装

使用 OpenClaw 在远端 Mac 或 Linux 机器上安装 LalaClaw，然后通过 SSH 端口转发在本地访问。

如果你已经有一台安装了 OpenClaw 的机器，并且可以通过 SSH 登录这台机器，那么你可以让 OpenClaw 直接从 GitHub 安装这个项目、在远端启动它，再把远端端口转发到本地访问。

对 OpenClaw 说：

```text
安装这个 https://github.com/aliramw/lalaclaw
```

典型流程：

1. OpenClaw 在远端机器上克隆这个仓库。
2. OpenClaw 安装依赖并启动 LalaClaw。
3. 应用在远端机器的 `127.0.0.1:5678` 上监听。
4. 你通过 SSH 把远端端口转发到本地。
5. 你在本地浏览器中打开转发后的地址。

示例 SSH 端口转发：

```bash
ssh -N -L 3000:127.0.0.1:5678 root@your-remote-server-ip
```

然后打开：

```text
http://127.0.0.1:3000
```

## 从 npm 安装

如果你是普通用户，最简单的安装方式是：

```bash
npm install -g lalaclaw@latest
lalaclaw init
```

然后打开 [http://127.0.0.1:5678](http://127.0.0.1:5678)。

说明：

- `lalaclaw init` 会在 macOS 和 Linux 上把本地配置写到 `~/.config/lalaclaw/.env.local`
- 默认情况下，`lalaclaw init` 使用 `HOST=127.0.0.1`、`PORT=5678`、`FRONTEND_PORT=4321`，除非你主动覆盖
- 检测到本地 OpenClaw 时，`lalaclaw init` 还会写入解析后的 `OPENCLAW_BIN`，并给 `launchd` 配好包含当前 Node 运行时的 `PATH`
- 在源码仓库中，`lalaclaw init` 会默认后台启动 Server 和 Vite Dev Server，然后提示你打开 Dev Server URL
- 在 macOS 的 npm 安装场景里，`lalaclaw init` 会安装并启动 Server 的 `launchd` 服务，然后提示你打开 Server URL
- 在 Linux 的 npm 安装场景里，`lalaclaw init` 会后台启动 Server，然后提示你打开 Server URL
- 如果你只想写配置、不自动启动服务，可以使用 `lalaclaw init --no-background`
- 使用 `--no-background` 后，先跑 `lalaclaw doctor`，源码仓库用 `lalaclaw dev`，发布包安装用 `lalaclaw start`
- `lalaclaw status`、`lalaclaw restart`、`lalaclaw stop` 只用于管理 macOS 的 `launchd` Server 服务
- 预览 `doc`、`ppt`、`pptx` 文件需要 LibreOffice。在 macOS 上可执行 `lalaclaw doctor --fix`，或者运行 `brew install --cask libreoffice`

## 从 GitHub 安装

如果你希望拿到源码，用于开发或本地修改：

```bash
git clone https://github.com/aliramw/lalaclaw.git lalaclaw
cd lalaclaw
npm ci
npm run doctor
npm run lalaclaw:init
```

然后打开 [http://127.0.0.1:4321](http://127.0.0.1:4321)。

说明：

- `npm run lalaclaw:init` 现在默认会后台启动 Server 和 Vite Dev Server，除非你显式传 `--no-background`
- 后台启动完成后，会提示你打开 Dev Server URL，默认是 `http://127.0.0.1:4321`
- 如果你只想生成配置，可执行 `npm run lalaclaw:init -- --no-background`
- `npm run lalaclaw:start` 会占用当前 terminal，关闭 terminal 后服务也会停止
- 如果你的本地配置已经准备好，可以跳过 `npm run lalaclaw:init`
- 如果你更想手动编辑配置，可以从 [`.env.local.example`](../../.env.local.example) 开始

## 更新已安装的 LalaClaw

如果你是通过 npm 安装的，想更新到最新版：

```bash
npm install -g lalaclaw@latest
lalaclaw init
```

如果你想切换到某个指定发布版本，比如 `2026.3.20-1`：

```bash
npm install -g lalaclaw@2026.3.20-1
lalaclaw init
```

如果你是从 GitHub 安装的，想更新到最新版本：

```bash
cd /path/to/lalaclaw
git pull
npm ci
npm run build
npm run lalaclaw:start
```

如果你想切换到某个指定发布版本，比如 `2026.3.20-1`：

```bash
cd /path/to/lalaclaw
git fetch --tags
git checkout 2026.3.20-1
npm ci
npm run build
npm run lalaclaw:start
```

说明：

- `npm install -g lalaclaw@latest` 会更新全局安装的 npm 包
- `git pull` 会把你本地的代码更新到 GitHub 上的最新版本
- `npm ci` 会安装这个版本对应的依赖
- `npm run build` 会刷新生产模式使用的前端文件
- 如果你使用 macOS 的 `launchd` 常驻运行，更新后请执行 `launchctl kickstart -k gui/$(id -u)/ai.lalaclaw.app` 重启服务
- 如果 Git 提示你有本地改动，请先备份或提交这些改动，再执行更新

## 开发模式

开发模式需要 GitHub 源码仓库，并且已经执行过 `npm ci`。

仓库联调时请使用仓库固定开发端口：

```bash
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
npm run dev:backend -- --host 127.0.0.1 --port 3000
```

你也可以直接运行：

```bash
npm run dev:all
```

开发地址：

- 前端：`http://127.0.0.1:5173`
- 后端：`http://127.0.0.1:3000`
- 浏览器入口：`http://127.0.0.1:5173`

开发态下 `/api/*` 会通过 `vite.config.mjs` 代理到 `http://127.0.0.1:3000`。

## 生产构建模式

如果你要验证构建产物而不是开发联调：

```bash
npm run build
npm run lalaclaw:start
```

说明：

- `npm run lalaclaw:start` 依赖现有的 `dist/`
- 如果跳过 `npm run build`，后端会返回 `503 Web app build is missing`
- 因此日常前端开发不应使用构建模式

## macOS 常驻生产部署

如果你希望在 macOS 上关闭 terminal 之后服务仍然在线，建议使用 `launchd`。

1. 先构建应用：

```bash
npm ci
npm run doctor
npm run lalaclaw:init
npm run build
```

2. 用仓库里的脚本生成 plist：

```bash
./deploy/macos/generate-launchd-plist.sh
```

3. 加载服务：

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/ai.lalaclaw.app.plist
launchctl enable gui/$(id -u)/ai.lalaclaw.app
launchctl kickstart -k gui/$(id -u)/ai.lalaclaw.app
```

常用命令：

```bash
launchctl print gui/$(id -u)/ai.lalaclaw.app
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/ai.lalaclaw.app.plist
tail -f ./logs/lalaclaw-launchd.out.log
tail -f ./logs/lalaclaw-launchd.err.log
```

更完整的 macOS 部署说明见 [deploy/macos/README.md](../../deploy/macos/README.md)。

## `mock` 与 OpenClaw

启动时，后端会优先读取 `~/.openclaw/openclaw.json`。

- 如果检测到本地网关和 token，则进入 `openclaw` 模式
- 否则默认回退到 `mock` 模式

强制使用 `mock`：

```bash
npm run dev:backend -- --profile mock --host 127.0.0.1 --port 3000
```

如果你使用 CLI 初始化配置：

```bash
npm run lalaclaw:init
npm run doctor
```

在 `remote-gateway` 模式下，`doctor` 还会对远端网关做一次真实探测，并发送一个最小 API 请求来验证配置的模型和 Agent。

## Browser Access Tokens

如果浏览器打开后看到访问令牌解锁页，可以按下面的方式找到或重置 token：

- 运行 `lalaclaw access token` 查看当前 token
- 运行 `lalaclaw access token --rotate` 生成并写入新的 token
- 检查 `~/.config/lalaclaw/.env.local` 里的 `COMMANDCENTER_ACCESS_TOKENS` 或 `COMMANDCENTER_ACCESS_TOKENS_FILE`
- 如果这台实例不是你自己部署的，向部署者索取 token
