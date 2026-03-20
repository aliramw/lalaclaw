[English](../en/documentation-api-troubleshooting.md) | [中文](../zh/documentation-api-troubleshooting.md) | [繁體中文（香港）](../zh-hk/documentation-api-troubleshooting.md) | [日本語](../ja/documentation-api-troubleshooting.md) | [한국어](../ko/documentation-api-troubleshooting.md) | [Français](../fr/documentation-api-troubleshooting.md) | [Español](../es/documentation-api-troubleshooting.md) | [Português](../pt/documentation-api-troubleshooting.md) | [Deutsch](../de/documentation-api-troubleshooting.md) | [Bahasa Melayu](../ms/documentation-api-troubleshooting.md) | [தமிழ்](../ta/documentation-api-troubleshooting.md)

[Back to Home](./documentation.md) | [Quick Start](./documentation-quick-start.md) | [Inspector, File Preview, and Tracing](./documentation-inspector.md) | [Sessions, Agents, and Runtime Modes](./documentation-sessions.md)

# API and Troubleshooting

## API Overview

### `GET /api/session`

Purpose:

- Fetch basic session metadata
- Return model, agent, think mode, available models, available agents, available skills, and related session state

### `POST /api/session`

Purpose:

- Update session preferences
- Supports `agentId`, `model`, `fastMode`, and `thinkMode`

### `GET /api/runtime`

Purpose:

- Fetch the current runtime snapshot
- Returns the projected `conversation`, `timeline`, `files`, `artifacts`, `snapshots`, `agents`, and `peeks`

### `POST /api/chat`

Purpose:

- Send a chat turn
- Streams NDJSON by default
- Supports attachments, `fastMode`, `assistantMessageId`, and `sessionUser`

### `POST /api/chat/stop`

Purpose:

- Abort the active reply for the current tab

### `GET /api/file-preview`

Purpose:

- Load preview metadata for a file
- Returns inline text content or a media `contentUrl`

### `GET /api/file-preview/content`

Purpose:

- Return the real file content for an absolute path

### `POST /api/file-manager/reveal`

Purpose:

- Reveal the target file in Finder, Explorer, or the platform file manager

## Common Issues

### The page does not load and the backend says `dist` is missing

Reason:

- You started `npm start` or `node server.js` expecting the production bundle
- But `npm run build` has not been run yet

Fix:

- For production mode: run `npm run build` first, then `npm start`
- For development: follow [Quick Start](./documentation-quick-start.md) and run both Vite and Node

### The installed app opens to a white screen and the console mentions `mermaid-vendor`

Typical symptom:

- The app bundle loads, but the screen stays blank
- The browser console shows an error from `mermaid-vendor-*.js`

Most likely cause:

- You are on the older packaged build `2026.3.19-1`
- That build used a Mermaid-specific manual vendor split which could break production startup after install

Fix:

- Upgrade to `lalaclaw@2026.3.19-2` or newer
- If you are running from a source checkout, pull the latest `main`, then rebuild with `npm run build`

### The page loads in development, but API calls fail

Check these first:

- Is the frontend running on `127.0.0.1:5173`?
- Is the backend running on `127.0.0.1:3000`?
- Are you using the Vite entrypoint rather than the production server entrypoint?

### OpenClaw is installed, but the app still runs in `mock`

Check:

- Does `~/.openclaw/openclaw.json` exist?
- Is `COMMANDCENTER_FORCE_MOCK=1` set?
- Are `OPENCLAW_BASE_URL` and `OPENCLAW_API_KEY` empty or wrong?

### The first message disappears and the chat returns to the empty state

Typical symptoms:

- The page opens on `127.0.0.1:5173`
- You send the first `hi`
- The conversation immediately goes back to "Waiting for your first command"

Check these first:

- Run `npm run doctor`
- If you are using `local-openclaw`, make sure the output does not say `OpenClaw CLI not found on PATH`
- In the browser Network panel, inspect `POST /api/chat` and see whether it comes back with an empty `conversation`

Most common cause:

- `~/.openclaw/openclaw.json` exists, so LalaClaw enters `local-openclaw`
- But the `openclaw` CLI itself is not installed correctly or is not available on `PATH`
- The backend cannot complete the local OpenClaw session flow, and the frontend is then overwritten by an empty snapshot

Fix:

- Run `which openclaw`
- If it returns nothing, install the OpenClaw CLI or add it to `PATH`
- If the CLI is already installed in a custom location, start the backend with:

```bash
OPENCLAW_BIN=/absolute/path/to/openclaw PORT=3000 HOST=127.0.0.1 node server.js
```

- Then run:

```bash
npm run doctor
```

Confirm:

- `Runtime profile` is the expected one
- `OpenClaw CLI found` is no longer failing
- Then try the first message again

### Model or agent switches do not seem to take effect

Possible reasons:

- You are still in `mock` mode, so only local preferences are changing
- Remote session patching failed in `openclaw` mode
- The selected model is actually the same as the agent default

Best places to inspect:

- The `Environment` tab in [Inspector, File Preview, and Tracing](./documentation-inspector.md)
- Backend console output

If the problem only appears while switching into another tabbed conversation:

- Confirm the switcher finished opening the target session before sending the next turn
- Inspect `runtime.transport`, `runtime.socket`, and `runtime.fallbackReason` in the `Environment` tab

### A file cannot be previewed

Common causes:

- The file item does not have an absolute path
- The file no longer exists at that path
- The target is not a regular file

Important note:

- Both `file-preview` and `file-manager/reveal` require absolute paths
- In the `Environment` tab, absolute file paths open preview, but directory paths intentionally skip preview and open the platform file manager instead
- If you expected inline preview for a log directory or workspace root, that is working as designed

### Why is attachment content truncated?

This is expected behavior:

- Text attachments are truncated to `120000` characters in the frontend
- The file preview endpoint truncates text previews at `1 MB`

That keeps chat payloads and preview rendering from being overloaded by very large content.

### Why do I briefly see a thinking placeholder after refresh?

That is part of the pending-turn recovery flow:

- The frontend restores the local pending placeholder first
- Once the runtime snapshot arrives with the final reply, it replaces that placeholder

In most cases, that is normal recovery behavior rather than an error.

### Why is an Environment action disabled even though I can see the target?

Common reason:

- The app can read a remote OpenClaw target, but the current operation is intentionally limited to local-safe flows

What to check:

- Whether `OPENCLAW_BASE_URL` points to a non-loopback host
- Whether the `Environment` panel labels the target as remote
- Whether the blocked action is a local-only mutation such as install, update, config apply, or gateway management

Expected behavior:

- Read-only diagnostics can stay available for both local and remote targets
- Higher-risk mutations stay disabled until the dedicated remote-operations flow is available

## For Deeper Structure Notes

- For frontend and backend layering, read [Architecture Overview](./architecture.md)
- For demo flows, read [Product Showcase](./showcase.md)
- For future modularization direction, read [Refactor Roadmap](./refactor-roadmap.md)
