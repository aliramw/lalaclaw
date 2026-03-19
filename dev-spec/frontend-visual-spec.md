# Frontend Visual Spec

Last updated: 2026-03-19

## Purpose

This document records the baseline visual rules for the LalaClaw frontend so UI polish decisions do not live only in chat history or individual PR context.

## Core Principles

- Prefer clear information hierarchy over decorative density.
- Use consistent spacing and container rhythm before adding more visual treatment.
- Avoid duplicate labels or sections that describe the same concept at different levels with the same name.
- Summary areas and detail areas should feel related, but not visually repetitive.

## Spacing And Rhythm

- Use a compact vertical rhythm built on `8px` steps for dense inspector-style panels.
- Sibling containers in the same stack should use the same top and bottom padding unless there is a deliberate hierarchy difference.
- Collapsible section headers should not inherit oversized default card paddings; they should feel compact enough to scan in a list.
- Avoid large blank space above the first row of useful content in side panels.
- Dense inspector sections should prefer the tighter density tier once grouping is introduced; avoid tall headers or overly generous content padding for purely diagnostic lists.
- In stacked inspector sections, the gap between a section title and its own card should be tighter than the gap to the previous sibling section. Never let a title visually read as attached to the card above it.
- Form controls inside inspector cards should not rely on browser-default select arrows. Use a consistent custom arrow placement so dropdown affordances align with the input shell and right padding.
- Checkbox controls inside inspector forms should align to the vertical center of their text label. Do not use ad-hoc top margins to visually fake alignment.

## Section Containers

- Collapsible diagnostic or inspector sections should have:
  - consistent header height
  - aligned chevron, title, and count badge
  - matching corner radius and border treatment across siblings
- Count badges should be visually secondary to the title and should not dominate the header.
- Count badges inside segmented inspector tabs must keep a distinct pill background and outline even when the tab is not selected; the inactive badge cannot blend into the tab list surface in either light or dark theme.
- Expanded sections may add a top divider between header and content, but collapsed and expanded states should keep a stable outer shape.
- For inspector-style collapsible lists, header and content padding should stay compact enough that many sections can be scanned without excessive vertical scrolling.

## Naming And Information Architecture

- Sibling groups must use distinct names. Do not create two adjacent sections both called `Gateway`.
- Summary groups should use user-facing names such as `Overview`, `Connectivity`, `Doctor`, or `Logs`.
- Technical detail groups should use names that explain scope, for example:
  - `Session context`
  - `Realtime sync`
  - `Gateway config`
  - `Application`
  - `Other`
- If two data sources belong to the same mental model, group them together. Example: `runtime.*` and `runtimeHub.*` belong under one realtime sync group, not separate sibling groups.

## Ordering Rules

- Order sections from most decision-useful to least:
  1. summary / diagnostics
  2. session context
  3. realtime sync / transport state
  4. gateway configuration
  5. application metadata
  6. other
- `Other` must always be last.
- Duplicated detail rows that are already represented in the summary layer should usually be removed from the lower-level technical groups.

## Inspector Environment Panel

- The environment tab should present a top-level diagnostic summary first, then technical detail groups.
- The environment tab hint text should describe the combined surface as OpenClaw diagnostics, management actions, and current-session environment details; do not reuse stale backend summary copy that only describes gateway/session metadata.
- The application metadata group should be labeled `LalaClaw` instead of a generic “Application” label.
- Diagnostic summary should cover:
  - OpenClaw version
  - runtime profile
  - config path and status
  - workspace root and status
  - gateway status and health URL
  - doctor summary
  - log entry points
- Lower-level groups should avoid repeating obvious summary rows like `gateway.baseUrl` or `session.mode` if those are already promoted into the diagnostic summary.
- The `LalaClaw` metadata group should include at least the app version, current server URL, host, port, and active access/auth mode so operators can confirm the local control-plane endpoint at a glance.
- Long values such as JSON session keys, file paths, and runtime identifiers must wrap inside the container boundary; do not allow value text to visually spill past the right edge.
- If an environment value is an absolute file path that points to a file-like value, render it as a clickable preview link instead of inert monospace text.
- If an environment value represents a directory such as `*.dir` or `*.root`, render it as a folder entry with a folder icon and make the click action open that directory in the system file manager instead of opening inline preview.
- Environment path interactions must use verified metadata from the data source. Do not guess purely from a slash-prefixed string, because API routes like `/v1/chat/completions` are not files.
- Missing files should stay plain text instead of rendering as broken preview links. Only render preview actions for confirmed existing files.
- Directory icons in environment path rows should sit outside the colored link text, use a muted gray tone, and be vertically centered against the path label.
- Environment diagnostics labels should use the newer user-facing names now exposed in the UI, including `OpenClaw Doctor` and `Current session agent workspace directory`, instead of older generic names such as `Doctor` or `Workspace root`.
- In install/update panels, hide the primary update action when the system is already up to date. Keep the status badge and refresh action, but do not show a no-op primary button.
- Install/update failure states must expose the underlying command diagnostics clearly, including `stderr`, timeout state, and exit code when available.
- Install/update failure cards should map known failure shapes to actionable guidance. Prefer linking to the relevant official OpenClaw docs and keep the inline summary short.
- When the recommended fix is longer than a short inline note, open it in a dedicated preview-style dialog instead of expanding the main card into a long wall of text.
- Large environment subpanels such as install/update, config, and management should use a slightly larger gap between sibling sections than between each section title and its card body.
- Top-level environment tools such as `OpenClaw config`, `OpenClaw management`, `OpenClaw install/update`, and `OpenClaw operation history` should use the same collapsible section pattern as lower-level diagnostic groups instead of staying permanently expanded.

## Preview Overlays

- File preview overlays with a secondary sidebar must keep the main preview column shrinkable with `min-w-0`-style constraints so long single-line content scrolls inside the preview surface instead of pushing the sidebar out of view.
- Code-like previews in light mode should use a true light syntax surface and token palette; avoid embedding a dark code block inside an otherwise light preview shell unless the user explicitly asks for it.

## Feedback Loop

- When a user gives specific visual feedback, update this spec in the same workstream as the code change.
- New visual rules should be written here as explicit guidance, not left implied in a component implementation.
- If a requested visual change conflicts with an older rule, update this file to reflect the new decision instead of silently diverging from the spec.
