[English](../en/documentation-quick-start.md) | [中文](../zh/documentation-quick-start.md) | [繁體中文（香港）](../zh-hk/documentation-quick-start.md) | [日本語](../ja/documentation-quick-start.md) | [한국어](../ko/documentation-quick-start.md) | [Français](../fr/documentation-quick-start.md) | [Español](../es/documentation-quick-start.md) | [Português](../pt/documentation-quick-start.md) | [Deutsch](../de/documentation-quick-start.md) | [Bahasa Melayu](../ms/documentation-quick-start.md) | [தமிழ்](../ta/documentation-quick-start.md)

[Back to Home](./documentation.md) | [Interface Overview](./documentation-interface.md) | [Sessions, Agents, and Runtime Modes](./documentation-sessions.md) | [API and Troubleshooting](./documentation-api-troubleshooting.md)

# Quick Start

## Requirements

- For development, use the Node.js version defined in [`.nvmrc`](../../.nvmrc), currently `22`. The published package supports `^20.19.0 || ^22.12.0 || >=24.0.0`
- npm installation is recommended for normal local use
- Use a GitHub source checkout only if you want development mode or local code changes

## Install Through OpenClaw

Use OpenClaw to install LalaClaw on a remote Mac or Linux machine, then access it locally through SSH port forwarding.

If you already have a machine with OpenClaw installed and you can log in to that machine over SSH, you can ask OpenClaw to install this project from GitHub, start it on the remote host, and then forward the remote port back to your local computer.

Tell OpenClaw:

```text
Install https://github.com/aliramw/lalaclaw
```

Typical flow:

1. OpenClaw clones this repository on the remote machine.
2. OpenClaw installs dependencies and starts LalaClaw.
3. The app listens on `127.0.0.1:5678` on the remote machine.
4. You forward that remote port to your local computer over SSH.
5. You open the forwarded local address in your browser.

Example SSH port forwarding:

```bash
ssh -N -L 3000:127.0.0.1:5678 root@your-remote-server-ip
```

Then open:

```text
http://127.0.0.1:3000
```

## Install From npm

For the simplest end-user setup:

```bash
npm install -g lalaclaw@latest
lalaclaw init
```

Then open [http://127.0.0.1:5678](http://127.0.0.1:5678).

Notes:

- `lalaclaw init` writes local config to `~/.config/lalaclaw/.env.local` on macOS and Linux
- By default, `lalaclaw init` uses `HOST=127.0.0.1`, `PORT=5678`, and `FRONTEND_PORT=4321` unless you override them
- When local OpenClaw is detected, `lalaclaw init` also writes a resolved `OPENCLAW_BIN` path and a `launchd` `PATH` that includes the current Node runtime
- If you enable `COMMANDCENTER_ACCESS_MODE=token`, browser users will need a token from `COMMANDCENTER_ACCESS_TOKENS` or `COMMANDCENTER_ACCESS_TOKENS_FILE` in that same config file
- If you have shell access on the host, run `lalaclaw access token` to print the current token or `lalaclaw access token --rotate` to replace it
- In a source checkout, `lalaclaw init` starts both Server and Vite Dev Server in the background, then prompts to open the Dev Server URL
- On macOS npm installs, `lalaclaw init` installs and starts the Server `launchd` service, then prompts to open the Server URL
- On Linux npm installs, `lalaclaw init` starts the Server in the background, then prompts to open the Server URL
- Use `lalaclaw init --no-background` if you only want to write config without auto-starting services
- After `--no-background`, run `lalaclaw doctor`, then use `lalaclaw dev` for source checkouts or `lalaclaw start` for packaged installs
- `lalaclaw status`, `lalaclaw restart`, and `lalaclaw stop` control the macOS `launchd` Server service only
- Previewing `doc`, `ppt`, and `pptx` files requires LibreOffice. On macOS, run `lalaclaw doctor --fix` or `brew install --cask libreoffice`

## Browser Access Tokens

If the browser shows the unlock screen, use one of these paths to get the token:

- If you have terminal access on the host, run `lalaclaw access token`
- If you need to replace it, run `lalaclaw access token --rotate`
- If you are checking config files directly, look for `COMMANDCENTER_ACCESS_TOKENS` or `COMMANDCENTER_ACCESS_TOKENS_FILE`
- `lalaclaw init` usually writes the config to `~/.config/lalaclaw/.env.local` on macOS/Linux
- On Windows, the default config file is usually `%APPDATA%\LalaClaw\.env.local`
- If someone else deployed the workspace, ask that deployer to share a token with you

## Install From GitHub

Use this path if you want a source checkout for development or local modification.

```bash
git clone https://github.com/aliramw/lalaclaw.git lalaclaw
cd lalaclaw
npm ci
npm run doctor
npm run lalaclaw:init
```

Then open [http://127.0.0.1:4321](http://127.0.0.1:4321).

Notes:

- `npm run lalaclaw:init` starts both Server and Vite Dev Server in the background by default unless you pass `--no-background`
- After background startup, it prompts to open the Dev Server URL, which defaults to `http://127.0.0.1:4321`
- If you only want config generation, run `npm run lalaclaw:init -- --no-background`
- `npm run lalaclaw:start` runs in the current terminal and stops when that terminal closes
- If your setup is already ready, you can skip `npm run lalaclaw:init`
- If you prefer manual setup, use [`.env.local.example`](../../.env.local.example) as a starting point

## Update An Existing Install

If you installed LalaClaw from npm and want the newest version:

```bash
npm install -g lalaclaw@latest
lalaclaw init
```

If you want a specific published version instead, such as `2026.3.19-2`:

```bash
npm install -g lalaclaw@2026.3.19-2
lalaclaw init
```

If you installed LalaClaw from GitHub and want the latest version:

```bash
cd /path/to/lalaclaw
git pull
npm ci
npm run build
npm run lalaclaw:start
```

If you want a specific released version instead, such as `2026.3.19-2`:

```bash
cd /path/to/lalaclaw
git fetch --tags
git checkout 2026.3.19-2
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

For normal repository development, use the fixed dev ports defined by the repo:

```bash
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
npm run dev:backend -- --host 127.0.0.1 --port 3000
```

You can also start both processes with:

```bash
npm run dev:all
```

Development URLs:

- Frontend: `http://127.0.0.1:5173`
- Backend: `http://127.0.0.1:3000`
- Browser entrypoint: `http://127.0.0.1:5173`

During development, `/api/*` requests are proxied by `vite.config.mjs` to `http://127.0.0.1:3000`.

## Production Build Mode

If you want to verify the built app instead of the live development setup:

```bash
npm run build
npm run lalaclaw:start
```

Notes:

- `npm run lalaclaw:start` depends on an existing `dist/`
- If you skip `npm run build`, the backend returns `503 Web app build is missing`
- `npm start` is not the right choice for normal frontend development

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
npm run dev:backend -- --profile mock --host 127.0.0.1 --port 3000
```

If you use the CLI to initialize config:

```bash
npm run lalaclaw:init
npm run doctor
```

In `remote-gateway` mode, `doctor` also performs a live probe against the configured gateway URL and sends a minimal API request to validate the configured model and agent.

## What You Should See

- `LalaClaw` in the top-left brand area
- Model, context, fast mode, and thinking mode controls in the header
- A chat composer with attachment and send controls
- Inspector tabs for `Run Log / Files / Summaries / Environment / Collab / Preview`
- Working chat replies even in `mock` mode
