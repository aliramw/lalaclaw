# LalaClaw TypeScript Migration Plan

## Goal

Introduce TypeScript incrementally across the repository to improve contract clarity, refactor safety, and long-term maintainability without freezing feature work or forcing a full rewrite.

## Why This Is Worth Doing

- The codebase already has enough state and contract complexity that plain JavaScript is starting to hide too many assumptions.
- Frontend state flows, storage payloads, runtime snapshots, and chat/session models would all benefit from explicit types.
- The repository is large enough that safer refactors and better editor support will pay off quickly.
- AI-assisted changes become more reliable when data shapes and state transitions are encoded instead of implied.

## Constraints

- The frontend can adopt `.ts` and `.tsx` incrementally with low friction.
- The backend currently runs as raw CommonJS via `node server.js`, so server-side TypeScript needs a separate transition strategy.
- The repository already has unrelated local changes and active feature work, so migration should happen in small, reviewable batches.
- Existing lint/test instability should not be mixed with large type changes in the same step.

## Migration Principles

- Prefer gradual migration over a big-bang rewrite.
- Migrate low-coupling modules before large stateful controllers and route handlers.
- Introduce shared types early so later migrations converge on one source of truth.
- Keep the app runnable after every phase.
- Raise strictness only after coverage and type surfaces stabilize.

## Planned Architecture

### Frontend

- Use TypeScript directly in `src/` with mixed JS/TS support during the transition.
- Centralize reusable client-side types under `src/types/`.
- Keep import paths extensionless so JS and TS files can coexist during migration.

### Backend

There are two viable backend migration paths:

1. Short-term path: keep backend in CommonJS and use JSDoc plus centralized shared types while frontend migration advances.
2. Full migration path: add a server build/output step and migrate `server/` to TypeScript in a later phase.

Recommended approach:

- Finish frontend/shared-type migration first.
- Then decide whether backend should move to:
  - compiled TypeScript output for `server/`
  - or a lighter CommonJS + JSDoc + schema-validation middle ground

## Phase Plan

## Phase 0: Baseline Stabilization

Goal:
- Separate existing repo issues from migration-specific issues.

Tasks:
- Fix current `lint` errors.
- Triage current failing tests.
- Identify flaky or unrelated failures so migration work is not blamed for them.

Exit criteria:
- We can tell whether a failure was pre-existing or introduced by the migration.

## Phase 1: TypeScript Foundation

Goal:
- Make the repository TypeScript-capable without forcing immediate full adoption.

Tasks:
- Add `typescript`.
- Add `typecheck` script.
- Add `tsconfig.json` with mixed JS/TS support.
- Extend ESLint to understand `ts/tsx`.
- Add initial global/browser declarations where needed.

Current status:
- A first implementation of this phase has already been prepared on branch `codex/typescript-migration`.

Exit criteria:
- `npm run typecheck` works.
- `npm run build` still works.
- TS files can live next to JS files without breaking imports.

## Phase 2: Shared Types And Low-Risk Utilities

Goal:
- Establish core domain vocabulary before migrating heavier modules.

Priority types:
- `ChatMessage`
- `Attachment`
- `SessionPreferences`
- `ChatTab`
- `RuntimeSnapshot`
- `DashboardSession`
- common API request/response payloads

Priority files:
- `src/lib/*` utility modules
- `src/features/chat/utils/*`
- `server/formatters/*`

Notes:
- Frontend utilities are the safest place to harden patterns before touching state-heavy controllers.
- Server formatters are good candidates only if we choose a backend TS path or temporarily annotate them with JSDoc.

Exit criteria:
- Core shared types exist and are reused by at least a few migrated modules.
- Utility-layer TS adoption is proven to be low-friction.

## Phase 3: Frontend State And Storage Layer

Goal:
- Type the places where mistakes are expensive and frequent.

Priority files:
- `src/features/app/storage/app-storage.js`
- `src/features/chat/controllers/use-chat-controller.js`
- `src/features/session/runtime/use-runtime-snapshot.js`
- `src/features/app/state/*`

Why this phase matters:
- These files define persistence shape, runtime shape, and user-visible chat state behavior.
- This is where TypeScript will deliver the biggest safety gains.

Exit criteria:
- Storage payloads and runtime snapshots have explicit types.
- Message/attachment/session contracts are reused instead of redefined ad hoc.

## Phase 4: Frontend Component Migration

Goal:
- Bring larger UI surfaces onto the shared type model.

Priority order:
1. UI primitives and small component helpers
2. mid-sized panels and overlays
3. large components such as:
   - `src/components/command-center/inspector-panel.jsx`
   - `src/components/command-center/chat-panel.jsx`
   - `src/App.jsx`

Notes:
- Avoid starting with the largest files.
- Extract helper types and controller-facing props before converting very large components.

Exit criteria:
- Core UI surfaces consume shared typed contracts.
- Large components no longer invent local ad hoc data shapes.

## Phase 5: Backend Strategy Decision

Goal:
- Choose and implement the backend path intentionally instead of by drift.

Decision checkpoint:
- If the server layer keeps growing, move to compiled TypeScript output.
- If server churn is moderate and runtime simplicity matters more, keep CommonJS and add JSDoc/types/schema validation first.

If choosing full backend TS:
- introduce `tsconfig.server.json` or equivalent
- define output directory and runtime entry strategy
- migrate `server/formatters`, `server/http`, `server/routes`, then `server/services`

High-risk backend files:
- `server.js`
- `server/routes/chat.js`
- `server/services/openclaw-client.js`
- `server/services/runtime-hub.js`

Exit criteria:
- Backend approach is explicit, documented, and consistent with build/start scripts.

## Phase 6: Raise Strictness Gradually

Goal:
- Improve type quality without stalling migration throughput.

Recommended progression:
1. mixed JS/TS with broad compatibility
2. reduce `any` and missing type holes in migrated areas
3. enable `noImplicitAny`
4. enable `strictNullChecks`
5. consider full `strict` once the repo is mostly migrated

Exit criteria:
- Strictness increases are deliberate and supported by test coverage and stable contracts.

## Suggested File Order

### First wave

- `src/lib/utils`
- `src/lib/api-client`
- `src/lib/cc-debug-events`
- `src/features/chat/utils/*`

### Second wave

- `src/features/app/storage/app-storage`
- `src/features/session/runtime/use-runtime-snapshot`
- `src/features/chat/controllers/use-chat-controller`

### Third wave

- shared component helpers
- `inspector-panel`
- `chat-panel`
- `App`

### Later wave

- server formatters
- server routes
- runtime/OpenClaw service layer

## Validation Strategy

Run these continuously during migration:

- `npm run typecheck`
- `npm run build`
- targeted Vitest runs for the files being migrated

Run these at phase boundaries:

- `npm run lint`
- `npm test`

For frontend-touching phases:

- confirm the app still loads correctly in the browser
- watch for runtime regressions around:
  - chat send/stream
  - attachment flows
  - session switching
  - runtime snapshot refresh
  - inspector panels

## Risks

- Mixing migration with unrelated feature work can make blame and rollback harder.
- Very large files may produce noisy type errors if migrated too early.
- Backend migration can become a build-system project if we do not choose a clear path first.
- Existing test/lint issues may obscure the real cost of migration unless stabilized early.

## Recommended Working Style

- Use a dedicated migration branch and keep changes reviewable by phase.
- Prefer one logical migration unit per PR.
- Document newly introduced shared types as contracts, not just syntax.
- Avoid type-only churn that does not improve boundaries or readability.

## Immediate Next Actions

1. Keep Phase 1 work on `codex/typescript-migration`.
2. Stabilize current lint/test baseline enough to separate pre-existing failures from migration failures.
3. Introduce shared message, attachment, session, and runtime types.
4. Migrate the state/storage layer before attempting the largest UI files.
5. Decide the backend path before renaming major `server/` modules.

## Expected Outcome

If we follow this plan, TypeScript migration should improve reliability and maintainability without forcing a disruptive rewrite. The main win is not "using TS everywhere"; it is making LalaClaw's runtime, session, and chat contracts explicit enough that humans and agents can safely change the system over time.
