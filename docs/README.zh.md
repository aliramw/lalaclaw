[查看不同语言的 README： English](../README.md) | [中文](./README.zh.md) | [繁體中文（香港）](./README.zh-hk.md) | [日本語](./README.ja.md) | [한국어](./README.ko.md) | [Français](./README.fr.md) | [Español](./README.es.md) | [Português](./README.pt.md) | [Deutsch](./README.de.md) | [Bahasa Melayu](./README.ms.md) | [தமிழ்](./README.ta.md)

# LalaClaw

[![CI](https://github.com/aliramw/lalaclaw/actions/workflows/ci.yml/badge.svg)](https://github.com/aliramw/lalaclaw/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](../LICENSE)

一种更适合与 Agent 协作共创的方式。

作者：Marila Wang

## 亮点

- 基于 React + Vite 的 command center 界面，包含对话、时间线、检查器、主题、语言和附件工作流
- 参考 VS Code 的文件探索体验，支持会话树、工作区树、预览操作和更丰富的文档处理
- 内置中文、繁體中文（香港）、English、日本語、한국어、Français、Español、Português、Deutsch、Bahasa Melayu 和 தமிழ் 界面支持
- Node.js 后端可连接本地或远端 OpenClaw 网关
- 内置聚焦测试、CI、lint、贡献文档和版本记录

## 产品导览

- 顶部概览栏：Agent、模型、快速模式、思考模式、上下文、队列、主题和语言控制
- 主对话区：提示词输入、附件处理、流式回复和会话重置
- 右侧检查器：时间线、文件、产物、快照和运行时活动
- 检查器中的 Environment 区：OpenClaw 诊断、管理动作、安全配置编辑，以及文件/目录路径不同的打开行为
- 运行循环：默认支持 `mock` 模式，也可以切换到真实 OpenClaw 网关

更完整的演示见 [zh/showcase.md](./zh/showcase.md)。

## 文档

- 语言索引：[README.md](./README.md)
- 中文指南：[zh/documentation.md](./zh/documentation.md)
- 快速开始：[zh/documentation-quick-start.md](./zh/documentation-quick-start.md)
- 界面说明：[zh/documentation-interface.md](./zh/documentation-interface.md)
- 会话与运行时：[zh/documentation-sessions.md](./zh/documentation-sessions.md)
- 架构说明：[zh/architecture.md](./zh/architecture.md)

更多结构说明见 [server/README.md](../server/README.md) 和 [src/features/README.md](../src/features/README.md)。

## 安装指南

### 从 npm 安装

如果你是普通用户，最简单的安装方式是：

```bash
npm install -g lalaclaw@latest
lalaclaw init
```

然后打开 [http://127.0.0.1:5678](http://127.0.0.1:5678)。

说明：

- `lalaclaw init` 会在 macOS 和 Linux 上把本地配置写到 `~/.config/lalaclaw/.env.local`
- 默认情况下，`lalaclaw init` 使用 `HOST=127.0.0.1`、`PORT=5678`、`FRONTEND_PORT=4321`，除非你主动覆盖
- 在源码仓库中，`lalaclaw init` 会默认后台启动 Server 和 Vite Dev Server，然后提示你打开 Dev Server URL
- 在 macOS 的 npm 安装场景里，`lalaclaw init` 会安装并启动 Server 的 `launchd` 服务，然后提示你打开 Server URL
- 在 Linux 的 npm 安装场景里，`lalaclaw init` 会后台启动 Server，然后提示你打开 Server URL
- 如果你只想写配置、不自动启动服务，可以使用 `lalaclaw init --no-background`
- 使用 `--no-background` 后，先跑 `lalaclaw doctor`，源码仓库用 `lalaclaw dev`，发布包安装用 `lalaclaw start`
- `lalaclaw status`、`lalaclaw restart`、`lalaclaw stop` 只用于管理 macOS 的 `launchd` Server 服务
- 预览 `doc`、`ppt`、`pptx` 文件需要 LibreOffice。在 macOS 上可执行 `lalaclaw doctor --fix`，或者运行 `brew install --cask libreoffice`

### 通过 OpenClaw 安装

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

然后打开本地地址：

```text
http://127.0.0.1:3000
```

### 从 GitHub 安装

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
- `npm run lalaclaw:start` 会占用当前终端运行，关闭终端后服务也会停止
- 如果你之后想使用实时开发环境，可以执行 `npm run dev:all`，然后打开 `http://127.0.0.1:4321` 或你自定义的 `FRONTEND_PORT`

### 更新 LalaClaw

如果你是通过 npm 安装的，想更新到最新版：

```bash
npm install -g lalaclaw@latest
lalaclaw init
```

如果你想切换到某个指定发布版本，比如 `2026.3.20-2`：

```bash
npm install -g lalaclaw@2026.3.20-2
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

如果你想切换到某个指定发布版本，比如 `2026.3.20-2`：

```bash
cd /path/to/lalaclaw
git fetch --tags
git checkout 2026.3.20-2
npm ci
npm run build
npm run lalaclaw:start
```

## 常用命令

- `npm run dev:all` 启动标准本地开发流程
- `npm run doctor` 检查 Node.js、OpenClaw 探测、端口和本地配置
- `npm run lalaclaw:init` 写入或刷新本地引导配置
- `npm run lalaclaw:start` 在检查 `dist/` 后启动构建版应用
- `npm run build` 构建生产包
- `npm test` 运行一次 Vitest 测试
- `npm run lint` 运行 ESLint

完整命令列表和贡献流程见 [CONTRIBUTING.md](../CONTRIBUTING.md)。

## 贡献

欢迎贡献。对于较大的功能、架构调整或用户可见行为变化，建议先开 issue 对齐方向。

在提交 PR 前：

- 保持改动聚焦，避免顺手做无关重构
- 对行为变化补充或更新测试
- 新增用户可见文案请走 `src/locales/*.js`
- 用户可见行为变化时同步更新文档
- 版本化行为变化时更新 [CHANGELOG.md](../CHANGELOG.md)

完整贡献清单见 [CONTRIBUTING.md](../CONTRIBUTING.md)。

## 开发说明

- 标准本地开发流程使用 `npm run dev:all`
- 开发时默认访问 [http://127.0.0.1:4321](http://127.0.0.1:4321)，或使用你自定义的 `FRONTEND_PORT`
- 只有依赖 `dist/` 的构建产物时，才使用 `npm run lalaclaw:start` 或 `npm start`
- 默认情况下，应用会自动探测本地 OpenClaw 网关
- 如果你想稳定复现 UI 或前端问题，可以设置 `COMMANDCENTER_FORCE_MOCK=1` 强制 `mock` 模式
- 如果你想在源码开发态里反复演示 LalaClaw 应用内自更新链路，可以调用 `POST /api/dev/lalaclaw/update-mock` 开启指定 stable 版本的 dev-only mock，演示完成后再用 `DELETE /api/dev/lalaclaw/update-mock` 关闭
- 提交 PR 前，建议至少运行 `npm run lint`、`npm test` 和 `npm run build`

## 版本约定

LalaClaw 使用 npm 兼容的日历版本格式。

- 每次项目版本变化时更新 [CHANGELOG.md](../CHANGELOG.md)
- 同一天的多次发布使用 `YYYY.M.D-N`，例如 `2026.3.20-2`，不要使用 `YYYY.M.D.N`
- 破坏性变更应在 release notes 和迁移文档里明确标注
- 开发时推荐使用 [`.nvmrc`](../.nvmrc) 中的 Node.js `22`；已发布的 npm 包支持 `^20.19.0 || ^22.12.0 || >=24.0.0`

## OpenClaw 接入

如果 `~/.openclaw/openclaw.json` 存在，LalaClaw 会自动探测本地 OpenClaw 网关，并复用其中的回环地址和网关令牌。

对于新的源码仓库环境，常见初始化流程如下：

```bash
git clone https://github.com/aliramw/lalaclaw.git lalaclaw
cd lalaclaw
npm ci
npm run doctor
npm run lalaclaw:init
```

如果你想手动接入另一个 OpenClaw 兼容网关，可以设置：

```bash
export OPENCLAW_BASE_URL="https://your-openclaw-gateway"
export OPENCLAW_API_KEY="..."
export OPENCLAW_MODEL="openclaw"
export OPENCLAW_AGENT_ID="main"
export OPENCLAW_API_STYLE="chat"
export OPENCLAW_API_PATH="/v1/chat/completions"
```

如果你的网关更接近 OpenAI Responses API，可以使用：

```bash
export OPENCLAW_API_STYLE="responses"
export OPENCLAW_API_PATH="/v1/responses"
```

如果没有设置这些变量，应用会运行在 `mock` 模式，这样在初始化阶段也可以完整体验界面和对话流程。
