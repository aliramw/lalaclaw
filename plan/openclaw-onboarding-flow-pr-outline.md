# OpenClaw Onboarding Flow PR Outline

## Goal

Package the current `codex/openclaw-onboarding-flow` branch into a reviewable series that is easy to validate and safe to merge without losing the broader onboarding workstream context.

## Current Commit Stack

1. `c8b04d9` `Document onboarding workstream outline`
2. `9e5c071` `Add OpenClaw onboarding flow to inspector`
3. `738b1a8` `Add onboarding smoke and browser e2e validation`
4. `095681b` `Expand session overview aquatic walker behavior`
5. `810e129` `Refine queued message editing in chat composer`
6. `8aa3377` `Constrain file preview layout with sidebar`
7. `ce9245a` `Link browser e2e guide from localized docs`

## Recommended Review Order

### 1. OpenClaw onboarding feature

- Review `9e5c071` first.
- This is the main product behavior change for the branch.
- Focus on:
  - backend command wrapping and route shape
  - Inspector environment gating logic
  - onboarding state transitions
  - capability detection and supported-option filtering
  - frontend/backend regression coverage

### 2. Validation and CI hardening

- Review `738b1a8` second.
- This commit explains how the onboarding feature is validated in isolation and in CI.
- Focus on:
  - the isolated temp-`HOME` smoke flow
  - Playwright browser smoke scaffolding
  - Vitest / Playwright separation via `vite.config.mjs`
  - CI artifact behavior on failure

### 3. Chat queued-message UX

- Review `810e129` third.
- This is a self-contained product polish change that touches composer behavior and queue handling.
- Focus on:
  - queued message edit semantics
  - attachment preservation when restoring queued entries
  - compact queue strip placement and controls

### 4. File preview layout containment

- Review `8aa3377` fourth.
- This is a focused preview-shell layout fix.
- Focus on:
  - wide content containment
  - sidebar non-overlap guarantees
  - code/markdown horizontal overflow behavior

### 5. Session overview aquatic walkers

- Review `095681b` fifth.
- This is visually isolated from the onboarding work and can be reviewed separately.
- Focus on:
  - spawn-rate tuning
  - edge response logic
  - reroute timing and lifetime behavior

### 6. Documentation-only follow-ups

- Review `ce9245a` and `c8b04d9` last.
- These are support commits for discoverability and reviewer context.

## Recommended Commit / PR Shape

### 1. Environment panel wording and diagnostics polish

- Keep the copy, naming, and information-architecture updates together.
- Include the LalaClaw environment card changes, frontend/backend address surfacing, and locale alignment.
- Include the corresponding Inspector panel tests and visual-spec updates.

### 2. Chat follow-bottom and inspector stability fixes

- Group the chat sticky-bottom recovery fixes together with the Inspector runtime-error fixes.
- Keep App-level / component-level regressions in the same commit so the behavior change is easy to verify.

### 3. OpenClaw onboarding backend + environment UI

- Include:
  - `server/services/openclaw-onboarding.js`
  - `server/routes/openclaw-onboarding.js`
  - `server/core/app-context.js`
  - `src/features/app/controllers/use-openclaw-inspector.js`
  - `src/components/command-center/inspector-panel.jsx`
  - locale additions needed by the onboarding UI
- Keep the capability detection, refresh, and result reporting in this same slice so the feature lands coherently.

### 4. Smoke validation + CI hardening

- Include:
  - `scripts/openclaw-onboarding-smoke.cjs`
  - `package.json`
  - `.github/workflows/ci.yml`
  - `vite.config.mjs`
  - the test-baseline fixes required for `npm test`
  - contributor / README documentation for the smoke flow
- This keeps the delivery story clear: feature first, then validation / CI coverage.

## Reviewer Notes

- The onboarding feature intentionally wraps official OpenClaw CLI behavior instead of reimplementing onboarding logic inside LalaClaw.
- The environment UI is capability-aware: it should only show options that the currently installed OpenClaw CLI actually supports.
- The smoke script is designed to be safe for shared developer machines because it runs with an isolated temporary `HOME`.
- CI uploads the smoke JSON report as an artifact even on failure, so backend logs and onboarding state transitions remain inspectable.

## Squash Guidance

### Keep separate

- Keep `9e5c071` and `738b1a8` separate.
- The feature and its validation story are both large enough to deserve their own review units.
- Keep `810e129` separate from onboarding.
- Keep `8aa3377` separate from chat/composer work.

### Safe to squash if needed

- `c8b04d9` can be squashed into the eventual PR description process if you do not want an internal-planning commit in the final history.
- `ce9245a` can be squashed into `738b1a8` if you want all browser-e2e documentation changes to live with the validation commit.
- `095681b` can stay independent, but if you want a shorter history and the reviewer audience does not care about the animation work in isolation, it could be squashed into one broader "frontend polish" commit later.

### Recommended final shape if you want fewer commits

1. `Add OpenClaw onboarding flow to inspector`
2. `Add onboarding smoke and browser e2e validation`
3. `Refine queued message editing in chat composer`
4. `Constrain file preview layout with sidebar`
5. `Expand session overview aquatic walker behavior`

Then fold:

- `Document onboarding workstream outline` out of final history, or keep it only if you explicitly want planning history preserved.
- `Link browser e2e guide from localized docs` into the validation commit.

## Validation Baseline

- `npm run test:openclaw:onboarding:smoke -- --json`
- `npm run lint`
- `npm test`
- `npm run build`

## Follow-up Candidates

- Convert the onboarding smoke JSON report into a richer PR-facing summary comment or check-run annotation.
- If release timing requires it, split the onboarding capability-detection polish from the core install-to-onboarding gating behavior.
- Consider a later pass that snapshots a few recent support-option rechecks instead of only the latest one.
