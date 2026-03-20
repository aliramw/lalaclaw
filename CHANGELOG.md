# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Added an in-app OpenClaw onboarding flow that keeps newly installed OpenClaw instances in an explicit initialization state until onboarding completes, with support for official `quickstart`, `advanced`, and `manual` flows
- Added capability-aware OpenClaw onboarding forms, support-option recheck controls, recent support-detection result reporting, and an isolated onboarding smoke command plus CI job/artifact for end-to-end validation

### Changed

- Expanded the Inspector environment panel so the LalaClaw section surfaces clearer runtime context such as frontend/backend addresses and onboarding support metadata instead of only showing sparse version details
- Refined OpenClaw environment copy across locales, including clearer naming for gateway/runtime states and the support-option recheck workflow

### Fixed

- Fixed several Inspector environment regressions around initialization ordering, missing locale metadata, and action visibility while onboarding state is still loading
- Fixed chat follow-bottom recovery so manual return-to-bottom and refresh restoration resume sticky bottom behavior during ongoing assistant generation
- Fixed the test baseline so `npm test` excludes Playwright e2e files from Vitest and the current session overview assertions match the shipped runtime tuning fields

## [2026.3.20-3]

### Changed

- Published a follow-up release so the new in-app LalaClaw self-update flow can be verified end-to-end against a real npm `stable` promotion from `2026.3.20-2`
- Updated README and localized quick-start / README version examples to `2026.3.20-3`

## [2026.3.20-2]

### Added

- Added a dev-only LalaClaw update mock route so source-checkout demos can toggle a target stable version without restarting the backend

### Changed

- Added a dedicated LalaClaw in-app self-update flow that checks npm `stable` releases, surfaces update state in the Environment tab, and documents stable dist-tag confirmation as an explicit release decision
- Refined the Environment panel LalaClaw update presentation so the update-available copy stays inline while the immediate action reuses the same filled blue treatment as the main send button
- Updated README and localized quick-start / README version examples to `2026.3.20-2`

### Fixed

- Removed the old environment-variable LalaClaw update mock path so the dev-only route is the single supported demo entrypoint
- Cleared the current release blockers in lint and App-level regressions so tarball validation, installed startup, and the new LalaClaw update flow pass release verification again

## [2026.3.20-1]

### Added

- Added an OpenClaw environment workspace inside the Inspector with install/update status, management actions, safe config editing, operation history, rollback restore, and remote-target safeguards
- Added backend OpenClaw facade/routes/services for config, update, management, operation history, rollback metadata, and persisted backup snapshots
- Added regression coverage for the new OpenClaw environment flows, runtime WebSocket handshake, noisy gateway stdout parsing, and current-session model sync after agent-default changes

### Changed

- Expanded the root README plus localized docs to document the new OpenClaw environment tooling, safer validation expectations, and the `2026.3.20-1` published-version examples
- Reworked the Inspector environment layout so OpenClaw sections appear in a cleaner order, start collapsed by default, and hide zero-count badges
- Allowed the Inspector to edit the current agent's default model separately from the global default model, and switched those model fields to dropdown selection

### Fixed

- Prevented background IM runtime polling from stacking overlapping `/api/runtime` requests when earlier polls are still in flight
- Stopped the OpenClaw environment bootstrap loaders from repeatedly re-requesting config, update, and history data after load or failure, which could destabilize the web app over long sessions
- Tolerated noisy gateway CLI stdout when parsing JSON responses and routed delivery-backed WeCom sends away from the unsupported `chat.send` path
- Synced the visible current-session model after applying a new current-agent default model and improved model-switch errors so the real backend failure reason reaches the UI
- Restored runtime WebSocket coverage and install-time validation so packaged installs are less likely to regress into polling-only behavior without detection

## [2026.3.19-2]

### Changed

- Replaced the IM conversation switcher text badges with branded SVG logos for DingTalk, Feishu, and WeCom while keeping the existing menu flow and labels intact
- Updated published-version examples in the root README, localized README variants, and localized quick-start guides to `2026.3.19-2`

### Fixed

- Removed the Mermaid-specific manual vendor split that could produce a circular `mermaid-vendor -> vendor -> mermaid-vendor` chunk graph and break production startup after install
- Stabilized App-level agent switch regressions by waiting for the switcher UI to become ready before exercising post-switch interactions

## [2026.3.19-1]

### Added

- Added an optional token access mode for remote/browser deployments, including cookie-backed login, protected `/api/*` and runtime WebSocket access, and a dedicated unlock screen in the web app

### Changed

- Documented direct URL deployments alongside the existing SSH port-forward workflow, and added access-token environment examples to `.env.local.example`
- Colored CLI doctor status labels so `OK`, `WARN`, `INFO`, and `ERROR` are easier to scan in terminal output
- Added an explicit doctor summary line so CLI health checks show whether the current setup is fully healthy, warning-only, or blocked by errors
- IM session tabs now preserve local pending turns while background runtime snapshots refresh, preventing optimistic user messages and thinking placeholders from disappearing after tab switches

### Fixed

- Windows-style `file:///C:/...` markdown image links now resolve through local file preview URLs correctly in chat rendering
- Added cross-platform runtime overrides for `lalaclaw dev/frontend/backend` so Windows can start services with `--host/--port` flags instead of POSIX-only `HOST=... PORT=...` prefix syntax
- Added CLI aliases `-h`/`--help` for help output and `-v`/`--version` for version output
- `lalaclaw start` now runs a doctor preflight with the same runtime overrides and refuses to launch when doctor reports blocking errors
- IM session auto-redirect now matches channels from the real session identity instead of substring-matching the whole session key, avoiding false redirects for ordinary sessions
- Localized the new composer click hint and unread badge accessibility labels across all supported locales

## [2026.3.17-9]

### Added

- Added a remote-install quick-start path to the root README and localized README variants under `docs/`, including SSH port-forward access notes for OpenClaw-managed remote hosts
- Surfaced the running `LALACLAW.VERSION` in the dashboard environment snapshot for easier runtime inspection and support/debugging

### Changed

- Updated the CLI and docs to use the current startup defaults of `PORT=5678` and `FRONTEND_PORT=4321`, while keeping repository development guidance on the fixed `5173/3000` dev ports
- Consolidated localized root README variants under `docs/README.*.md` and refreshed internal links to match the new documentation layout
- Synchronized localized `documentation-quick-start` guides with the latest install, update, remote-install, and development-mode guidance
- Clarified new-session reset copy across locales to state that conversation content is reset and context length returns to zero
- Updated published-version examples in `README` and localized documentation guides to `2026.3.17-9`

### Fixed

- Fixed the root English README after a localized remote-install section was accidentally merged into it
- Fixed quick-start docs that still pointed users at outdated install/runtime defaults or old development port assumptions

## [2026.3.17-8]

### Added

- Expanded CLI and gateway regression coverage for PATH composition, local profile env isolation, executable-bin validation, and IM session tab naming/styling

### Changed

- Updated IM conversation tab labels to `钉钉 agent-name` / `飞书 agent-name` / `企业微信 agent-name`, and rendered the `agent-name` suffix in a muted smaller style for clearer visual hierarchy
- Hardened launch/runtime environment setup by prepending required runtime/bin directories to PATH for launchd services and spawned child processes
- Updated published-version examples in `README` and localized `documentation-quick-start` guides to `2026.3.17-8`

### Fixed

- Fixed local OpenClaw binary discovery/usage in non-interactive contexts by requiring absolute `OPENCLAW_BIN` paths to be executable and by consistently persisting resolved local binaries during `lalaclaw init`
- Fixed stale remote-gateway variables leaking into local-openclaw child environments by clearing `OPENCLAW_BASE_URL` and `OPENCLAW_API_KEY` when running locally
- Fixed OpenClaw CLI gateway invocations that could fail to resolve binaries under constrained PATH environments

## [2026.3.17-7]

### Added

- A dedicated `InspectorFilesPanel` module for the inspector file view, with richer session/workspace navigation coverage and additional regression tests around file previews, filters, and context-menu actions
- Agent-aware composer placeholder copy across every locale, including a semibold highlighted agent name inside the empty composer state

### Changed

- Reduced initial page-load work by deduplicating runtime bootstrap requests, lazy-loading locale bundles, Prism languages, markdown plugins, preview overlays, and heavy markdown rendering paths until they are actually needed
- Refined command-center polish around connection labels, localized tooltip copy, and responsive inspector filter sizing on narrow layouts
- Updated published-version examples in the root README and localized quick-start guides to `2026.3.17-7`

### Fixed

- Prevented the language-switch tooltip from reappearing immediately after a locale change
- Reduced layout thrash in the chat/app shell by stabilizing composer sizing, scroll-follow behavior, focus handling, and footer status layout during first load

## [2026.3.17-6]

### Added

- Inline Monaco editing for Markdown, plain-text, and code-like file previews, including a backend save endpoint and toolbar save / cancel controls
- A new `Edit` action in the inspector file context menu that opens eligible files directly into preview edit mode

### Changed

- Updated the inspector and preview documentation to describe inline file editing, and refreshed published-version examples to `2026.3.17-6`
- Kept oversized truncated text previews read-only so inline editing cannot overwrite content that was not fully loaded

### Fixed

- Stopped global composer hotkeys from stealing typed characters while focus is inside the Monaco preview editor
- Replaced the raw `Method not allowed` save failure with a clearer hint when the running backend needs a restart to pick up the new save route

## [2026.3.17-5]

### Added

- VS Code-style file exploration in the inspector with separate `Session Files` and `Workspace Files` sections, lazy-loaded workspace folders, path filtering, compact single-folder chains, and directory refresh actions
- Spreadsheet preview for `csv`, `xls`, `xlsx`, and `xlsm` files, plus richer Office/media preview handling for `doc`, `docx`, `ppt`, `pptx`, `heic`, and `heif`
- Mermaid diagram rendering for completed fenced `mermaid` code blocks, including diagram preview from chat messages
- Native `/model` and `/models` handling across runtime modes, with mock-mode status/list/set fallbacks and openclaw-mode forwarding that mirrors the selected model back into local session state
- A custom new-session confirmation dialog instead of the browser-native confirm prompt
- `lalaclaw doctor --fix` on macOS to install LibreOffice automatically when Office preview dependencies are missing

### Changed

- Reworked the inspector `Files` tab so collapsed sections keep their count badges, workspace counts show the total file count, and empty `Session Files` sections stay hidden
- Updated file preview controls with preview font-size options, better Office dependency guidance, and DOCX rendering inside the shared preview overlay
- Forwarded native OpenClaw slash and bang commands without local prepatches while still syncing local fast/thinking/reset/session metadata from authoritative runtime snapshots

### Fixed

- Prevented raw top-level `<final>...</final>` assistant envelopes from leaking into the visible chat transcript
- Improved conversation replay dedupe so transient assistant fragments and duplicate merged echoes collapse back to a single authoritative turn

## [2026.3.17-4]

### Fixed

- Prevented duplicate chat turns from appearing when the same replayed user/assistant pair was merged from multiple conversation sources in a different timestamp order
- Reduced duplicate-send and duplicate-reply glitches in the main chat flow by tightening optimistic turn handling and replay collapse across runtime sync

### Changed

- Sorted tool input/output items in the inspector timeline newest-first by timestamp so the latest call appears at the top
- Kept the `Files` count badge visible even when the inspector tabs collapse down to icon-only mode

## [2026.3.17-3]

### Added

- Automatic macOS background-service setup from `lalaclaw init` for npm installs, including `launchd` registration, log files, and a prompt that opens the App URL in the browser after setup
- User-facing `lalaclaw status`, `lalaclaw stop`, and `lalaclaw restart` commands for managing the macOS background service without calling `launchctl` directly
- Additional CLI coverage for launchd setup, browser opening, command parsing, and colorized error output

### Changed

- Clarified `lalaclaw init`, `lalaclaw doctor`, and `--help` output around `App URL`, `API URL`, and `Dev frontend URL` so packaged installs no longer point users at the Vite port
- Highlighted `ERROR` lines from `lalaclaw doctor` in red when the terminal supports color, while keeping log and non-interactive output plain
- Adjusted the inspector timeline details and expand/collapse controls for more reliable left alignment in the session sidebar
- Updated npm-install and upgrade docs to reflect the background-first macOS flow and the new service-management commands

## [2026.3.17-2]

### Added

- An npm package release shape for `lalaclaw` with a bundled production `dist/` build so end users can install and start without a source checkout
- A user-scoped default config path at `~/.config/lalaclaw/.env.local` for npm installs, while keeping compatibility with the legacy project-local `.env.local`
- npm-first install and upgrade instructions in the root README plus all localized quick-start guides
- Additional CLI coverage for default config resolution and explicit config overrides in the npm-install path

### Changed

- Switched the package identity from `commandcenter` to `lalaclaw` for npm distribution and added publish-time file filtering with a `prepack` build step
- Repositioned GitHub installation docs as the source-checkout path for development, while keeping npm installation as the default user-facing setup

## [2026.3.17]

### Added

- A root-level `CODE_OF_CONDUCT.md` and linked repository entry points for issue intake, PR expectations, review ownership, and security reporting
- Contribution, development, and versioning guidance in the root `README.md`
- A Chinese root README with a matching language switch link from the main `README.md`
- Repository workflow, testing, internationalization, and release-note guidance in `CONTRIBUTING.md`
- A repository entry-point index in `docs/README.md` so product docs and governance docs are easier to navigate
- Localized quick-start update instructions for existing installs across English, Chinese, Japanese, French, Spanish, and Portuguese docs

### Changed

- Updated the command-center shortcut help to reflect the active composer send mode instead of showing a single static shortcut mapping
- Tuned the connection-status send-mode toggle styling for light theme so it stays legible outside dark mode
- Aligned localized docs and showcase links around the shorter `Easter Egg` page title across the documentation tree
- Refined the root README setup highlights to emphasize local and remote OpenClaw gateway support and added a user-facing upgrade flow for GitHub installs

## [2026.3.16]

### Added

- Modular backend structure with `core`, `services`, `routes`, `formatters`, and `http` layers
- Modular frontend feature structure with controller, storage, state, utils, and runtime boundaries
- Hook- and module-level test coverage for the main frontend and backend orchestration paths
- CI workflow, contribution guide, security policy, issue templates, and pull request template
- ESLint-based lint workflow for React, hooks, and Node modules
- Vitest coverage reporting with shared thresholds and HTML output
- Dependabot configuration for npm and GitHub Actions updates
- Architecture documentation and richer README project overview
- Multilingual documentation trees under `docs/` for English, Chinese, Japanese, French, Spanish, and Portuguese
- A dedicated language index for documentation plus locale entry links from the root `README.md`
- A user-facing documentation page for the top-left lobster easter egg
- Project tooling commands exposed through the `lalaclaw` CLI entry in `package.json`
- A checked-in `.env.local.example` template for manual setup and bootstrap flows
- Automated `lalaclaw init`, `lalaclaw doctor`, `lalaclaw dev`, and `lalaclaw start` workflows for new machines
- Remote OpenClaw gateway probing and runtime validation for configured model and agent pairs
- CLI coverage for config parsing, doctor reporting, and remote validation requests

### Changed

- Reduced `server.js` to a thin application entrypoint and request dispatcher
- Reduced `src/App.jsx` to a thin page composition layer centered on `useCommandCenter()`
- Removed the legacy static `public/` UI implementation in favor of the Vite + React app
- Split the frontend bundle into smaller chunks to remove the large-entry warning during build
- Moved the primary English documentation into `docs/en` and aligned all locale trees to the same filename structure
- Standardized the project versioning format on calendar-style releases, starting with `2026.3.16`
- Expanded the root README and all localized quick-start guides with step-by-step GitHub installation, initialization, and remote-gateway setup instructions
- Standardized browser and localized product titles on `LalaClaw` instead of `LalaClaw.ai`
- Added a composer send-mode toggle with a blue underlined link style and changed the default keyboard behavior to `Enter` send with `Shift + Enter` newline
