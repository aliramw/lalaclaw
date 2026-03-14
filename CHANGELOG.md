# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Modular backend structure with `core`, `services`, `routes`, `formatters`, and `http` layers
- Modular frontend feature structure with controller, storage, state, utils, and runtime boundaries
- Hook- and module-level test coverage for the main frontend and backend orchestration paths
- CI workflow, contribution guide, security policy, issue templates, and pull request template
- ESLint-based lint workflow for React, hooks, and Node modules
- Vitest coverage reporting with shared thresholds and HTML output
- Dependabot configuration for npm and GitHub Actions updates
- Architecture documentation and richer README project overview

### Changed

- Reduced `server.js` to a thin application entrypoint and request dispatcher
- Reduced `src/App.jsx` to a thin page composition layer centered on `useCommandCenter()`
- Removed the legacy static `public/` UI implementation in favor of the Vite + React app
- Split the frontend bundle into smaller chunks to remove the large-entry warning during build
