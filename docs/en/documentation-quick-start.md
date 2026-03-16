[English](../en/documentation-quick-start.md) | [中文](../zh/documentation-quick-start.md) | [日本語](../ja/documentation-quick-start.md) | [Français](../fr/documentation-quick-start.md) | [Español](../es/documentation-quick-start.md) | [Português](../pt/documentation-quick-start.md)

[Back to Home](./documentation.md) | [Interface Overview](./documentation-interface.md) | [Sessions, Agents, and Runtime Modes](./documentation-sessions.md) | [API and Troubleshooting](./documentation-api-troubleshooting.md)

# Quick Start

## Requirements

- Use the Node.js version defined in [`.nvmrc`](../../.nvmrc), currently `22`
- npm installation is recommended for normal local use
- Use a GitHub source checkout only if you want development mode or local code changes

## Install From npm

For the simplest end-user setup:

```bash
npm install -g lalaclaw
lalaclaw init
```

Notes:

- `lalaclaw init` writes your local config to `~/.config/lalaclaw/.env.local` on macOS and Linux
- On npm installs for macOS, `lalaclaw init` also starts a `launchd` background service automatically
- After the macOS background service starts, `lalaclaw init` prompts you to press Enter and opens the App URL in your browser
- If you only want to write config on macOS, use `lalaclaw init --no-background`
- On Linux, or when you opt out of background startup, continue with `lalaclaw doctor` and `lalaclaw start`
- On macOS, use `lalaclaw status` to inspect the background service, `lalaclaw restart` to restart it, and `lalaclaw stop` to stop it

## Install From GitHub

Use this path if you want a source checkout for development or local modification.

If OpenClaw is already installed on the machine and `~/.openclaw/openclaw.json` is available:

```bash
git clone https://github.com/aliramw/lalaclaw.git lalaclaw
cd lalaclaw
npm ci
npm run doctor
npm run lalaclaw:init
npm run build
npm run lalaclaw:start
```

Notes:

- `npm run doctor` checks Node.js, local OpenClaw discovery, ports, and config
- `npm run doctor -- --json` returns the same diagnosis as JSON with `summary.status` and `summary.exitCode`
- `npm run lalaclaw:init` helps you create or refresh `.env.local`
- `npm run lalaclaw:init -- --write-example` copies `.env.local.example` to the target config file without prompts
- `npm run lalaclaw:start` is the recommended production entrypoint after `npm run build`
- `npm run lalaclaw:start` runs in the current terminal, so closing that terminal stops the app
- If your setup is already ready, you can skip `npm run lalaclaw:init`
- If you prefer manual setup, use [`.env.local.example`](../../.env.local.example) as a starting point

## Update An Existing Install

If you installed LalaClaw from npm and want the newest version:

```bash
npm install -g lalaclaw@latest
lalaclaw init
```

If you want a specific published version instead, such as `2026.3.17-5`:

```bash
npm install -g lalaclaw@2026.3.17-5
lalaclaw init
```

If you installed LalaClaw from GitHub, update it like this:

If you already installed LalaClaw from GitHub and want the latest version:

```bash
cd /path/to/lalaclaw
git pull
npm ci
npm run build
npm run lalaclaw:start
```

If you want a specific released version instead, such as `2026.3.17-5`:

```bash
cd /path/to/lalaclaw
git fetch --tags
git checkout 2026.3.17-5
npm ci
npm run build
npm run lalaclaw:start
```

Notes:

- `npm install -g lalaclaw@latest` updates the globally installed npm package
- `git pull` updates your local copy to the newest version on GitHub
- `npm ci` installs the dependencies required by that version
- `npm run build` refreshes the web app files used by the production server
- If you use the macOS `launchd` setup, restart the service after updating with `launchctl kickstart -k gui/$(id -u)/ai.lalaclaw.app`
- If Git says you have local changes, back them up or commit them before updating

## Development Mode

Development mode requires a GitHub source checkout with `npm ci` already run.

For development, run both the frontend and backend at the same time, and use the Vite entry page as the browser entrypoint.

You can do that with one command:

```bash
npm run dev:all
```

Or run the two servers separately:

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
npm run lalaclaw:start
```

Notes:

- `npm run lalaclaw:start` depends on an existing `dist/`
- If you skip `npm run build`, the backend returns `503 Web app build is missing`
- Because of that, `npm start` is not the right choice for normal frontend development

## Persistent Production Deploy On macOS

If you want the app to keep running after you close the terminal on macOS, use `launchd`.

1. Build the app:

```bash
npm ci
npm run doctor
npm run lalaclaw:init
npm run build
```

2. Generate the plist:

```bash
./deploy/macos/generate-launchd-plist.sh
```

3. Load it:

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/ai.lalaclaw.app.plist
launchctl enable gui/$(id -u)/ai.lalaclaw.app
launchctl kickstart -k gui/$(id -u)/ai.lalaclaw.app
```

Useful commands:

```bash
launchctl print gui/$(id -u)/ai.lalaclaw.app
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/ai.lalaclaw.app.plist
tail -f ./logs/lalaclaw-launchd.out.log
tail -f ./logs/lalaclaw-launchd.err.log
```

For the full macOS flow, see [deploy/macos/README.md](../../deploy/macos/README.md).

## `mock` and OpenClaw

On startup, the backend first tries to read local OpenClaw config from `~/.openclaw/openclaw.json`.

- If it finds a local gateway and token, it runs in `openclaw` mode
- Otherwise it falls back to `mock` mode by default

Force `mock` mode:

```bash
COMMANDCENTER_FORCE_MOCK=1 PORT=3000 HOST=127.0.0.1 node server.js
```

The CLI writes the same values into `.env.local` when you run:

```bash
npm run lalaclaw:init
```

Then run:

```bash
npm run doctor
```

In `remote-gateway` mode, `doctor` also performs a live probe against the configured gateway URL and sends a minimal API request to validate the configured model and agent.

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
