[返回首页](./documentation.md) | [界面总览](./documentation-interface.md) | [会话、Agent 与运行模式](./documentation-sessions.md) | [API 与排障](./documentation-api-troubleshooting.md)

# 快速开始

## 环境要求

- 使用仓库 [`.nvmrc`](../../.nvmrc) 中定义的 Node.js 版本，当前为 `22`
- 首次本地运行前，在项目根目录执行 `npm ci`
- 如需生成本地 `.env.local`，可执行 `npm run lalaclaw:init`

## 在新机器上从 GitHub 安装

如果这台机器已经安装好 OpenClaw，并且 `~/.openclaw/openclaw.json` 可用，推荐直接执行：

```bash
git clone https://github.com/aliramw/CommandCenter.git lalaclaw
cd lalaclaw
npm ci
npm run doctor
npm run lalaclaw:init
npm run dev:all
```

说明：

- `npm run doctor` 会检查 Node、OpenClaw、本地配置和端口占用
- `npm run doctor -- --json` 会输出相同诊断结果的 JSON，并带有 `summary.status` 和 `summary.exitCode`
- `npm run lalaclaw:init` 会帮助你生成或刷新 `.env.local`
- `npm run lalaclaw:init -- --write-example` 会直接把 `.env.local.example` 复制到目标配置文件，不进入交互
- 如果你的本地配置已经准备好，可以跳过 `npm run lalaclaw:init`
- 如果你更想手动编辑配置，可以从 [`.env.local.example`](../../.env.local.example) 开始

## 开发模式

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
