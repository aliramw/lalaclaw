# LalaClaw Open Source Maturity Review Plan

## Goal

Review the repository against the standard of a mature, modern, high-quality, AI-era open source project, then turn the findings into a practical improvement roadmap.

## Current Strengths

- Clear product direction with a distinct OpenClaw-focused operator workflow instead of a generic chat shell
- Strong repository hygiene compared with typical early-stage projects: CI, tests, release notes, contribution docs, issue templates, CODEOWNERS, code of conduct, and security policy already exist
- Good engineering discipline around i18n, release sequencing, packaging-sensitive changes, and high-risk WebSocket/runtime areas
- Frontend and backend already have documented layering guidance in [src/features/README.md](../src/features/README.md) and [server/README.md](../server/README.md)
- Test surface is broad: unit, controller, app-level, backend regressions, Playwright e2e, and OpenClaw onboarding smoke all exist

## Main Gaps

## 1. Documentation And Source-Of-Truth Drift

The project has strong documentation coverage, but some core operational facts already drift across files.

- Dev frontend entry is described as `http://127.0.0.1:5173` in `AGENTS.md` and `CONTRIBUTING.md`
- README and many localized docs still describe `FRONTEND_PORT=4321` or `http://127.0.0.1:4321` for source-checkout flows
- The CLI still defaults to `4321` for frontend dev startup in [bin/lalaclaw.js](../bin/lalaclaw.js)
- Vite itself defaults to `5173` in [vite.config.mjs](../vite.config.mjs)

This is not just a docs issue. It creates friction for contributors, reviewers, release validation, and AI coding agents trying to infer the intended dev flow.

### Recommendation

- Define one canonical explanation for each startup mode:
  - direct `vite` mode
  - `lalaclaw dev` mode
  - `lalaclaw init` source-checkout mode
  - packaged install mode
- Add a single source-of-truth table for ports, commands, and URLs
- Make README, CONTRIBUTING, docs, and tests derive from that shared truth where practical
- Add a doc-consistency check for port, URL, and command references

## 2. Versioning Policy Inconsistency

The repo clearly uses npm-compatible calendar versioning in practice, but contribution docs still say "Semantic Versioning".

- README says calendar versioning
- CONTRIBUTING says Semantic Versioning

For a mature open source project, release policy should never be ambiguous.

### Recommendation

- Standardize all public docs on npm-compatible calendar versioning
- Add a short versioning rationale so contributors understand why the project chose this approach
- Add a release-doc consistency check to prevent future drift

## 3. Release Process Is Strong On Paper But Not Yet Fully Automated

Repository rules set a high bar for release validation:

- `npm pack`
- clean temp install
- real installed startup path
- first-screen render verification
- runtime/chunk-init error checks

But CI currently focuses on lint, coverage, build, e2e, and onboarding smoke. The installed-package validation path is documented but not fully enforced in automation.

### Recommendation

- Add a dedicated release-artifact validation workflow
- Run `npm pack` in CI for release-facing or packaging-sensitive changes
- Install the tarball in a clean temporary directory
- Start the installed package through its real production entry
- Fail CI on startup regressions, chunk-init failures, or blank-screen symptoms

## 4. Large Frontend Hotspots Reduce Long-Term Maintainability

A few files are already large enough to slow down safe iteration:

- `src/components/command-center/inspector-panel.jsx`
- `src/components/command-center/chat-panel.jsx`
- `src/features/app/controllers/use-command-center.js`
- `src/App.jsx`

This matters even more in an AI-assisted codebase. Large files make behavior boundaries less explicit, increase merge pressure, and reduce the precision of both human review and agent-generated changes.

### Recommendation

- Split by domain ownership instead of only by UI region
- Extract stateful controller logic before extracting purely visual fragments
- Define clearer module boundaries for:
  - inspector operations
  - session/runtime surfaces
  - chat composer and queue flow
  - environment and OpenClaw operations
- Track file-size and responsibility hotspots as an explicit refactor queue

## 5. Quality Gates Are Present But Still Calibrated Like An Earlier-Stage Project

Coverage thresholds are relatively low for a codebase with this much stateful runtime behavior.

- lines/statements: 50
- functions: 52
- branches: 40

Those thresholds are useful as a floor, but not yet a high-standard quality bar.

### Recommendation

- Raise thresholds gradually instead of all at once
- Introduce higher standards for critical domains first:
  - runtime hub and runtime socket flows
  - session/storage persistence
  - chat controller and queueing behavior
  - OpenClaw config/update/management flows
- Consider separate coverage reporting for critical modules

## 6. Package Metadata And Project Positioning Need To Feel More Production-Grade

The package still presents itself partly like a prototype.

- `description` says "prototype"
- `keywords` is empty
- `author` is empty

This weakens discoverability and the project's external signal, especially for npm users and future contributors.

### Recommendation

- Replace "prototype" wording if it no longer reflects project intent
- Fill in `keywords`, `author`, and any other missing npm metadata
- Tighten the package positioning around the actual use case: OpenClaw command center, agent operations UI, local/remote operator cockpit, or equivalent

## 7. Repository Artifact Hygiene Can Improve

The repository currently includes built release tarballs in version control.

That creates avoidable noise and makes the repo feel less clean than the surrounding process standards imply.

### Recommendation

- Stop tracking generated release tarballs in Git
- Keep release artifacts in GitHub Releases, CI artifacts, or a dedicated distribution channel instead
- Add ignore rules or process checks if needed

## 8. AI-Era Contract Clarity Still Has Room To Grow

This project already has many implicit contracts across:

- runtime snapshots
- WebSocket payloads
- session identity mapping
- local persistence payloads
- OpenClaw service responses
- environment and diagnostic surfaces

In AI-assisted maintenance, hidden contracts are expensive. They cause regressions, mis-edits, and fragile agent behavior.

### Recommendation

- Add stronger explicit contracts for critical payloads and state transitions
- Use schema-based validation, or at minimum centralized normalizers and documented payload shapes
- Create a short architecture note for:
  - runtime event model
  - session identity model
  - persistence schema/versioning model
  - OpenClaw operation state model

## Suggested Priority

## P1

- Unify documentation and operational source of truth
- Resolve versioning-policy inconsistency
- Document startup modes and default ports clearly

## P2

- Add installed-package release validation to CI
- Add doc/release consistency checks
- Clean up repository artifact hygiene

## P3

- Break down major frontend hotspots
- Make ownership boundaries clearer across controller/runtime/inspector surfaces

## P4

- Raise quality gates for critical domains
- Add stronger explicit contracts for runtime, persistence, and OpenClaw payloads

## Concrete Next Actions

1. Write a single "startup modes and ports" reference and link all contributor docs to it.
2. Update README, CONTRIBUTING, and localized quick-start docs to remove port/version-policy drift.
3. Add a CI workflow for `npm pack` plus clean-directory install/start smoke.
4. Open refactor issues for `inspector-panel`, `chat-panel`, and `use-command-center`.
5. Define a staged coverage-ratcheting plan for runtime, session, chat, and OpenClaw-critical code.
6. Add a small architecture/contracts doc focused on runtime events, session keys, and persistence schema ownership.

## Expected Outcome

If the project closes the gaps above, it will move from "well-organized and serious" to "operationally trustworthy and contributor-scalable". The next maturity jump is less about adding more features and more about making the existing standards consistent, automated, and easier for both humans and AI agents to follow.
