# Server Structure

`server/` is organized by responsibility instead of by request path.

## Layers

- `core/`
  Runtime wiring and stateful foundations.
  Put configuration discovery, app context assembly, and session preference state here.

- `services/`
  Data-producing backend services.
  Put OpenClaw transport, transcript projection, and dashboard snapshot composition here.

- `routes/`
  HTTP-facing request handlers only.
  Route modules should orchestrate request/response behavior, but they should not own storage, parsing, or transport primitives.

- `formatters/`
  Stateless parsing, message shaping, token formatting, and slash-command helpers.
  These modules should stay easy to unit test in isolation.

- `http/`
  Low-level HTTP helpers such as body parsing and JSON/file responses.

## Rules

- Prefer adding pure helpers to `formatters/` before expanding route files.
- Prefer adding new transport or projection logic to `services/` before touching `core/app-context.js`.
- Keep `server.js` thin. It should stay focused on startup and top-level request dispatch.
- If a module needs many dependencies injected for testability, that is expected in `services/` and `routes/`.
- If a file starts mixing request handling with parsing or file-system projection, split it before it grows.

## Current Entry Flow

1. `server.js` creates the app server.
2. `core/app-context.js` assembles config, stores, services, and route handlers.
3. `routes/` handle `/api/session`, `/api/runtime`, and `/api/chat`.
4. `services/` talk to OpenClaw or build dashboard snapshots.
5. `formatters/` normalize messages, commands, transcripts, and usage displays.
