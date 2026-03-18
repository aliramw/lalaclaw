# CLAUDE.md

LalaClaw is an agent command center prototype — a React + Vite frontend paired with a Node.js backend that connects to OpenClaw gateways. It provides a chat interface, file explorer, runtime inspector, and multi-language support for co-creating with AI agents.

## Quick Reference

```bash
# Requirements
node 22.x          # see .nvmrc

# Setup
npm ci

# Key commands
npm run lint        # ESLint (flat config)
npm test            # Vitest (single run)
npm run test:coverage  # Vitest with v8 coverage
npm run build       # Vite production build → dist/

# Development
npm run dev:all     # Start frontend (:5173) + backend (:3000) together
npm run dev         # Frontend only (Vite dev server)
npm run dev:backend # Backend only

# Production
npm start           # Serve from dist/ via server.js
```

## Architecture

### Frontend (`src/`)

Domain-first organization under `src/features/`:

| Domain | Purpose |
|--------|---------|
| `app/` | Page composition, persistence, hotkeys, boot state |
| `chat/` | Composer, queue/send, prompt history |
| `session/` | Runtime polling, snapshot sync |
| `theme/` | Theme persistence |

Each domain uses role subfolders:
- `controllers/` — orchestration hooks (page-level behavior)
- `storage/` — persistence helpers
- `state/` — default objects and shape builders
- `utils/` — pure helpers, minimal React coupling
- `runtime/` — server state polling and hydration

**Entry flow:** `main.jsx` → `App.jsx` → `use-command-center.js` → domain hooks → storage/utils

**UI components** live in `src/components/`:
- `ui/` — base components built on Radix UI primitives
- `command-center/` — domain-specific components

**Locales** in `src/locales/` — 11 languages (en, zh, zh-hk, ja, ko, fr, es, pt, de, ms, ta)

### Backend (`server/`)

Responsibility-layered, no Express — native Node.js `http` module:

| Layer | Purpose |
|-------|---------|
| `core/` | Config discovery, app context assembly, session state |
| `services/` | OpenClaw transport, transcript projection, dashboard snapshots |
| `routes/` | HTTP request handlers (`/api/session`, `/api/runtime`, `/api/chat`, etc.) |
| `formatters/` | Stateless parsing, message shaping, token formatting |
| `http/` | Low-level body parsing, JSON/file responses |

**Entry flow:** `server.js` → `core/app-context.js` → routes → services → formatters

### Shared

- `shared/strip-markdown-for-display.cjs` — CommonJS utility used by both sides

## Key Directories

```
bin/            CLI entry (lalaclaw.js)
deploy/         Deployment configs (macos)
docs/           Multi-language documentation
server/         Backend (core/, services/, routes/, formatters/, http/)
shared/         Shared utilities
src/            Frontend (features/, components/, lib/, locales/)
test/           All test files (17 suites)
```

## Development Workflow

- Dev entry point: `http://127.0.0.1:5173`
- `vite.config.mjs` proxies `/api/*` → `http://127.0.0.1:3000`
- Do NOT use `npm start` for frontend dev — it requires pre-built `dist/`
- Auto-detects local OpenClaw gateway at `~/.openclaw/openclaw.json`
- Force mock mode: `COMMANDCENTER_FORCE_MOCK=1 PORT=3000 HOST=127.0.0.1 node server.js`
- Environment config: copy `.env.example` and `.env.local.example`

## Code Conventions

### Internationalization (critical)
- **No hard-coded user-facing strings** — all copy goes in `src/locales/*.js`
- New keys must update at least `src/locales/en.js` and `src/locales/zh.js`
- Use the `i18n.jsx` provider for rendering
- Do not rename or delete existing locale keys unless the task explicitly requires migration

### Change Principles
- Prefer minimal viable changes — do not bundle unrelated refactors
- Read existing implementation and tests before modifying
- Keep `server.js` and `src/App.jsx` thin — add logic in domain folders
- Do not silently discard user messages, history, or session state
- For streaming, queueing, persistence, or session sync changes, check:
  - `src/features/chat/controllers/*.js`
  - `src/features/app/controllers/*.js`
  - `src/features/app/storage/*.js`
  - `src/features/session/runtime/*.js`

### UI & Accessibility
- Interactive elements need accessible names and keyboard operability
- Consider long text, narrow screens, wrapping, and button truncation
- Surface errors to users with stable messages; preserve debug info for developers

### Open Source Compatibility
- Evaluate license, maintenance, bundle size before adding dependencies
- Reuse existing deps or native APIs when possible
- Exports, component props, routes, localStorage keys, and event names are compatibility interfaces

## Testing

- **Framework:** Vitest 4.x with jsdom environment
- **Setup:** `test/setup.js` (polyfills for ResizeObserver, PointerEvent, matchMedia, etc.)
- **Location:** all tests in `test/` directory; frontend component tests in `src/App.test.jsx`
- **Coverage thresholds:** 50% lines/statements, 52% functions, 40% branches

### Rules
- Bug fixes require at least one regression test
- Streaming/queueing/persistence/session-sync → prefer controller-level or App-level tests
- OpenClaw integration changes → prefer mock-safe tests
- State what tests you ran (or didn't run) when describing changes

## Linting

- ESLint 9.x flat config (`eslint.config.mjs`)
- React hooks rules enforced (rules-of-hooks: error, exhaustive-deps: warn)
- react-refresh: only-export-components (warn)
- Separate rule sets for `src/`, `test/`, `server.js`, `bin/`, and `*.mjs`
- EditorConfig: 2-space indent, UTF-8, LF endings, trim trailing whitespace

## CI Pipeline

Runs on push to main/master and all PRs (`.github/workflows/ci.yml`):

1. `npm ci`
2. `npm run lint`
3. `npm run test:coverage`
4. `npm run build`

## Versioning

- Calendar versioning: `YYYY.M.D-N` (e.g., `2026.3.17-2`) — npm-compatible
- Update `CHANGELOG.md` on every version change
- Release order: bump version → update changelog/docs → lint+test+build → commit+push → git tag + GitHub release → npm publish
- Sync example version numbers in README and documentation-quick-start docs

## Common Pitfalls

- Do not use `npm start` or `dist/` during frontend development
- Do not hard-code strings — they will fail lint or review
- Do not add deps without evaluating alternatives using existing packages
- Do not put logic in `server.js` or `App.jsx` — use domain folders
- Do not skip tests — CI enforces coverage thresholds
- Do not rename/delete locale keys, localStorage keys, or exported APIs without explicit migration
