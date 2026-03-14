# Product Showcase

This document is a lightweight guide for what to demo, screenshot, or record when presenting LalaClaw.

## Core Screens

- Overview bar: agent/model selectors, fast mode, think mode, queue, theme, and locale toggles
- Chat panel: pending assistant turn, markdown answer, attachment chips, and reset affordance
- Inspector panel: timeline, file list, artifacts, snapshots, agent graph, and runtime peeks

## Demo Story

1. Start in `mock` mode and show the default command center layout.
2. Send a prompt with an attachment to demonstrate composer behavior and pending state.
3. Open the inspector tabs to show timeline, files, and snapshots updating from the same session.
4. Toggle model, fast mode, think mode, theme, and locale to show session-level controls.
5. Switch to an OpenClaw-backed environment to show the same UI running against a live gateway.

## Suggested Assets

- One full-width desktop screenshot of the default workspace
- One screenshot focused on the chat panel during a pending turn
- One screenshot focused on the inspector panel after a completed run
- A short GIF showing prompt submission, status changes, and inspector updates

## Notes For Maintainers

- Prefer images captured from the current React app, not from historical mockups
- Keep screenshots aligned with the active product language and theme choices used in the README
- Update this document when major UI surfaces or demo flows change
