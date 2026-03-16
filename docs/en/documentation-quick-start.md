[Back to Home](./documentation.md) | [Interface Overview](./documentation-interface.md) | [Sessions, Agents, and Runtime Modes](./documentation-sessions.md) | [API and Troubleshooting](./documentation-api-troubleshooting.md)

# Quick Start

## Requirements

- Use the Node.js version defined in [`.nvmrc`](../../.nvmrc), currently `22`
- Run `npm ci` in the project root before your first local run

## Development Mode

For development, run both the frontend and backend at the same time, and use the Vite entry page as the browser entrypoint.

### 1. Start the Frontend

Run this in the project root:

```bash
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Frontend URL:

```text
http://127.0.0.1:5173
```

### 2. Start the Backend

Run this in the project root:

```bash
PORT=3000 HOST=127.0.0.1 node server.js
```

Backend URL:

```text
http://127.0.0.1:3000
```

### 3. Open the App

- Always use `http://127.0.0.1:5173` as the browser entrypoint in development
- During development, `/api/*` requests are proxied by `vite.config.mjs` to `http://127.0.0.1:3000`

## Production Build Mode

If you want to verify the built app instead of the live development setup:

```bash
npm run build
npm start
```

Notes:

- `npm start` depends on an existing `dist/`
- If you skip `npm run build`, the backend returns `503 Web app build is missing`
- Because of that, `npm start` is not the right choice for normal frontend development

## `mock` and OpenClaw

On startup, the backend first tries to read local OpenClaw config from `~/.openclaw/openclaw.json`.

- If it finds a local gateway and token, it runs in `openclaw` mode
- Otherwise it falls back to `mock` mode by default

Force `mock` mode:

```bash
COMMANDCENTER_FORCE_MOCK=1 PORT=3000 HOST=127.0.0.1 node server.js
```

Explicitly configure a gateway:

```bash
export OPENCLAW_BASE_URL="https://your-openclaw-gateway"
export OPENCLAW_API_KEY="..."
export OPENCLAW_MODEL="openclaw"
export OPENCLAW_AGENT_ID="main"
export OPENCLAW_API_STYLE="chat"
export OPENCLAW_API_PATH="/v1/chat/completions"
node server.js
```

If your gateway is closer to the Responses API:

```bash
export OPENCLAW_API_STYLE="responses"
export OPENCLAW_API_PATH="/v1/responses"
```

## What You Should See

- `LalaClaw` in the top-left brand area
- Model, context, fast mode, and thinking mode controls in the header
- A chat composer with attachment and send controls
- Inspector tabs for `Run Log / Files / Summaries / Environment / Collab / Preview`
- Working chat replies even in `mock` mode

## Next

- Read [Interface Overview](./documentation-interface.md) before exploring the UI
- Read [Chat, Attachments, and Commands](./documentation-chat.md) if you want to jump straight into the interaction flow
