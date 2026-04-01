# Chat Tool Cards In Stream Design

Last updated: 2026-04-01

## Background

The chat panel currently renders only `messages`, while tool activity is available separately through `taskTimeline`.

That creates a mismatch with the intended OpenClaw-style chat behavior:

- tool calls and tool results should be visible directly in chat
- tool activity should keep updating while the assistant is still streaming
- historical turns should keep their tool activity after refresh or reload
- assistant markdown streaming should not swallow, duplicate, or reorder tool cards

The immediate goal is to surface tool activity inside chat without rewriting the underlying runtime/session model in this change.

## Goals

- Show tool-call activity directly inside the chat conversation.
- Keep tool activity visible for both live streaming turns and historical turns.
- Prevent tool cards from being merged into assistant markdown content while text is still streaming.
- Reuse existing tool-card UI patterns where possible.
- Keep this change scoped to rendering and view-model derivation rather than runtime protocol changes.

## Non-Goals

- Do not migrate `/api/chat` transport away from the current flow.
- Do not redesign `runtimeHub`, `taskTimeline.sync`, or transcript generation in this change.
- Do not rewrite chat state into the larger `conversation/run/composer/sync` model yet.
- Do not remove current pending/streaming behavior outside the minimum changes required for stable rendering.

## Current State

### Chat Panel

[`src/components/command-center/chat-panel.tsx`](/Users/marila/.codex/worktrees/3dfe/lalaclaw/src/components/command-center/chat-panel.tsx) renders from `messages` only. Assistant streaming and pending UI are driven from message-level flags such as `pending` and `streaming`.

### Timeline Data

`taskTimeline` already exists in the app state and reaches [`src/App.tsx`](/Users/marila/.codex/worktrees/3dfe/lalaclaw/src/App.tsx), but it is not threaded into the chat panel.

Timeline runs already contain the data needed for chat-adjacent tool activity:

- run `timestamp`
- run `prompt`
- run `tools`
- run `toolsSummary`
- run `status`
- run `outcome`

### Existing Reusable UI

[`src/components/command-center/inspector-panel-timeline.tsx`](/Users/marila/.codex/worktrees/3dfe/lalaclaw/src/components/command-center/inspector-panel-timeline.tsx) already contains a mature tool-card implementation:

- `ToolCallTimeline`
- `ToolCallCard`
- status badges
- collapsible input/output sections

This should be reused instead of re-invented inside chat.

## Chosen Approach

Use a derived chat render model that inserts a dedicated tool-activity block into each user turn:

- user bubble
- tool activity block for that turn, when present
- assistant bubble(s)

Tool activity is rendered as a sibling block in the conversation flow, not as part of assistant markdown content.

This is intentionally a rendering-layer solution:

- `messages` remain the message transcript source
- `taskTimeline` remains the tool/run activity source
- chat derives a stable combined view model from both

## Rejected Alternatives

### Option 1: Inject tool cards into assistant markdown bubbles

Rejected because it couples tool activity and assistant text into the same streaming render surface. While text is appended, the tool cards would be forced to reflow inside the bubble and are more likely to duplicate, reorder, or visually "string together" with markdown content.

### Option 2: Full state-model rewrite now

Rejected for this change because it would expand scope into high-risk runtime/session/state ownership areas. The repository already has a larger refactor direction documented elsewhere, but this task should land the visible behavior first with minimal risk.

## Data Mapping Design

### Turn Windows

Chat will derive turn windows from user messages.

Each user message opens a window:

- start: the current user message timestamp
- end: the next user message timestamp, if one exists

Any `taskTimeline` run whose timestamp falls within that window belongs to that user turn.

### Run-to-Turn Matching

For each user turn:

- collect all runs whose `timestamp` is within the turn window
- sort them by ascending timestamp
- render them as one activity section for that turn

This deliberately avoids trying to infer tool ownership from assistant markdown or by parsing tool text back out of transcript content.

### Assistant Placement

Within a single turn:

- tool activity appears before the first assistant bubble in that turn
- if there are multiple assistant messages in the same turn, the tool activity block still appears only once
- if a turn has no tool activity, chat falls back to the existing message-only layout

### Live Streaming Behavior

For the active turn:

- tool activity block updates when `taskTimeline` changes
- assistant bubble updates when `messages` streaming content changes
- pending/thinking bubble remains separate from the tool block

This separation is the core safeguard against card interleaving during stream updates.

## Rendering Model

### New Derived Render Items

`ChatPanel` should stop treating the entire conversation as a flat `messages.map(...)` list.

Instead, it should derive a render list with stable item types such as:

```ts
type ChatRenderItem =
  | { type: "message"; key: string; message: ChatMessage; previousMessageId?: string }
  | { type: "tool-activity"; key: string; turnMessageId: string; runs: RuntimeTimelineRun[] };
```

Exact type names may vary, but the separation of message items and tool-activity items should remain explicit.

### New Chat Activity Block

Add a chat-specific wrapper component, tentatively named `ChatTurnActivityBlock`, that:

- accepts one turn's timeline runs
- renders them using the shared tool-card timeline UI
- keeps spacing and width aligned with assistant-side chat content
- remains visually separate from assistant markdown

This wrapper can also later host additional turn-scoped run metadata if needed, but this change should keep it focused on tool activity.

### Shared Tool UI Extraction

Move reusable tool-card pieces out of the inspector-specific file into a shared component module that both inspector and chat can consume.

The shared module should preserve:

- collapsible tool cards
- localized collapse/expand labels
- input/output code blocks
- status badges

The inspector should continue to behave the same after the extraction.

## Stability Rules

### Rule 1: Tool cards never render inside markdown content

Tool activity must not be appended into `message.content`, not even temporarily for streaming.

### Rule 2: Tool activity is inserted once per turn

Even when a turn has:

- multiple tool calls
- multiple tool results
- multiple assistant messages

the activity block appears only once for that turn.

### Rule 3: Missing timeline data must degrade safely

If `taskTimeline` is unavailable, malformed, or cannot be matched confidently:

- render the conversation with the current `messages`-only behavior
- do not block normal chat rendering

### Rule 4: Pending bubble remains independent

If tool activity appears before assistant text does:

- show the tool activity block
- keep the existing pending/thinking bubble behavior

This preserves the visual meaning that work is in progress without forcing tool cards to wait for assistant prose.

## Component and Prop Changes

### App Layer

[`src/App.tsx`](/Users/marila/.codex/worktrees/3dfe/lalaclaw/src/App.tsx) should pass `taskTimeline` into `ChatPanel`.

### Chat Panel Props

[`src/components/command-center/chat-panel.tsx`](/Users/marila/.codex/worktrees/3dfe/lalaclaw/src/components/command-center/chat-panel.tsx) should accept `taskTimeline` as an additional prop.

The prop can remain loosely typed initially if needed to fit current runtime typing, but the implementation should prefer a dedicated normalized shape near the render-derivation helper.

### Shared Component Location

The extracted tool timeline UI should live in a neutral command-center component file rather than inside the inspector-specific module.

## Testing Strategy

This change should follow TDD.

### Required New Chat Tests

Add targeted regressions in [`src/components/command-center/chat-panel.test.jsx`](/Users/marila/.codex/worktrees/3dfe/lalaclaw/src/components/command-center/chat-panel.test.jsx) for:

1. historical turns render tool cards before the corresponding assistant reply
2. streaming assistant text updates do not duplicate or merge tool cards into the assistant bubble
3. multiple tool calls within one turn stay inside one activity block
4. turns with assistant text but no tools still render exactly like the existing chat layout
5. turns with tools before final assistant prose show both the tool block and the pending/thinking bubble

### Required Shared-UI Safety Test

If tool timeline UI is extracted from the inspector module, rerun inspector timeline coverage to confirm no regression in:

- card expansion/collapse
- localized labels
- input/output rendering

## Validation

Minimum intended validation for implementation after the spec is approved:

- `npx vitest run src/components/command-center/chat-panel.test.jsx`
- `npx vitest run src/components/command-center/inspector-panel.test.jsx`

If shared extraction touches broader command-center integration in a non-trivial way, widen verification from there.

## Risks

### Risk 1: Incorrect run-to-turn matching

`taskTimeline` is timestamp-based, so a malformed timestamp or unusual transcript ordering could place a run under the wrong user turn.

Mitigation:

- use simple, deterministic timestamp windows
- degrade to `messages`-only rendering when matching is not trustworthy
- keep the insertion rule consistent and test boundary cases

### Risk 2: Existing chat auto-follow behavior regresses

The chat panel has careful scroll-follow logic for streaming replies. Inserting new sibling blocks could shift height during a live run.

Mitigation:

- keep tool activity in the same assistant-side column flow
- add a regression that updates tools and streaming text across rerenders
- preserve stable keys for activity blocks and bubbles

### Risk 3: Shared component extraction breaks inspector timeline

Mitigation:

- keep the extracted API thin
- reuse current locale keys rather than inventing chat-only labels where possible
- rerun inspector timeline coverage

## Implementation Boundaries

This spec intentionally stops before the larger chat-state refactor.

Follow-up work may later evolve the internal model toward separate `streamText` and `toolStream` state, but this change should only deliver:

- chat-visible tool cards
- stable live streaming rendering
- historical persistence through existing timeline data

## Decision Summary

Implement chat tool cards by deriving per-turn activity blocks from `taskTimeline` and rendering them as siblings of assistant bubbles, not inside assistant markdown. Reuse the existing tool-card UI, keep the change scoped to render derivation plus prop threading, and cover the live-streaming/non-interleaving behavior with chat-panel regressions first.
