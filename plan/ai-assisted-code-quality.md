# AI-assisted Code Quality Plan

## Purpose

This plan captures how we treat AI-generated code (including prompts, model versions, and outcomes) so AI output stays traceable, testable, and gated by the same quality system that protects human contributions.

## Scope

- All AI-generated patches, completions, or refactors for `lalaclaw` components.
- Prompt templates or chains that produce code we eventually merge.
- AI-assisted UI proposals that might influence `dev-spec/frontend-visual-spec.md`.

## Prompt and Artifact Logging

- Record the prompt, AI model/version, and generation time in this document or a linked appendix before opening a PR.
- Note which files are affected, what part of the diff came from AI, and whether the AI output reused existing helper logic or introduced new behavior.
- Tag the related PR with `ai-generated` and call out these logs in the PR description so reviewers can easily jump to the metadata.

## Human Review Gate

- No AI change merges automatically; an engineer who understands the module must inspect AI results, confirm the logic, and document acceptance in the plan (Reviewer + timestamp + key checks).
- High-risk areas (runtime/session syncing, WebSocket, OpenClaw operations, release infrastructure, storage/state machines) require an explicit decision record explaining why AI involvement was justified and what regressions were re-tested.
- Review checklist items include: i18n/localization coverage, security patterns, dependency/third-party usage, and whether generated comments or docs already exist in `src/locales/*.js` or other appropriate places.

## CI/Testing Requirements

- AI output runs through the same validation pipeline as handwritten code. Always run lint/format, unit/contract tests, integration/e2e cases, and any specialized smoke tests tied to the touched modules.
- For AI-assisted ownership refactors around `app/storage`, `app/state`, `chat/state`, or `theme`, include `npm run check:architecture:contracts` in the validation log whenever that matrix is the relevant narrow guardrail.
- For UI work, confirm the generated design still complies with `dev-spec/frontend-visual-spec.md` and note that verification in the plan (screenshots, storybook states, or visual diffs as needed).
- When AI modifies release or packaging surfaces, include `npm run build` and `npm run pack:release` in the CI run and confirm the clean install smoke path succeeds before merging.

## Metrics and Feedback

- Track AI contribution outcomes: `ai.patch.pass_rate` (how often prompt outputs pass review first time), `ai.patch.bug_count`, and `ai.patch.rollback_count`. Update the plan weekly with any anomalies.
- When AI output causes a post-merge bug, record the incident, identify prompt adjustments, and update the plan’s “Prompt Templates” section so future prompts avoid the same pitfall.
- Use these learnings to refine prompt templates, review checklists, and spec references within this document.

## Integration with Visual Spec

- Any visual rule introduced through AI must be added to `dev-spec/frontend-visual-spec.md` before the PR merges. Note the linkage in this plan so future reviewers know which AI prompt produced the rule change.

## Review Summary Section

- After each AI-involved PR, append a short summary: prompt used, files touched, tests rerun, reviewer, and whether any manual validation (UI, smoke, environment) was required. Keep at least the last three summaries in this file for traceability.

### 2026-03-26 — Chat/Storage Ownership Refactor Validation Close-out

- Prompt/workstream: continue the `app-storage` ownership split, contract/boundary guardrails, and final validation closure for the OpenClaw-aligned chat-state refactor.
- Files touched: controller/runtime typing surfaces such as `src/features/app/controllers/use-command-center.ts`, `src/features/app/controllers/use-command-center-reset.ts`, `src/features/app/controllers/use-command-center-helpers.ts`, `src/features/app/controllers/use-command-center-session-actions.ts`, runtime/state helpers such as `src/features/session/runtime/use-runtime-snapshot.ts`, `src/features/chat/state/chat-runtime-pending.ts`, `src/features/chat/state/chat-pending-conversation.ts`, plus validation-adjacent files such as `src/App.tsx`, `src/types/runtime.ts`, `src/types/assets.d.ts`, and `src/features/app/storage/use-app-persistence.ts`.
- Quality gates rerun:
  - `npm run typecheck`
  - `npm run lint`
  - `npm test`
  - `npm run build`
  - `npm run check:architecture:contracts`
  - `npm run pack:release`
  - `npm run test:release:smoke -- --tarball ./artifacts/lalaclaw-2026.3.24-1.tgz`
- Manual/equivalent validation:
  - tarball installed in a clean temporary directory
  - packaged app started from installed files
  - release smoke confirmed first-screen render path and browser-level console/page error counts stayed at `0`
- Reviewer/sign-off: AI-assisted implementation validated against repository quality gates; no new runtime/build/release-smoke regressions were observed in the final validation pass.
- Recommended human follow-up:
  - review the new ownership boundaries for `app/state`, `chat/state`, `theme`, and `app/storage`
  - verify the architecture-contract matrix remains the intended narrow guardrail and not a substitute for behavior regressions
  - decide whether the final delivery should land as one close-out PR or a small stack of follow-up PRs

### 2026-03-28 — Chat Single-Pipeline Cutover Close-out and Command Center Boundary Repair

- Prompt/workstream: execute the chat single-pipeline cutover plan, close out the validation matrix, repair the extracted `command-center` component boundaries, and prepare a reviewable draft PR.
- AI model/version: GPT-5 Codex (Codex desktop agent).
- Generation time: 2026-03-28 Asia/Shanghai.
- Files touched:
  - runtime/controller and state surfaces such as `src/features/session/runtime/use-runtime-snapshot.ts`, `src/features/app/controllers/use-command-center.ts`, `src/features/app/controllers/use-command-center-reset.ts`, `src/features/app/controllers/use-command-center-background-runtime-sync.ts`, `src/features/chat/state/chat-dashboard-session.test.ts`, and `src/App.test.jsx`
  - `command-center` UI boundaries such as `src/components/command-center/chat-panel.tsx`, `src/components/command-center/chat-copy-button.tsx`, `src/components/command-center/chat-im-tab-logo.tsx`, `src/components/command-center/chat-message-id-utils.ts`, `src/components/command-center/chat-message-label.tsx`, `src/components/command-center/chat-navigation-buttons.tsx`, `src/components/command-center/chat-pending-bubble.tsx`, `src/components/command-center/chat-react-utils.ts`, `src/components/command-center/chat-reset-dialog.tsx`, `src/components/command-center/chat-user-bubble.tsx`, `src/components/command-center/markdown-content.tsx`, and `src/components/command-center/session-overview.tsx`
  - test and plan updates such as `tests/e2e/chat-session-stability.spec.js`, `plan/chat-state-refactor-against-openclaw-dashboard.md`, and this file
- Quality gates rerun:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run build`
  - `npm test`
  - `npm run check:architecture:contracts`
  - `npm run test:e2e -- tests/e2e/chat-session-stability.spec.js`
- Manual/equivalent validation:
  - runtime/controller/App regressions rerun around pending recovery, reset/bootstrap IM flows, and lagging runtime sync stabilization
  - full `chat-session-stability` e2e suite rerun after the single-pipeline cutover close-out
- Reviewer/sign-off:
  - pending human review
  - extra attention required on runtime/session synchronization because the cutover touched a high-risk module family
- Reviewer checklist:
  - confirm the runtime pending/settled transcript rules still match expected stop/reset/bootstrap behavior
  - confirm the extracted `command-center` component props align with existing UI behavior and do not hide stale render paths
  - confirm the markdown/file preview font-size regression is fixed without introducing new memoization skips
  - confirm the plan close-out notes accurately match the executed validation commands
- Known validation note:
  - one full-suite run timed out once in `src/components/command-center/inspector-panel.test.jsx` (`supports token-based provider onboarding`), but the isolated rerun and a subsequent full `npm test` run both passed, so this remains recorded as suite-level flaky rather than resolved root cause
