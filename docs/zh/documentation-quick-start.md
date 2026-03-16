[返回首页](./documentation.md) | [界面总览](./documentation-interface.md) | [会话、Agent 与运行模式](./documentation-sessions.md) | [API 与排障](./documentation-api-troubleshooting.md)

# 快速开始

## 环境要求

- 使用仓库 [`.nvmrc`](../../.nvmrc) 中定义的 Node.js 版本，当前为 `22`
- 首次本地运行前，在项目根目录执行 `npm ci`

## 开发模式

开发时需要同时启动前端和后端，并且用 Vite 页面作为浏览器入口。

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
npm start
```

说明：

- `npm start` 依赖现有的 `dist/`
- 如果跳过 `npm run build`，后端会返回 `503 Web app build is missing`
- 因此日常前端开发不应使用 `npm start`

## `mock` 与 OpenClaw

启动时，后端会优先读取 `~/.openclaw/openclaw.json`。

- 如果检测到本地网关和 token，则进入 `openclaw` 模式
- 否则默认回退到 `mock` 模式

强制使用 `mock`：

```bash
COMMANDCENTER_FORCE_MOCK=1 PORT=3000 HOST=127.0.0.1 node server.js
```

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
