[Read this README in: English](./README.md) | [中文](./docs/README.zh.md) | [繁體中文（香港）](./docs/README.zh-hk.md) | [日本語](./docs/README.ja.md) | [한국어](./docs/README.ko.md) | [Français](./docs/README.fr.md) | [Español](./docs/README.es.md) | [Português](./docs/README.pt.md) | [Deutsch](./docs/README.de.md) | [Bahasa Melayu](./docs/README.ms.md) | [தமிழ்](./docs/README.ta.md)

# LalaClaw

[![CI](https://github.com/aliramw/lalaclaw/actions/workflows/ci.yml/badge.svg)](https://github.com/aliramw/lalaclaw/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

A better way to co-create with OpenClaw.

Author: Marila Wang

## Highlights

- React + Vite command center UI with chat, timeline, inspector, theme, locale, and attachment flows
- VS Code-style file exploration with separate session and workspace trees, preview actions, and richer document handling
- Built-in locale support for 中文, 繁體中文（香港）, English, 日本語, 한국어, Français, Español, Português, Deutsch, Bahasa Melayu, and தமிழ்
- Node.js backend that can connect to local or remote OpenClaw gateways
- Focused tests, CI, linting, contribution docs, and release notes

## Product Tour

- Top overview bar for agent, model, fast mode, think mode, context, queue, theme, and locale
- Main chat workspace for prompts, attachments, streaming replies, and session reset
- Inspector panel for timeline, files, artifacts, snapshots, and runtime activity
- Environment diagnostics inside the Inspector for OpenClaw version, gateway health, doctor-style checks, logs, and live runtime sync state
- Controlled OpenClaw management actions inside the Inspector, with confirmation, command output, follow-up health checks, and environment refresh
- Structured OpenClaw config editing inside the Inspector, with backup, validation, before/after diffs, and optional gateway restart
- OpenClaw safeguards inside the Inspector, with persistent audit history, explicit remote config authorization, and local/remote rollback restore flow
- Local OpenClaw install/update status inside the Inspector, with official update preview, official install guidance, and controlled update execution
- Environment paths inside the Inspector that distinguish previewable files from directories that should open in the system file manager
- Runtime loop that works in `mock` mode by default and can switch to live OpenClaw gateways

A longer walkthrough lives in [docs/en/showcase.md](./docs/en/showcase.md).

## Documentation

- Language index: [docs/README.md](./docs/README.md)
- English guide: [docs/en/documentation.md](./docs/en/documentation.md)
- Quick start: [docs/en/documentation-quick-start.md](./docs/en/documentation-quick-start.md)
- Interface guide: [docs/en/documentation-interface.md](./docs/en/documentation-interface.md)
- Sessions and runtime: [docs/en/documentation-sessions.md](./docs/en/documentation-sessions.md)
- Architecture notes: [docs/en/architecture.md](./docs/en/architecture.md)
- AI-assisted coding governance plan: [plan/ai-assisted-code-quality.md](./plan/ai-assisted-code-quality.md)

More structure notes live in [server/README.md](./server/README.md) and [src/features/README.md](./src/features/README.md).

## Installation Guide

### Install Through OpenClaw

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

If you want to expose a remote install through a direct HTTPS URL instead of SSH port forwarding, enable token access mode on the server and put it behind your preferred reverse proxy. See `Token Access Mode` below.

Example SSH port forwarding:

```bash
ssh -N -L 3000:127.0.0.1:5678 root@your-remote-server-ip
```

Then open the forwarded local address:

```text
http://127.0.0.1:3000
```

### Install From npm

For the simplest end-user setup:

```bash
npm install -g lalaclaw@latest
lalaclaw init
```

Then open [http://127.0.0.1:5678](http://127.0.0.1:5678).

#### Windows

On Windows, run the same commands in PowerShell:

```powershell
npm install -g lalaclaw@latest
lalaclaw init
```

Then open [http://127.0.0.1:5678](http://127.0.0.1:5678).

Windows notes:

- `lalaclaw init` usually writes local config to `%APPDATA%\LalaClaw\.env.local`
- Use `lalaclaw init --no-background` if you only want to write config without auto-starting services
- After `--no-background`, run `lalaclaw doctor`, then use `lalaclaw start` for packaged installs
- `lalaclaw start` runs in the current terminal session, so closing that terminal stops the app
- If `lalaclaw` is not recognized, restart PowerShell or make sure the npm global bin directory is on `PATH`

Windows release validation with a local tarball:

```powershell
npm run pack:release
npm run test:release:smoke -- --tarball .\artifacts\lalaclaw-<version>.tgz
```

This smoke installs the tarball into a clean temp directory, starts the packaged app on a free loopback port, opens Chromium, and fails if the first screen stays blank or new browser runtime errors appear.

Notes:

- `lalaclaw init` writes local config to `~/.config/lalaclaw/.env.local` on macOS and Linux
- By default, `lalaclaw init` uses `HOST=127.0.0.1`, `PORT=5678`, and `FRONTEND_PORT=4321` unless you override them
- In a source checkout, `lalaclaw init` starts both Server and Vite Dev Server in the background, then prompts to open the Dev Server URL
- On macOS npm installs, `lalaclaw init` installs a per-user `launchd` LaunchAgent, bootstraps it with `launchctl`, enables it, and kickstarts the Server so it comes back automatically after login or crashes
- On Linux npm installs, `lalaclaw init` starts the Server in the background, then prompts to open the Server URL
- Use `lalaclaw init --no-background` if you only want to write config without auto-starting services
- After `--no-background`, run `lalaclaw doctor`, then use `lalaclaw dev` for source checkouts or `lalaclaw start` for packaged installs
- `lalaclaw doctor` now prints colored status labels plus an explicit summary line, and `lalaclaw start` runs the same doctor preflight before launching
- `lalaclaw status`, `lalaclaw restart`, and `lalaclaw stop` control the macOS `launchd` Server service only
- Previewing `doc`, `ppt`, and `pptx` files requires LibreOffice. On macOS, run `lalaclaw doctor --fix` or `brew install --cask libreoffice`

### Install From GitHub

If you want a source checkout for development or local modification:

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
- If you want the live development environment later, run `npm run dev:all` and open `http://127.0.0.1:4321` or your configured `FRONTEND_PORT`

### Update LalaClaw

If you installed LalaClaw with npm and want the newest version:

```bash
npm install -g lalaclaw@latest
lalaclaw init
```

If you want a specific published version instead, such as `2026.4.6`:

```bash
npm install -g lalaclaw@2026.4.6
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

If you want a specific released version instead, such as `2026.4.6`:

```bash
cd /path/to/lalaclaw
git fetch --tags
git checkout 2026.4.6
npm ci
npm run build
npm run lalaclaw:start
```

## Common Commands

- `npm run dev` starts the Vite development server
- `npm run dev:all` starts both the frontend and backend in development mode
- `npm run dev:frontend` starts only the Vite development server
- `npm run dev:backend` starts only the backend server
- Runtime commands accept overrides like `--host`, `--port`, `--frontend-host`, `--frontend-port`, and `--profile` (for example: `npm run dev:backend -- --host 127.0.0.1 --port 3000`)
- `npm run doctor` checks Node.js, OpenClaw discovery, ports, and local config
  For `remote-gateway`, it also probes the configured gateway URL and sends a minimal API request to validate the configured model and agent.
- `npm run doctor` prints colored `OK`/`WARN`/`INFO`/`ERROR` labels plus a final summary line
- `npm run doctor -- --fix` installs LibreOffice automatically on macOS when LibreOffice-backed preview support is missing
- `npm run doctor -- --json` prints the same diagnosis as machine-readable JSON with `summary.status` and `summary.exitCode`
- `lalaclaw access token` prints the current browser access token from local config, and `lalaclaw access token --rotate` generates a new one
- `npm run lalaclaw:init` writes a local `.env.local` bootstrap file
- `npm run test:openclaw:onboarding:smoke` runs an isolated temp-`HOME` smoke for `install-state -> onboarding -> ready -> support-options recheck`
  Set `LALACLAW_ONBOARDING_SMOKE_OUTPUT_FILE` to persist the JSON report, or pass `--json` to keep stdout machine-only.
  The main CI workflow also runs this smoke in a dedicated `openclaw-onboarding-smoke` job and uploads the JSON report as an artifact for review.
- `lalaclaw -h` / `lalaclaw --help` prints CLI help, and `lalaclaw -v` / `lalaclaw --version` prints the current CLI version
- `npm run lalaclaw:init -- --write-example` copies [`.env.local.example`](./.env.local.example) to your target config path without prompts
- `npm run lalaclaw:start` starts the built app after running doctor preflight checks and verifying `dist/`
- `npm run build` creates the production bundle
- `npm run pack:release` writes the validated release tarball to `artifacts/`
- `npm run test:release:smoke -- --tarball ./artifacts/lalaclaw-<version>.tgz` installs the tarball into a clean temp directory, starts the packaged app in `mock` mode on a free loopback port, opens the first screen in Chromium, and fails on new runtime or console errors
- `npm test` runs the Vitest suite once
- `npm run test:coverage` runs the Vitest suite with coverage
- `npm run lint` runs ESLint across the workspace
- `npm run list:architecture:contracts` prints the currently auto-discovered architecture contract test files
- `npm run list:architecture:contracts:json` prints the same contract file list as machine-readable JSON, including a total count and per-feature summary
- `npm run check:architecture:contracts` runs the focused architecture contract matrix for `app/storage`, `app/state`, `chat/state`, and `theme`

For the full command list and contributor workflow, see [CONTRIBUTING.md](./CONTRIBUTING.md).

## Contributing

Contributions are welcome. For larger features, architectural changes, or user-visible behavior changes, please open an issue first.

- AI-generated contributions must follow `AGENTS.md` instructions, log prompts/outputs/tests in `plan/ai-assisted-code-quality.md`, and get a human reviewer sign-off before merging.

Before opening a PR:

- Keep changes focused and avoid unrelated refactors
- Add or update tests for behavior changes
- Route new user-facing copy through `src/locales/*.js`
- Update docs for user-visible behavior changes
- Update [CHANGELOG.md](./CHANGELOG.md) when versioned behavior changes
- Run the minimum sufficient checks for your change:
  - Docs-only or copy-only changes can skip tests if you say so explicitly
  - Typical behavior changes should run affected tests or `npm test`
  - Release-facing, build-related, or high-risk changes should run `npm run lint`, `npm test`, and `npm run build`
  - Use `npm run test:coverage` for broader regression confidence on cross-cutting changes
  - Refactors that mainly move ownership or tighten module boundaries can also run `npm run check:architecture:contracts` as a focused guardrail alongside targeted behavior tests

The full contribution checklist lives in [CONTRIBUTING.md](./CONTRIBUTING.md).

## Development Notes

- Use `npm run dev:all` for the standard local development workflow
- Use [http://127.0.0.1:4321](http://127.0.0.1:4321) for the Vite app during development by default, or your configured `FRONTEND_PORT`
- Use `npm run lalaclaw:start` or `npm start` only for built output that depends on `dist/`
- By default, the app auto-detects a local OpenClaw gateway when available
- To force `mock` mode for reproducible UI or frontend debugging, set `COMMANDCENTER_FORCE_MOCK=1`
- For repeated source-checkout demos of the in-app LalaClaw self-update flow, use the dev-only route `POST /api/dev/lalaclaw/update-mock` with `{ "enabled": true, "stableVersion": "2026.4.6" }`, then disable it later with `DELETE /api/dev/lalaclaw/update-mock`
- Before submitting a PR, report the exact validation you ran; if you only ran targeted tests or skipped checks, say why

## Versioning

LalaClaw uses npm-compatible calendar versioning for releases.

- Update [CHANGELOG.md](./CHANGELOG.md) whenever the project version changes
- Use npm-compatible calendar versions. For multiple releases on the same day, use `YYYY.M.D-N` such as `2026.4.6-1`, not `YYYY.M.D.N`
- Call out breaking changes explicitly in release notes and migration-facing docs
- For development, the repository targets Node.js `22` via [`.nvmrc`](./.nvmrc). The published package supports `^20.19.0 || ^22.12.0 || >=24.0.0`

## OpenClaw Wiring

If `~/.openclaw/openclaw.json` exists, LalaClaw automatically detects your local OpenClaw gateway and reuses its loopback endpoint plus gateway token.

When you point the app at a non-loopback OpenClaw gateway through `OPENCLAW_BASE_URL`, the inspector now treats that target as `remote`.

- Remote targets stay readable in the `Environment` tab, including diagnostics, config path hints, and runtime status
- Local-only OpenClaw mutations such as install, update, config apply, and management actions stay blocked until the dedicated remote-operations flow is ready
- The inspector's `OpenClaw operation history` is now persisted across backend restarts in `~/.config/lalaclaw/openclaw-operation-history.json`
- Saved rollback metadata for local and remote config changes is also persisted in `~/.config/lalaclaw/openclaw-backups.json`
- Remote snapshot bodies are written to protected per-backup files under `~/.config/lalaclaw/openclaw-backup-snapshots/` instead of being inlined into the main metadata JSON
- Local config writes still create on-disk snapshot files beside `~/.openclaw/openclaw.json` using `openclaw.json.backup.<timestamp>` names
- Blocked remote attempts are recorded in that same operation history so you can see what was prevented and why
- Successful local and remote config writes both record rollback labels in that history, and the inspector can restore a saved snapshot after an explicit confirmation step
- Rollback points are now bound to the OpenClaw target that created them, so a backup from one remote cannot be restored into another target by mistake
- The same inspector surface now offers a recovery guide with official OpenClaw docs links so you can decide whether to switch back to a local-safe target or operate on the remote host directly

For a fresh source checkout, a typical setup looks like this:

```bash
git clone https://github.com/aliramw/lalaclaw.git lalaclaw
cd lalaclaw
npm ci
npm run doctor
npm run lalaclaw:init
```

If you want to point to another OpenClaw-compatible gateway, set:

```bash
export OPENCLAW_BASE_URL="https://your-openclaw-gateway"
export OPENCLAW_API_KEY="..."
export OPENCLAW_MODEL="openclaw"
export OPENCLAW_AGENT_ID="main"
export OPENCLAW_API_STYLE="chat"
export OPENCLAW_API_PATH="/v1/chat/completions"
```

If your gateway is closer to the OpenAI Responses API, use:

```bash
export OPENCLAW_API_STYLE="responses"
export OPENCLAW_API_PATH="/v1/responses"
```

## Token Access Mode

If you want to open LalaClaw through a direct remote URL, keep the normal browser app but require an access token before any `/api/*` or runtime WebSocket traffic is allowed.

Example:

```bash
export HOST="0.0.0.0"
export PORT="5678"
export COMMANDCENTER_ACCESS_MODE="token"
export COMMANDCENTER_ACCESS_TOKENS="replace-with-a-long-random-token"
npm run build
npm run lalaclaw:start
```

Notes:

- The browser first loads the app shell, then exchanges the token for an `httpOnly` cookie through `/api/auth/token`
- Protected mode covers the REST API plus `/api/runtime/ws`, so chat, file preview, file save, workspace tree, and runtime snapshots stay behind the same gate
- For multiple tokens, separate `COMMANDCENTER_ACCESS_TOKENS` entries with commas or newlines, or point `COMMANDCENTER_ACCESS_TOKENS_FILE` at a newline-separated token file
- If you started LalaClaw with `lalaclaw init`, the token settings usually live in `~/.config/lalaclaw/.env.local` on macOS/Linux or `%APPDATA%\LalaClaw\.env.local` on Windows
- If you have terminal access on the host, run `lalaclaw access token` to print the current token, or `lalaclaw access token --rotate` to replace it
- Keep using `HOST=127.0.0.1` when you only need local access or SSH port forwarding
- For internet-facing deployments, prefer HTTPS through a reverse proxy in front of LalaClaw

Without these variables, the app runs in `mock` mode so the UI and chat loop remain usable during bootstrap.
