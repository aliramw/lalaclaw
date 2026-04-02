# Project Visual Refresh Design

Last updated: 2026-04-01

## Background

The current LalaClaw UI already has a solid command-center structure, but the visual system is still closer to an engineering workbench than a polished product shell.

The most visible gaps are:

- light and dark themes do not yet feel like an intentionally paired visual system
- app chrome, chat, and inspector surfaces are all reasonably clean, but their relative importance is not strong enough at a glance
- dense operational content exists, but the hierarchy between "where I am", "what the system is doing", and "what I should do next" can be sharper

The user asked for an overall visual upgrade using a stronger design pass rather than a narrow token-only refresh.

## Chosen Direction

This design intentionally combines the preferred directions into one paired system:

- `light` theme uses the `Signal Desk` direction: warm, paper-like, calm, and polished
- `dark` theme uses the `Precision Ops` direction: cool, sharper, more technical, and more signal-forward
- overall density stays `balanced`: denser than a marketing product, looser than a pure internal tool
- scope follows a `shell-first redesign`: update the visual system and the main shell hierarchy together without rewriting the core interaction model

## Goals

- Make light and dark mode feel intentionally paired instead of independently tuned.
- Give the app shell a stronger visual hierarchy so the workspace feels easier to scan.
- Keep the chat area as the primary stage while preserving the inspector as a high-signal secondary surface.
- Improve perceived product quality through better color, spacing, elevation, grouping, and action emphasis.
- Reuse the existing theme mechanism and current component structure wherever possible.

## Non-Goals

- Do not redesign the session/runtime state model.
- Do not rewrite the chat transport or inspector data architecture.
- Do not introduce a marketing-style landing-page aesthetic that weakens the product's operator-tool identity.
- Do not turn the inspector into a low-density dashboard; it must remain operationally useful.

## Existing Constraints

### Theme Mechanism

[`src/features/theme/use-theme.ts`](/Users/marila/.codex/worktrees/4e33/lalaclaw/src/features/theme/use-theme.ts) already supports `light`, `dark`, and `system` by toggling the `dark` class and a `data-theme` attribute on `document.documentElement`.

The redesign should keep that mechanism and layer a stronger semantic token system on top of it.

### Surface Reuse

[`src/components/command-center/chat-panel-surfaces.ts`](/Users/marila/.codex/worktrees/4e33/lalaclaw/src/components/command-center/chat-panel-surfaces.ts) and the matching inspector surface wrappers already route the shell through shared `Button`, `Card`, `ScrollArea`, `Textarea`, and `Tooltip` primitives.

That makes a token-driven redesign preferable to one-off per-component restyling.

### Existing Shell Structure

The top-level shell is already split cleanly:

- [`src/components/app-shell/app-split-layout.tsx`](/Users/marila/.codex/worktrees/4e33/lalaclaw/src/components/app-shell/app-split-layout.tsx)
- [`src/components/command-center/chat-panel.tsx`](/Users/marila/.codex/worktrees/4e33/lalaclaw/src/components/command-center/chat-panel.tsx)
- [`src/components/command-center/inspector-panel.tsx`](/Users/marila/.codex/worktrees/4e33/lalaclaw/src/components/command-center/inspector-panel.tsx)

The visual refresh should respect those boundaries rather than collapsing them into a new layout model.

## Visual System Design

### Semantic Tokens

Expand [`src/index.css`](/Users/marila/.codex/worktrees/4e33/lalaclaw/src/index.css) from the current minimal token set into a more explicit shell vocabulary:

- `background`
- `background-muted`
- `surface`
- `surface-elevated`
- `surface-strong`
- `panel`
- `panel-muted`
- `primary`
- `primary-foreground`
- `accent`
- `accent-foreground`
- `border`
- `border-strong`
- `text`
- `text-muted`
- `text-subtle`
- `success`
- `warning`
- `danger`
- `focus-ring`

The goal is to let shell surfaces express depth and emphasis semantically instead of forcing every component to invent its own `bg-*` mix.

### Light Theme: Signal Desk

The light theme should feel warmer and calmer than the current UI:

- parchment or paper-cream background instead of neutral gray-white
- creamy main surfaces with slightly warmer borders
- amber-brown primary actions for send/update/high-priority calls to action
- softer shadow edges and slightly more tactile card elevation
- status colors remain semantic, but the base shell should feel trustworthy rather than clinical

This is the default theme for focused day-to-day usage.

### Dark Theme: Precision Ops

The dark theme should feel more technical and higher contrast than the current dark mode:

- deep navy background instead of flat charcoal
- blue-steel panels and stronger edge definition
- cyan-blue highlights for primary action and online/signal states
- clearer differentiation between page background, chat stage, and inspector surfaces
- restrained glow only where it improves status perception

This is the advanced/control-plane companion to the light theme, not a different product identity.

### Typography

Preserve the current tool-friendly typographic tone instead of introducing a decorative font dependency.

Use typography changes through scale and rhythm:

- stronger title sizing in app chrome and section headers
- slightly cleaner label/body contrast
- consistent compact monospace usage for code, paths, and diagnostics
- better visual separation between metadata text and actionable content

### Motion

Motion should stay minimal and purposeful:

- micro-elevation on hover for primary shell cards
- consistent `150-220ms` transitions for hover/focus/open states
- no decorative floating or oversized glow animation
- existing busy/streaming states remain subtle and operational

## Shell And Hierarchy Design

### App Chrome

The app chrome should read as a stable product bar rather than a generic card sitting above the workspace.

Key changes:

- make the top area feel like one intentional shell band
- clearly separate brand/current context on the left from utility and global actions on the right
- give the settings/profile trigger a quieter utility treatment so it supports the header instead of visually competing with the main call to action
- ensure the strongest filled action in the shell visually matches the strongest filled action in the composer

### Chat Stage

The chat area should become the clearest focal plane in the app.

That means:

- stronger contrast between page background and chat stage container
- clearer visual grouping for tabs, session overview, transcript, and composer
- improved spacing rhythm so the transcript feels less like stacked generic cards
- a composer surface that feels deliberately anchored and slightly elevated
- empty and loading states that feel product-grade rather than placeholder-like

The chat area should feel active, central, and current.

### Inspector

The inspector remains information-dense, but its hierarchy should be quieter than the chat stage.

Key changes:

- keep compact section rhythm, but separate groups more clearly
- reduce the sense that every section has identical visual weight
- use calmer panel surfaces so dense content remains scannable
- make tab navigation feel like a utility rail, not a competing primary navigation system
- keep environment and operations flows readable without turning the column into a dashboard mosaic

### Split Layout Relationship

The shell should communicate one primary workspace and one supporting workspace:

- chat is primary
- inspector is secondary
- the resize handle becomes more intentional and easier to discover, but still visually quiet
- gutters and edge contrast should better communicate the two-pane relationship

## Component-Level Rules

### Buttons

[`src/components/ui/button.tsx`](/Users/marila/.codex/worktrees/4e33/lalaclaw/src/components/ui/button.tsx) should expose a more deliberate hierarchy:

- `default` = strongest filled action, used sparingly
- `outline` = structured utility action with stronger border clarity
- `ghost` = low-emphasis contextual control
- `secondary` = softer filled support action

Primary buttons in light and dark mode should feel related, not merely recolored.

### Cards And Panels

[`src/components/ui/card.tsx`](/Users/marila/.codex/worktrees/4e33/lalaclaw/src/components/ui/card.tsx) should become the shared shell surface primitive:

- more deliberate radius scale
- clearer distinction between resting surface and elevated surface
- lighter padding in dense operational cards
- stronger title-to-body rhythm

### Header Utilities

[`src/components/app-shell/settings-trigger.tsx`](/Users/marila/.codex/worktrees/4e33/lalaclaw/src/components/app-shell/settings-trigger.tsx) should visually align with the quieter utility cluster rather than reading like a default icon button.

### Empty And Loading States

[`src/components/command-center/chat-empty-conversation.tsx`](/Users/marila/.codex/worktrees/4e33/lalaclaw/src/components/command-center/chat-empty-conversation.tsx) should inherit the upgraded shell tone:

- more product-like centering and spacing
- icon and text that belong to the theme language
- support both the warm light mode and precise dark mode without looking like two unrelated empty states

## Implementation Slices

### Slice 1: Global Theme Tokens

Files most likely touched:

- [`src/index.css`](/Users/marila/.codex/worktrees/4e33/lalaclaw/src/index.css)
- [`src/components/ui/button.tsx`](/Users/marila/.codex/worktrees/4e33/lalaclaw/src/components/ui/button.tsx)
- [`src/components/ui/card.tsx`](/Users/marila/.codex/worktrees/4e33/lalaclaw/src/components/ui/card.tsx)
- related primitives such as `tabs`, `textarea`, `badge`, `tooltip`, and `scroll-area`

Goal:

- establish the paired light/dark token system before shell polish work begins

### Slice 2: App Chrome And Shell

Files most likely touched:

- [`src/App.tsx`](/Users/marila/.codex/worktrees/4e33/lalaclaw/src/App.tsx)
- [`src/components/app-shell/app-split-layout.tsx`](/Users/marila/.codex/worktrees/4e33/lalaclaw/src/components/app-shell/app-split-layout.tsx)
- [`src/components/command-center/header-bar.tsx`](/Users/marila/.codex/worktrees/4e33/lalaclaw/src/components/command-center/header-bar.tsx)
- [`src/components/app-shell/settings-trigger.tsx`](/Users/marila/.codex/worktrees/4e33/lalaclaw/src/components/app-shell/settings-trigger.tsx)

Goal:

- restage the top shell and overall pane relationship without changing behavior

### Slice 3: Chat Stage Polish

Files most likely touched:

- [`src/components/command-center/chat-panel.tsx`](/Users/marila/.codex/worktrees/4e33/lalaclaw/src/components/command-center/chat-panel.tsx)
- [`src/components/command-center/chat-panel-surfaces.ts`](/Users/marila/.codex/worktrees/4e33/lalaclaw/src/components/command-center/chat-panel-surfaces.ts)
- [`src/components/command-center/chat-empty-conversation.tsx`](/Users/marila/.codex/worktrees/4e33/lalaclaw/src/components/command-center/chat-empty-conversation.tsx)
- chat-adjacent components for tabs, message meta, and composer affordances

Goal:

- make the chat view feel like the main stage in both themes

### Slice 4: Inspector Restaging

Files most likely touched:

- [`src/components/command-center/inspector-panel.tsx`](/Users/marila/.codex/worktrees/4e33/lalaclaw/src/components/command-center/inspector-panel.tsx)
- inspector primitives and section components

Goal:

- preserve operational density while improving grouping, calm, and scanability

## Validation Expectations For Implementation

When the design turns into code, validation should match the shell-wide scope:

- run targeted component tests for touched UI components
- run at least `npm test` because the redesign crosses shared shell surfaces
- verify both `light` and `dark` mode manually
- check long English and Chinese strings in header, tabs, cards, and inspector rows
- verify keyboard focus visibility and contrast for all primary shell actions

## Recommendation Summary

The best fit for this request is:

- shell-first redesign
- paired light/dark visual identities
- balanced density
- stronger hierarchy, not a new interaction model

This gives the project a visibly more polished product shell while staying aligned with the current codebase and operational use cases.
