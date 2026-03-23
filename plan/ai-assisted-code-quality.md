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
