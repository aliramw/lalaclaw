# LalaClaw TypeScript Migration Plan

## Goal

Introduce TypeScript incrementally across the repository to improve contract clarity, refactor safety, and long-term maintainability without freezing feature work or forcing a rewrite.

## Why This Is Worth Doing

- The codebase has enough state, transport, and storage complexity that plain JavaScript hides too many assumptions.
- Frontend state flows, storage payloads, runtime snapshots, and chat/session models benefit from explicit contracts.
- The backend now has enough orchestration logic that typed route/service boundaries materially reduce migration and refactor risk.
- AI-assisted changes are safer when the main data shapes are encoded instead of implied.

## Constraints

- The app must remain runnable after each migration slice.
- The public runtime entry stays `node server.js`.
- The repository has active feature work, so migration work should stay incremental and reviewable.
- Validation discipline matters as much as file conversion discipline, especially on runtime, IM, delivery-routed, and packaging-sensitive paths.

## Migration Principles

- Prefer gradual migration over a big-bang rewrite.
- Migrate shared contracts before large stateful consumers when possible.
- Keep imports extensionless where that improves JS/TS interop during transition.
- Treat compatibility-first typing as the default unless a real bug is uncovered.
- Keep this document current-focused. Historical notes should only remain when they still change execution decisions.

## Architecture

### Frontend

- Use TypeScript directly in `src/` with mixed JS/TS support during the transition.
- Centralize reusable client-side types under `src/types/`.
- Keep the migration centered on shared contracts, stateful controllers, and high-signal utility boundaries before tightening render surfaces.

### Backend

- Keep the published/runtime entry at `node server.js`.
- Compile the server tree through `tsconfig.server.json` into `.server-build/`.
- Let the root `server.js` remain a thin bootstrap that loads `.server-build/server/entry.js`.
- Migrate backend slices under `server/` without changing the external startup contract.

## Phase Plan

### Phase 0: Baseline Stabilization

Goal:
- Separate existing repo issues from migration-specific issues.

Exit criteria:
- We can tell whether a failure was pre-existing or introduced by migration work.

### Phase 1: TypeScript Foundation

Goal:
- Make the repository TypeScript-capable without forcing immediate full adoption.

Exit criteria:
- `npm run typecheck` works.
- `npm run build` still works.
- TS files can coexist next to JS files.

### Phase 2: Shared Types And Low-Risk Utilities

Goal:
- Establish reusable domain vocabulary before touching heavier state and transport code.

Exit criteria:
- Core shared types exist and are reused by multiple migrated modules.

### Phase 3: Frontend State And Storage Layer

Goal:
- Type the areas where mistakes are expensive and frequent.

Exit criteria:
- Storage payloads, runtime snapshots, and main controller contracts are typed.

### Phase 4: Frontend Component Migration

Goal:
- Move the main app shell and command-center surfaces onto shared typed contracts.

Exit criteria:
- Large UI surfaces no longer invent ad hoc local data shapes.

### Phase 5: Backend Migration And Stabilization

Goal:
- Move the backend onto a real TS compilation path while preserving `node server.js`.

Exit criteria:
- The production backend surface is typed end to end.
- The compiled runtime path, source-test interop, and CLI/runtime compatibility edges are stabilized.

### Phase 6: Raise Strictness Deliberately

Goal:
- Improve type quality after production-code migration is complete.

Exit criteria:
- Stricter compiler rules are promoted only after bounded probes and validation passes.

## Current State

- Phase 1 through Phase 5 are effectively complete for production code.
- The frontend production surface under `src/` is effectively migrated to TypeScript.
- The remaining `src/**/*.js` and `src/**/*.jsx` files are tests and locale dictionaries rather than app-runtime logic.
- The backend production surface under `server/` is effectively migrated to TypeScript and compiled through the stable `node server.js` bootstrap into `.server-build/`.
- The intentionally retained JavaScript/CommonJS compatibility surface is now narrow and explicit:
  - `server.js` remains the public runtime entry
  - `bin/lalaclaw.js` remains the CLI entry
  - `shared/*.cjs` remains available for JS-compatible shared helpers
- The backend compiler gate already enforces:
  - `noImplicitAny`
  - `useUnknownInCatchVariables`
  - `noImplicitReturns`
- Both `tsconfig.json` and `tsconfig.server.json` still keep `strict: false`, but `strictNullChecks` is now promoted into the checked compiler configuration for both targets.
- The production typecheck commands now pass cleanly with that promotion in place:
  - `npm run typecheck`
  - `npm run typecheck:server`
- That means the migration frontier is no longer broad `.js` -> `.ts` conversion; it is now type-quality work and stricter contract enforcement.

## Historical Checkpoints

- Shared type foundations for chat and runtime contracts are landed and reused by stateful frontend modules.
- The high-risk frontend controller/storage/runtime path is landed in TypeScript, including:
  - `app-storage`
  - `use-app-persistence`
  - `use-chat-controller`
  - `use-runtime-snapshot`
  - `use-runtime-socket`
  - `use-command-center`
  - `use-openclaw-inspector`
- The largest frontend app surfaces are landed in TypeScript, including:
  - `src/App.tsx`
  - `src/components/command-center/chat-panel.tsx`
  - `src/components/command-center/inspector-panel.tsx`
  - `src/components/command-center/session-overview.tsx`
- The backend runtime path is landed behind the stable `node server.js` entry, including:
  - `server/entry.ts`
  - `server/core/*`
  - `server/http/*`
  - `server/routes/*`
  - `server/services/*`
- Backend stabilization already covered compiled-runtime path safety, test-entry cleanup, CLI/runtime compatibility helpers, and the first strictness promotions.

## Next Execution Plan

The next phase is no longer "find the next production JS file." The next phase is a deliberate strictness pass, with backend first and frontend second.

### Phase 6A: Backend `strictNullChecks` Probe

Goal:
- Raise backend type quality beyond the current compatibility-first baseline without forcing a broad transport refactor.

Order:
1. Start with lower-risk backend slices before transport-heavy modules:
   - `server/services/dev-workspace-restart.ts`
   - `server/services/lalaclaw-update-runner.ts`
   - `server/services/lalaclaw-update.ts`
   - `server/services/openclaw-management.ts`
   - `server/services/openclaw-update.ts`
   - `server/services/openclaw-config.ts`
2. Then move into read-model and projection-heavy modules:
   - `server/services/dashboard.ts`
   - `server/services/transcript.ts`
3. Only after those are stable, probe orchestration and transport-heavy modules:
   - `server/services/runtime-hub.ts`
   - `server/routes/chat.ts`
   - `server/services/openclaw-client.ts`

Rules:
- Use `npx tsc -p tsconfig.server.json --noEmit --strictNullChecks` as a planning probe first.
- Keep each pass bounded to one module or one very small cluster.
- Favor compatibility-first null shaping over behavior changes unless a real bug is uncovered.
- Preserve the AGENTS validation bar for runtime, WebSocket, IM, and OpenClaw transport slices.
- Do not promote `strictNullChecks` into `tsconfig.server.json` until the backend probe frontier is clean and the affected validation matrix is green.

Current probe note:
- The first real `strictNullChecks` probe is broader than the earlier `noImplicitAny` frontier suggested; it currently reaches into `server/core/*`, `server/entry.ts`, `dashboard.ts`, `transcript.ts`, `runtime-hub.ts`, `openclaw-client.ts`, and several OpenClaw/local-update services.
- The first low-risk strictness slice is already landed:
  - `server/services/dev-workspace-restart.ts`
  - `server/services/openclaw-management.ts`
  - `server/services/openclaw-update.ts`
- The second low-risk strictness slice is also landed:
  - `server/services/openclaw-config.ts`
  - `server/services/openclaw-facade.ts`
- The next core/read-model strictness slice is also landed:
  - `server/core/config.ts`
  - `server/core/session-store.ts`
  - `server/entry.ts`
  - `server/services/dashboard.ts`
- The transport-heavy and projection-heavy strictness follow-ups are also landed:
  - `server/services/openclaw-client.ts`
  - `server/services/openclaw-onboarding.ts`
  - `server/services/runtime-hub.ts`
  - `server/services/transcript.ts`
- The backend planning probe now passes cleanly with `npx tsc -p tsconfig.server.json --noEmit --strictNullChecks`.
- The next TypeScript migration focus should move to the frontend `strictNullChecks` probe instead of continuing backend nullability cleanup.

### Phase 6B: Frontend `strictNullChecks` Probe

Goal:
- Bring the frontend from "typed production surface" to "meaningfully stricter contracts" without reopening the whole component migration effort.

Order:
1. Start with shared contracts and utility boundaries:
   - `src/types/*`
   - `src/lib/*`
   - `src/features/app/storage/*`
2. Then move through stateful controller/runtime layers:
   - `src/features/app/controllers/*`
   - `src/features/chat/controllers/*`
   - `src/features/session/runtime/*`
   - `src/features/session/*`
3. Only after the shared/state layers are stable, tighten large UI surfaces and wrapper props.

Rules:
- Use `npx tsc -p tsconfig.json --noEmit --strictNullChecks` as a planning probe first.
- Prefer fixing nullability at shared contract boundaries before adding local casts inside large components.
- Keep locale dictionaries in JS until the locale key contract is made explicit; locale-file extension changes are not a prerequisite for frontend strictness.

Current probe note:
- The first frontend `strictNullChecks` probe is broader than the phase order alone suggests; it currently surfaces remaining nullability work across `src/App.tsx`, `src/components/command-center/*`, `src/features/app/controllers/*`, `src/features/chat/controllers/*`, `src/features/session/runtime/*`, and a few shared storage helpers.
- The first shared-boundary strictness slice is landed:
  - `src/types/chat.ts`
  - `src/lib/attachment-storage.ts`
  - `src/features/app/storage/use-app-persistence.ts`
  - `src/features/app/storage/app-storage.ts`
- That slice keeps the affected storage tests green and removes the first layer of `undefined` / `never[]` issues at the frontend persistence boundary.
- The next controller/runtime strictness slice is also landed:
  - `src/features/app/controllers/use-command-center.ts`
  - `src/features/session/runtime/use-runtime-snapshot.ts`
- The next chat-controller strictness slice is also landed:
  - `src/features/chat/controllers/chat-stream-helpers.ts`
  - `src/features/chat/controllers/use-chat-controller.ts`
  - `src/features/chat/controllers/use-prompt-history.ts`
- The first large UI-shell strictness slice is also landed:
  - `src/App.tsx`
  - `src/components/command-center/chat-panel-utils.ts`
  - `src/components/command-center/chat-panel.tsx`
- The next markdown-surface strictness slice is also landed:
  - `src/components/command-center/markdown-renderer.tsx`
- The next file-preview strictness slice is also landed:
  - `src/components/command-center/file-preview-overlay.tsx`
- The next auxiliary command-center strictness slice is also landed:
  - `src/components/command-center/context-preview-dialog.tsx`
  - `src/components/command-center/use-file-preview.ts`
  - `src/components/command-center/inspector-files-panel-utils.ts`
- The next inspector/session strictness slice is also landed:
  - `src/components/command-center/inspector-files-panel.tsx`
  - `src/components/command-center/inspector-panel-files.tsx`
  - `src/components/command-center/inspector-panel.tsx`
  - `src/components/command-center/session-overview.tsx`
  - `src/features/app/controllers/use-openclaw-inspector.ts`
- A final strictness cleanup slice is also landed:
  - `src/components/command-center/inspector-panel-utils.ts`
  - `src/components/command-center/lobster-collision.ts`
  - `server/formatters/usage-format.ts`
  - `server/routes/chat.ts`
  - `server/services/dashboard.ts`
  - `server/services/openclaw-client.ts`
  - `server/services/transcript.ts`
- The `App -> ChatPanel` boundary, the chat-controller path, the command-center environment surfaces, and the session overview shell no longer appear in the filtered `strictNullChecks` probe.
- The frontend and backend `strictNullChecks` planning probes are now clean end to end, so the next migration phase should shift from nullability cleanup to deciding which stricter compiler gates to promote next and in what order.
- `noUncheckedIndexedAccess` is now promoted into both checked compiler configs:
  - `tsconfig.json`
  - `tsconfig.server.json`
- The production typecheck commands remain green after that promotion:
  - `npm run typecheck`
  - `npm run typecheck:server`
- The frontend `noUncheckedIndexedAccess` helper/state slice is now landed:
  - `src/components/command-center/chat-panel.tsx`
  - `src/components/command-center/inspector-files-panel-utils.ts`
  - `src/components/command-center/inspector-panel.tsx`
  - `src/components/command-center/markdown-renderer.tsx`
  - `src/components/command-center/session-overview.tsx`
  - `src/features/app/controllers/use-command-center.ts`
  - `src/features/app/storage/app-storage.ts`
- That means the migration frontier has shifted again: the next useful strictness candidate is no longer index/nullability cleanup, but a materially broader contract-shape pass such as `exactOptionalPropertyTypes` or a larger move toward `strict`.

### Phase 6C: Last-Mile Cleanup

- Convert high-signal tests to `.ts` / `.tsx` opportunistically when touching them, but do not block strictness work on mass test-file renames.
- Add an explicit locale contract check keyed from `src/locales/en.js` before considering any locale-file migration.
- Keep future plan updates short and current-focused.

## Validation Bar For The Next Phase

- Backend strictness slice:
  - `npm run typecheck:server`
  - `npm run build:server`
  - the tightest affected backend Vitest files
  - the server smoke command
- Frontend strictness slice:
  - `npm run typecheck`
  - the tightest affected frontend tests, or `npm test` when the impact crosses controller/runtime/app-shell boundaries
  - `npm run build`
- Runtime, WebSocket, IM, delivery-routed, or OpenClaw transport slices:
  - keep the targeted regressions
  - add one real or equivalent end-to-end validation path when behavior-sensitive transport logic is touched
- Build-sensitive or release-facing changes:
  - follow the repo baseline in AGENTS, including `npm run lint`, `npm test`, `npm run build`, `npm run pack:release`, and tarball-based install validation when the change affects release/runtime packaging behavior

## Expected Outcome

If we follow this plan, TypeScript migration should improve reliability and maintainability without forcing a disruptive rewrite. The main win is not "using TS everywhere"; it is making LalaClaw's runtime, session, transport, and storage contracts explicit enough that humans and agents can safely change the system over time.
