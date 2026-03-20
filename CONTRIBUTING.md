# Contributing

Thanks for contributing to LalaClaw.

## Before You Start

- For larger features, architectural changes, or user-visible behavior changes, please open an issue first.
- Keep pull requests focused. Avoid unrelated refactors or formatting churn in touched files.
- Read [README.md](./README.md) first for the quick contribution and development summary.
- Please follow the community expectations in [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).
- Use the GitHub issue templates under [`.github/ISSUE_TEMPLATE/`](./.github/ISSUE_TEMPLATE) when opening bugs or feature requests.
- Security-sensitive reports should follow [SECURITY.md](./SECURITY.md) instead of public issues.

## Local Setup

```bash
npm ci
npm run lint
npm test
npm run build
```

Run `npm run test:coverage` when you are making broader release-facing, cross-cutting, or high-risk changes and want a wider regression signal.

For browser-level end-to-end coverage, install the Playwright browser once and then run:

```bash
npm run test:e2e:install
npm run test:e2e
```

Use `npm run test:e2e:headed` when you want to watch the browser locally.

The browser e2e scope, stability rules, and authoring guidelines live in [docs/en/testing-e2e.md](./docs/en/testing-e2e.md).

For OpenClaw onboarding changes, run the isolated smoke once before you merge:

```bash
npm run test:openclaw:onboarding:smoke
```

That smoke launches a temporary backend with an isolated `HOME`, drives `GET /api/openclaw/onboarding`, `POST /api/openclaw/onboarding`, and `GET /api/openclaw/onboarding?refreshCapabilities=1`, and then tears the temporary state back down. Set `LALACLAW_ONBOARDING_SMOKE_KEEP_TMP=1` if you want to inspect the generated temp directory after the run.

For CI or scripted validation, you can also set:

- `LALACLAW_ONBOARDING_SMOKE_OUTPUT_FILE=/abs/path/report.json` to persist the JSON result
- `GITHUB_STEP_SUMMARY` to let the smoke append a short markdown summary in GitHub Actions
- `npm run test:openclaw:onboarding:smoke -- --json` to keep stdout as JSON-only output

The main GitHub Actions workflow runs this smoke in a dedicated `openclaw-onboarding-smoke` job. That job uploads the JSON report as an artifact even when the smoke fails, so reviewers can inspect the onboarding state transition, capability detection source, and backend logs without rerunning locally.

For the standard development workflow, run:

```bash
npm run dev:all
```

Use [http://127.0.0.1:5173](http://127.0.0.1:5173) as the frontend dev entry.

If you specifically want the backend only, run:

```bash
node server.js
```

If you want to force local development into `mock` mode, use:

```bash
export COMMANDCENTER_FORCE_MOCK=1
```

If you want to demo the in-app LalaClaw self-update flow repeatedly from a source checkout without restarting the backend, use the dev-only mock route:

```bash
curl http://127.0.0.1:3000/api/dev/lalaclaw/update-mock
curl -X POST http://127.0.0.1:3000/api/dev/lalaclaw/update-mock \
  -H 'Content-Type: application/json' \
  -d '{"enabled":true,"stableVersion":"2026.3.21-1"}'
curl -X DELETE http://127.0.0.1:3000/api/dev/lalaclaw/update-mock
```

Notes:

- This route is available only from a source checkout in development, not from packaged installs.
- `GET` returns the current dev mock state.
- `POST` enables the mock and sets the stable version shown by `/api/lalaclaw/update`.
- `DELETE` disables the mock and clears the previous demo update job state.

If your change depends on built output, run `npm run build` and verify against `npm run lalaclaw:start` or `npm start`.

If you are preparing a release or changing packaging behavior, do not stop at validating the source checkout. Also validate the actual npm artifact with `npm pack`, install that tarball in a clean temporary directory, and verify one real installed startup path before publishing.

## Project Shape

- Frontend feature structure is documented in [src/features/README.md](./src/features/README.md)
- Backend layering is documented in [server/README.md](./server/README.md)

## Before Opening a PR

- Keep `server.js` and `src/App.jsx` thin; prefer adding logic inside the domain folders.
- Add or update tests for any behavior change.
- Route new user-facing copy through `src/locales/*.js`.
- Update at least `src/locales/en.js` and `src/locales/zh.js` when adding locale keys.
- Update docs for user-visible behavior changes.
- Update [CHANGELOG.md](./CHANGELOG.md) when versioned behavior changes.
- Run the relevant local checks before submitting. Prefer:
  - `npm run lint`
  - `npm test`
  - `npm run build`
  - `npm run test:coverage` for broader release-facing changes
- Avoid unrelated formatting churn in touched files.
- If your change affects OpenClaw integration, prefer mock-safe tests by default.

## Internationalization

- Do not add hard-coded user-facing strings in components, hooks, controllers, or utilities.
- Put user-facing copy in `src/locales/*.js` and use the existing i18n layer.
- If a locale is temporarily missing, keep a safe fallback and do not expose raw locale keys in the UI.

## Testing Guidance

- For bug fixes, add at least one regression test.
- For streaming, queueing, hydration, persistence recovery, or session/runtime sync, prefer controller-level or `App`-level tests over only pure function tests.
- Use the existing validation commands as the baseline:
  - `npm run lint`
  - `npm test`
  - `npm run test:coverage`
  - `npm run build`
- Pick the minimum sufficient validation based on change scope:
  - Docs-only or copy-only changes may skip tests, but say so explicitly in the PR.
  - Typical UI or small backend logic changes should run affected tests, or `npm test` if the impact is unclear.
  - Runtime, session, storage, streaming, hydration, pending recovery, or concurrency changes should run affected tests and prefer `App`-level or controller-level regressions.
  - Release-facing changes, dependency upgrades, build pipeline changes, or version bumps should run `npm run lint`, `npm test`, `npm run build`, and `npm pack`, plus `npm run test:coverage` when the risk is broad.
- If your change depends on built output, run `npm run build` and verify against `npm run lalaclaw:start` or `npm start`.
- If you are validating a release artifact, install the `npm pack` tarball in a clean temporary directory and check the installed app itself, not only the source workspace.
- Treat build warnings or install-time smoke failures such as circular chunks, chunk initialization errors, or a blank first screen as release blockers until resolved.
- If you only ran targeted tests, mention the exact commands and why that narrower scope was sufficient.
- If any validation was skipped or failed, call that out explicitly together with the remaining risk.

## Pull Request Notes

- Explain the user-facing or developer-facing impact.
- Call out any tradeoffs or follow-up work.
- Mention testing performed.
- Follow [`.github/pull_request_template.md`](./.github/pull_request_template.md) so reviewers get consistent context.

## Versioning and Release Notes

- LalaClaw follows Semantic Versioning for releases.
- Use npm-compatible calendar versions. For multiple releases on the same day, use `YYYY.M.D-N` such as `2026.3.17-2`, not `YYYY.M.D.N`.
- Breaking changes should be called out explicitly in release notes and migration-facing docs.
- The repository currently targets Node.js `22` via [`.nvmrc`](./.nvmrc).
- The in-app LalaClaw self-update flow reads the npm `stable` dist-tag first and falls back to `latest` only when `stable` is missing.
- For every release, ask the maintainer explicitly whether the new version should be promoted to `stable`. Do not assume every published version becomes `stable`.
- If the maintainer has not confirmed `stable`, prefer publishing to a non-`stable` tag such as `next`, then promote later with `npm dist-tag add lalaclaw@<version> stable` only after approval.
- To move `stable` away from a version, either point `stable` back to an older version with `npm dist-tag add lalaclaw@<older-version> stable`, or remove it entirely with `npm dist-tag rm lalaclaw stable` when that fallback behavior is intentionally desired.

## Release Artifact Checklist

Before `npm publish`, validate the package that users will actually install:

- Run `npm run lint`
- Run `npm test`
- Run `npm run build`
- Run `npm pack`
- Install the generated tarball in a clean temporary directory
- Start the installed package through its real production entry
- Confirm the first screen renders and the browser console has no new runtime or chunk-init errors

Changes touching `vite.config.*`, `manualChunks`, lazy-loaded bundle boundaries, or packaging-sensitive dependencies such as Mermaid should always include this installed-package smoke test.

## Scope Guidance

- `server/core/` is for runtime wiring and stateful foundations.
- `server/services/` is for transport and snapshot-building services.
- `server/routes/` is for request handlers.
- `server/formatters/` is for pure parsing and formatting helpers.
- `src/features/*/controllers/` is for orchestration hooks.
- `src/features/*/storage/`, `state/`, `utils/`, and `runtime/` should stay focused and easy to test.
