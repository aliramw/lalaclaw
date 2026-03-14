# LalaClaw

Agent command center prototype for an OpenClaw-style operator cockpit.

## Run

```bash
node server.js
```

Then open [http://127.0.0.1:3000](http://127.0.0.1:3000).

## Test

```bash
npm test
```

Watch mode:

```bash
npm run test:watch
```

## OpenClaw wiring

If `~/.openclaw/openclaw.json` exists, CommandCenter will automatically detect your local OpenClaw gateway and reuse its loopback endpoint plus gateway token.

If you want to override that and point to another OpenClaw-compatible gateway, set:

```bash
export OPENCLAW_BASE_URL="https://your-openclaw-gateway"
export OPENCLAW_API_KEY="..."
export OPENCLAW_MODEL="openclaw"
export OPENCLAW_AGENT_ID="main"
export OPENCLAW_API_STYLE="chat"
export OPENCLAW_API_PATH="/v1/chat/completions"
node server.js
```

If your gateway is closer to the OpenAI Responses API, use:

```bash
export OPENCLAW_API_STYLE="responses"
export OPENCLAW_API_PATH="/v1/responses"
```

Without these variables, the app runs in `mock` mode so the UI and chat loop remain usable during bootstrap.

To force `mock` mode even when a local `~/.openclaw/openclaw.json` is present, set:

```bash
export COMMANDCENTER_FORCE_MOCK=1
```
