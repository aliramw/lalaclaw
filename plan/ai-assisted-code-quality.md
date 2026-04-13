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

### 2026-04-06 — Workspace Shell Contrast and Environment Tab Background Flattening

- Prompt/workstream: respond to visual feedback that the large light-mode workspace container blended too closely into white surfaces, and remove the inspector environment tab body's own background tint so the right column relies on the shared shell plus inner section cards.
- AI model/version: GPT-5 Codex (Codex desktop agent).
- Generation time: 2026-04-06 Asia/Shanghai.
- Files touched:
  - shared shell and inspector layout surfaces such as `src/components/app-shell/app-split-layout.tsx` and `src/components/command-center/inspector-panel.tsx`
  - regression coverage in `src/components/app-shell/app-split-layout.test.tsx` and `src/components/command-center/inspector-panel.test.jsx`
  - visual/spec governance in `dev-spec/frontend-visual-spec.md` and this file
- Quality gates rerun:
  - `npm test -- --run src/components/app-shell/app-split-layout.test.tsx src/components/command-center/inspector-panel.test.jsx`
- Manual/equivalent validation:
  - mapped the user-supplied screenshot to the shared workspace shell and inspector tab-body layers before changing any tokens
  - kept the fix scoped to shell/background hierarchy only and mirrored the new light-shell contrast plus inspector-tab-background rules into `dev-spec/frontend-visual-spec.md`
- Reviewer/sign-off:
  - pending human review
  - low risk because the patch only changes presentational shell classes and related regression assertions
- Reviewer checklist:
  - confirm the light-mode outer workspace shell now reads distinctly from white chat cards and the white composer input
  - confirm the environment tab body no longer shows an extra tinted background behind its sections
  - confirm other inspector tabs still feel structurally grouped without reintroducing nested card framing
- Visual spec linkage:
  - added an explicit rule for background-free inspector tab bodies in `dev-spec/frontend-visual-spec.md`; the light-shell contrast rule already exists there and this patch implements it in the shared workspace shell

### 2026-04-06 — Split Gutter Symmetry and Centered Resize Grip

- Prompt/workstream: remove the visible divider line between the chat pane and inspector, make the split gutter visually balanced on both sides, and align the resize grip to the old divider centerline instead of leaving it offset.
- AI model/version: GPT-5 Codex (Codex desktop agent).
- Generation time: 2026-04-06 Asia/Shanghai.
- Files touched:
  - split-layout surfaces such as `src/components/app-shell/app-split-layout.tsx`
  - regression coverage in `src/components/app-shell/app-split-layout.test.tsx`
  - visual/spec governance in `dev-spec/frontend-visual-spec.md` and this file
- Quality gates rerun:
  - `npm test -- --run src/components/app-shell/app-split-layout.test.tsx`
- Manual/equivalent validation:
  - mapped the reported asymmetry to the old `xl:border-l` plus extra right-pane padding before switching the split into a neutral gutter treatment
  - synced the no-divider and centered-grip rule into `dev-spec/frontend-visual-spec.md` in the same workstream
- Reviewer/sign-off:
  - pending human review
  - low risk because the patch only changes shell spacing and resize-grip presentation
- Reviewer checklist:
  - confirm the wide split layout no longer shows a visible vertical divider line
  - confirm the gutter feels evenly spaced on both sides of the grip
  - confirm the grip now sits on the visual split centerline
- Visual spec linkage:
  - added an explicit wide-split gutter symmetry and centered-resize-grip rule to `dev-spec/frontend-visual-spec.md`

### 2026-04-06 — Chat Bubble Alignment and In-Card Jump Control

- Prompt/workstream: investigate why the user bubble looked left-shifted and why the `Back to message top` control rendered outside the assistant card, then make the smallest chat-panel layout fix that restores right-edge alignment and keeps the jump control inside the card.
- AI model/version: GPT-5 Codex (Codex desktop agent).
- Generation time: 2026-04-06 Asia/Shanghai.
- Files touched:
  - chat render surfaces such as `src/components/command-center/chat-user-bubble.tsx` and `src/components/command-center/chat-panel.tsx`
  - regression coverage in `src/components/command-center/chat-panel.test.jsx`
  - visual/spec governance in `dev-spec/frontend-visual-spec.md` and this file
- Quality gates rerun:
  - `npm test -- --run src/components/command-center/chat-panel.test.jsx -t "keeps user message metadata below the bubble so the bubble stays right-aligned|keeps the message-top jump button inside the assistant card corner instead of rendering it beside the card"`
  - `npm test -- --run src/components/command-center/chat-panel.test.jsx`
- Manual/equivalent validation:
  - compared the supplied screenshots against the current chat bubble DOM structure to confirm the user bubble was visually shifted by side metadata and the jump control was mounted as a card sibling instead of inside the assistant bubble
  - mirrored both chat-layout rules into `dev-spec/frontend-visual-spec.md` in the same workstream
- Reviewer/sign-off:
  - pending human review
  - low-to-medium risk surface because the patch is scoped to transcript presentation in `command-center` and does not alter runtime/session transport or persistence
- Reviewer checklist:
  - confirm user bubbles now visually hug the right edge of the chat column
  - confirm the message-top jump button sits inside the assistant card's top-right corner in compact/full/outline variants
  - confirm assistant meta, outlines, and pending cards still render in the expected order
- Visual spec linkage:
  - added explicit rules for right-aligned user bubbles and in-card message-top controls to `dev-spec/frontend-visual-spec.md`

### 2026-04-01 — Chat Tool Activity Card Ordering and Collapse Behavior

- Prompt/workstream: make chat transcript tool activity render as separate cards, keep each chat tool card collapsed by default, and place tool cards in chronological order instead of merging them into one block above the assistant reply.
- AI model/version: GPT-5 Codex (Codex desktop agent).
- Generation time: 2026-04-01 Asia/Shanghai.
- Files touched:
  - chat transcript render surfaces such as `src/components/command-center/chat-panel-render-items.ts`, `src/components/command-center/chat-panel.tsx`, `src/components/command-center/chat-turn-activity.tsx`, and `src/components/command-center/tool-call-timeline.tsx`
  - regression coverage such as `src/components/command-center/chat-panel.test.jsx` and `src/App.test.jsx`
  - visual/spec governance such as `dev-spec/frontend-visual-spec.md` and this file
- Quality gates rerun:
  - `npm test -- --run src/components/command-center/chat-panel.test.jsx -t "renders each chat tool call as its own collapsed card in chronological order between the user turn and assistant reply|keeps the streaming assistant DOM node stable when tool activity is present and timestamp changes without an explicit id"`
  - `npm test -- --run src/App.test.jsx -t "restores historical tool activity in chat after refresh hydration"`
  - `npm test -- --run src/components/command-center/tool-call-timeline.test.jsx`
  - `npm test -- --run src/components/command-center/inspector-panel.test.jsx -t "renders timeline details and switches tabs|collapses individual tool cards inside the detail section"`
- Manual/equivalent validation:
  - UI rule synced into `dev-spec/frontend-visual-spec.md` so future chat tool-card changes have an explicit baseline
  - inspector/tool timeline regressions rerun to confirm the new default-collapsed behavior stays scoped to chat cards and does not silently change inspector defaults
- Reviewer/sign-off:
  - pending human review
  - low-to-medium risk surface because this changes transcript ordering and card grouping in the chat UI, but it avoids runtime/session transport logic
- Reviewer checklist:
  - confirm tool activity now appears as separate cards in the same chronological flow as the surrounding turn
  - confirm chat cards start collapsed while inspector timeline cards still default to their previous open behavior
  - confirm no stale tool IO appears inside assistant bubbles during streaming or hydration recovery
- Visual spec linkage:
  - added the chat tool-card ordering and default-collapse rule to `dev-spec/frontend-visual-spec.md` in the same workstream per repository policy

### 2026-04-01 — System Message Split for Inbound IM Follow-ups

- Prompt/workstream: keep aborted-run wrappers and similar transcript-side notes out of user chat bubbles by splitting them into standalone system messages, then render those notes as separate neutral cards in chat.
- AI model/version: GPT-5 Codex (Codex desktop agent).
- Generation time: 2026-04-01 Asia/Shanghai.
- Files touched:
  - transcript normalization and projection surfaces such as `server/services/transcript.ts` and `server/services/transcript.test.js`
  - chat rendering and locale surfaces such as `src/components/command-center/chat-panel.tsx`, `src/components/command-center/chat-panel.test.jsx`, `src/locales/en.js`, and `src/locales/zh.js`
  - visual/spec governance such as `dev-spec/frontend-visual-spec.md` and this file
- Quality gates rerun:
  - `npm test -- --run server/services/transcript.test.js`
  - `npm test -- --run src/components/command-center/chat-panel.test.jsx`
  - `npm test -- --run src/App.test.jsx -t "restores historical tool activity in chat after refresh hydration"`
- Manual/equivalent validation:
  - compared the raw Weixin transcript wrapper shape against the projector regression so the fix preserves the note but moves it into a dedicated system card instead of silently dropping it
  - synced the new chat IA rule into `dev-spec/frontend-visual-spec.md` in the same workstream
- Reviewer/sign-off:
  - pending human review
  - low-to-medium risk surface because it changes transcript normalization and one chat-card render branch, but it does not alter runtime transport or storage contracts
- Reviewer checklist:
  - confirm aborted-run notes now appear as standalone neutral system cards
  - confirm the actual IM user follow-up stays in its own normal user bubble
  - confirm assistant streaming, tool cards, and existing chat bubble layouts remain unchanged
- Visual spec linkage:
  - added the system-card rule for transcript-side control notes to `dev-spec/frontend-visual-spec.md` in the same workstream per repository policy

### 2026-04-01 — Retained Pending Thinking Card Continuity

- Prompt/workstream: investigate why the chat thinking card briefly disappears after a turn starts, then keep the in-flight assistant card visible while a retained pending turn waits for runtime catch-up.
- AI model/version: GPT-5 Codex (Codex desktop agent).
- Generation time: 2026-04-01 Asia/Shanghai.
- Files touched:
  - retained-pending state projection surfaces such as `src/features/chat/state/chat-dashboard-session.ts`
  - regression coverage such as `src/features/chat/state/chat-dashboard-session.test.ts` and `src/App.test.jsx`
  - visual/spec governance such as `dev-spec/frontend-visual-spec.md` and this file
- Quality gates rerun:
  - `npm test -- --run src/features/chat/state/chat-dashboard-session.test.ts`
  - `npm test -- --run src/App.test.jsx -t "keeps the thinking card visible while a retained pending turn waits for runtime assistant catch-up"`
- Manual/equivalent validation:
  - inspected the supplied screen recording and compared it with the retained-pending projection path to confirm the gap occurred while the busy header stayed active but the transcript overlay was suppressed
  - synced the continuity rule into `dev-spec/frontend-visual-spec.md` in the same workstream
- Reviewer/sign-off:
  - pending human review
  - low-to-medium risk surface because it changes pending-overlay projection for busy chat turns, but it is scoped to chat-state rendering rather than runtime transport
- Reviewer checklist:
  - confirm the thinking card no longer briefly disappears during retained pending catch-up
  - confirm we still avoid duplicate assistant overlays once real assistant content is present
  - confirm settled assistant replies still replace the thinking card cleanly
- Visual spec linkage:
  - added the retained-pending thinking-card continuity rule to `dev-spec/frontend-visual-spec.md` in the same workstream per repository policy

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

### 2026-04-01 — Global Visual Refresh Design Baseline

- Prompt/workstream: use superpowers and `ui-ux-pro-max` to improve the overall project visual quality, choosing a warm `Signal Desk` light theme, a cooler `Precision Ops` dark theme, and a shell-first balanced-density redesign.
- AI model/version: GPT-5 Codex (Codex desktop agent).
- Generation time: 2026-04-01 Asia/Shanghai.
- Files touched:
  - `plan/2026-04-01-project-visual-refresh-design.md`
  - `dev-spec/frontend-visual-spec.md`
  - `plan/ai-assisted-code-quality.md`
- Quality gates rerun:
  - not run; this workstream only records design/spec updates and visual-baseline decisions
- Manual/equivalent validation:
  - reviewed existing shell and theme surfaces in `src/index.css`, `src/App.tsx`, `src/components/app-shell/app-split-layout.tsx`, `src/components/command-center/chat-panel.tsx`, `src/components/command-center/inspector-panel.tsx`, and shared UI primitives before locking the design direction
  - verified that the new visual rules were mirrored into `dev-spec/frontend-visual-spec.md`
  - follow-up assistant-bubble refinements stayed on semantic theme tokens and added a subtle border rule after manual light-mode review showed the warmer fill blending too far into the chat-stage background
  - follow-up shell cleanup removed a redundant framed chat-header container and unified the top-right utility controls under one shared shell utility treatment after manual review flagged mismatched heights and background surfaces
- Reviewer/sign-off:
  - pending human review before implementation begins
- Follow-up expectation:
  - implementation PRs derived from this design should log their concrete prompts, touched files, and validation runs separately once code changes begin

### 2026-04-03 — Markdown Annotation Workbench Spacing and Draft Removal

- Prompt/workstream: fix the markdown preview annotation mode so controls no longer sit flush against the overlay edge, add a per-annotation remove affordance for draft instructions, and sync the resulting spacing rules back into the visual spec.
- AI model/version: GPT-5 Codex (Codex desktop agent).
- Generation time: 2026-04-03 Asia/Shanghai.
- Files touched:
  - annotation workbench and preview overlay surfaces such as `src/components/command-center/markdown-preview-annotation-workbench.tsx` and `src/components/command-center/file-preview-overlay.tsx`
  - regression coverage such as `src/components/command-center/markdown-preview-annotation-workbench.test.jsx`
  - locale wiring such as `src/locales/en.js` and `src/locales/zh.js`
  - visual/spec governance such as `dev-spec/frontend-visual-spec.md` and this file
- Quality gates rerun:
  - `npm test -- src/components/command-center/file-preview-overlay.test.jsx src/components/command-center/markdown-preview-annotation-workbench.test.jsx`
  - `npm run lint`
- Manual/equivalent validation:
  - compared the user-supplied screenshot against the annotation-mode layout to confirm the regression was spacing hierarchy rather than missing functionality
  - reworked the annotation mode into padded grouped surfaces so the preview column and instruction column both preserve safe margins inside the overlay
  - refined the selection interaction so the action menu opens next to the selected text, pending selections use a blue temporary highlight, and committed annotations switch to yellow only after an action is chosen
  - aligned the temporary selection menu with the app's existing context-menu visual language, removed redundant right-column framing/title copy, and strengthened the toolbar toggle so active annotation mode reads as an explicit cancel state rather than another edit-style action
  - updated the temporary action menu again to match the existing context-menu chrome and icon treatment more strictly, and delayed menu appearance until pointer release so dragging a longer selection cannot hit the menu mid-selection
  - restored the right-column instructional sentence as plain helper text instead of deleting it, tightened one-line draft annotation rows so they no longer read as oversized cards, and added explicit replacement-input guidance after choosing an annotation action
  - added the `A` shortcut and matching tooltip disclosure for the annotation-mode toggle, and changed `Esc` behavior so edit/annotation mode exits always confirm before the preview closes
  - fixed the selection-menu trigger so dragging from inside the preview still resolves into a menu even when the pointer-up lands slightly outside the preview container
  - added a first-class `Delete` annotation action to the context menu, kept the menu width compact, and removed the textarea resize affordance because the workbench does not support manual textarea resizing
  - moved the annotation action menu so it prefers the space below the current selection and only flips above when needed, preventing the menu from covering the selected text itself
  - reordered the annotation menu so destructive `Delete` stays after `Replace` and `Replace all`
  - removed the redundant aggregate annotation editor and switched the right-hand workbench to per-row editing, where each replace-style draft is edited through a single unified line input and the lower prompt preview becomes the only combined instruction surface
  - collapsed each editable draft row down to a single visible shell by merging the inline text field into the outer card, reduced the dismiss control to a smaller clearly-secondary button size, added an explicit `替换为` / `Replace with` target prompt on the arrow-right side so empty replacement targets never look like inert blank space, then adjusted long-prefix rows to wrap instead of truncating, and finally moved the replacement input back into the same wrapped text flow after manual review showed a pseudo two-column layout was wasting width
  - replaced the remaining fixed-width replacement box with a sentence-flow inline editor so `替换为` / `Replace with` now behaves like placeholder copy inside the instruction itself and long replacement text stays visible as part of the full wrapped instruction
  - after manual UI review of the chat transcript, pulled user-message meta back underneath the user bubble instead of leaving it as a detached side column, and toned the composer shell down so the heavier blue focus ring only appears on focus instead of idling in the resting state
  - rolled back the earlier horizontal `1px` highlight padding after real interaction review showed it nudged selected text sideways; highlights now keep the visual treatment without changing line width
  - synced the new safe-gutter and right-column spacing-tier rules into `dev-spec/frontend-visual-spec.md` in the same workstream
- Reviewer/sign-off:
  - pending human review
  - low-to-medium risk surface because the change is confined to file-preview UI layout and draft-instruction controls without touching runtime/session transport
- Reviewer checklist:
  - confirm annotation mode no longer looks flush to the overlay edges in both light and dark themes
  - confirm a fresh text selection shows a blue temporary highlight and nearby action menu, then switches to yellow only after choosing an annotation action
  - confirm a single draft annotation can be removed without clearing the rest of the workbench state
  - confirm the generated prompt, submit action, and preview highlights remain aligned after removing one draft rule
  - confirm the restored helper sentence remains visible without reintroducing the redundant dashed empty-state frame
  - confirm the `A` shortcut and `Esc` confirmation behavior match the tooltip copy and do not accidentally close the preview without confirmation
  - confirm a drag selection still opens the action menu even if the pointer is released just outside the preview body
  - confirm the compact context menu now includes `Delete` and the right-hand textarea no longer shows a misleading resize handle
  - confirm the action menu no longer sits on top of the highlighted selection and that destructive actions remain ordered after the replace actions
  - confirm replace-style draft rows can be edited inline without a second large editor box, while delete rows still summarize correctly and the generated prompt preview stays accurate
  - confirm each editable draft row now reads as one framed control rather than an outer card plus inner textbox, and that the dismiss button remains visible but visually secondary
- Visual spec linkage:
  - added markdown annotation overlay compact-menu, non-overlapping menu placement, destructive-action ordering, delete-action, drag-selection, non-resizable-textarea, safe-gutter, compact draft-row, explicit replacement-target prompt, stable in-place highlight rule, shortcut, and `Esc`-confirmation rules to `dev-spec/frontend-visual-spec.md` in the same workstream per repository policy
- Prompt/workstream: stop a single long pasted user message in `main` from blowing out the chat shell and making the rest of the screen look globally misaligned.
- Files touched:
  - `src/components/command-center/chat-user-bubble.tsx`
  - `src/components/command-center/markdown-content.tsx`
  - `src/components/command-center/chat-panel.test.jsx`
  - `src/components/command-center/markdown-content.test.jsx`
  - `dev-spec/frontend-visual-spec.md`
- Quality gates rerun:
  - `npm test -- src/components/command-center/chat-panel.test.jsx src/components/command-center/markdown-content.test.jsx`
  - `npm run lint -- src/components/command-center/chat-user-bubble.tsx src/components/command-center/markdown-content.tsx src/components/command-center/chat-panel.test.jsx src/components/command-center/markdown-content.test.jsx`
- Manual/equivalent validation:
  - traced the reported “only main is broken” symptom back to one long user bubble instead of the global split layout
  - added shrink constraints on the user-bubble chain and upgraded markdown/text wrapping so long unbroken content stays inside the bubble
- Reviewer checklist:
  - confirm a single long user message in `main` no longer pushes the chat column or inspector column out of alignment
  - confirm the long string wraps inside the bubble instead of truncating or forcing horizontal overflow

### 2026-04-13 — Hermes Agent Tab Design

- Prompt/workstream: if the local/runtime environment reports that the `hermes` agent is installed, allow the command-center to add a `hermes` conversation tab from the existing add-tab menu.
- AI model/version: GPT-5 Codex (Codex desktop agent).
- Generation time: 2026-04-13 Asia/Shanghai.
- Files touched:
  - `plan/2026-04-13-hermes-agent-tab-design.md`
  - `plan/ai-assisted-code-quality.md`
- Quality gates rerun:
  - not run; this workstream only records design/spec updates before implementation begins
- Manual/equivalent validation:
  - reviewed the current add-tab flow in `src/components/command-center/session-overview.tsx`
  - reviewed runtime state ingestion in `src/features/session/runtime/use-runtime-snapshot.ts`
  - reviewed tab creation and activation flow in `src/features/app/controllers/use-command-center-session-selection.ts`
  - verified that the least-risk design is to normalize runtime agent candidates once near snapshot state and keep downstream UI on the existing `string[] availableAgents` contract
- Reviewer/sign-off:
  - pending human review before implementation begins
- Follow-up expectation:
  - the implementation workstream should log the concrete runtime payload assumptions, touched files, and validation commands separately once code changes start
