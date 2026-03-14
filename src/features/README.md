# Feature Structure

`src/features/` is organized around product domains first, then by role inside each domain.

## Domains

- `app/`
  Page-level composition, app persistence, hotkeys, and session boot state.

- `chat/`
  Composer behavior, queue/send control, prompt history, and chat-specific utilities.

- `session/`
  Runtime polling and session snapshot synchronization.

- `theme/`
  Theme persistence and DOM theme application.

## Role Subfolders

- `controllers/`
  Hooks that orchestrate behavior across multiple smaller modules.
  These are the closest frontend equivalent to backend route handlers.

- `storage/`
  Local persistence helpers and storage-oriented hooks.

- `state/`
  Local shape builders and domain defaults.

- `utils/`
  Small pure helpers with little or no React coupling.

- `runtime/`
  Session/runtime-specific hooks that poll or hydrate server state.

## Rules

- Keep `App.jsx` thin. Prefer moving page orchestration into `app/controllers/`.
- Put pure helpers in `utils/` or `storage/` before adding more logic to controller hooks.
- If a hook owns side effects plus multiple refs plus cross-domain coordination, it likely belongs in `controllers/`.
- If a value is just a default object builder or local shape helper, it belongs in `state/`.
- Avoid importing from a directory barrel inside the same folder when that would create a cycle.

## Current Entry Flow

1. `App.jsx` renders the page shell.
2. `app/controllers/use-command-center.js` assembles the page-level behavior.
3. Domain hooks under `chat/`, `session/`, and `theme/` provide focused behavior.
4. Storage and utility modules hold persistence and pure helpers that back those hooks.
