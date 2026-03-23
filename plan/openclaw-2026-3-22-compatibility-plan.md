# OpenClaw 2026.3.22 Compatibility Plan

Last updated: 2026-03-24

## Goal

Support OpenClaw `2026.3.22` without regressing the currently supported local versions that LalaClaw operators are already using.

## Why This Needs A Plan

OpenClaw `2026.3.22` is now the npm `latest` release, and it already changed at least one integration surface that LalaClaw depended on implicitly:

- The old private hashed SDK bundle path such as `dist/reply-Bm8VrLQh.js` is no longer stable.
- Newer builds expose stable `plugin-sdk` entry points such as `dist/plugin-sdk/gateway-runtime.js` and `dist/plugin-sdk/cli-runtime.js`.
- The upstream changelog also shows broader SDK and onboarding surface movement in the same release window, so we should treat `2026.3.22` as a compatibility milestone rather than a one-line hotfix.

## Compatibility Strategy

Keep the compatibility layer explicit and version-tolerant:

1. Prefer stable upstream export surfaces when they exist.
2. Fall back to legacy/private surfaces only for older OpenClaw builds.
3. Add regression tests that prove both paths still work.
4. Avoid rewriting existing OpenClaw logic inside LalaClaw when official CLI or RPC behavior is available.

## Scope

In scope:

- OpenClaw runtime SDK loading
- Gateway client compatibility
- Onboarding capability detection and option mapping
- Config and management command compatibility
- Inspector diagnostics that reflect the current upstream runtime accurately

Out of scope for this plan:

- Reworking `/api/chat` transport architecture
- Large OpenClaw ops UX redesign
- Remote-host feature expansion unrelated to `2026.3.22`

## Confirmed Breakage So Far

### 1. Runtime SDK loading

LalaClaw previously hardcoded the OpenClaw SDK lookup to a private hashed file:

- `dist/reply-Bm8VrLQh.js`

That path is not present in `openclaw@2026.3.22`, so old lookup logic fails even though the package still ships a usable gateway runtime through stable `plugin-sdk` exports.

Status:

- Fixed in the current worktree by preferring `dist/plugin-sdk/gateway-runtime.js` and `dist/plugin-sdk/cli-runtime.js`, then falling back to legacy hashed reply bundles for older installs.

### 2. Update preview metadata drift

The `openclaw update --dry-run --tag latest --json` flow still works in `2026.3.22`, but its returned metadata is not identical to older builds:

- `tag` may now be reported as `openclaw@latest` instead of plain `latest`.
- LalaClaw previously treated the dry-run preview as mandatory for building update state.

Status:

- Fixed in the current worktree by normalizing `@latest` tag variants and by treating dry-run preview as best-effort instead of making the whole update inspector fail.

## Execution Plan

### Phase 1. Stabilize The Runtime Compatibility Layer

Goal:
Make LalaClaw tolerate both legacy and `2026.3.22` OpenClaw package layouts.

Tasks:

- Keep the new stable-first SDK lookup path.
- Preserve legacy hashed-bundle fallback for older local installs.
- Add and keep focused regression coverage for both lookup modes.

Exit criteria:

- LalaClaw can initialize the gateway client against both old and new package layouts.
- No existing OpenClaw client regressions fail.

### Phase 2. Audit CLI And RPC Surface Drift

Goal:
Find places where LalaClaw assumes older CLI help text, command output, or RPC method behavior.

Tasks:

- Recheck onboarding help parsing against `2026.3.22`.
- Recheck `update status --json`, `config file`, `config validate --json`, and `gateway call` output assumptions.
- Identify any fields whose names or shapes changed but are still loosely parsed today.

Exit criteria:

- We have a written list of strict assumptions by file and command.
- Any new parser fragility found gets either fixed or tracked as a follow-up item.

### Phase 3. Harden Onboarding Capability Detection

Goal:
Keep the inspector onboarding flow capability-aware across old and new OpenClaw versions.

Tasks:

- Verify current help-text parsing still works with the `2026.3.22` onboarding flag list.
- Decide whether we should move from help-text scraping toward a more stable capability source when upstream offers one.
- Add regression tests for newly added auth-choice and gateway option variants that should not break filtering.

Exit criteria:

- Supported onboarding options remain correct for both legacy and `2026.3.22`.
- The UI does not advertise unsupported combinations.

### Phase 4. Validate Diagnostics And Ops Surfaces

Goal:
Make sure the Environment / Inspector surface still reflects reality with newer OpenClaw builds.

Tasks:

- Verify version detection still shows the right OpenClaw version.
- Verify doctor, gateway status, config path, and health URL still populate correctly.
- Confirm that management actions still use official commands that remain valid in `2026.3.22`.

Exit criteria:

- Diagnostics are accurate for a real or equivalent `2026.3.22` install.
- No ops action silently relies on a removed command shape.

## Validation Matrix

Minimum validation for this workstream:

- `npm run lint`
- `npm test`

Targeted validation for the current runtime compatibility slice:

- `npm test -- server/services/openclaw-client.test.js`

Equivalent real-world validation to add before calling the workstream complete:

- One local machine with an older OpenClaw install
- One local machine or isolated tarball install with `openclaw@2026.3.22`
- At least one real startup path where LalaClaw can:
  - detect OpenClaw
  - open the inspector/environment surface
  - connect to the gateway client path without runtime errors

## Risks To Watch

- Upstream `plugin-sdk` subpaths are stable compared with hashed bundles, but we still need to treat them as versioned contracts and avoid assuming too much beyond the exported symbols we use.
- Help-text parsing for onboarding remains inherently brittle if upstream wording changes without changing semantics.
- Some compatibility issues may only appear on real machines with actual OpenClaw state, plugins, or onboarding history.

## Current Status

- Runtime SDK lookup breakage for `2026.3.22` has been fixed in this worktree.
- Focused regression coverage for the stable-path and legacy-fallback path has been added.
- `openclaw-update` now tolerates preview drift better, including `openclaw@latest` tag metadata and unsupported dry-run fallback.
- `openclaw-onboarding` has been rechecked against `2026.3.22` help text, and regression coverage now locks the supported auth-choice subset and default capability mapping.
- `openclaw-config` regression coverage now explicitly locks remote `config.get` payload variants that return `result.resolved` or raw JSON snapshots instead of the older direct `parsed` shape.
- `openclaw-management` regression coverage now locks the official `doctor --repair` path and confirms that noisy `gateway status` terminal output does not break success evaluation when the health probe is healthy.
- Inspector UI coverage now includes a `2026.3.22` state combination, proving the Environment panel can render the newer update/onboarding/config state without surfacing a false update alert.
- Equivalent real-install validation has been completed against an isolated `openclaw@2026.3.22` binary wired into a live LalaClaw backend instance, including `config`, `update`, `onboarding`, and browser-level Environment panel loading.
- Quick real-command audit did not show an immediate command-shape break in `config file`, `config validate --json`, `gateway status --json`, or `onboard --help`.
- Validation baseline for the current worktree now includes targeted service regressions, inspector UI regressions, `npm run lint`, `npm run build`, and full `npm test`.
- Next recommended step: split this work into a clean commit / PR narrative or continue with follow-up hardening only if we want broader release-facing validation such as `npm run test:coverage` or tarball install checks.

## Suggested Follow-up Tickets Or PR Slices

1. `OpenClaw 2026.3.22 compatibility: runtime SDK and gateway client`
2. `OpenClaw 2026.3.22 compatibility: onboarding capability audit`
3. `OpenClaw 2026.3.22 compatibility: config/update/management command audit`
4. `OpenClaw 2026.3.22 compatibility: real-install validation and inspector follow-up`
