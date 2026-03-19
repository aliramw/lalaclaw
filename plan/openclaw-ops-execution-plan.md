# OpenClaw Operations Execution Plan

Last updated: 2026-03-19

## Goal

Make `lalaclaw` a safe operations frontend for OpenClaw by delivering the work in small, reviewable phases instead of one large feature branch.

## Umbrella And Sub-Issues

- Umbrella: [#36](https://github.com/aliramw/lalaclaw/issues/36)
- Phase 1: [#43](https://github.com/aliramw/lalaclaw/issues/43) Read-only OpenClaw diagnostics surface
- Phase 2: [#44](https://github.com/aliramw/lalaclaw/issues/44) Safe OpenClaw management actions
- Phase 3: [#45](https://github.com/aliramw/lalaclaw/issues/45) Structured OpenClaw config management
- Phase 4: [#46](https://github.com/aliramw/lalaclaw/issues/46) Local OpenClaw install and update flow
- Phase 5: [#47](https://github.com/aliramw/lalaclaw/issues/47) Remote OpenClaw operations with audit and rollback

## Working Rules

- Always use official OpenClaw CLI or RPC behavior when possible.
- Do local-machine support before remote-host support.
- Keep install, management, config, and remote repair in separate PRs.
- For risky operations, require confirmation, visible output, health checks, and recovery guidance.

## Delivery Rhythm

For each sub-issue:

1. Read the issue, current implementation, and related tests.
2. Define the smallest acceptable scope for that phase.
3. Implement only that phase's code changes.
4. Add regression coverage at the right layer.
5. Run targeted validation.
6. Merge the PR.
7. Update the umbrella issue checklist.

## Phase Details

### #43 Read-only diagnostics

Goal:
Expose OpenClaw version, gateway health, doctor summary, config path, workspace path, and log entry points in a read-only surface.

Expected output:
- Backend snapshot/service support for diagnostics
- Frontend inspector or diagnostics panel
- Clear handling for missing config, missing workspace, or unreachable gateway

Validation:
- Backend/service regression test
- Frontend rendering or interaction test
- One real or equivalent live status read

### #44 Safe management actions

Goal:
Add controlled start/stop/restart/status and doctor repair actions after diagnostics are stable.

Expected output:
- Confirmed action flow
- Structured command output
- Post-action health check
- Failure guidance

Validation:
- Success, failure, and timeout regression coverage
- One real or equivalent execute -> health-check -> result flow

### #45 Structured config management

Goal:
Support safe config changes with structured patching rather than free-form editing as the default path.

Expected output:
- Read config
- Patch/apply config
- Backup or base-hash protection
- Validation result display

Validation:
- Read, patch, validation failure, and rollback or backup tests
- One real or equivalent config apply flow

### #46 Local install and update

Goal:
Wrap the official local install/update path after diagnostics and management are stable.

Expected output:
- Detect install state
- Detect upgrade availability or missing prerequisites
- Report progress and final state

Validation:
- Not-installed / installed / update-needed coverage
- One real or equivalent local install or update validation

### #47 Remote operations

Goal:
Add remote operations only after the local-first phases are stable and observable.

Expected output:
- Permission gating
- Audit trail
- Rollback or backup point before writes
- Connectivity-loss-safe UX

Validation:
- Authorization, connectivity loss, failed writes, and rollback visibility tests
- One controlled remote or equivalent simulation before release

## Current Next Step

Start with [#43](https://github.com/aliramw/lalaclaw/issues/43) and keep the first implementation intentionally small:

- Reuse the existing dashboard snapshot instead of creating a new API
- Add OpenClaw diagnostics fields on the backend
- Render them as a clearer read-only diagnostics section in the Inspector environment tab
- Add focused backend and frontend regression tests
