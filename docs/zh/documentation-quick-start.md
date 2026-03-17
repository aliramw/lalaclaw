[English](../en/documentation-quick-start.md) | [中文](../zh/documentation-quick-start.md) | [繁體中文（香港）](../zh-hk/documentation-quick-start.md) | [日本語](../ja/documentation-quick-start.md) | [한국어](../ko/documentation-quick-start.md) | [Français](../fr/documentation-quick-start.md) | [Español](../es/documentation-quick-start.md) | [Português](../pt/documentation-quick-start.md) | [Deutsch](../de/documentation-quick-start.md) | [Bahasa Melayu](../ms/documentation-quick-start.md) | [தமிழ்](../ta/documentation-quick-start.md)

[返回首页](./documentation.md) | [界面总览](./documentation-interface.md) | [会话、Agent 与运行模式](./documentation-sessions.md) | [API 与排障](./documentation-api-troubleshooting.md)

# 快速开始

## 环境要求

- 使用仓库 [`.nvmrc`](../../.nvmrc) 中定义的 Node.js 版本，当前为 `22`
- 普通本地使用推荐走 npm 安装
- 只有在需要开发模式或本地修改代码时，才需要 GitHub 源码仓库

## 从 npm 安装

如果你是普通用户，最简单的安装方式是：

```bash
npm install -g lalaclaw@latest
lalaclaw init
```

说明：

- `lalaclaw init` 会在 macOS 和 Linux 上把本地配置写到 `~/.config/lalaclaw/.env.local`
- 在 macOS 的 npm 安装场景下，`lalaclaw init` 还会自动通过 `launchd` 启动后台服务
- macOS 后台服务启动后，`lalaclaw init` 会提示你按 Enter，并自动在浏览器里打开 App URL
- 如果你只想写配置、不自动后台启动，可以使用 `lalaclaw init --no-background`
- 在 Linux 上，或者你关闭了自动后台启动时，再继续执行 `lalaclaw doctor` 和 `lalaclaw start`
- 在 macOS 上可以用 `lalaclaw status` 查看后台服务状态，用 `lalaclaw restart` 重启它，用 `lalaclaw stop` 停止它

## 从 GitHub 安装

如果你希望拿到源码，用于开发或本地修改：

如果这台机器已经安装好 OpenClaw，并且 `~/.openclaw/openclaw.json` 可用，推荐直接执行：

```bash
git clone https://github.com/aliramw/lalaclaw.git lalaclaw
cd lalaclaw
npm ci
npm run doctor
npm run lalaclaw:init
npm run build
npm run lalaclaw:start
```

说明：

- `npm run doctor` 会检查 Node、OpenClaw、本地配置和端口占用
- `npm run doctor -- --json` 会输出相同诊断结果的 JSON，并带有 `summary.status` 和 `summary.exitCode`
- `npm run lalaclaw:init` 会帮助你生成或刷新 `.env.local`
- `npm run lalaclaw:init -- --write-example` 会直接把 `.env.local.example` 复制到目标配置文件，不进入交互
- `npm run lalaclaw:start` 是执行 `npm run build` 之后推荐的生产启动入口
- `npm run lalaclaw:start` 会占用当前 terminal，关闭 terminal 后服务也会停止
- 如果你的本地配置已经准备好，可以跳过 `npm run lalaclaw:init`
- 如果你更想手动编辑配置，可以从 [`.env.local.example`](../../.env.local.example) 开始

## 更新已安装的 LalaClaw

如果你是通过 npm 安装的，想更新到最新版：

```bash
npm install -g lalaclaw@latest
lalaclaw init
```

如果你想切换到某个指定发布版本，比如 `2026.3.17-7`：

```bash
npm install -g lalaclaw@2026.3.17-7
lalaclaw init
```

如果你是从 GitHub 安装的，请按下面方式更新：

如果你已经从 GitHub 安装过 LalaClaw，想更新到最新版本：

```bash
cd /path/to/lalaclaw
git pull
npm ci
npm run build
npm run lalaclaw:start
```

如果你想切换到某个指定发布版本，比如 `2026.3.17-7`：

```bash
cd /path/to/lalaclaw
git fetch --tags
git checkout 2026.3.17-7
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

开发时需要同时启动前端和后端，并且用 Vite 页面作为浏览器入口。

也可以直接用一条命令启动前后端：

```bash
npm run dev:all
```

如果你想分别启动，再按下面步骤执行：

### 1. 启动前端

```bash
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

前端地址：

```text
http://127.0.0.1:5173
```

### 2. 启动后端

```bash
PORT=3000 HOST=127.0.0.1 node server.js
```

后端地址：

```text
http://127.0.0.1:3000
```

### 3. 打开应用

- 开发时浏览器入口固定使用 `http://127.0.0.1:5173`
- 开发态下 `/api/*` 会通过 `vite.config.mjs` 代理到 `http://127.0.0.1:3000`

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
COMMANDCENTER_FORCE_MOCK=1 PORT=3000 HOST=127.0.0.1 node server.js
```

如果你使用 CLI 初始化配置：

```bash
npm run lalaclaw:init
npm run doctor
```

在 `remote-gateway` 模式下，`doctor` 还会实际探测远端网关，并用最小请求校验配置的 model 和 agent 是否可用。

显式配置网关：

```bash
export OPENCLAW_BASE_URL="https://your-openclaw-gateway"
export OPENCLAW_API_KEY="..."
export OPENCLAW_MODEL="openclaw"
export OPENCLAW_AGENT_ID="main"
export OPENCLAW_API_STYLE="chat"
export OPENCLAW_API_PATH="/v1/chat/completions"
node server.js
```

如果你的网关更接近 Responses API：

```bash
export OPENCLAW_API_STYLE="responses"
export OPENCLAW_API_PATH="/v1/responses"
```

## 启动成功后你会看到什么

- 左上角显示 `LalaClaw`
- 顶部有模型、上下文、快速模式和思考模式控制
- 聊天输入区带有附件按钮和发送按钮
- 右侧检查器包含 `Run Log / Files / Summaries / Environment / Collab / Preview`
- 即使在 `mock` 模式下也能正常发送消息并收到回复

## 下一步

- 先看 [界面总览](./documentation-interface.md)
- 想直接了解交互流程时看 [对话、附件与命令](./documentation-chat.md)
