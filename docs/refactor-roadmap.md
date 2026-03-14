# Refactor Roadmap

## Goals

- Reduce the maintenance risk of `src/App.jsx` and `server.js`.
- Separate UI composition, data orchestration, and OpenClaw integration.
- Keep the current product behavior stable while making tests more focused.

## Current Pressure Points

- `src/App.jsx` mixes persistence, polling, composer behavior, queue management, theming, and runtime synchronization.
- `server.js` mixes HTTP routing, runtime config detection, session preference storage, OpenClaw transport, transcript parsing, and dashboard projection.
- The repository still contains both the Vite app entrypoint and an older static app under `public/`.
- Some server tests depend on machine-local OpenClaw discovery unless the runtime is explicitly pinned to mock mode.

## Target Shape

### Frontend

- `src/app/bootstrap/`
  - App bootstrap, providers, global styles, root rendering.
- `src/features/session/`
  - Session runtime polling, model and agent selection, fast mode, think mode.
- `src/features/chat/`
  - Composer, queueing, send flow, prompt history, attachment handling.
- `src/features/inspector/`
  - Timeline, files, artifacts, snapshots, agents, peeks.
- `src/shared/`
  - UI primitives, markdown rendering, formatting helpers, storage helpers.

### Backend

- `server/config.js`
  - Runtime config detection, mock override, local OpenClaw discovery.
- `server/session-store.js`
  - Session preferences, local conversation cache.
- `server/openclaw-client.js`
  - HTTP and gateway RPC calls, session patching, direct request vs session mode.
- `server/transcript.js`
  - Transcript reading, message normalization, file extraction, timeline and snapshot projection.
- `server/routes.js`
  - `/api/session`, `/api/runtime`, `/api/chat`, static file handling.
- `server/index.js`
  - Server creation and startup only.

## Recommended Order

### Phase 1: Stabilize runtime boundaries

- Keep `server.js` as the public entrypoint, but move pure helpers into small modules first.
- Introduce a single runtime config module and route all environment detection through it.
- Add explicit test toggles for mock mode and local discovery.

### Phase 2: Extract frontend state domains

- Move attachment storage and prompt history logic into `src/features/chat/state/`.
- Move runtime polling and snapshot application into `src/features/session/state/`.
- Keep `App.jsx` as a composition shell that wires hooks and panels together.

### Phase 3: Split OpenClaw transport from snapshot projection

- Separate request sending from transcript parsing.
- Make `buildDashboardSnapshot` compose smaller functions instead of reading files and formatting data inline.
- Test transcript projection with fixture transcripts instead of full route tests where possible.

### Phase 4: Remove legacy static app

- Legacy static UI files in `public/index.html` and `public/app.js` have been removed; `dist` is now the only served frontend bundle.
- If not, remove them and let the Node server fall back to the Vite app entry or built assets only.
- Update README so local run instructions always match the active frontend.

## Suggested First PRs

1. Extract server runtime config and session store into separate files.
2. Extract frontend chat send flow into a `useChatController` hook.
3. Extract frontend runtime polling into a `useRuntimeSnapshot` hook.
4. Add transcript fixtures and parser unit tests.
5. Remove the legacy static app after verifying no deployment path still depends on it.

## Testing Strategy

- Keep route tests in mock mode by default.
- Add focused unit tests for:
  - transcript parsing
  - session preference resolution
  - attachment persistence and hydration
  - prompt history navigation
- Add one or two integration tests for real route behavior, but guard them behind explicit environment setup.

## Risks To Watch

- Session reset behavior currently touches both frontend local state and backend session identity generation.
- Attachment persistence spans `localStorage` and IndexedDB, so refactors should preserve migration behavior.
- `OpenClaw` mode has timing-sensitive polling and session patch calls; transport extraction should preserve ordering.
