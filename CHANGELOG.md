# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

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
