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

The backend transition now has an explicit implementation path:

1. Keep the published/runtime entry at `node server.js`.
2. Use a dedicated `tsconfig.server.json` to compile `server/**/*.ts` plus any remaining JS dependencies into `.server-build/`.
3. Let the root `server.js` act as a thin bootstrap that builds the server bundle and then loads `.server-build/server/entry.js`.
4. Migrate `server/` incrementally in bounded slices, starting with low-coupling `server/core` and `server/http` modules before larger routes and services.

This keeps the runtime contract stable while still allowing real server-side `.ts` migrations.

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
- `typescript`, `tsconfig.json`, ESLint TS parsing, and the `npm run typecheck` script are now present in the repo.
- As of 2026-03-22, `npm run typecheck` passes against the current mixed JS/TS setup.

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

Current checkpoint:
- `src/types/chat.ts` now exists and already covers the chat/storage layer's first shared contracts:
  - `ChatMessage`
  - `ChatAttachment`
  - `PendingChatTurn`
  - `ChatTab`
  - `ChatTabMeta`
  - `StoredUiState`
- `src/types/runtime.ts` now exists for the runtime/session layer and currently covers:
  - `RuntimeSession`
  - `RuntimeSnapshot`
  - `RuntimeFile`
  - `RuntimeTaskRelationship`
  - `RuntimePeeks`
  - runtime hook / socket payload helper types
- These types are already being consumed by the first migrated storage module instead of being kept purely theoretical.

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

Current checkpoint:
- `src/features/app/storage/app-storage.ts` is in progress as the first Phase 3 migration unit, replacing the previous JS module.
- The storage migration already imports and reuses shared chat/storage contracts from `src/types/chat.ts`.
- Targeted validation for this slice passed on 2026-03-22:
  - `npm run typecheck`
  - `npm test -- src/features/app/storage/use-app-persistence.test.jsx`
- `src/features/session/runtime/use-runtime-snapshot.ts` is now also migrated to TypeScript and reuses the shared runtime/session contracts from `src/types/runtime.ts`.
- Targeted validation for the runtime snapshot slice passed on 2026-03-22:
  - `npm run typecheck`
  - `npm test -- src/features/session/runtime/use-runtime-snapshot.test.jsx src/features/session/runtime/use-runtime-snapshot.test.js`
- The next state-heavy target should now be `src/features/chat/controllers/use-chat-controller.js`.

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

Current checkpoint:
- The backend strategy has now been chosen and landed:
  - `tsconfig.server.json` compiles the server tree into `.server-build/`
  - `package.json` now includes `npm run typecheck:server` and `npm run build:server`
  - the root `server.js` now bootstraps the compiled server runtime instead of directly containing the app implementation
  - the real server entry now lives in `server/entry.ts`
- The first bounded backend slices are now migrated:
  - `server/core/session-key.ts`
  - `server/core/config.ts`
  - `server/core/session-store.ts`
  - `server/core/index.ts`
  - `server/http/http-utils.ts`
  - `server/http/index.ts`
  - `server/formatters/chat-commands.ts`
  - `server/formatters/chat-format.ts`
  - `server/formatters/usage-format.ts`
  - `server/formatters/index.ts`
  - `server/services/lalaclaw-service-status.ts`
  - `server/routes/openclaw-history.ts`
  - `server/routes/runtime.ts`
  - `server/routes/lalaclaw-update.ts`
  - `server/routes/openclaw-management.ts`
  - `server/routes/openclaw-update.ts`
  - `server/routes/lalaclaw-update-dev.ts`
  - `server/routes/dev-workspace-restart.ts`
- Targeted validation for the first backend slices passed on 2026-03-22:
  - `npm run typecheck:server`
  - `npm run build:server`
  - `npm test -- server/core/config.test.js server/core/session-key.test.js server/core/session-store.test.js server/http/http-utils.test.js`
  - `node -e "const { createAppServer } = require('./server.js'); ..."` server smoke

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

## Process Log

This section tracks the actual migration sequence so the document reflects the real workstream instead of only the idealized target state.

### Completed / Landed In This Workstream

- Phase 1 foundation is present in the repo:
  - `typescript`
  - `tsconfig.json`
  - ESLint TS parsing
  - `npm run typecheck`
- Shared client-side type modules now exist:
  - `src/types/chat.ts`
  - `src/types/runtime.ts`
- First state/storage migration slice is in place:
  - `src/features/app/storage/app-storage.ts`
- App persistence hook slice is now in place:
  - `src/features/app/storage/use-app-persistence.ts`
- Second state/runtime migration slice is in place:
  - `src/features/session/runtime/use-runtime-snapshot.ts`
- Runtime transport hook slice is now in place:
  - `src/features/session/runtime/use-runtime-socket.ts`
- Runtime stale-running helper slice is now in place:
  - `src/features/session/runtime/use-stale-running-detector.ts`
- App session state slice is now in place:
  - `src/features/app/state/app-session.ts`
- Feature barrel cleanup slices are now in place:
  - `src/features/app/storage/index.ts`
  - `src/features/chat/controllers/index.ts`
  - `src/features/session/runtime/index.ts`
  - `src/features/app/controllers/index.ts`
  - `src/features/app/state/index.ts`
- App hotkeys controller slice is now in place:
  - `src/features/app/controllers/use-app-hotkeys.ts`
- OpenClaw inspector preparation slice is now in place:
  - `src/features/app/controllers/openclaw-inspector-helpers.ts`
  - the form-value, config-model, and remote-guard helpers used by `use-openclaw-inspector` now live in a typed helper module
- OpenClaw inspector controller slice is now in place:
  - `src/features/app/controllers/use-openclaw-inspector.ts`
- Command-center controller slice is now in place:
  - `src/features/app/controllers/use-command-center.ts`
- Phase 4 utility slices are now starting:
  - `src/components/command-center/lobster-collision.ts`
  - `src/components/command-center/lobster-walk-tuning.ts`
  - `src/components/command-center/markdown-content-utils.ts`
  - `src/components/command-center/inspector-files-panel-utils.ts`
  - `src/components/command-center/inspector-panel-utils.ts`
  - `src/components/command-center/markdown-content.tsx`
  - `src/components/command-center/chat-panel-utils.ts`
  - `src/components/command-center/clipboard-utils.ts`
  - `src/components/command-center/use-file-preview.ts`
  - `src/components/command-center/header-bar.tsx`
  - `src/components/command-center/context-preview-dialog.tsx`
  - `src/components/command-center/selection-menu.tsx`
  - `src/components/command-center/markdown-renderer.tsx`
  - `src/components/command-center/file-preview-overlay.tsx`
  - `src/components/command-center/inspector-files-panel.tsx`
  - `src/components/command-center/session-overview.tsx`
- Chat-controller preparation slice is now in place:
  - `src/features/chat/controllers/chat-turn-helpers.ts`
  - `src/features/chat/controllers/chat-stream-helpers.ts`
  - `src/features/chat/controllers/chat-request-helpers.ts`
  - the optimistic-turn and pending-message helpers used by `use-chat-controller` now live in a typed helper module
  - the stream parsing and response-shape helpers used by `use-chat-controller` now also live in a typed helper module
  - the request-payload and queue-state helpers used by `use-chat-controller` now also live in a typed helper module
- Chat controller migration slice is now in place:
  - `src/features/chat/controllers/use-chat-controller.ts`
- Prompt history controller slice is now in place:
  - `src/features/chat/controllers/use-prompt-history.ts`

### Validation Log

- 2026-03-22:
  - `npm run typecheck` passed after the mixed JS/TS foundation and again after the runtime migration.
  - `npm test -- src/features/app/storage/use-app-persistence.test.jsx` passed.
  - `npm test -- src/features/session/runtime/use-runtime-snapshot.test.jsx src/features/session/runtime/use-runtime-snapshot.test.js` passed.
  - `npm run typecheck` passed after extracting the chat controller helper slice.
  - `npm test -- src/features/chat/controllers/use-chat-controller.test.jsx` passed.
  - `npm run typecheck` passed again after extracting the chat stream helper slice.
  - `npm test -- src/features/chat/controllers/use-chat-controller.test.jsx` passed again after the stream helper extraction.
  - `npm run typecheck` passed again after extracting the request / queue helper slice.
  - `npm test -- src/features/chat/controllers/use-chat-controller.test.jsx` passed again after the request / queue helper extraction.
  - `npm run typecheck` passed after converting `use-chat-controller` itself to TypeScript.
  - `npm test -- src/features/chat/controllers/use-chat-controller.test.jsx` passed after the controller conversion.
  - `npm run typecheck` passed after converting `src/features/app/state/app-session.ts` to TypeScript.
  - `npm run typecheck` passed after converting `src/features/app/controllers/use-app-hotkeys.ts` to TypeScript.
  - `npm test -- src/features/app/controllers/use-app-hotkeys.test.jsx` passed after the hotkeys controller conversion.
  - `npm run typecheck` passed after extracting the OpenClaw inspector helper slice.
  - `npm test -- src/features/app/controllers/use-openclaw-inspector.test.jsx` passed after the OpenClaw inspector helper extraction.
  - `npm run typecheck` passed after converting `use-openclaw-inspector` itself to TypeScript.
  - `npm test -- src/features/app/controllers/use-openclaw-inspector.test.jsx` passed after the inspector controller conversion.
  - `npm run typecheck` passed after converting `use-command-center` itself to TypeScript.
  - `npm test -- src/features/app/controllers/use-command-center.test.js` passed after the command-center controller conversion.
  - `npm run typecheck` passed after converting the first small Phase 4 command-center component helpers.
  - `npm test -- src/components/command-center/lobster-collision.test.js` passed after converting `lobster-collision.ts`.
  - `npm run typecheck` passed after converting `markdown-content.tsx`.
  - `npm test -- src/components/command-center/markdown-content.test.jsx` passed after converting `markdown-content.tsx`.
  - `npm run typecheck` passed after converting `chat-panel-utils.ts`.
  - `npm test -- src/components/command-center/chat-panel.test.jsx` completed with `124` passing tests and `3` skipped tests after converting `chat-panel-utils.ts`.
  - `npm run typecheck` passed after converting `clipboard-utils.ts`.
  - `npm test -- src/components/command-center/inspector-panel.test.jsx` passed with `97` passing tests after converting `clipboard-utils.ts`.
  - `npm run typecheck` passed after converting `use-file-preview.ts`.
  - `npm test -- src/components/command-center/inspector-panel.test.jsx` passed with `97` passing tests after converting `use-file-preview.ts`.
  - `npm test -- src/components/command-center/chat-panel.test.jsx` completed with `124` passing tests and `3` skipped tests after converting `use-file-preview.ts`.
  - `npm run typecheck` passed after converting `lobster-walk-tuning.ts`.
  - `npm test -- src/components/command-center/session-overview.test.jsx` passed with `34` passing tests after converting `lobster-walk-tuning.ts`.
  - `npm run typecheck` passed after converting `header-bar.tsx`.
  - `npm run typecheck` passed after converting `context-preview-dialog.tsx`.
  - `npm test -- src/components/command-center/context-preview-dialog.test.jsx` passed with `5` passing tests after converting `context-preview-dialog.tsx`.
  - `npm run typecheck` passed after converting `use-runtime-socket.ts`.
  - `npm test -- src/features/session/runtime/use-runtime-socket.test.jsx` passed with `12` passing tests after converting `use-runtime-socket.ts`.
  - `npm test -- src/features/session/runtime/use-runtime-snapshot.test.jsx src/features/session/runtime/use-runtime-snapshot.test.js` passed with `33` passing tests after converting `use-runtime-socket.ts`.
  - `npm run typecheck` passed after converting `use-stale-running-detector.ts`.
  - `npm test -- src/components/command-center/chat-panel.test.jsx` completed with `124` passing tests and `3` skipped tests after converting `use-stale-running-detector.ts`.
  - `npm run typecheck` passed after converting `selection-menu.tsx`.
  - `npm test -- src/components/command-center/chat-panel.test.jsx` completed with `124` passing tests and `3` skipped tests after converting `selection-menu.tsx`.
  - `npm test -- src/components/command-center/session-overview.test.jsx` passed with `34` passing tests after converting `selection-menu.tsx`.
  - `npm run typecheck` passed after converting `markdown-renderer.tsx`.
  - `npm test -- src/components/command-center/markdown-content.test.jsx` passed with `25` passing tests after converting `markdown-renderer.tsx`.
  - `npm test -- src/components/command-center/chat-panel.test.jsx` completed with `124` passing tests and `3` skipped tests after converting `markdown-renderer.tsx`.
  - `npm run typecheck` passed after converting `use-prompt-history.ts`.
  - `npm test -- src/features/app/controllers/use-command-center.test.js` passed with `34` passing tests after converting `use-prompt-history.ts`.
  - `npm run typecheck` passed after converting `use-app-persistence.ts`.
  - `npm test -- src/features/app/storage/use-app-persistence.test.jsx` passed with `4` passing tests after converting `use-app-persistence.ts`.
  - `npm run typecheck` passed after converting the feature barrel/index files to TypeScript.
  - `npm run typecheck` passed after converting `file-preview-overlay.tsx`.
  - `npm test -- src/components/command-center/file-preview-overlay.test.jsx` passed with `35` passing tests after converting `file-preview-overlay.tsx`.
  - `npm run typecheck` passed after converting `session-overview.tsx`.
  - `npm test -- src/components/command-center/session-overview.test.jsx` passed with `34` passing tests after converting `session-overview.tsx`.
  - `npm run typecheck` passed after extracting `inspector-files-panel-utils.ts`.
  - `npm test -- src/components/command-center/inspector-panel.test.jsx src/components/command-center/file-preview-overlay.test.jsx` passed with `132` passing tests after extracting `inspector-files-panel-utils.ts`.
  - `npm run typecheck` passed after converting `inspector-files-panel.tsx`.
  - `npm test -- src/components/command-center/inspector-panel.test.jsx src/components/command-center/file-preview-overlay.test.jsx` passed with `132` passing tests after converting `inspector-files-panel.tsx`.
  - `npm run typecheck` passed after making `inspector-panel.jsx` reuse `inspector-files-panel-utils.ts`.
  - `npm test -- src/components/command-center/inspector-panel.test.jsx src/components/command-center/file-preview-overlay.test.jsx` passed with `132` passing tests after the `inspector-panel.jsx` helper deduplication.
  - `npm run typecheck` passed after extracting the first `inspector-panel-utils.ts` helper slice.
  - `npm test -- src/components/command-center/inspector-panel.test.jsx src/components/command-center/file-preview-overlay.test.jsx` passed with `132` passing tests after extracting the first `inspector-panel-utils.ts` helper slice.
  - `npm run typecheck` passed after extracting the second `inspector-panel-utils.ts` helper slice for OpenClaw config/update/onboarding helpers.
  - `npm test -- src/components/command-center/inspector-panel.test.jsx src/components/command-center/file-preview-overlay.test.jsx` passed with `132` passing tests after extracting the second `inspector-panel-utils.ts` helper slice.
  - `npm run typecheck` passed after stabilizing the second `inspector-panel-utils.ts` helper slice.
  - `npm test -- src/components/command-center/inspector-panel.test.jsx src/components/command-center/file-preview-overlay.test.jsx` passed with `132` passing tests after stabilizing the second `inspector-panel-utils.ts` helper slice.
  - `npm run typecheck` passed after extracting the third `inspector-panel-utils.ts` helper slice for update troubleshooting, formatting helpers, and relationship labeling.
  - `npm test -- src/components/command-center/inspector-panel.test.jsx src/components/command-center/file-preview-overlay.test.jsx` passed with `132` passing tests after extracting the third `inspector-panel-utils.ts` helper slice.
  - A direct `inspector-panel.tsx` conversion was attempted, the initial `tsc` pass surfaced a large volume of UI component signature noise, and the rename was intentionally rolled back before landing so the worktree could return to a passing `typecheck` / targeted-test state.
  - `npm run typecheck` passed again after rolling the experimental `inspector-panel.tsx` rename back to `inspector-panel.jsx`.
  - `npm test -- src/components/command-center/inspector-panel.test.jsx src/components/command-center/file-preview-overlay.test.jsx` passed with `132` passing tests after rolling the experimental `inspector-panel.tsx` rename back.
  - `npm run typecheck` passed after deduplicating the third `inspector-panel-utils.ts` helper slice and keeping `inspector-panel.jsx` wired to the shared helper exports.
  - `npm test -- src/components/command-center/inspector-panel.test.jsx src/components/command-center/file-preview-overlay.test.jsx` passed with `132` passing tests after deduplicating the third `inspector-panel-utils.ts` helper slice.
  - `npm run typecheck` passed after extracting a fourth `inspector-panel-utils.ts` helper slice for session item keying, home-path compaction, absolute-path detection, and merged session file item shaping.
  - `npm test -- src/components/command-center/inspector-panel.test.jsx src/components/command-center/file-preview-overlay.test.jsx` passed with `132` passing tests after extracting the fourth `inspector-panel-utils.ts` helper slice.
  - `npm run typecheck` passed after extracting a fifth `inspector-panel-utils.ts` helper slice for file-manager action labeling and workspace-node path lookup.
  - `npm test -- src/components/command-center/inspector-panel.test.jsx src/components/command-center/file-preview-overlay.test.jsx` passed with `132` passing tests after extracting the fifth `inspector-panel-utils.ts` helper slice.
  - `npm run typecheck` initially failed when the first `inspector-panel-primitives.tsx` extraction hit the loose prop typings on shared UI wrappers; the extraction was kept and fixed with minimal TS interop shims instead of being rolled back.
  - `npm test -- src/components/command-center/inspector-panel.test.jsx src/components/command-center/file-preview-overlay.test.jsx` initially failed with `19` context-menu regressions after the first copy-button extraction because the main panel still referenced the `Copy` icon locally; the icon import was restored and the panel returned to green.
  - `npm run typecheck` passed after landing the first `inspector-panel-primitives.tsx` slice for `PanelEmpty`, `InspectorHint`, `TabCountBadge`, `DataList`, `TimelineDetailCard`, `CopyCodeButton`, and `HoverCopyValueButton`.
  - `npm test -- src/components/command-center/inspector-panel.test.jsx src/components/command-center/file-preview-overlay.test.jsx` passed with `132` passing tests after landing the first `inspector-panel-primitives.tsx` slice.
  - `npm run typecheck` initially failed when the first `inspector-panel-timeline.tsx` extraction hit the same loose prop typings on shared card wrappers; the slice was kept and stabilized with the same minimal TS interop pattern instead of being rolled back.
  - `npm test -- src/components/command-center/inspector-panel.test.jsx src/components/command-center/file-preview-overlay.test.jsx` passed with `132` passing tests while the first `inspector-panel-timeline.tsx` slice was still being type-stabilized, confirming the render behavior stayed intact during the extraction.
  - `npm run typecheck` passed after landing the first `inspector-panel-timeline.tsx` slice for `ToolIoCodeBlock`, `ToolCallTimeline`, and `RelationshipCard`.
  - `npm test -- src/components/command-center/inspector-panel.test.jsx src/components/command-center/file-preview-overlay.test.jsx` passed with `132` passing tests after landing the first `inspector-panel-timeline.tsx` slice.
  - `npm run typecheck` initially failed when the second `inspector-panel-timeline.tsx` slice moved `TimelineItemCard` / `TimelineTab` and hit the same shared button-wrapper prop typing noise; the slice was stabilized with the established interop pattern instead of being rolled back.
  - `npm test -- src/components/command-center/inspector-panel.test.jsx src/components/command-center/file-preview-overlay.test.jsx` temporarily failed with `9` timeline regressions while `TimelineTab` was missing the injected `getItemKey` callback; the missing wiring was restored and the targeted suite returned to green.
  - `npm run typecheck` passed after landing the second `inspector-panel-timeline.tsx` slice for `TimelineItemCard` and `TimelineTab`.
  - `npm test -- src/components/command-center/inspector-panel.test.jsx src/components/command-center/file-preview-overlay.test.jsx` passed with `132` passing tests after landing the second `inspector-panel-timeline.tsx` slice.
  - `npm run typecheck` passed after extending `inspector-panel-primitives.tsx` with `EnvironmentSectionCard`, `FileGroupSection`, and `FileFilterInput`.
  - `npm test -- src/components/command-center/inspector-panel.test.jsx src/components/command-center/file-preview-overlay.test.jsx` passed with `132` passing tests after extending `inspector-panel-primitives.tsx` with the section-level environment/files primitives.
  - `npm run typecheck` passed after extending `inspector-panel-primitives.tsx` with `OpenClawOnboardingSelectField` and `OpenClawRemoteNotice`.
  - `npm test -- src/components/command-center/inspector-panel.test.jsx src/components/command-center/file-preview-overlay.test.jsx` passed with `132` passing tests after extending `inspector-panel-primitives.tsx` with the onboarding/remote-notice primitives.
  - `npm run typecheck` initially failed when the first `inspector-panel-files.tsx` extraction met the stricter `InspectorFileNode` helper signatures from `inspector-files-panel-utils.ts`; the new file-tree module was kept and stabilized with narrow boundary casts instead of being rolled back.
  - `npm test -- src/components/command-center/inspector-panel.test.jsx src/components/command-center/file-preview-overlay.test.jsx` passed with `132` passing tests while the `inspector-panel-files.tsx` slice was being type-stabilized, confirming the file-tree rendering behavior stayed intact during extraction.
  - `npm run typecheck` passed after landing the first `inspector-panel-files.tsx` slice for `FileLink`, `WorkspaceTreeNode`, and `SessionTreeNode`.
  - `npm test -- src/components/command-center/inspector-panel.test.jsx src/components/command-center/file-preview-overlay.test.jsx` passed with `132` passing tests after landing the first `inspector-panel-files.tsx` slice.
  - `npm run typecheck` passed after landing the first `inspector-panel-file-menu.tsx` slice for `FileContextMenu`.
  - `npm test -- src/components/command-center/inspector-panel.test.jsx src/components/command-center/file-preview-overlay.test.jsx` temporarily failed after the `FileContextMenu` extraction because the main panel still needed `apiFetch` for `requestWorkspaceTree`; the missing import was restored and the targeted suite returned to green.
  - `npm test -- src/components/command-center/inspector-panel.test.jsx src/components/command-center/file-preview-overlay.test.jsx` passed with `132` passing tests after landing the first `inspector-panel-file-menu.tsx` slice.
  - `npm run typecheck` passed after landing the first `inspector-panel-file-sections.tsx` slice for the session/workspace `FilesTab` render sections.
  - `npm test -- src/components/command-center/inspector-panel.test.jsx src/components/command-center/file-preview-overlay.test.jsx` temporarily failed with `1` session-filter regression after the first `inspector-panel-file-sections.tsx` extraction because the session section no longer matched the original open/empty-state structure closely enough; the section was brought back in line with the original `FilesTab` behavior and the targeted suite returned to green.
  - `npm test -- src/components/command-center/inspector-panel.test.jsx src/components/command-center/file-preview-overlay.test.jsx` passed with `132` passing tests after landing the first `inspector-panel-file-sections.tsx` slice.
  - A second whole-file `inspector-panel.tsx` attempt was tried after the latest preparatory slices landed, but `tsc` still surfaced a concentrated wall of shared UI wrapper typing noise plus a smaller set of OpenClaw state-shape issues; the rename was rolled back instead of leaving the worktree red.
  - `npm run typecheck` passed again after rolling the second experimental `inspector-panel.tsx` rename back to `inspector-panel.jsx`.
  - `npm test -- src/components/command-center/inspector-panel.test.jsx src/components/command-center/file-preview-overlay.test.jsx` passed with `132` passing tests after rolling the second experimental `inspector-panel.tsx` rename back.
  - `npm run typecheck` passed after extracting a typed onboarding form-state normalization helper into `inspector-panel-utils.ts`.
  - `npm test -- src/components/command-center/inspector-panel.test.jsx src/components/command-center/file-preview-overlay.test.jsx` passed with `132` passing tests after switching `OpenClawOnboardingPanel` to the normalized onboarding form-state helper.
  - `npm run typecheck` passed after extracting a typed config form-state normalization helper into `inspector-panel-utils.ts`.
  - `npm test -- src/components/command-center/inspector-panel.test.jsx src/components/command-center/file-preview-overlay.test.jsx` passed with `132` passing tests after switching `OpenClawConfigPanel` to the normalized config form-state helper.
  - A third whole-file `inspector-panel.tsx` attempt was made after the shared UI surface aliases and OpenClaw form-state normalization helpers landed; the remaining `tsc` errors had narrowed to a dozen concrete items instead of the earlier wall of wrapper noise.
  - `npm run typecheck` passed after keeping the `inspector-panel.tsx` rename, narrowing a few remaining `unknown` / callback parameter issues, and switching the panel to the shared `inspector-panel-surfaces.ts` wrapper aliases.
  - `npm test -- src/components/command-center/inspector-panel.test.jsx src/components/command-center/file-preview-overlay.test.jsx` passed with `132` passing tests after landing the `inspector-panel.tsx` conversion.
  - `npm run typecheck:server` and `npm run build:server` passed after landing the server runtime bootstrap plus the first `server/core/*`, `server/http/*`, and `server/formatters/*` TypeScript slices.
  - `npm test -- test/runtime-hub.test.js server/routes/runtime-ws.test.js test/runtime-ws.test.js` passed after landing `server/services/runtime-hub.ts` and `server/routes/runtime-ws.ts`.
  - `npm test -- server/routes/chat.test.js test/chat-route.test.js test/server-http.test.js` passed after landing `server/routes/chat.ts`.
  - `npm test -- server/services/openclaw-client.test.js test/openclaw-client.test.js` passed after landing `server/services/openclaw-client.ts`.
  - `npm test -- test/file-manager-route.test.js` passed after landing `server/routes/file-manager.ts`.
  - `npm test -- server/services/dashboard.test.js test/dashboard.test.js test/transcript.test.js` passed after landing `server/services/dashboard.ts`.
  - `npm test -- server/services/openclaw-management.test.js` passed after landing `server/services/openclaw-management.ts`.
  - `npm test -- server/services/openclaw-update.test.js server/services/openclaw-management.test.js` passed after landing `server/services/openclaw-update.ts`.
  - `npm test -- server/services/openclaw-facade.test.js server/services/openclaw-update.test.js server/services/openclaw-management.test.js` passed after landing `server/services/openclaw-facade.ts`.
  - `npm test -- server/services/openclaw-operations.test.js server/services/openclaw-facade.test.js server/services/openclaw-update.test.js server/services/openclaw-management.test.js` passed after landing `server/services/openclaw-operations.ts`.
  - `npm test -- server/services/lalaclaw-update.test.js server/routes/lalaclaw-update.test.js server/routes/lalaclaw-update-dev.test.js` passed after landing `server/services/lalaclaw-update.ts`.
  - `npm test -- server/services/dev-workspace-restart.test.js server/routes/dev-workspace-restart.test.js` passed after landing `server/services/dev-workspace-restart.ts`.
  - `npm test -- server/services/lalaclaw-update-runner.test.js server/services/lalaclaw-update.test.js server/routes/lalaclaw-update.test.js server/routes/lalaclaw-update-dev.test.js` passed after landing `server/services/lalaclaw-update-runner.ts`.
  - `npm test -- server/services/openclaw-config.test.js server/routes/openclaw-config.test.js server/services/openclaw-facade.test.js server/services/openclaw-operations.test.js server/services/openclaw-update.test.js server/services/openclaw-management.test.js` passed after landing `server/services/openclaw-config.ts`.
  - `npm test -- server/services/openclaw-onboarding.test.js server/routes/openclaw-onboarding.test.js` passed after landing `server/services/openclaw-onboarding.ts`.
  - `npm run typecheck:server` and `npm run build:server` passed after landing `server/services/index.ts`, at which point `server/services/transcript.js` became the last remaining production JS file in `server/services/`.
  - `node -e "const { createAppServer } = require('./server.js'); ..."` passed repeatedly as `server smoke ok` throughout the backend slices, including after the runtime/chat transport migrations.
  - A whole-file `server/services/transcript.ts` attempt was made, surfaced a wide domain-shape type wall, and was intentionally rolled back before landing; `npm run typecheck:server` passed again after the rollback.
  - `server/services/transcript.ts` is now successfully landed after re-opening the transcript slice with a compatibility-first TypeScript pass instead of another strict/domain-heavy rewrite attempt.
  - `npm run typecheck:server` and `npm run build:server` passed after landing `server/services/transcript.ts`.
  - `npm test -- server/services/transcript.test.js test/transcript.test.js` passed with `39` passing tests after switching the transcript regressions from CommonJS `require('./transcript')` to direct TS imports.
  - `npm test -- server/services/dashboard.test.js test/dashboard.test.js` passed with `13` passing tests after revalidating the dashboard/transcript read-model chain against the landed `server/services/transcript.ts`.
  - `npm test -- test/server-http.test.js` passed with `6` passing tests and `1` skipped test after tightening `server/core/config.ts` and `server/core/app-context.ts` to import `openclaw-operations` through real TS imports instead of source-level `require()` calls that Vitest could not resolve once the OpenClaw services had moved to `.ts`.
  - `node -e "const { createAppServer } = require('./server.js'); ..."` passed again as `server smoke ok` after the transcript landing and the `config.ts` / `app-context.ts` source-test interop fix.

### Current Migration Pattern

The working pattern for this migration is now:

1. Add or extend shared types in `src/types/*`.
2. Migrate one stateful module from `.js` to `.ts`.
3. Keep imports extensionless so JS callers keep working.
4. Run `npm run typecheck` plus the tightest high-signal tests for that slice.
5. Update this plan document before moving to the next slice.

## Current State

- Phase 1 is functionally established.
- Phase 2 is partially established through shared chat and runtime contracts.
- Phase 3 is actively underway.
- The storage and runtime snapshot slices are the current reference implementations for future JS -> TS migrations.
- `app-storage`, `use-runtime-snapshot`, `use-chat-controller`, `app-session`, and `use-app-hotkeys` are now all migrated to TypeScript.
- `use-app-persistence` is now also migrated to TypeScript, so the UI-state persistence path is typed end-to-end with `app-storage`.
- `use-runtime-socket` is now also migrated to TypeScript, so the runtime snapshot layer and its underlying WS transport are both typed.
- `use-stale-running-detector` is now also migrated to TypeScript, so the chat panel's runtime busy-warning hook is typed too.
- `use-prompt-history` is now also migrated to TypeScript, so the command-center composer history flow is typed too.
- `use-openclaw-inspector` is now fully migrated to TypeScript.
- `use-command-center` is now fully migrated to TypeScript.
- The backend runtime strategy is now no longer theoretical; the repository can compile and boot a mixed TS/JS `server/` tree through the `server.js` bootstrap plus `.server-build`.
- The first backend foundation slices are now migrated to TypeScript in `server/core/*` and `server/http/*`, which creates a proven pattern for continuing into routes and services without changing the external `node server.js` startup contract.
- `server/auth/access-control.ts` is now also landed in TypeScript, so the auth/login/origin-check boundary attached directly to the server entry path is no longer a JS island.
- `server/routes/workspace-tree.ts` is now also landed in TypeScript, which extends the server migration from small JSON/action routes into a medium-sized filesystem traversal route with path safety, filtering, and tree shaping logic.
- `server/routes/file-preview.ts` is now also landed in TypeScript, which extends the backend migration into the preview/conversion path for text, spreadsheet, office, image, media, and editable file flows.
- `server/routes/runtime-ws.ts` is now also landed in TypeScript, which moves the backend migration onto the runtime WebSocket upgrade/subscription path without yet touching `runtime-hub` internals.
- The main remaining JS/JSX migration surface is now concentrated in a handful of large command-center components instead of being spread across feature barrels and smaller hooks.
- The migration focus can now shift from the highest-risk state/controllers into the smaller Phase 4 UI/component surfaces before attempting the very largest UI files.
- Phase 4 has now begun through small helper modules instead of large panels.
- Phase 4 now also includes at least one medium-sized component surface (`markdown-content.tsx`), not only helper modules.
- Phase 4 now has typed coverage for several command-center helper surfaces used by larger panels, including clipboard handling.
- Phase 4 now also has typed coverage for the shared file-preview hook used by both `inspector-panel` and `chat-panel`.
- Phase 4 now also has typed coverage for the lobster motion tuning helper consumed by `session-overview`.
- Phase 4 now also includes a first small presentational TSX component conversion through `header-bar.tsx`.
- Phase 4 now also includes a typed dialog surface through `context-preview-dialog.tsx`, not only helpers and tiny UI shells.
- Phase 4 now also includes a typed reusable menu/control surface through `selection-menu.tsx`.
- Phase 4 now also includes the shared markdown rendering surface through `markdown-renderer.tsx`, which meaningfully reduces the remaining risk before `chat-panel` and `inspector-panel`.
- Phase 4 now also includes the file preview surface through `file-preview-overlay.tsx`, so the remaining large component work is more concentrated around `session-overview`, `chat-panel`, and `inspector-panel`.
- Phase 4 now also includes the session/status surface through `session-overview.tsx`, so the remaining largest UI work is increasingly concentrated in `chat-panel` and `inspector-panel`.
- Phase 4 now also includes a typed tree/path helper boundary for inspector file browsing through `inspector-files-panel-utils.ts`, reducing the amount of untyped logic still embedded inside `inspector-files-panel.jsx`.
- Phase 4 now also includes the full `inspector-files-panel.tsx` conversion, so both the inspector-side file tree logic and the file-preview overlay that embeds it now sit on typed boundaries.
- `inspector-panel.jsx` itself is still JS, but it now reuses the typed path/tree helper boundary from `inspector-files-panel-utils.ts` instead of maintaining a second divergent copy of that logic.
- `inspector-panel.jsx` now also reuses a first typed `inspector-panel-utils.ts` helper boundary for diagnostics, environment grouping, and OpenClaw management status rendering instead of keeping all of that logic inline.
- `inspector-panel.jsx` now also reuses a second typed `inspector-panel-utils.ts` helper boundary for OpenClaw config field metadata, outcome badges, and onboarding option/capability formatting, which further reduces the amount of panel-local decision logic still living in the main JSX file.
- `inspector-panel.jsx` now also reuses a third typed `inspector-panel-utils.ts` helper boundary for update troubleshooting guidance, timestamp formatting, JSON detection, and relationship display labels.
- The `inspector-panel-utils.ts` boundary is now carrying multiple independent helper groups, so the remaining work inside `inspector-panel.jsx` is increasingly concentrated in render-heavy panel composition instead of data shaping and label logic.
- The third `inspector-panel-utils.ts` helper slice has now also been deduplicated and revalidated, so the shared helper boundary is stable instead of carrying accidental repeated exports from the exploratory extraction pass.
- `inspector-panel.jsx` now also reuses a fourth typed `inspector-panel-utils.ts` helper boundary for session item keying, path compaction, absolute-path checks, and session file item merge/build logic, which removes another cluster of panel-local data shaping from the JSX file.
- The frontend production app surface is effectively migrated, so the main remaining migration frontier has now shifted to bounded backend slices rather than additional `src/` production modules.
- `server/services/transcript.ts` is now also landed, so the backend service layer no longer has a remaining production JS island under `server/services/`.
- The current server-side migration frontier is no longer "finish the last JS service"; it has shifted to stabilization, broader validation, and cleanup of source-test interop edges that still depend on CommonJS-style `require()` inside migrated TS modules.
- A first explicit backend stabilization pass is now underway after the transcript landing, focused on source-test interop instead of new product behavior.

### Backend Progress

- `server/entry.ts` now holds the actual server app/bootstrap implementation that used to live directly in the root `server.js`.
- The root `server.js` is now a runtime bootstrap that compiles the server tree and then loads the emitted server entry.
- `vite.config.mjs` now excludes `.server-build/**` from Vitest discovery so emitted files do not get double-run by the test harness.
- `server/core/config.test.js` was updated to load the TS module shape cleanly.
- New backend regression coverage now exists for:
  - `server/core/session-key.test.js`
  - `server/core/session-store.test.js`
  - `server/http/http-utils.test.js`
  - `server/services/lalaclaw-service-status.test.js`
  - `server/routes/openclaw-history.test.js`
  - `server/routes/runtime.test.js`
  - `server/routes/lalaclaw-update.test.js`
  - `server/routes/openclaw-management.test.js`
  - `server/routes/openclaw-update.test.js`
  - `server/routes/lalaclaw-update-dev.test.js`
  - `server/routes/dev-workspace-restart.test.js`
  - `server/routes/openclaw-config.test.js`
  - `server/routes/openclaw-onboarding.test.js`
  - `server/routes/session.test.js`
  - `test/access-auth.test.js`
  - `test/workspace-tree-route.test.js`
  - `test/file-preview-route.test.js`
  - `server/routes/runtime-ws.test.js`
  - `test/runtime-ws.test.js`
  - `test/runtime-hub.test.js`
- existing formatter regressions now run directly against:
  - `server/formatters/chat-commands.ts`
  - `server/formatters/chat-format.ts`
  - `server/formatters/usage-format.ts`

## Next Execution Slice

The backend migration is no longer in the "bounded route leaves only" phase.

Recommended order:

1. Use the now-landed `server/routes/runtime-ws.ts`, `server/services/runtime-hub.ts`, and `server/core/app-context.ts` trio as the reference pattern for orchestration-grade backend slices.
2. The next most coherent slices are the remaining server production JS islands outside the main chat/runtime path:
   - `server/services/dashboard.js`
   - `server/services/transcript.js`
   - the OpenClaw operations service helpers that still sit behind already-migrated routes
3. `server/routes/file-manager.ts` is now also landed, so the remaining work is increasingly concentrated in read-model and operations services rather than request-entry routes.
4. Keep using `npm run typecheck:server`, `npm run build:server`, targeted backend Vitest files, and the server smoke command after each server slice.
5. For any further WebSocket/runtime work, keep the AGENTS Phase 2 priorities intact: shared session-key parsing first, IM/runtime subscription consistency second, delivery-routed event preference third, direct patch protocol stabilization last.

Recent progress note:

- The formatter leaf modules are now also migrated to TypeScript and validated without changing the external `node server.js` runtime contract.
- The `lalaclaw-service-status` service leaf is now also migrated to TypeScript with a first dedicated regression test, which confirms the new backend path also works for JSON/package imports, env-driven path resolution, and small service modules.
- Two small route leaves are now also migrated to TypeScript:
  - `server/routes/openclaw-history.ts`
  - `server/routes/runtime.ts`
- Those route slices confirmed that the mixed server tree can keep consuming the new TS modules from the existing app context/runtime bootstrap without changing the public HTTP surface.
- Two additional small route leaves are now also migrated to TypeScript:
  - `server/routes/lalaclaw-update.ts`
  - `server/routes/openclaw-management.ts`
- Those two slices keep the same request/response behavior and structured error-code behavior while proving that the route layer can keep consuming typed body helpers and service results without changing the external HTTP contract.
- Three more operational route leaves are now also migrated to TypeScript:
  - `server/routes/openclaw-update.ts`
  - `server/routes/lalaclaw-update-dev.ts`
  - `server/routes/dev-workspace-restart.ts`
- Those three slices further confirm that the current server TS path works not only for simple GET routes, but also for POST/DELETE handlers that fan out into service calls while preserving existing status codes and payload shapes.
- Two more OpenClaw route leaves plus the thicker session route are now also migrated to TypeScript:
  - `server/routes/openclaw-config.ts`
  - `server/routes/openclaw-onboarding.ts`
  - `server/routes/session.ts`
- The `session.ts` conversion is the first route slice in this backend phase that is no longer tiny; it coordinates model/agent preference updates, gateway patches, and snapshot refreshes. Its successful landing is the current upper bound of the bounded-route strategy before the migration steps into auth, websocket, preview, or larger service orchestration.
- The auth boundary is now also migrated:
  - `server/auth/access-control.ts`
- During the auth slice, `server/http/http-utils.ts` and `server/http/index.ts` were tightened from CommonJS-style TS files into real TS `import` / `export` modules so Vitest could load the HTTP helpers directly without ESM/CJS interop failures.
- That auth slice is an important checkpoint because it proves the current server TS path still holds when the migrated module sits directly on the app-entry request path rather than behind a small leaf route factory.
- A first medium-sized filesystem route is now also migrated:
  - `server/routes/workspace-tree.ts`
- That route matters because it is more stateful than the earlier action/history/config leaves: it does path normalization, workspace-root enforcement, filter compilation, recursive tree shaping, and directory metadata. Its successful landing shows the current server TS path can still handle moderate filesystem orchestration without yet stepping into preview conversion, websocket transport, or runtime hub complexity.
- A second, larger filesystem/preview route is now also migrated:
  - `server/routes/file-preview.ts`
- That route is a meaningful escalation from `workspace-tree.ts`: it covers preview-type detection, spreadsheet shaping, office/pdf conversion, HEIC conversion, binary/media passthrough, and editable text save flows. Its successful landing is the clearest signal so far that the current server TS path can handle medium-complexity filesystem pipelines while still staying short of WebSocket/chat/runtime orchestration.
- The runtime WebSocket route is now also migrated:
  - `server/routes/runtime-ws.ts`
- That slice matters because it is the first backend move that touches the WebSocket phase-follow-up area called out in AGENTS. During the migration, the old optional `require('ws')` fallback path caused the real WebSocket handshake test to silently use a dummy fallback server under Vitest; this was fixed by switching the route to a real TS `import { WebSocketServer } from 'ws'`, after which both the route-local and higher-level WebSocket regressions returned to green.
- The runtime hub service is now also migrated:
  - `server/services/runtime-hub.ts`
- That slice matters because it is the first backend move that converts a true orchestration-heavy runtime service instead of a route leaf. It now carries the shared session-key parsing, channel subscription lifecycle, direct patch fan-out, gateway event routing, and polling fallback logic under TypeScript without changing the external runtime WebSocket contract.
- During the runtime-hub slice, two migration-specific regressions were caught and fixed before the slice was considered landed:
  - `server/core/session-key.ts` had to be tightened into a real named TS export so the new service import path would stop relying on script-scope globals
  - `test/runtime-hub.test.js` initially kept using `createRequire(...)`, which bypassed Vitest's TS dependency pipeline; switching the test to a direct ESM import was required so the `runtime-hub.ts` -> `session-key.ts` chain could be validated as real source TS rather than as a Node fallback path
- The runtime-hub slice also satisfies the AGENTS WebSocket Phase 2 routing-test expectation with dedicated regressions that already cover:
  - command-center session routing
  - IM JSON `sessionUser` routing without string-splitting corruption
  - bootstrap IM session routing
  - malformed session-key fallback refresh behavior
- The app-context assembly layer is now also migrated:
  - `server/core/app-context.ts`
- That slice matters because it is the first successful full-file move of the server's main composition root. It now wires together the already-migrated auth, HTTP, runtime route, runtime hub, session route, preview route, OpenClaw operations services, and transcript/dashboard services under TypeScript without changing the public `node server.js` startup contract.
- During the app-context slice, one migration-specific regression was caught and fixed before the slice was considered landed:
  - `test/server-http.test.js` still loaded TS modules through `createRequire(...)`, which bypassed Vitest's TS transform pipeline; the test was updated to keep CommonJS `require()` for JS modules while switching the migrated TS modules to direct ESM imports
- The chat route is now also migrated:
  - `server/routes/chat.ts`
- That slice matters because it is the main HTTP/NDJSON facade for local slash commands, session preference patching, OpenClaw dispatch, streaming deltas, stop handling, and local conversation persistence. With `chat.ts` landed, the remaining server-side chat risk is now concentrated much more clearly in `server/services/openclaw-client.js`.
- During the chat slice, one migration-specific regression was caught and fixed before the slice was considered landed:
  - the chat-related route/integration tests still loaded migrated TS modules through `createRequire(...)`; they were updated to import `chat.ts`, `session.ts`, and the migrated HTTP/config helpers through Vitest's source-TS pipeline instead of Node's CommonJS fallback path
- The OpenClaw transport/service boundary is now also migrated:
  - `server/services/openclaw-client.ts`
- That slice matters because it carries the highest-risk remaining server transport logic from the AGENTS Phase 2 area: delivery-routed gateway event streams, delta/final/error handling, silent-gap polling fallback, mirrored IM message delivery, gateway SDK loading, and direct HTTP fallback behavior.
- During the openclaw-client slice, two migration-specific regressions were caught and fixed before the slice was considered landed:
  - the module needed a broad but compatibility-first TS option/error shape layer so the migration would tighten the service boundary without forcing a transport refactor
  - the direct openclaw-client tests originally loaded the service through `createRequire(...)` and a mixed JS barrel; they were moved to direct TS imports, and the downstream `dashboard` / `transcript` tests were updated to import their leaf service modules instead of the barrel so the source-test graph would not break when `openclaw-client.js` disappeared
- The openclaw-client slice now has explicit green regression coverage for the AGENTS-required transport cases:
  - delivery-routed event streams
  - delta / final / error handling
  - polling fallback and silent-gap recovery
- The file-manager route is now also migrated:
  - `server/routes/file-manager.ts`
- That slice matters because it removes one more app-context-facing JS route boundary while keeping the scope small: reveal, paste, clipboard upload, source-path copy, and rename flows now run through a typed route module instead of an untyped filesystem helper.
- During the file-manager slice, the only migration-specific issue was TypeScript's narrowing around path validation unions; that was resolved by making the route's validation helpers return explicit typed result shapes rather than by changing runtime behavior.
- The dashboard read-model service is now also migrated:
  - `server/services/dashboard.ts`
- That slice matters because it proves the current server TS path also works for session/read-model aggregation that sits above transcript projection and below the app-context composition root.
- The OpenClaw management and update service leaves are now also migrated:
  - `server/services/openclaw-management.ts`
  - `server/services/openclaw-update.ts`
- Those slices matter because the already-migrated OpenClaw routes no longer fan out into JS service islands for health checks, command summaries, install/update guidance, or post-command state inspection.
- During the `openclaw-update.ts` slice, one migration-specific regression was caught and fixed before the slice was considered landed:
  - the first TS pass still used `require('./openclaw-management')`, which let `typecheck:server` pass but caused the direct Vitest service import to fail until it was switched to a real TS import
- The OpenClaw facade orchestration layer is now also migrated:
  - `server/services/openclaw-facade.ts`
- That slice matters because it is the first typed orchestration boundary above the already-migrated OpenClaw management/update/config/onboarding services, including remote/local mutation blocking, operation-history recording, and rollback metadata shaping.
- The OpenClaw operations utility layer is now also migrated:
  - `server/services/openclaw-operations.ts`
- That slice matters because the newly typed OpenClaw facade/config/update flows no longer depend on a JS-only persistence/history/backup helper layer for remote-target detection, operation history, or rollback snapshot storage.
- The LalaClaw self-update service chain is now also partially migrated beyond the route leaf:
  - `server/services/lalaclaw-update.ts`
  - `server/services/lalaclaw-update-runner.ts`
- Those slices matter because the npm stable-tag check, job-state persistence, mock-preview flow, detached worker launch, and worker-side status-file updates are now typed end-to-end instead of stopping at the route boundary.
- The dev-workspace restart service is now also migrated:
  - `server/services/dev-workspace-restart.ts`
- That slice matters because it proves the current server TS path also works for git/worktree discovery plus detached helper-process scheduling, not only for HTTP/OpenClaw transport and state services.
- The OpenClaw config and onboarding service layers are now also migrated:
  - `server/services/openclaw-config.ts`
  - `server/services/openclaw-onboarding.ts`
- Those slices matter because the remaining OpenClaw service surface is no longer split between typed routes/facades and JS-only service logic. Config snapshot loading, config patch/rollback, onboarding capability detection, and onboarding command orchestration are now all on the TS side.
- The `server/services/index.ts` barrel is now also migrated.
- That slice mattered as a bookkeeping checkpoint because it isolated `server/services/transcript.js` as the last remaining production JS file under `server/services/`.
- A direct `server/services/transcript.ts` whole-file conversion was first attempted and intentionally rolled back before landing.
- That rollback is a real part of the process log: the first attempt surfaced a broad domain-shape typing wall across transcript/projector payloads, so the rename was reverted to keep the worktree green instead of leaving a half-converted large service behind.
- The transcript service is now also migrated:
  - `server/services/transcript.ts`
- That slice matters because it closes the last remaining production JS island under `server/services/` and brings the server-side transcript/projector boundary into the same TS path as dashboard, app-context, chat, and runtime-hub.
- The successful transcript landing used a compatibility-first pattern rather than a domain-model rewrite:
  - the file was renamed to `.ts`
  - the projector factory and its broad helper inputs were widened with `LooseRecord`-style compatibility annotations instead of introducing a large new transcript type hierarchy
  - a small number of source-test interop issues were then fixed by moving the transcript regressions and the `openclaw-operations` imports used by `config.ts` / `app-context.ts` onto real TS imports
- The first backend stabilization slice after the transcript landing is now also partially landed:
  - `test/config.test.js`
  - `test/session-store.test.js`
  - `test/session-key.test.js`
  - `test/session-route.test.js`
  - `test/file-preview-route.test.js`
  - `test/runtime-ws.test.js`
  - `test/workspace-tree-route.test.js`
  - `server/routes/dev-workspace-restart.test.js`
  - `server/routes/lalaclaw-update.test.js`
  - `server/routes/session.test.js`
  - `server/routes/openclaw-config.test.js`
  - `server/routes/runtime-ws.test.js`
  - `server/routes/openclaw-update.test.js`
  - `server/routes/openclaw-onboarding.test.js`
  - `server/routes/runtime.test.js`
  - `server/routes/openclaw-management.test.js`
  - `server/routes/openclaw-history.test.js`
  - `server/routes/lalaclaw-update-dev.test.js`
- That stabilization slice keeps behavior unchanged and only removes `createRequire(...)` / `require('./*.ts')` style test entrypoints in favor of direct TS imports, so the source-test graph is less dependent on CommonJS fallback resolution.
- During the transcript slice, two migration-specific regressions were caught and fixed before the slice was considered landed:
  - the first `tsc` pass surfaced a long but shallow wall of `{}` / `unknown` inference errors across payload/session-search helpers; these were collapsed by annotating the broad projector entry points instead of by changing runtime behavior
  - the transcript and dashboard regressions initially failed because they still loaded `./transcript` through CommonJS `require()`; they were switched to direct TS imports, and the same source-test compatibility issue was then fixed for `openclaw-operations` in `config.ts` / `app-context.ts` when `test/server-http.test.js` exposed it
- A follow-up stabilization experiment was also tried after the transcript landing:
  - `server/core/index.ts` was temporarily converted into a real TS barrel
  - `server/entry.ts` was temporarily converted to real TS imports from `./core`
- That experiment was intentionally rolled back in the same workstream instead of being left half-landed:
  - `config.ts` and `app-context.ts` still expose their server entry contracts through CommonJS-style module shapes, so `server/entry.ts` could not yet consume `HOST`, `PORT`, and `createAppContext` through real named imports without first converting those deeper modules
  - the rollback restored the passing `typecheck:server`, `build:server`, `test/server-http.test.js`, and server smoke state before the slice was considered complete
- The stabilization pass has also already proven that the lower-risk path is test-entry cleanup rather than deeper runtime-entry cleanup:
  - `npm test -- test/config.test.js test/session-store.test.js test/session-key.test.js test/session-route.test.js test/file-preview-route.test.js test/runtime-ws.test.js test/workspace-tree-route.test.js` passed after switching those tests to direct TS imports
  - `npm test -- server/routes/dev-workspace-restart.test.js server/routes/lalaclaw-update.test.js server/routes/session.test.js server/routes/openclaw-config.test.js server/routes/runtime-ws.test.js server/routes/openclaw-update.test.js server/routes/openclaw-onboarding.test.js server/routes/runtime.test.js server/routes/openclaw-management.test.js server/routes/openclaw-history.test.js server/routes/lalaclaw-update-dev.test.js` passed after switching the route-local tests from `require('./*.ts')` to direct TS imports
  - `npm test -- server/core/config.test.js server/core/session-key.test.js server/core/session-store.test.js server/http/http-utils.test.js server/services/openclaw-config.test.js server/services/openclaw-onboarding.test.js server/services/openclaw-facade.test.js server/services/openclaw-operations.test.js server/services/lalaclaw-update.test.js server/services/dev-workspace-restart.test.js server/services/lalaclaw-update-runner.test.js` passed as a broader stabilization guard while the import cleanup work was landing
  - `npm test -- test/access-auth.test.js test/server.test.js test/server-http.test.js` passed after keeping `require("../server")` as the single top-level runtime entry while moving only the migrated leaf modules to direct TS imports
- The stabilization pass also surfaced and fixed a real runtime bug in the compiled backend path:
  - `server/core/config.ts` previously computed `PROJECT_ROOT` as `path.resolve(__dirname, '..', '..')`, which is correct in source but wrong once the server is emitted under `.server-build/server/**`
  - that bug leaked into `DIST_DIR` and transcript/file path normalization, causing the compiled runtime to treat `.server-build` as the project root
  - the fix now detects the `.server-build` case and lifts `PROJECT_ROOT` back to the real repository root before deriving `PUBLIC_DIR` / `DIST_DIR`
  - `npm run typecheck:server`, `npm run build:server`, `npm test -- test/server.test.js test/access-auth.test.js test/server-http.test.js`, and the server smoke command all passed after that fix landed
- The stabilization pass then extended one step further into the CLI/runtime boundary:
  - `shared/lalaclaw-service-status.cjs` now holds the JS-compatible launchd/service-status helper logic used by both the CLI and the typed server service layer
  - `server/services/lalaclaw-service-status.ts` now wraps that shared helper through a source/build-compatible path resolver instead of owning a separate implementation
  - `bin/lalaclaw.js` now consumes the shared helper instead of requiring a migrated TS server service path directly
  - `npm test -- test/lalaclaw-cli.test.js test/lalaclaw-cli-launchd.test.js server/services/lalaclaw-service-status.test.js` passed after that compatibility bridge landed
- A broader stabilization verification sweep has now also passed:
  - `npm test` passed with `74` passing test files, `975` passing tests, and `4` skipped tests after the transcript landing, compiled-runtime root fix, CLI compatibility bridge, and test-entry cleanup were all in place
  - `npm run build` passed after the same stabilization sweep, confirming the frontend production bundle still builds while the server-side static-dir/runtime-root fixes are in place
  - `npm run lint` now exits successfully after ignoring `.server-build/**`, aligning `server/**/*.test.js` with ESM parsing, and removing the remaining error-level unused imports/types introduced during the TS migration; the current lint surface is warning-only, not error-level red
- A follow-up frontend warning-reduction slice is now also landed on top of that stabilization sweep:
  - `src/lib/dev-workspace-page-reloader.ts` now holds the page reload bridge that `App.tsx` tests use, so `src/App.tsx` no longer exports non-component helpers and no longer trips Fast Refresh export warnings
  - `src/components/command-center/session-overview-utils.ts` now holds the exported aquatic-walker helper functions, so `src/components/command-center/session-overview.tsx` no longer mixes component exports with test-only helper exports
  - `src/components/command-center/inspector-panel-files.tsx` no longer exports an internal-only compact-directory renderer helper
  - `src/components/command-center/markdown-renderer.tsx` now uses a captured DOM container reference in the streaming-image cleanup path instead of reading `containerRef.current` again during teardown
  - `src/components/command-center/selection-menu.tsx`, `src/components/command-center/chat-panel.tsx`, `src/components/command-center/file-preview-overlay.tsx`, `src/features/app/controllers/use-command-center.ts`, and `src/features/session/runtime/use-runtime-snapshot.ts` now carry explicit hook dependencies / stable callbacks where the remaining lint warnings were purely structural rather than behavioral
- That warning-reduction slice stayed deliberately on the low-risk side:
  - it did not change transport logic, persistence shape, or runtime event semantics
  - it only extracted non-component exports, stabilized callback identities, or made existing hook dependencies explicit where the referenced values were already part of the current runtime behavior
- The broader verification sweep has now been rerun after that warning-reduction slice as well:
  - `npm run typecheck` passed
  - `npm run lint` passed with zero warnings and zero errors
  - `npm test -- src/App.test.jsx src/components/command-center/session-overview.test.jsx src/components/command-center/inspector-panel.test.jsx src/components/command-center/markdown-content.test.jsx` passed while the first structural extraction batch was landing
  - `npm test -- src/App.test.jsx src/components/command-center/chat-panel.test.jsx src/components/command-center/file-preview-overlay.test.jsx src/features/app/controllers/use-command-center.test.js src/features/session/runtime/use-runtime-snapshot.test.jsx src/features/session/runtime/use-runtime-snapshot.test.js` passed while the callback/dependency stabilization batch was landing
  - `npm test` passed again with `74` passing test files, `975` passing tests, and `4` skipped tests after the warning-reduction slice
  - `npm run build` passed again after the warning-reduction slice, confirming the final lint cleanup did not break the production frontend bundle
- A focused backend export-chain cleanup slice is now also landed after stabilization:
  - `server/core/config.ts` now exposes its runtime constants and helpers through real named TS exports instead of a trailing `module.exports` object
  - `server/core/session-store.ts` now exposes its store helpers through real named TS exports instead of a trailing `module.exports` object
  - `server/core/app-context.ts` now exports `createAppContext()` as a real TS export and consumes `config` / `session-store` through TS imports instead of `require()`
  - `server/core/index.ts` is now a real TS barrel built from `export *` statements instead of a `module.exports = { ...require(...) }` shim
  - `server/entry.ts` now imports `HOST`, `PORT`, and `createAppContext` through the typed core barrel and exports `createRequestHandler`, `createAppServer`, `startServer`, and `__test` through real TS exports
- That slice matters because it removes the last intentionally preserved CommonJS-shaped TS layer in the backend composition root:
  - the previous stabilization phase kept `config.ts`, `app-context.ts`, `core/index.ts`, and `entry.ts` in a compatibility-shaped state on purpose
  - this follow-up proves the server can now keep the stable `node server.js` bootstrap contract while still using a genuinely typed `server/core -> server/entry` export/import chain under `.server-build`
- The backend export-chain cleanup slice has already been validated with a high-signal server matrix:
  - `npm run typecheck:server` passed
  - `npm run build:server` passed
  - `npm test` passed again with `74` passing test files, `975` passing tests, and `4` skipped tests after the core export/import cleanup
  - `node -e "const { createAppServer } = require('./server.js'); ..."` returned `server smoke ok` after the same slice
- A release-artifact validation slice has now also been run after the migration/stabilization work, and it surfaced a real packaging/runtime bug before release:
  - `npm run test:coverage` passed after the post-migration cleanup, giving a broader regression signal for the now-cross-cutting TS/build/server changes
  - `npm run pack:release` initially succeeded, but the first clean-directory install/start smoke failed
  - the clean install was able to install `artifacts/lalaclaw-2026.3.21-2.tgz`, but starting the installed package failed with `Cannot find module 'typescript/bin/tsc'`
  - that failure was caused by `server.js` still assuming runtime server compilation via the local TypeScript dev dependency, which does not exist in a normal installed-package environment
- That release-artifact bug is now fixed:
  - `server.js` now prefers a local TypeScript compile only when `typescript/bin/tsc` is actually available
  - otherwise it falls back to a prebuilt `.server-build/server/entry.js`, and throws a clear error only if neither the compiler nor the prebuilt runtime is present
  - `package.json` now includes `.server-build/` in the published files list
  - `package.json` `prepack` now runs both `npm run build` and `npm run build:server`, so the tarball always contains the compiled server runtime needed by installed-package startup
- The release-artifact validation was then rerun successfully after that fix:
  - `npm run lint` passed
  - `npm test` passed with `74` passing test files, `975` passing tests, and `4` skipped tests
  - `npm run test:coverage` passed again after the packaging fix
  - `npm run build` passed
  - `npm run build:server` passed
  - `npm run pack:release` passed again, and the tarball now includes `.server-build/**`
  - a second clean-directory install of `artifacts/lalaclaw-2026.3.21-2.tgz` succeeded
  - the installed-package startup path succeeded with `COMMANDCENTER_FORCE_MOCK=1 ./node_modules/.bin/lalaclaw start --host 127.0.0.1 --port 4381`
  - the installed package then served the built app shell at `/` and returned a valid JSON snapshot at `/api/session`
- This is an important migration-process checkpoint:
  - without the tarball validation, the source checkout would have looked fully green while the installed package was still broken
  - the migration/stabilization phase is therefore now validated not only at source level but also at installed-artifact startup level
- A first post-migration strictness probe has now also been run on the backend:
  - `npx tsc -p tsconfig.server.json --noEmit --noImplicitAny` was used as a probe rather than as a new required gate
  - the first probe showed that `server/core/config.ts`, `server/core/app-context.ts`, and `server/entry.ts` were the smallest remaining typed-boundary issues before the much noisier `server/routes/chat.ts`, `server/routes/file-manager.ts`, `server/services/dashboard.ts`, `server/services/runtime-hub.ts`, and `server/services/transcript.ts` clusters
  - a tiny preparatory `server/core` slice is now landed: `server/entry.ts` has a typed unknown-error fallback instead of reading `.message` unsafely, `server/core/config.ts` no longer leaves the default-agent lookup callback implicit, and `server/core/app-context.ts` no longer leaves `resolveAgentDisplayName()` untyped
  - after those fixes, the `noImplicitAny` probe no longer reports `server/core/*` as the top failing cluster; the remaining noise is concentrated in larger routes/services instead
- The first post-core strictness slice is now also landed on a bounded server route:
  - `server/routes/file-manager.ts` now has explicit request/dependency/body/clipboard helper typings instead of relying on implicit `any` across the whole route
  - the route keeps its compatibility-first runtime shape: CommonJS `fs/path` loading is unchanged, request bodies still stay loose at the boundary, and only the route-local contracts were tightened
  - after that slice, the `noImplicitAny` probe no longer reports `server/routes/file-manager.ts`; the next remaining clusters were still led by `server/routes/chat.ts`, `server/services/dashboard.ts`, `server/services/runtime-hub.ts`, and `server/services/transcript.ts`
- The next bounded strictness slice is now also landed on a helper-heavy backend service:
  - `server/services/dashboard.ts` now has explicit helper parameter types, recursive environment-flattening return types, and a compatibility-first `createDashboardService()` options surface instead of relying on implicit `any` across the whole service boundary
  - this slice intentionally stayed broad-but-loose rather than trying to invent a new strict dashboard domain model; most callbacks and payloads still use `LooseRecord` at the service edge, while the noisiest implicit holes are now gone
  - after that slice, the `noImplicitAny` probe no longer reports `server/services/dashboard.ts`; the remaining high-noise clusters were then concentrated in `server/routes/chat.ts`, `server/services/runtime-hub.ts`, and `server/services/transcript.ts`
- The next bounded strictness slice is now also landed on the runtime/WebSocket orchestration layer:
  - `server/services/runtime-hub.ts` now has explicit snapshot/patch/channel/gateway-event/websocket-like helper shapes instead of relying on implicit `any` through the diff, patch, channel, and subscription pipeline
  - this slice stayed compatibility-first on purpose: it did not change gateway routing order, direct-patch heuristics, chat-delta handling, or lifecycle refresh behavior; it only made the existing contracts explicit enough for the stricter probe
  - after that slice, the `noImplicitAny` probe no longer reports `server/services/runtime-hub.ts`; the remaining major backend strictness clusters were then centered on `server/routes/chat.ts` and `server/services/transcript.ts`
- The next bounded strictness slice is now also landed on the chat transport route:
  - `server/routes/chat.ts` now has explicit request/dependency/message/preference/reply helper shapes instead of relying on implicit `any` across the chat stop handler, chat route dependencies, and streaming callback surface
  - this slice remained behavior-preserving on purpose: it did not change `/api/chat` transport mode selection, local persistence updates, session patch ordering, or streaming event emission; it only made the existing route contract explicit enough for the stricter probe
  - after that slice, the `noImplicitAny` probe no longer reports `server/routes/chat.ts`; the largest remaining backend strictness cluster is now concentrated in `server/services/transcript.ts`
- A first transcript-specific preparatory strictness slice is now also landed:
  - `server/services/transcript.ts` now has explicit top-level helper typings for session-path resolution, jsonl cache entries, transcript content extraction, user/assistant text cleanup, status parsing, directory previews, path normalization, and detected-file helper boundaries
  - this slice intentionally stopped before the transcript projector's deeper conversation/timeline/domain assembly logic; the goal was to peel off the low-risk helper layer first without pretending the remaining transcript work is just another routine parameter-annotation pass
  - after that slice, the `noImplicitAny` probe no longer starts at the very top of `transcript.ts`; the remaining transcript errors are now concentrated further down in conversation assembly, timeline/run shaping, and session identity projection
- That strictness-prep slice also surfaced an execution-process gotcha that is now recorded explicitly:
  - `npm run build:server` and any Vitest suite that reads `.server-build/**` should not be treated as parallel-safe validation steps
  - one combined run temporarily produced a false-negative `createOpenClawOnboardingService is not a function` failure in `test/server-http.test.js` while `.server-build` was being rewritten
  - rerunning the same server test matrix after `build:server` completed restored the expected green result, so the issue was validation ordering rather than a landed runtime regression
- During this slice, two migration-specific regressions were caught and fixed before the slice was considered landed:
  - the first formatter tests still resolved the old JS barrel and had to be pointed at the new TS files directly
  - `usage-format.ts` briefly introduced a `count` field into `parseTokenDisplay()` and stringified numeric timestamps too aggressively; both behaviors were restored to the original contract before landing
- `inspector-panel.jsx` now also reuses a fifth typed `inspector-panel-utils.ts` helper boundary for file-manager action labeling and workspace-node lookup, further shrinking the amount of platform-specific and tree-search logic still embedded in the panel file.
- `inspector-panel.jsx` now also reuses a first typed `inspector-panel-primitives.tsx` boundary for the simplest empty/hint/badge/list primitives and the copy-button controls, which is the first successful move from pure-helper extraction into lightweight component extraction on the inspector side.
- `inspector-panel.jsx` now also reuses a first typed `inspector-panel-timeline.tsx` boundary for the code-block, tool-call timeline, and relationship cards, so more of the timeline rendering surface has moved out of the main JSX file without reattempting a risky whole-file rename yet.
- `inspector-panel.jsx` now also reuses a second typed `inspector-panel-timeline.tsx` boundary for `TimelineItemCard` and `TimelineTab`, so the main panel file no longer owns most of the timeline rendering stack directly.
- `inspector-panel.jsx` now also reuses a larger `inspector-panel-primitives.tsx` boundary for section cards and file-group/filter controls, so more of the environment/files chrome is typed and shared outside the main JSX file.
- `inspector-panel.jsx` now also reuses typed onboarding and remote-notice primitives, so the remaining environment-side complexity is increasingly concentrated in OpenClaw flow orchestration instead of leaf UI controls.
- `inspector-panel.jsx` now also reuses a first typed `inspector-panel-files.tsx` boundary for `FileLink`, `WorkspaceTreeNode`, and `SessionTreeNode`, so most of the file-tree rendering stack is no longer embedded directly in the main JSX file.
- `inspector-panel.jsx` now also reuses a first typed `inspector-panel-file-menu.tsx` boundary for `FileContextMenu`, so the remaining files-side work in the main panel is increasingly concentrated in `FilesTab` state/orchestration instead of leaf interaction UI.
- `inspector-panel.jsx` now also reuses a first typed `inspector-panel-file-sections.tsx` boundary for the session/workspace `FilesTab` render sections, so most of the files-side rendering stack is now outside the main JSX file and the remaining `FilesTab` work is more clearly state/orchestration focused.
- The second full-file `inspector-panel.tsx` attempt was much more informative than the first one: the remaining blockers are no longer broad file-tree/timeline/render-surface issues, but a narrower cluster around shared UI wrapper typings and a handful of OpenClaw state/value shapes.
- `OpenClawOnboardingPanel` now also reads from a typed onboarding form-state normalization helper, so one of the remaining `.tsx` blocker clusters has already started shrinking without changing behavior.
- `OpenClawConfigPanel` now also reads from a typed config form-state normalization helper, so the remaining `.tsx` blocker cluster around OpenClaw values/state shapes is narrower on both the onboarding and config sides.
- `src/components/command-center/inspector-panel.tsx` is now fully landed in TypeScript, with the final successful move coming from a combination of shared wrapper surface aliases plus the staged helper/component extractions that reduced the remaining blocker set to a tractable list.
- A first full-file `inspector-panel.tsx` attempt was informative but not yet landable; the next successful move should likely be one more preparatory boundary reduction or a focused component extraction rather than a blind whole-file rename.
- A direct `chat-panel.tsx` conversion was initially attempted and intentionally rolled back before landing because it left `npm run typecheck` red; that rollback ended up being useful because it identified the exact blocker groups instead of leaving the worktree half-converted.
- `src/components/command-center/chat-panel-surfaces.ts` is now landed as the same kind of wrapper-surface shim that helped unblock `inspector-panel.tsx`, so the shared UI wrapper typing noise has been reduced before the next whole-file move.
- `src/components/command-center/chat-panel.tsx` is now fully landed in TypeScript, with the successful pass coming from a narrower interop strategy: typed message/attachment props, memo comparator cleanup, scroll-option normalization, speech-recognition window interop, and small `MarkdownContent` / `FilePreviewOverlay` compatibility casts instead of another large helper extraction round.
- Phase 4's largest remaining frontend migration surface was no longer `chat-panel` after the successful `inspector-panel.tsx` and `chat-panel.tsx` landings; that top-level focus has now also progressed through a successful `App.tsx` landing.
- `src/App.tsx` is now fully landed in TypeScript, with the remaining blocker set turning out to be small and top-level only: `ImportMeta.env` typing, card-wrapper interop, a DOM `blur()` narrowing, and a few bridge props that had to be aligned between `App.tsx`, `ChatTabsStrip`, and `InspectorPanel`.
- The successful `App.tsx` landing means the main frontend app shell is no longer a JS/JSX holdout; the remaining migration surface is now much more clearly split between small frontend utility/auth/UI files and the still-unmigrated backend/server tree.
- `src/features/session/status-display.ts` is now also landed in TypeScript, which matters because it is a shared status-normalization boundary consumed by `App.tsx`, `chat-panel.tsx`, `inspector-panel.tsx`, runtime snapshot logic, and command-center controllers.
- `src/features/session/im-session.ts` is now also landed in TypeScript, so the IM session identity/bootstrap/runtime-anchor/reset helpers that sit underneath `chat-panel`, `session-overview`, runtime snapshot logic, and command-center controllers are no longer an untyped island.
- `src/features/theme/use-theme.ts` is now also landed in TypeScript, with the hook still exposing a string-friendly setter to preserve the existing `SessionOverview` / `App` integration contract while normalizing invalid values internally.
- `src/features/auth/access-context.ts` and `src/features/auth/access-gate.tsx` are now also landed in TypeScript, so the app-shell auth boundary is no longer a JS/JSX island and now has typed context value, fetch payload, and provider surface definitions.
- `src/main.tsx` is now also landed in TypeScript, with a simple root-element guard rather than any behavioral change.
- `src/lib/i18n.tsx` is now also landed in TypeScript, with a deliberate split between loose per-locale source dictionaries and a stable outward-facing `messages` view so existing typed consumers can keep treating `useI18n()` as a consistent contract even though locale files are not perfectly isomorphic.
- `src/features/chat/utils/chat-utils.ts` and `src/features/chat/utils/index.ts` are now also landed in TypeScript, so prompt sizing, time formatting, editable-element detection, and attachment file helpers are no longer an untyped shared utility boundary.
- `src/lib/attachment-storage.ts` is now also landed in TypeScript, which is important because the attachment persistence/hydration path sits directly underneath `use-app-persistence.ts` and therefore affects restored composer/message attachment behavior.
- `src/lib/prism-languages.ts` is now also landed in TypeScript, so dynamic Prism language loading and the `usePrismLanguage()` hook that power markdown/preview/inspector code highlighting are no longer a JS utility boundary.
- A first batch of shared UI wrappers is now also landed in TypeScript: `src/components/ui/button.tsx`, `src/components/ui/card.tsx`, `src/components/ui/tooltip.tsx`, `src/components/ui/textarea.tsx`, `src/components/ui/badge.tsx`, `src/components/ui/scroll-area.tsx`, `src/components/ui/separator.tsx`, and `src/components/ui/switch.tsx`.
- Those wrapper moves were intentionally kept compatibility-first: where existing call sites used broader values than the wrapper's cva/Radix typing wanted, the wrapper surface was widened or locally cast rather than forcing broad refactors across the app shell and command-center panels.
- A second shared UI wrapper batch is now also landed in TypeScript: `src/components/ui/tabs.tsx` and `src/components/ui/dropdown-menu.tsx`.
- At this point the remaining `src/` JavaScript/JSX files are no longer production app logic; they are test files and locale data files. That means the frontend production surface is effectively migrated to TypeScript, even though the test suite and locale dictionaries are still intentionally left in JS for now.
- The backend/server tree is in a different category from the frontend migration work:
  - the app currently runs the server with `node server.js`
  - `server.js` and the `server/` tree are still CommonJS/`require()` based
  - the current `tsconfig.json` does not include `server/` and uses `moduleResolution: "Bundler"`, which is suitable for the frontend but not a drop-in fit for a Node/CommonJS server runtime
  - because of that, direct `server/*.ts` renames are not a "small slice" the way the frontend moves were; they imply a runtime/loading/build decision first

## Next Execution Slice

The next move should stay incremental, but the migration frontier is now almost entirely on the backend service side rather than in `src/`.

Recommended order:

1. Keep using the now-landed `runtime-hub -> app-context -> chat -> openclaw-client -> dashboard -> transcript` chain as the reference pattern for orchestration-grade backend TS slices.
2. There is no longer a remaining production JS island under `server/services/`; the next server-side work should focus on stabilization instead of "find the next JS leaf".
3. The original backend stabilization target is now effectively complete, and the first post-stabilization backend cleanup slice is also complete:
   - source-test interop hotspots have been cleaned up across the migrated backend surface
   - the server production surface is now effectively typed end to end
   - frontend warning-level lint follow-up is also now complete, so the repository has returned to a zero-warning `npm run lint` baseline instead of merely a warning-only passing state
   - `server/core/index.ts` / `server/entry.ts` no longer need to be preserved in a CommonJS-shaped TS form; that compatibility layer has now been removed without changing the public `node server.js` entry contract
   - the next move should therefore no longer be "finish stabilization", but rather choose between a stricter typing pass, test-layer cleanup, release-artifact verification work, or AGENTS follow-up feature work
   - continue preferring test-entry cleanup over runtime-entry cleanup whenever a source-test compatibility problem can be solved at the test boundary
   - treat `server/core/config.ts` as the current reference point for compiled-runtime path safety, because source-only path logic is no longer sufficient once `node server.js` bootstraps `.server-build`
   - treat the current lint/build/test baseline as a real completion checkpoint for the migration/stabilization phase rather than as an intermediate cleanup state
4. The first bounded stricter-typing slice is now also identified:
   - keep the work limited to one backend module or one small cluster at a time
   - use `npx tsc -p tsconfig.server.json --noEmit --noImplicitAny` only as a probe, not as the release gate yet
   - the first successful target was `server/routes/file-manager.ts`
   - the second successful target is now `server/services/dashboard.ts`
   - the third successful target is now `server/services/runtime-hub.ts`
   - the fourth successful target is now `server/routes/chat.ts`
   - the fifth successful target started as a preparatory slice inside `server/services/transcript.ts` and is now fully extended through conversation/search/timeline helpers, so `transcript.ts` no longer appears in the current `noImplicitAny` probe output
   - the sixth successful target is the small local-update cluster: `server/services/dev-workspace-restart.ts`, `server/services/lalaclaw-update-runner.ts`, and `server/services/lalaclaw-update.ts`
   - the seventh successful target is the OpenClaw management/onboarding pair: `server/services/openclaw-management.ts` and `server/services/openclaw-onboarding.ts`
   - the eighth successful target is the OpenClaw update/operations pair: `server/services/openclaw-update.ts` and `server/services/openclaw-operations.ts`
   - the ninth successful target is `server/services/openclaw-config.ts`
   - the current probe frontier has therefore moved off `transcript.ts` and every medium service slice; it is now concentrated in the still-large `server/services/openclaw-client.ts`
5. After each stricter-typing slice, keep running `npm run typecheck:server`, `npm run build:server`, the tightest affected backend Vitest files, and the server smoke command.
   - the completed `transcript.ts` timeline/run slice also exposed one real shape mismatch during landing: timeline snapshots were missing `sessionId`, which was fixed before the slice was considered green
   - the completed local-update slice did not expose behavior regressions; its only real `noImplicitAny` work was service-boundary shaping (`unknown`/destructured option args/JSON payloads) and it still passed the route/service regression matrix unchanged
   - the completed OpenClaw management/onboarding slice likewise stayed compatibility-first: the landed changes were action-definition/health-result/auth-choice/cache surface typings, not changes to CLI semantics or route behavior
   - the completed OpenClaw update/operations slice stayed in the same compatibility-first lane: command-summary/health/state shapes were made explicit, but install/update behavior and route semantics were kept intact
   - the completed OpenClaw config slice also stayed compatibility-first: the landed changes were field-change/result/guidance/return-surface typings, not changes to patch/backup/rollback semantics
6. For WebSocket/runtime/OpenClaw transport work, preserve the AGENTS validation bar: targeted regressions plus an equivalent end-to-end path whenever the slice touches delivery-routed, IM, or runtime synchronization behavior.

## Immediate Next Actions

1. Keep the plan document synchronized with both real landings and real rollbacks, especially when a migration-specific source-test interop failure is discovered and fixed during backend TS work.
2. Use the now-landed `transcript.ts` slice as the template for any remaining large compatibility-first service conversion: widen the service boundary first, then fix the direct source-test imports that the rename exposes.
3. Treat the current zero-warning `lint` + green `test` + green `build` + green server smoke state as the completion checkpoint for the migration/stabilization phase.
4. The old caution about not re-attempting the `server/core/index.ts` / `server/entry.ts` cleanup is now historical context rather than active guidance; that slice is landed and green.
5. Treat the first `noImplicitAny` probe as planning input: it has already paid off by shrinking `server/core/*`, `server/routes/file-manager.ts`, `server/services/dashboard.ts`, `server/services/runtime-hub.ts`, `server/routes/chat.ts`, and now the full helper-heavy/domain-adjacent compatibility pass of `server/services/transcript.ts`; the remaining candidates are no longer transcript-shaped and now skew toward smaller service helpers plus the still-large `server/services/openclaw-client.ts`.
6. When validating stricter-typing work on the backend, do not run `build:server` in parallel with tests that consume `.server-build/**`; build first, then run the affected Vitest matrix, then run the smoke command.
7. The next stricter-typing slice should be chosen with the AGENTS risk hierarchy in mind: `chat` work has now already been tightened without transport behavior change, `transcript.ts` has now been fully removed from the probe frontier, and the lowest-risk next moves are the smaller local-update/OpenClaw service files before another serious pass on `server/services/openclaw-client.ts`.
8. The local-update cluster (`dev-workspace-restart.ts`, `lalaclaw-update-runner.ts`, `lalaclaw-update.ts`), the management/onboarding pair (`openclaw-management.ts`, `openclaw-onboarding.ts`), the update/operations pair (`openclaw-update.ts`, `openclaw-operations.ts`), and now `openclaw-config.ts` are all out of the active probe frontier, so the remaining candidate is effectively `server/services/openclaw-client.ts`.
9. Because `openclaw-client.ts` is now the only remaining `noImplicitAny` probe cluster, the next move should not be a blind whole-file tightening pass; it should start with one very small compatibility-first slice that shapes the top-level service options/dependency boundary before touching stream/event/run-state internals.
10. That first `openclaw-client.ts` preparatory slice is now landed:
   - the service option/dependency boundary is explicitly typed
   - the gateway SDK promise/cache is explicitly shaped instead of defaulting to implicit `any`
   - the first retry/helper/import-resolution layer is now typed enough that the `noImplicitAny` frontier has moved past the root of the file and down into the delivery-routed / stream / run-state internals
   - that slice was kept compatibility-first and required one follow-up adjustment: the initial option signatures were briefly too narrow for existing interop and had to be widened again before `typecheck:server` was green
11. The second and third `openclaw-client.ts` preparatory slices are now also landed:
   - the request/payload/session-message layer is explicitly typed enough that direct-request detection, request building, and session-message normalization no longer appear in the `noImplicitAny` probe output
   - the session-run / SSE utility layer is also explicitly typed enough that helper functions such as session start/wait, assistant-history lookup, SSE consumption, and stream text extraction no longer appear in the probe output either
   - the remaining probe cluster then narrowed to the event-stream shell (`activeRunState`, `waitResult`, WebSocket callback parameters, dispatch wrappers, `subscribeGatewayEvents`), and that shell has now also been typed without changing delivery-routed behavior, fallback polling behavior, or gateway subscription semantics
   - one final single-line follow-up was required during landing because a `reason: unknown` value was still being passed directly into `new Error(...)`; after coercing that to string, the backend `noImplicitAny` probe became fully clean
12. The planning probe `npx tsc -p tsconfig.server.json --noEmit --noImplicitAny` is now fully clean across the backend tree.
13. This is a real stabilization checkpoint, not just a probe-only milestone:
   - `npm run typecheck:server` is green
   - `npm run build:server` is green
   - the high-signal OpenClaw/chat transport matrix (`server/services/openclaw-client.test.js`, `test/openclaw-client.test.js`, `server/routes/chat.test.js`, `test/chat-route.test.js`, `test/server-http.test.js`) is green
   - full `npm test` is green
   - the server smoke command is green
14. The `noImplicitAny` planning probe has now been promoted into a real enforced backend compiler gate:
   - `tsconfig.server.json` now sets `"noImplicitAny": true`
   - `npm run typecheck:server` and `npm run build:server` therefore enforce the same rule set that was previously only checked manually with the probe command
   - this promotion was validated against `lint`, full `npm test`, frontend `npm run build`, and the server smoke command rather than only against backend-local checks
15. The frontend `npm run build` validation still emits large-chunk warnings, but it did not produce `Circular chunk`, chunk-init, or blank-screen-class release blocker signals during this gate-promotion round.
16. The next stricter backend rule has now also been proven and promoted:
   - `npx tsc -p tsconfig.server.json --noEmit --useUnknownInCatchVariables` was used as a probe first
   - the resulting frontier was small and localized, mostly around direct `catch (error)` property access in `lalaclaw-update-runner.ts`, `lalaclaw-update.ts`, `openclaw-client.ts`, `openclaw-config.ts`, `openclaw-management.ts`, and `runtime-hub.ts`
   - after those catch-boundary fixes, `tsconfig.server.json` now also sets `"useUnknownInCatchVariables": true`
   - `npm run typecheck:server`, `npm run build:server`, the high-signal OpenClaw/chat transport matrix, `npm run lint`, full `npm test`, frontend `npm run build`, and the server smoke command all remained green after that promotion
17. The frontend `npm run build` validation still emits large-chunk warnings after the `useUnknownInCatchVariables` promotion as well, but still without `Circular chunk`, chunk-init, or blank-screen-class release blocker signals.
18. The next stricter backend rule has now also been proven and promoted:
   - `npx tsc -p tsconfig.server.json --noEmit --noImplicitReturns` produced no errors at all, which means the earlier compatibility-first typing work had already implicitly cleaned this surface up
   - `tsconfig.server.json` now also sets `"noImplicitReturns": true`
   - `npm run typecheck:server`, `npm run build:server`, the high-signal OpenClaw/chat transport matrix, `npm run lint`, full `npm test`, frontend `npm run build`, and the server smoke command all remained green after that promotion
19. At this point the backend server compiler gate is no longer just "TS compiles":
   - `noImplicitAny` is enforced
   - `useUnknownInCatchVariables` is enforced
   - `noImplicitReturns` is enforced
20. The next truly meaningful strictness step is no longer another nearly-free compiler toggle; it is likely a semantics-affecting rule such as `strictNullChecks`, which should be treated as a dedicated migration phase rather than as another routine follow-up slice.

## Expected Outcome

If we follow this plan, TypeScript migration should improve reliability and maintainability without forcing a disruptive rewrite. The main win is not "using TS everywhere"; it is making LalaClaw's runtime, session, and chat contracts explicit enough that humans and agents can safely change the system over time.
