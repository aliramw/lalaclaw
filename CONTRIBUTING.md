# Contributing

Thanks for contributing to LalaClaw.

## Local Setup

```bash
npm ci
npm run lint
npm test
npm run test:coverage
npm run build
```

Run the app locally with:

```bash
node server.js
```

If you want to force local development into mock mode, use:

```bash
export COMMANDCENTER_FORCE_MOCK=1
```

## Project Shape

- Frontend feature structure is documented in [src/features/README.md](./src/features/README.md)
- Backend layering is documented in [server/README.md](./server/README.md)

## Before Opening a PR

- Keep `server.js` and `src/App.jsx` thin; prefer adding logic inside the domain folders.
- Add or update tests for any behavior change.
- Run `npm run lint`, `npm test`, `npm run test:coverage`, and `npm run build` locally before submitting.
- Avoid unrelated formatting churn in touched files.
- If your change affects OpenClaw integration, prefer mock-safe tests by default.

## Pull Request Notes

- Explain the user-facing or developer-facing impact.
- Call out any tradeoffs or follow-up work.
- Mention testing performed.

## Scope Guidance

- `server/core/` is for runtime wiring and stateful foundations.
- `server/services/` is for transport and snapshot-building services.
- `server/routes/` is for request handlers.
- `server/formatters/` is for pure parsing and formatting helpers.
- `src/features/*/controllers/` is for orchestration hooks.
- `src/features/*/storage/`, `state/`, `utils/`, and `runtime/` should stay focused and easy to test.
